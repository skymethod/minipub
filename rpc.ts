export type RpcRequest = ReplyRequest;
export type RpcResponse = ReplyRequest;

export interface ReplyRequest {
    readonly kind: 'reply';
    readonly inReplyTo: string; // e.g. https://example.social/users/someone/statuses/123123123123123123
    readonly content: string; // e.g. <p>Hello world</p>
    readonly inbox: string; // e.g. https://example.social/users/someone/inbox
    readonly to: string; // e.g. https://example.social/users/someone
}

// deno-lint-ignore no-explicit-any
export function isReplyRequest(obj: any): obj is ReplyRequest {
    return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
        && obj.kind === 'reply'
        && typeof obj.inReplyTo === 'string'
        && typeof obj.content === 'string'
        && typeof obj.inbox === 'string'
        && typeof obj.to === 'string'
        ;
}

export interface ReplyResponse {
    readonly kind: 'reply';
}
