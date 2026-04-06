export enum MessageType {
    CONNECT = 'CONNECT',
    CONNECT_ACK = 'CONNECT_ACK',
    REQUEST = 'REQUEST',
    RESPONSE = 'RESPONSE',
    REQUEST_LOG = 'REQUEST_LOG',
    HEARTBEAT = 'HEARTBEAT',
    HEARTBEAT_ACK = 'HEARTBEAT_ACK',
    LOCAL_SERVICE_PING = 'LOCAL_SERVICE_PING',
    ERROR = 'ERROR',
    DISCONNECT = 'DISCONNECT',
}

export interface BaseMessage {
    type: MessageType;
    timestamp: number;
}

export interface ConnectMessage extends BaseMessage {
    type: MessageType.CONNECT;
    token?: string;
    requestedSubdomain?: string;
    agentVersion: string;
    localPort?: number;
    requestCount?: number;
}

export interface ConnectAckMessage extends BaseMessage {
    type: MessageType.CONNECT_ACK;
    tunnelId: string;
    subdomain: string;
    publicUrl: string;
}

export interface RequestMessage extends BaseMessage {
    type: MessageType.REQUEST;
    streamId: string;
    tunnelId: string;
    metadata: {
        method: string;
        path: string;
        query: string;
        headers: Record<string, string | string[]>;
    };
    body: string; // base64 encoded
}

export interface ResponseMessage extends BaseMessage {
    type: MessageType.RESPONSE;
    streamId: string;
    metadata: {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string | string[]>;
    };
    body: string; // base64 encoded
}

export interface HeartbeatMessage extends BaseMessage {
    type: MessageType.HEARTBEAT;
}

export interface HeartbeatAckMessage extends BaseMessage {
    type: MessageType.HEARTBEAT_ACK;
}

export interface ErrorMessage extends BaseMessage {
    type: MessageType.ERROR;
    streamId?: string;
    code: string;
    message: string;
}

export interface RequestLogMessage extends BaseMessage {
    type: MessageType.REQUEST_LOG;
    tunnelId: string;
    method: string;
    host: string;
    path: string;
    statusCode: number;
    responseTime: number;
    ipAddress?: string;
    userAgent?: string;
    errorMessage?: string;
}

export interface LocalServicePingMessage extends BaseMessage {
    type: MessageType.LOCAL_SERVICE_PING;
    tunnelId: string;
    localServiceConnected: boolean;
    timestamp: number;
}

export interface DisconnectMessage extends BaseMessage {
    type: MessageType.DISCONNECT;
    reason?: string;
}

export type TunnelMessage =
    | ConnectMessage
    | ConnectAckMessage
    | RequestMessage
    | ResponseMessage
    | RequestLogMessage
    | HeartbeatMessage
    | HeartbeatAckMessage
    | LocalServicePingMessage
    | ErrorMessage
    | DisconnectMessage;
