import { TunnelClientOptions } from '@app/interfaces/tunnel-client.interface';
import { Socket } from 'socket.io-client';
import { HttpProxyService } from './http-proxy.service';
import {
    ConnectAckMessage,
    HeartbeatAckMessage,
    HeartbeatMessage,
    LocalServicePingMessage,
    MessageType,
    RequestMessage,
} from '@app/interfaces/protocol.interface';
import {
    createMessage,
    fixPublicUrl,
    sendConnectMessage,
    sendRequestLog,
    serializeMessage,
} from '@app/utils/utils';

/**
 * MessageHandlerService is responsible for handling all incoming messages from the server, managing the state of the tunnel client, and coordinating the forwarding of requests to the local service. It processes different message types such as CONNECT_ACK, REQUEST, HEARTBEAT, and DISCONNECT to maintain the tunnel connection and ensure smooth communication between the client and server. The service also implements a heartbeat mechanism to keep the connection alive and a reconnection strategy to handle unexpected disconnections gracefully.
 */
export class MessageHandlerService {
    private socket: Socket;
    private options: TunnelClientOptions;
    private isConnected: boolean = false;
    private shouldReconnect: boolean = true;
    private tunnelId: string | null = null;
    private subDomain: string | null = null;
    private publicUrl: string | null = null;
    private httpProxy: HttpProxyService | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private localServicePingInterval: NodeJS.Timeout | null = null;
    private connectFn: () => Promise<void>;

    /**
     * Create a new instance of the MessageHandlerService. This service will handle all incoming messages from the server and manage the state of the tunnel client. It requires a Socket.IO socket instance for communication with the server, the tunnel client options for configuration, and a connect function that can be called to initiate a new connection to the server when needed (e.g., during reconnection attempts).
     * @param socket Socket
     * @param options TunnelClientOptions
     * @param connectFn () => Promise<void>
     */
    constructor(
        socket: Socket,
        options: TunnelClientOptions,
        connectFn: () => Promise<void>,
    ) {
        this.socket = socket;
        this.options = options;
        this.httpProxy = new HttpProxyService(options.localPort);
        this.connectFn = connectFn;
    }

    /**
     * Get the current connection status of the tunnel client.
     * @returns boolean
     */
    getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Set the current connection status of the tunnel client.
     * @param value boolean
     */
    setIsConnected(value: boolean): void {
        this.isConnected = value;
    }

    /**
     * Update the socket instance used by the tunnel client.
     * @param socket Socket
     */
    updateSocket(socket: Socket): void {
        this.socket = socket;
    }

    /**
     * Handle the CONNECT message by sending a connect message to the server if not already connected. This will initiate the tunnel connection process, and upon receiving a CONNECT_ACK message, the client will be fully connected and ready to forward requests.
     */
    handleConnect(): void {
        if (!this.getIsConnected()) {
            sendConnectMessage(this.options, this.socket);
        }
    }

    /**
     * Handle the CONNECT_ACK message by updating the tunnel client's state with the received tunnel ID, subdomain, and public URL. This will also start the heartbeat and local service ping intervals.
     * @param message ConnectAckMessage
     */
    handleConnectAck(message: ConnectAckMessage): void {
        this.tunnelId = message.tunnelId;
        this.subDomain = message.subdomain;

        // Fix the public URL to ensure it has the correct protocol and does not include port numbers, as tunnl will handle the port forwarding internally.
        this.publicUrl = fixPublicUrl(
            message.publicUrl,
            this.subDomain,
            this.options,
        );

        console.log(`
    ╔═══════════════════════════════════════════════════════════════╗
    ║                  Tunnel Established Successfully              ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  Public URL:     ${this.publicUrl.padEnd(43)} ║
    ║  Subdomain:      ${message.subdomain.padEnd(43)} ║
    ║  Tunnel ID:      ${message.tunnelId.padEnd(43)} ║
    ║  Forwarding to:  http://localhost:${this.options.localPort.toString().padEnd(30)} ║
    ╚═══════════════════════════════════════════════════════════════╝
        `);

        // Start heartbeat and local service ping intervals after successful connection
        this.startHeartbeat();
        this.startLocalServicePing();
    }

