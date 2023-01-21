/**
 * Snapshot of an ActivityPub thread tree, starting at a given root object url.
 *
 * Serializable json object that can be saved, then reloaded to resume or update.
 *
 * Create a new threadcap using {@link makeThreadcap}.
 *
 * Update an existing threadcap using {@link updateThreadcap}.
 */
export interface Threadcap {
    /**
     * One or more id urls of the root-level nodes.
     *
     * Use these to lookup the corresponding root {@link Node} when starting to recurse down a reply tree.
    */
    readonly roots: readonly string[];
    /**
     * Comment data nodes captured so far, keyed by ActivityPub id.
     *
     * Each {@link Node} has information on any comment content or error found, and pointers to its direct replies or error found.
     */
    readonly nodes: Record<string, Node>;
    /**
     * Information about each {@link Commenter} captured so far, keyed by ActivityPub id (e.g the {@link Comment#attributedTo}).
     *
     * Kept here, outside of {@link nodes}, to minimize data duplication if a reply tree has multiple comments from the same commenter.
     *
     * In general, you can assume that all {@link Comment#attributedTo} references inside {@link nodes} have corresponding referents here.
     */
    readonly commenters: Record<string, Commenter>;
    /**
     * Underlying protocol used to capture the thread.
     *
     * Supported protocols: activitypub (default), twitter
     */
    readonly protocol?: Protocol;
}
/** An ISO-8601 date at GMT, including optional milliseconds, e.g. `1970-01-01T00:00:00Z` or `1970-01-01T00:00:00.123Z` */
export declare type Instant = string;
/** Supported protocols for capturing comment threads: activitypub, twitter */
export declare type Protocol = 'activitypub' | 'twitter';
export declare function isValidProtocol(protocol: string): protocol is Protocol;
/**
 * Snapshot of a single comment inside of a larger {@link Threadcap}.
 *
 * Includes data about the comment content itself and pointers to its direct reply nodes.
 */
export interface Node {
    /** Inline comment info, enough to render the comment itself (no replies). **/
    comment?: Comment;
    /**
     * Error encountered when trying to fetch and parse this comment info.
     *
     * Either `comment` or `commentError` will be defined, never both.
     */
    commentError?: string;
    /** Time when the comment info or error was updated. */
    commentAsof?: Instant;
    /**
     * ActivityPub ids of the direct child replies, once found completely.
     *
     * Use these to lookup the corresponding {@link Node nodes} when recursing down a reply tree.
     *
     * An empty array indicates no child replies were found, `undefined` means they have yet to be fetched, or failed to fetch.
     */
    replies?: readonly string[];
    /**
     * Error encountered when trying to fetch and parse the direct child replies.
     *
     * Either `replies` or `repliesError` will be defined, never both.
     */
    repliesError?: string;
    /** Time when the replies info or error was updated. */
    repliesAsof?: Instant;
}
/** Inline comment info, enough to render the comment itself (no replies). */
export interface Comment {
    /** Public web link to this comment, if available. */
    readonly url?: string;
    /**
     * Time this comment was published.
     *
     * Value comes directly from the ActivityPub payload, which is usually ISO-8601.
     */
    readonly published?: string;
    /** Media attachments included in this comment, if any. */
    readonly attachments: Attachment[];
    /**
     * Content (which may include html) for this comment, broken out by language code.
     *
     * ActivityPub technically supports multiple translations of a single post, though most servers will capture only one in their user interface.
     *
     * A language code of `und` indicates the server did not specify a language.
     *
     * One way to get the content html for the first (and usually only) language is `Object.values(content)[0]`.
     */
    readonly content: Record<string, string>;
    /**
     * ActivityPub id to the [Person](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-person) (or [Service](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-service)) actor that is responsible for this comment.
     *
     * Look up the full {@link Commenter} info using {@link Threadcap#commenters }, with this value as the index.
     */
    readonly attributedTo: string;
}
/** Media attachments to a comment */
export interface Attachment {
    /** Mime type of the attachment. */
    readonly mediaType: string;
    /** Width of the attachment image or video, if applicable. */
    readonly width?: number;
    /** Height of the attachment image or video, if applicable. */
    readonly height?: number;
    /** Source url to the attachment image or video. */
    readonly url: string;
}
/** Information about the commenter, typically a [Person](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-person) or [Service](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-service) actor. */
export interface Commenter {
    /** Profile icon for the commenter, if any */
    readonly icon?: Icon;
    /** Display name of the commenter. */
    readonly name: string;
    /** Web link to the commenter profile. */
    readonly url?: string;
    /** Fully-qualified fediverse username, e.g. `@user@example.com` */
    readonly fqUsername?: string;
    /** Time this information was last fetched */
    readonly asof: Instant;
}
/** Information about an icon associated with a {@link Commenter} */
export interface Icon {
    /** Source url to the icon image. */
    readonly url: string;
    /** Mime type of the icon image, if known. */
    readonly mediaType?: string;
}
/**
 * Function that performs an underlying HTTP GET call for `url` with the specified request `headers`, if any.
 *
 * Since many ActivityPub implementations do not make their data available over CORS, you may need to provide
 * a function that tries a browser-side call first, with a server-side proxy fallback.
 *
 * If running on the server, you can simply provide any standard `fetch` function. In Node, you can use `node-fetch` for example. In Deno, you can simply use the standard built-in `fetch` global.
 */
