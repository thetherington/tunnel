import { TunnelClientOptions } from '@app/interfaces/tunnel-client.interface';
import { SocketIOHandler } from '@app/socketIO/socket-handler';
import { io, Socket } from 'socket.io-client';
import { MessageHandlerService } from './message-handler.service';
import { createMessage, serializeMessage } from '@app/utils/utils';
import { MessageType } from '@app/interfaces/protocol.interface';

export class TunnelClientService {
    private socket: Socket | null = null;
    private options: TunnelClientOptions;
    private messageHandler: MessageHandlerService | null = null;

    constructor(options: TunnelClientOptions) {
        this.options = {
            reconnect: true,
            ...options,
        };
    }

    async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log(`[AGENT] Connection to ${this.options.serverUrl}...`);

            // Disconnect existing socket if it exists before creating a new one
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }

            // Check if this is a reconnection attempt by seeing if the message handler already exists
            const isReconnection = this.messageHandler !== null;

            // Create a new Socket.IO client instance
            this.socket = io(`${this.options.serverUrl}/agent`, {
                transports: ['websocket'],
                reconnection: false, // Disable built-in reconnection to implement custom logic
                autoConnect: true,
                timeout: 60000, // 60 seconds timeout for connection attempts
            });

            if (!isReconnection) {
                this.messageHandler = new MessageHandlerService(
                    this.socket,
                    this.options,
                    () => this.connect(),
                );
            } else {
                this.messageHandler?.updateSocket(this.socket);
            }

            const socketHandler = new SocketIOHandler(
                this.socket,
                this.options,
                this.messageHandler!,
            );

            socketHandler.listen(resolve, reject);
        });
    }

    disconnect(): void {
        this.messageHandler?.destroy();

        if (this.socket) {
            const disconnectMessage = createMessage(MessageType.DISCONNECT, {
                reason: 'Client initiated disconnect',
            });
            this.socket.emit('message', serializeMessage(disconnectMessage));

            this.socket.disconnect();
            this.socket = null;
        }

        this.messageHandler?.setIsConnected(false);
        console.log('[AGENT] Disconnected');
    }
}
