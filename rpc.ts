export type RpcRequest = ReplyRequest | UpdateProfileRequest;
export type RpcResponse = ReplyResponse | UpdateProfileResponse;

// reply

export interface ReplyRequest {
    readonly kind: 'reply';
    readonly inReplyTo: string; // e.g. https://example.social/users/someone/statuses/123123123123123123
    readonly content: string; // e.g. <p>Hello world</p>
    readonly inbox: string; // e.g. https://example.social/users/someone/inbox
    readonly to: string; // e.g. https://example.social/users/someone
    readonly dryRun?: boolean;
}

// deno-lint-ignore no-explicit-any
export function isReplyRequest(obj: any): obj is ReplyRequest {
    return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
        && obj.kind === 'reply'
        && typeof obj.inReplyTo === 'string'
        && typeof obj.content === 'string'
        && typeof obj.inbox === 'string'
        && typeof obj.to === 'string'
        && (obj.dryRun === undefined || typeof obj.dryRun === 'boolean')
        ;
}

export interface ReplyResponse {
    readonly kind: 'reply';
}

// update-profile

export interface UpdateProfileRequest {
    readonly kind: 'update-profile';
    readonly inbox: string; // e.g. https://example.social/users/someone/inbox
    readonly dryRun?: boolean;
}

// deno-lint-ignore no-explicit-any
export function isUpdateProfileRequest(obj: any): obj is UpdateProfileRequest {
    return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
        && obj.kind === 'update-profile'
        && typeof obj.inbox === 'string'
        && (obj.dryRun === undefined || typeof obj.dryRun === 'boolean')
        ;
}

export interface UpdateProfileResponse {
    readonly kind: 'update-profile';
}