export declare type Fetcher = (url: string, opts?: {
    headers?: Record<string, string>;
}) => Promise<Response>;
/**
 * HTTP response cache utilized when calling {@link makeThreadcap} or {@link updateThreadcap}.
 *
 * You can implement your own to tie into your own data storage backend, or use {@link InMemoryCache} to keep a cache around only in memory.
 */
export interface Cache {
    /**
     * Find a cached {@link TextResponse} for the given ActivityPub id that is still considered current after the specified time.
     *
     * Can return `undefined` if none are found.  This will usually trigger a refetch during the update process.
     */
    get(id: string, after: Instant): Promise<TextResponse | undefined>;
    /**
     * Save the given {@link TextResponse} as the current value (as of `fetched`) for the given ActivityPub id.
     *
     * Its up to the cache implementation to decide where/whether to store it somewhere before returning.
     */
    put(id: string, fetched: Instant, response: TextResponse): Promise<void>;
}
/** HTTP response with a text body. */
export interface TextResponse {
    /** The HTTP response {@link Response#status}. */
    readonly status: number;
    /** The HTTP response {@link Response#headers}. */
    readonly headers: Record<string, string>;
    /** The HTTP response body {@link Response#text} as a string. */
    readonly bodyText: string;
}
/** If customizing the rate-limiter wait function used in {@link makeRateLimitedFetcher}, these are the inputs you have to work with. */
export declare type RateLimiterInput = {
    endpoint: string;
    limit: number;
    remaining: number;
    reset: string;
    millisTillReset: number;
};
/**
 * Real-time callbacks fired when running {@link updateThreadcap}.
 *
 * Long threads can take while to update, so this is often a good way to trigger incremental progress updates as it continues to process.
 */
export interface Callbacks {
    /**
     * Receive a callback event.
     *
     * @param event See the possible event types in {@link Event}.
     */
    onEvent(event: Event): void;
}
/** All possible callback event types. See {@link Callbacks#onEvent} */
export declare type Event = WarningEvent | ProcessLevelEvent | NodesRemainingEvent | NodeProcessedEvent | WaitingForRateLimitEvent;
/** Fired when a non-fatal warning has occurred, like an ActivityPub object was found without the 'replies' property. */
export interface WarningEvent {
    readonly kind: 'warning';
    readonly nodeId: string;
    readonly url: string;
    readonly message: string;
    readonly object?: any;
}
/** Fired right before, and right after processing a given level of the reply tree. */
export interface ProcessLevelEvent {
    readonly kind: 'process-level';
    readonly phase: 'before' | 'after';
    readonly level: number;
}
/** Fired when the known number of nodes remaining in an update changes. */
export interface NodesRemainingEvent {
    readonly kind: 'nodes-remaining';
    readonly remaining: number;
}
/** Fired right after a single Node's inline comment information is updated, and also after a single Node's direct reply ids are updated. */
export interface NodeProcessedEvent {
    readonly kind: 'node-processed';
    readonly nodeId: string;
    readonly part: 'comment' | 'replies';
    readonly updated: boolean;
}
/** Fired when an update is waiting (sleeping) due to rate-limiting by the server. */
export interface WaitingForRateLimitEvent {
    readonly kind: 'waiting-for-rate-limit';
    readonly endpoint: string;
    readonly millisToWait: number;
    readonly millisTillReset: number;
    readonly limit: number;
    readonly remaining: number;
    readonly reset: Instant;
}
/** Maximum number of levels to process in the reply tree. */
export declare const MAX_LEVELS = 1000;
/**
 * Creates a new threadcap for a given root post url.
 *
 * @param url Root post url, should return ActivityPub data if requested with `Accept: application/activity+json`.
 * @param opts The user-agent to use when fetching, the underlying {@link Fetcher} function, and the {@link Cache} implemention to use.
 *
 * @returns A new {@link Threadcap} structure, or throws if the input url does not respond to an ActivityPub request.
 */
