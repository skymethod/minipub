export interface Threadcap {
    readonly root: string;
    readonly nodes: Record<string, Node>;
    readonly commenters: Record<string, Commenter>;
}
export declare type Instant = string;
export interface Node {
    comment?: Comment;
    commentError?: string;
    commentAsof?: Instant;
    replies?: readonly string[];
    repliesError?: string;
    repliesAsof?: Instant;
}
export interface Comment {
    readonly url?: string;
    readonly published?: string;
    readonly attachments: Attachment[];
    readonly content: Record<string, string>;
    readonly attributedTo: string;
}
export interface Attachment {
    readonly mediaType: string;
    readonly width?: number;
    readonly height?: number;
    readonly url: string;
}
export interface Commenter {
    readonly icon?: Icon;
    readonly name: string;
    readonly url: string;
    readonly fqUsername: string;
    readonly asof: Instant;
}
export interface Icon {
    readonly url: string;
    readonly mediaType?: string;
}
export declare type Fetcher = (url: string, opts?: {
    headers?: Record<string, string>;
}) => Promise<Response>;
export interface Cache {
    get(id: string, after: Instant): Promise<Response | undefined>;
    put(id: string, fetched: Instant, response: Response): Promise<void>;
}
export declare type RateLimiterInput = {
    hostname: string;
    limit: number;
    remaining: number;
    reset: string;
    millisTillReset: number;
};
export interface Callbacks {
    onEvent(event: Event): void;
}
export declare type Event = WarningEvent | ProcessLevelEvent | NodesRemainingEvent | NodeProcessedEvent | WaitingForRateLimitEvent;
export interface WarningEvent {
    readonly kind: 'warning';
    readonly nodeId: string;
    readonly url: string;
    readonly message: string;
    readonly object?: any;
}
export interface ProcessLevelEvent {
    readonly kind: 'process-level';
    readonly phase: 'before' | 'after';
    readonly level: number;
}
export interface NodesRemainingEvent {
    readonly kind: 'nodes-remaining';
    readonly remaining: number;
}
export interface NodeProcessedEvent {
    readonly kind: 'node-processed';
    readonly nodeId: string;
    readonly part: 'comment' | 'replies';
    readonly updated: boolean;
}
export interface WaitingForRateLimitEvent {
    readonly kind: 'waiting-for-rate-limit';
    readonly hostname: string;
    readonly millisToWait: number;
    readonly millisTillReset: number;
    readonly limit: number;
    readonly remaining: number;
    readonly reset: Instant;
}
/** Maximum number of levels to process in a reply chain */
export declare const MAX_LEVELS = 1000;
export declare function makeThreadcap(url: string, opts: {
    userAgent: string;
    fetcher: Fetcher;
    cache: Cache;
}): Promise<Threadcap>;
export declare function updateThreadcap(threadcap: Threadcap, opts: {
    updateTime: Instant;
    maxLevels?: number;
    maxNodes?: number;
    startNode?: string;
    keepGoing?: () => boolean;
    userAgent: string;
    fetcher: Fetcher;
    cache: Cache;
    callbacks?: Callbacks;
}): Promise<void>;
export declare class InMemoryCache implements Cache {
    private readonly map;
    get(id: string, after: Instant): Promise<Response | undefined>;
    put(id: string, fetched: Instant, response: Response): Promise<void>;
}
export declare function computeDefaultMillisToWait(input: RateLimiterInput): number;
export declare function makeRateLimitedFetcher(fetcher: Fetcher, opts?: {
    callbacks?: Callbacks;
    computeMillisToWait?: (input: RateLimiterInput) => number;
}): Fetcher;
