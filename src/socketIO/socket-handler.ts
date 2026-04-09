import {
    ConnectAckMessage,
    MessageType,
    RequestMessage,
    TunnelMessage,
} from '@app/interfaces/protocol.interface';
import { TunnelClientOptions } from '@app/interfaces/tunnel-client.interface';
import { MessageHandlerService } from '@app/services/message-handler.service';
import { parseMessage, sendConnectMessage } from '@app/utils/utils';
import { Socket } from 'socket.io-client';

export class SocketIOHandler {
    private socket: Socket;
    private options: TunnelClientOptions;
    private messageHandler: MessageHandlerService;

    constructor(
        socket: Socket,
        options: TunnelClientOptions,
        messageHandler: MessageHandlerService,
    ) {
        this.socket = socket;
        this.options = options;
        this.messageHandler = messageHandler;
    }

    public listen(
        resolve: (value: void | PromiseLike<void>) => void,
        reject: (reason?: any) => void,
    ): void {
        this.socket.on('connect', () => {
            sendConnectMessage(this.options, this.socket);
        });

        // Listen for messages from the server and handle them accordingly
        this.socket.on('message', (data: string) => {
            try {
                const message = parseMessage(data);
                this.handleMessage(message);

                // If we receive a CONNECT_ACK or CONNECT message and we're not already marked as connected, set the connection state to true
                if (
                    (message.type === MessageType.CONNECT ||
                        message.type === MessageType.CONNECT_ACK) &&
                    !this.messageHandler.getIsConnected()
                ) {
                    this.messageHandler.setIsConnected(true);
                    resolve();
                }
            } catch (error) {
                console.error(
                    '[AGENT] Failed to parse message from server:',
                    error,
                );
            }
        });

        this.socket.on('disconnect', (error) => {
            console.log('[AGENT] Socket.IO connection closed', error);
            this.messageHandler.handleDisconnect();
        });

        this.socket.on('error', (error) => {
            console.error('[AGENT] Socket.IO error:', error);
        });

        this.socket.on('connect_error', (error: Error) => {
            if (!this.messageHandler.getIsConnected()) {
                reject(error);
            } else {
                console.error(
                    '[AGENT] Connection error during reconnection:',
                    error.message,
                );
            }
        });
    }

    private async handleMessage(message: TunnelMessage): Promise<void> {
        switch (message.type) {
            case MessageType.CONNECT:
                this.messageHandler.handleConnect();
                break;

            case MessageType.CONNECT_ACK:
                this.messageHandler.handleConnectAck(
                    message as ConnectAckMessage,
                );
                break;

            case MessageType.REQUEST:
                this.messageHandler.handleRequest(message as RequestMessage);
                break;

            case MessageType.ERROR:
                console.error(
                    `[AGENT] Error from server: ${message.code} - ${message.message}`,
                );
                break;

            default:
                console.warn(
                    `[AGENT] Received unknown message type: ${message.type}`,
                );
        }
    }
}