export declare function makeThreadcap(url: string, opts: {
    userAgent: string;
    fetcher: Fetcher;
    cache: Cache;
    protocol?: Protocol;
    bearerToken?: string;
    debug?: boolean;
}): Promise<Threadcap>;
/**
 * Update or refresh a {@link Threadcap} in place by making underlying ActivityPub calls to enumerate the reply tree.
 *
 * @param threadcap Existing {@link Threadcap} structure, will be modified in-place as the update proceeds.
 * @param opts Inputs to use for the update pass:
 * - `updateTime`: An ISO-8601 time that represents the time of the update request.  You can resume an existing update by passing in the same time.
 * - `maxLevels`: (optional) Stop processing after processing a certain number of levels.  For example, `2` would flesh out the root comment (level 1) and also its direct reply comments (level 2).
 * - `maxNodes`: (optional) Stop processing after processing a certain total number of nodes.
 * - `startNode`: (optional) Start processing at a subnode, not the root node.  This is useful when a user hits 'refresh' on a given comment subnode.
 * - `keepGoing`: (optional) Stop processing when this custom function returns `false`, if provided.  Can be used to safely abort a long-running update.
 * - `userAgent`: The user-agent to use when fetching.
 * - `fetcher`: The underlying {@link Fetcher} function to use.
 * - `cache`: The {@link Cache} implementation to use.
 * - `callbacks`: (optional) The {@link Callbacks} interface to listen to interesting events in real-time during the update.
 */
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
    bearerToken?: string;
    debug?: boolean;
}): Promise<void>;
/** Simple implementation of {@link Cache} that keeps everything around in memory. */
export declare class InMemoryCache implements Cache {
    private readonly map;
    onReturningCachedResponse?: (id: string, after: Instant, fetched: Instant, response: TextResponse) => void;
    get(id: string, after: Instant): Promise<TextResponse | undefined>;
    put(id: string, fetched: Instant, response: TextResponse): Promise<void>;
}
/** If no custom function is passed to {@link makeRateLimitedFetcher}, this is the function that is used to determine how long to wait (sleep) before making a rate-limited fetch call. */
export declare function computeDefaultMillisToWait(input: RateLimiterInput): number;
/**
 * Creates a rate-limiting {@link Fetcher} out of an underlying {@link Fetcher}.
 *
 * This will respect the standard rate limit headers coming back from remote servers when making ActivityPub calls.
 *
 * @param fetcher Underlying (non-rate-limited) fetcher.
 * @param opts (optional) Optional callbacks and custom function to use when determining how long to wait (sleep) before a rate-limited fetch call.
 *
 * @returns A rate-limited fetcher.
 */
export declare function makeRateLimitedFetcher(fetcher: Fetcher, opts?: {
    callbacks?: Callbacks;
    computeMillisToWait?: (input: RateLimiterInput) => number;
}): Fetcher;
/**
 * Creates a {@link Fetcher} that supports request signing for ActivityPub requests out of an underlying {@link Fetcher}.
 *
 * By default, it will only sign requests for target hosts that require it.  To sign all requests, set `mode` to `'always'`.
 *
 * @param fetcher Underlying fetcher.
 * @param opts Public keyId URL (e.g. `'https://my-social.example/actor#main-key'`) and private key text (usually starts with `-----BEGIN PRIVATE KEY-----`)
 *
 * @returns A fetcher that supports request signing for ActivityPub requests
 */
export declare function makeSigningAwareFetcher(fetcher: Fetcher, opts: {
    keyId: string;
    privateKeyPemText: string;
    mode?: 'always' | 'when-needed';
}): Promise<Fetcher>;