    /**
     * Handle the REQUEST message by forwarding the incoming request to the target server using the HttpProxyService and sending the response back to the server to be forwarded to the client. This method also logs the request and response details for monitoring and debugging purposes.
     * @param requestMessage RequestMessage
     * @returns Promise<void>
     */
    async handleRequest(requestMessage: RequestMessage): Promise<void> {
        const startTime = Date.now();

        let statusCode = 502;
        let errorMessage: string | undefined;

        try {
            if (!this.httpProxy) return;
            const response = await this.httpProxy.forwardRequest({
                method: requestMessage.metadata.method,
                path: requestMessage.metadata.path,
                query: requestMessage.metadata.query,
                headers: requestMessage.metadata.headers,
                body: Buffer.from(requestMessage.body, 'base64'),
            });

            statusCode = response.statusCode;
            const base64Size = Buffer.from(response.body).toString(
                'base64',
            ).length;

            // If the response body is larger than 10MB when encoded in base64, we will not include it in the response message to avoid overwhelming the client and to prevent potential memory issues. Instead, we will send an error message back to the client indicating that the response body is too large to be forwarded.
            if (base64Size > 10 * 1024 * 1024) {
                console.warn(
                    `[AGENT] WARNING: Large response: (${(base64Size / 1024 / 1024).toFixed(2)}MB may cause connection issues.)`,
                );
            }

            // Send the response back to the server to be forwarded to the client
            const responseMessage = createMessage(MessageType.RESPONSE, {
                streamId: requestMessage.streamId,
                metadata: {
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                    headers: response.headers,
                },
                body: response.body.toString('base64'),
            });

            this.socket?.emit('message', serializeMessage(responseMessage));
        } catch (error) {
            console.log('[AGENT] Error forwarding request:', error);

            const errorMessage = createMessage(MessageType.RESPONSE, {
                streamId: requestMessage.streamId,
                metadata: {
                    statusCode: 502,
                    statusMessage: 'Bad Gateway',
                    headers: { 'content-type': 'text/plain' },
                },
                body: Buffer.from(
                    'Error forwarding request to local service',
                ).toString('base64'),
            });

            this.socket?.emit('message', serializeMessage(errorMessage));
        } finally {
            // Send request log to server
            const responseTime = Date.now() - startTime;
            sendRequestLog(
                this.socket,
                !!this.tunnelId ? this.tunnelId : '',
                !!this.publicUrl ? this.publicUrl : '',
                requestMessage,
                statusCode,
                responseTime,
                errorMessage,
            );
        }
    }

    /**
     * Handle the HEARTBEAT message by sending a HEARTBEAT_ACK message back to the server to indicate that the client is still alive and connected. This helps maintain the connection and allows the server to detect if the client has disconnected or become unresponsive.
     */
    handleHeartbeat(): void {
        const ackMessage = createMessage<HeartbeatAckMessage>(
            MessageType.HEARTBEAT_ACK,
            {},
        );

        this.socket?.emit('message', serializeMessage(ackMessage));
    }

    /**
     * Handle the DISCONNECT message by cleaning up the tunnel client's state, stopping any ongoing intervals, and attempting to reconnect if the disconnect was unexpected and reconnection is enabled in the options.
     */
    handleDisconnect(): void {
        this.isConnected = false;

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.localServicePingInterval) {
            clearInterval(this.localServicePingInterval);
            this.localServicePingInterval = null;
        }

        if (this.shouldReconnect && this.options.reconnect) {
            console.log(
                '[AGENT] Disconnected from server. Attempting to reconnect...',
            );
            this.reconnectTimeout = setTimeout(() => {
                this.attemptReconnect(0);
            }, 5000);
        }

