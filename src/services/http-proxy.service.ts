import {
    ProxyRequest,
    ProxyResponse,
} from '@app/interfaces/http-proxy-interface';
import axios, { AxiosResponse } from 'axios';

type HttpHeaders = Record<string, string | string[]>;

/**
 * Handles the forwarding of HTTP requests and responses between the client and the target server.
 * This service is responsible for managing the HTTP proxy functionality, including:
 * - Intercepting incoming HTTP requests from the client.
 * - Forwarding the requests to the target server.
 * - Receiving responses from the target server and sending them back to the client.
 * - Handling any necessary transformations or modifications to the requests and responses.
 * - Managing connection pooling and resource cleanup for efficient proxying.
 * - Implementing error handling and logging for debugging and monitoring purposes.
 */
export class HttpProxyService {
    private localPort: number;

    constructor(localPort: number) {
        this.localPort = localPort;
    }

    /**
     * Forward the incoming HTTP request to the target server and return the response.
     * @param request
     * @returns A promise that resolves to the response from the target server, including status code, status message, headers, and body.
     */
    async forwardRequest(request: ProxyRequest): Promise<ProxyResponse> {
        try {
            const queryString = request.query ? `?${request.query}` : '';
            const targetUrl = `http://localhost:${this.localPort}${request.path}${queryString}`;

            // Forward the request to the target server using axios and capture the response
            const response: AxiosResponse = await axios({
                url: targetUrl,
                method: request.method,
                headers: this.filterHeaders(request.headers),
                data: request.body.length > 0 ? request.body : undefined,
                responseType: 'arraybuffer', // Ensure the response is treated as a binary buffer
                maxRedirects: 0, // Prevent automatic redirection to handle it manually if needed
                validateStatus: () => true, // Accept all status codes to handle them manually
            });

            return {
                statusCode: response.status,
                statusMessage: response.statusText,
                headers: this.filterHeaders(response.headers as HttpHeaders),
                body: Buffer.from(response.data),
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                switch (error.code) {
                    case 'ECONNREFUSED':
                        throw new Error(
                            `Failed to connect to the target server at http://localhost:${this.localPort}. Please ensure the server is running and accessible.`,
                        );

                    case 'ETIMEDOUT':
                    case 'ECONNABORTED':
                        throw new Error(
                            `The request to the target server at http://localhost:${this.localPort} timed out. Please check the server's responsiveness and network connectivity.`,
                        );
                    default:
                        break;
                }
            }

            // For any other errors, provide a generic error message with details for debugging
            throw new Error(
                `An error occurred while forwarding the request to the target server: ${error.message}`,
            );
        }
    }

    /**
     * Filter out headers that should not be forwarded to the target server or back to the client.
     * @param headers
     * @returns A new set of headers with excluded headers removed.
     */
    private filterHeaders(headers: HttpHeaders): HttpHeaders {
        const filtered: HttpHeaders = {};

        const exclude = new Set([
            'host',
            'connection',
            'content-length', // axios will automatically set the correct content-length based on the body
            'transfer-encoding',
        ]);

        Object.entries(headers).forEach(([key, value]) => {
            if (!exclude.has(key.toLowerCase())) {
                filtered[key] = value;
            }
        });

        return filtered;
    }
}
