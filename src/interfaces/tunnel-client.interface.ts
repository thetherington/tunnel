export interface TunnelClientOptions {
    serverUrl: string;
    localPort: number;
    subdomain: string;
    token?: string;
    reconnect?: boolean;
}
