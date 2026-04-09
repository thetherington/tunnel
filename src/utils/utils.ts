import { AGENT_VERSION } from '@app/config';
import {
    ConnectMessage,
    MessageType,
    RequestLogMessage,
    RequestMessage,
    TunnelMessage,
} from '@app/interfaces/protocol.interface';
import { TunnelClientOptions } from '@app/interfaces/tunnel-client.interface';
import { Socket } from 'socket.io-client';

export function createMessage<T extends TunnelMessage>(
    type: MessageType,
    payload: Omit<T, 'type' | 'timestamp'>,
): T {
    return {
        ...payload,
        type,
        timestamp: Date.now(),
    } as T;
}

/**
 * Parse a JSON string into a TunnelMessage.
 * @param data The JSON string to parse.
 * @returns The parsed TunnelMessage.
 */
export function parseMessage(data: string): TunnelMessage {
    return JSON.parse(data) as TunnelMessage;
}

/**
 * Serialize a TunnelMessage into a JSON string.
 * @param message The TunnelMessage to serialize.
 * @returns The serialized JSON string.
 */
export function serializeMessage(message: TunnelMessage): string {
    return JSON.stringify(message);
}

/**
 * Send a request log message to the server with details about the request and response.
 * @param socket The Socket.IO client instance used to send the message.
 * @param tunnelId The ID of the tunnel associated with the request.
 * @param publicUrl The public URL of the tunnel, used for logging purposes.
 * @param requestMessage The original request message received from the server.
 * @param statusCode The HTTP status code of the response sent back to the client.
 * @param responseTime The time taken to process the request and send the response, in milliseconds.
 * @param errorMessage An optional error message if an error occurred while processing the request.
 */
export function sendRequestLog(
    socket: Socket | null,
    tunnelId: string,
    publicUrl: string,
    requestMessage: RequestMessage,
    statusCode: number,
    responseTime: number,
    errorMessage?: string,
): void {
    if (!tunnelId) return;

    try {
        const headers = requestMessage.metadata.headers;
        const userAgent = headers['user-agent'] as string | undefined;
        const host = (headers['host'] as string) || publicUrl || 'unknown';

        const logMessage = createMessage<RequestLogMessage>(
            MessageType.REQUEST_LOG,
            {
                tunnelId,
                method: requestMessage.metadata.method,
                host,
                path: requestMessage.metadata.path,
                statusCode,
                responseTime,
                userAgent,
                ipAddress: headers['x-forwarded-for'] as string,
                errorMessage,
            },
        );

        socket?.emit('message', serializeMessage(logMessage));
    } catch (error) {}
}

export function sendConnectMessage(
    options: TunnelClientOptions,
    socket: Socket | null,
): void {
    const connectMessage = createMessage<ConnectMessage>(MessageType.CONNECT, {
        token: options.token,
        requestedSubdomain: options.subdomain,
        agentVersion: AGENT_VERSION!,
        localPort: options.localPort,
        requestCount: 0,
    });

    socket?.emit('message', serializeMessage(connectMessage));
}

/**
 * Fixes the public URL by removing port numbers and ensuring the correct protocol.
 * @param url
 * @param subdomain
 * @param options
 * @returns
 */
export function fixPublicUrl(
    url: string,
    subdomain: string,
    options: TunnelClientOptions,
): string {
    try {
        // Localhost URLs, no need fixing
        if (/localhost|127\.0\.0\.1/.test(url)) {
            return url;
        }

        // Remove port numbers that may be fused with the top-level domain (e.g., .com3000) or trailing port numbers (e.g., :12345)
        let fixedUrl = url
            // strip port numbers fused with the top level domain (eg. .com3000 => .com)
            .replace(/\.(com|net|org|io|dev|app|co|fit|live)\d+/g, '.$1')
            // strip trailing port numbers (eg. :12345)
            .replace(/:(\d+)$/, '');

        // If the server URL has a domain and the fixed URL doesn't include it, prepend the server's domain to the fixed URL
        const serverDomain = options.serverUrl.match(
            /(?:wss?:\/\/)?([^:/]+)/,
        )?.[1];

        // Only prepend the server domain if it's not already included in the fixed URL and we have a subdomain to work with
        if (serverDomain && subdomain && !fixedUrl.includes(serverDomain)) {
            const protocol = options.serverUrl!.startsWith('https://')
                ? 'https://'
                : 'http://';

            fixedUrl = `${protocol}${subdomain}${serverDomain}`;
        }

        return fixedUrl.replace(/^http:\/\//, 'https://');
    } catch (error) {
        console.warn('[Agent] Error fixing public URL, using original:', error);
        return url;
    }
}
