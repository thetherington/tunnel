export interface ProxyRequest {
    method: string;
    path: string;
    query: string;
    headers: Record<string, string | string[]>;
    body: Buffer;
}

export interface ProxyResponse {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string | string[]>;
    body: Buffer;
}