        console.log('[AGENT] Disconnected from server');
    }

    /**
     * Destroy the tunnel client by cleaning up all resources, stopping intervals, and preventing any further reconnection attempts. This should be called when the tunnel client is no longer needed or when the application is shutting down to ensure a clean exit.
     */
    destroy(): void {
        this.shouldReconnect = false;

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.localServicePingInterval) {
            clearInterval(this.localServicePingInterval);
            this.localServicePingInterval = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    /**
     * Start the heartbeat interval to send HEARTBEAT messages to the server every 30 seconds. This helps maintain the connection and allows the server to detect if the client has disconnected or become unresponsive. The interval will be cleared when the client disconnects or is destroyed.
     */
    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.getIsConnected()) {
                const heartbeatMessage = createMessage<HeartbeatMessage>(
                    MessageType.HEARTBEAT,
                    {},
                );

                this.socket.emit('message', serializeMessage(heartbeatMessage));
            }
        }, 30000); // Send heartbeat every 30 seconds
    }

    /**
     * Start the local service ping interval to periodically check the health of the local service by sending a LOCAL_SERVICE_PING message to the server every 5 seconds. This allows the server to monitor the status of the local service and can be used to trigger alerts or notifications if the local service becomes unresponsive or disconnected. The interval will be cleared when the client disconnects or is destroyed.
     */
    private startLocalServicePing(): void {
        this.pingLocalService(); // Ping immediately upon connection

        this.localServicePingInterval = setInterval(() => {
            this.pingLocalService();
        }, 5000); // Ping local service every 5 seconds
    }

    /**
     * Ping the local service by sending a request through the HttpProxyService. This is used to check the health of the local service and ensure that it is responsive. If the ping fails, it indicates that the local service may be down or unresponsive, and this information can be sent to the server through a LOCAL_SERVICE_PING message.
     * @returns
     */
    private async pingLocalService(): Promise<void> {
        if (!this.httpProxy || !this.tunnelId) return;

        try {
            await this.httpProxy.forwardRequest({
                method: 'HEAD',
                path: '/',
                query: '',
                headers: { 'User-Agent': 'Tunnl-Agent-Health-Check' },
                body: Buffer.from(''),
            });

            this.sendLocalServicePing(true);
        } catch (error) {
            if (
                error instanceof Error &&
                (error.message.includes('ECONNREFUSED') ||
                    error.message.includes('Cannot connect to local service') ||
                    error.message.includes('ETIMEDOUT'))
            ) {
                this.sendLocalServicePing(false);
            }
        }
    }

    private sendLocalServicePing(connected: boolean): void {
        if (!this.tunnelId || !this.socket) return;

        const pingMessage = createMessage<LocalServicePingMessage>(
            MessageType.LOCAL_SERVICE_PING,
            {
                tunnelId: this.tunnelId,
                localServiceConnected: connected,
            },
        );

        this.socket.emit('local_service', serializeMessage(pingMessage));
    }

    /**
     * Attempt to reconnect to the server with exponential backoff. This method will try to reconnect up to a maximum number of retries, with a delay that increases exponentially after each failed attempt. If the maximum number of retries is reached or the client is destroyed, the reconnection attempts will stop.
     * @param retryCount The current retry attempt count.
     */
    private async attemptReconnect(retryCount: number): Promise<void> {
        const maxRetries = 10;
        const baseDelay = 5000; // 5 seconds
        const maxDelay = 60000; // 1 minute

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        try {
            console.log(
                `[AGENT] Reconnection attempt ${retryCount + 1}/${maxRetries}`,
            );

            await this.connectFn();

            console.log(`[AGENT] Reconnected successfully!`);
        } catch (error) {
            console.error(
                `[AGENT] Reconnection failed: ${error instanceof Error ? error.message : error}`,
            );

            if (retryCount < maxRetries - 1 && this.shouldReconnect) {
                const delay = Math.min(
                    baseDelay * Math.pow(2, retryCount),
                    maxDelay,
                );
                console.log(
                    `[AGENT] Scheduling next reconnection attempt in ${delay / 1000} seconds...`,
                );
                this.reconnectTimeout = setTimeout(() => {
                    this.attemptReconnect(retryCount + 1);
                }, delay);
            } else {
                console.error(
                    `[AGENT] Maximum reconnection attempts reached. Giving up.`,
                );
                process.exit(1); // Exit the process if maximum retries reached
            }
        }
    }
}
