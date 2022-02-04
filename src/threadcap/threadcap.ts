// deno-lint-ignore-file no-explicit-any
import { isReadonlyArray, isStringRecord, isValidIso8601 } from '../check.ts';

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
     * ActivityPub id of the root object url.
     * 
     * Use this to lookup the corresponding root {@link Node} when starting to recurse down a reply tree.
    */
    readonly root: string;

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
}

/** An ISO-8601 date at GMT, including optional milliseconds, e.g. `1970-01-01T00:00:00Z` or `1970-01-01T00:00:00.123Z` */
export type Instant = string;

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
    readonly url: string;

    /** Fully-qualified fediverse username, e.g. `@user@example.com` */
    readonly fqUsername: string;

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
export type Fetcher = (url: string, opts?: { headers?: Record<string, string> }) => Promise<Response>;

/**
 * HTTP response cache utilized when calling {@link makeThreadcap} or {@link updateThreadcap}.
 * 
 * You can implement your own to tie into your own data storage backend, or use {@link InMemoryCache} to keep a cache around only in memory.
 */
export interface Cache {

    /**
     * Find a cached {@link Response} for the given ActivityPub id that is still considered current after the specified time.
     * 
     * Can return `undefined` if none are found.  This will usually trigger a refetch during the update process.
     * 
     * Assume that any {@link Response} returned here will be read.  Clone any responses you are keeping around only in memory, since response body streams can only be read once.
     */
    get(id: string, after: Instant): Promise<Response | undefined>;

    /**
     * Save the given {@link Response} as the current value (as of `fetched`) for the given ActivityPub id.
     * 
     * Its up to the cache implementation to decide where/whether to store it somewhere before returning.
     */
    put(id: string, fetched: Instant, response: Response): Promise<void>;
}

/** If customizing the rate-limiter wait function used in {@link makeRateLimitedFetcher}, these are the inputs you have to work with. */
export type RateLimiterInput = { hostname: string, limit: number, remaining: number, reset: string, millisTillReset: number };

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
export type Event = WarningEvent | ProcessLevelEvent | NodesRemainingEvent | NodeProcessedEvent | WaitingForRateLimitEvent;

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
    readonly hostname: string;
    readonly millisToWait: number;
    readonly millisTillReset: number;
    readonly limit: number;
    readonly remaining: number;
    readonly reset: Instant;
}

//

/** Maximum number of levels to process in the reply tree. */
export const MAX_LEVELS = 1000; // go down at most this many levels (this would be quite the reply chain) we hit max recursion at about 3600

/**
 * Creates a new threadcap for a given root post url.
 * 
 * @param url Root post url, should return ActivityPub data if requested with `Accept: application/activity+json`.
 * @param opts The user-agent to use when fetching, the underlying {@link Fetcher} function, and the {@link Cache} implemention to use.
 * 
 * @returns A new {@link Threadcap} structure, or throws if the input url does not respond to an ActivityPub request.
 */
export async function makeThreadcap(url: string, opts: { userAgent: string, fetcher: Fetcher, cache: Cache }): Promise<Threadcap> {
    const { cache, userAgent } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string') throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (!/^(Note|Article|Video|PodcastEpisode)$/.test(type)) throw new Error(`Unexpected type: ${type}`); // PodcastEpisode = castopod, handled below, non-standard AP
    if (typeof id !== 'string') throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return { root: id, nodes: { }, commenters: { } };
}

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
 * - `fetcher`: The underlying {@link Fetcher} function, and the {@link Cache} implemention to use.
 * - `cache`: The {@link Cache} implemention to use.
 * - `callbacks`: (optional) The {@link Callbacks} interface to listen to interesting events in real-time during the update.
 */
export async function updateThreadcap(threadcap: Threadcap, opts: { 
        updateTime: Instant, maxLevels?: number, maxNodes?: number, startNode?: string, keepGoing?: () => boolean, 
        userAgent: string, fetcher: Fetcher, cache: Cache, callbacks?: Callbacks }) {
    const { userAgent, cache, updateTime, callbacks, maxLevels, maxNodes: maxNodesInput, startNode, keepGoing } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const maxLevel = Math.min(Math.max(maxLevels === undefined ? MAX_LEVELS : Math.round(maxLevels), 0), MAX_LEVELS);
    const maxNodes = maxNodesInput === undefined ? undefined : Math.max(Math.round(maxNodesInput), 0);
    if (startNode && !threadcap.nodes[startNode]) throw new Error(`Invalid start node: ${startNode}`);

    if (maxLevel === 0) return;
    if (maxNodes === 0) return;

    const idsBylevel: string[][] = [ [ startNode || threadcap.root ]];
    let remaining = 1;
    let processed = 0;

    const processLevel = async (level: number) => {
        callbacks?.onEvent({ kind: 'process-level', phase: 'before', level: level + 1 });
        const nextLevel = level + 1;
        for (const id of idsBylevel[level] || []) {
            const processReplies = nextLevel < maxLevel;
            const node = await processNode(id, processReplies, threadcap, updateTime, fetcher, cache, callbacks);
            remaining--;
            processed++;
            if (maxNodes && processed >= maxNodes) return;
            if (keepGoing && !keepGoing()) return;
            if (node.replies && nextLevel < maxLevel) {
                if (!idsBylevel[nextLevel]) idsBylevel[nextLevel] = [];
                idsBylevel[nextLevel].push(...node.replies);
                remaining += node.replies.length;
            }
            callbacks?.onEvent({ kind: 'nodes-remaining', remaining });
        }
        callbacks?.onEvent({ kind: 'process-level', phase: 'after', level: level + 1 });
        if (idsBylevel[nextLevel]) await processLevel(nextLevel);
    };
    await processLevel(0);
}

/** Simple implementation of {@link Cache} that keeps everything around in memory. */
export class InMemoryCache implements Cache {
    private readonly map = new Map<string, { response: Response, fetched: Instant }>();

    get(id: string, after: Instant): Promise<Response | undefined> {
        const { response, fetched } = this.map.get(id) || {};
        return Promise.resolve(response && fetched && fetched > after ? response.clone() : undefined);
    }

    put(id: string, fetched: Instant, response: Response): Promise<void> {
        this.map.set(id, { response, fetched });
        return Promise.resolve();
    }

}

/** If no custom function is passed to {@link makeRateLimitedFetcher}, this is the function that is used to determine how long to wait (sleep) before making a rate-limited fetch call. */
export function computeDefaultMillisToWait(input: RateLimiterInput): number {
    const { remaining, millisTillReset } = input;
    if (remaining >= 100) return 0; // allow bursting, mastodon gives you 300 per period
    return remaining > 0 ? Math.round(millisTillReset / remaining) : millisTillReset;
}

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
export function makeRateLimitedFetcher(fetcher: Fetcher, opts: { callbacks?: Callbacks, computeMillisToWait?: (input: RateLimiterInput) => number } = {}): Fetcher {
    const { callbacks } = opts;
    const computeMillisToWait = opts.computeMillisToWait || computeDefaultMillisToWait;
    const hostLimits = new Map<string, { limit: number, remaining: number, reset: string }>();
    
    return async (url, opts) => {
        const hostname = new URL(url).hostname;
        const limits = hostLimits.get(hostname);
        if (limits) {
            const { limit, remaining, reset } = limits;
            const millisTillReset = new Date(reset).getTime() - Date.now();
            const millisToWait = computeMillisToWait({ hostname, limit, remaining, reset, millisTillReset });
            if (millisToWait > 0) {
                callbacks?.onEvent({ kind: 'waiting-for-rate-limit', hostname, millisToWait, millisTillReset, limit, remaining, reset });
                await sleep(millisToWait);
            }
        }
        const res = await fetcher(url, opts);
        const limit = tryParseInt(res.headers.get('x-ratelimit-limit') || '');
        const remaining = tryParseInt(res.headers.get('x-ratelimit-remaining') || '');
        const reset = tryParseIso8601(res.headers.get('x-ratelimit-reset') || '');
        if (limit !== undefined && remaining !== undefined && reset !== undefined) {
            hostLimits.set(hostname, { limit, remaining, reset });
        }
        return res;
    }
}

//

const APPLICATION_ACTIVITY_JSON = 'application/activity+json';

async function findOrFetchActivityPubObject(url: string, after: Instant, fetcher: Fetcher, cache: Cache): Promise<any> {
    const response = await findOrFetchActivityPubResponse(url, after, fetcher, cache);
    const { status, headers } = response;
    if (status !== 200) throw new Error(`Expected 200 response for ${url}, found ${status} body=${await response.text()}`);
    const contentType = headers.get('content-type') || '<none>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Expected json response for ${url}, found ${contentType} body=${await response.text()}`);
    return await response.json();
}

async function findOrFetchActivityPubResponse(url: string, after: Instant, fetcher: Fetcher, cache: Cache): Promise<Response> {
    const existing = await cache.get(url, after);
    if (existing) return existing;
    const res = await fetcher(url, { headers: { accept: APPLICATION_ACTIVITY_JSON }});
    await cache.put(url, new Date().toISOString(), res.clone());
    return res;
}

async function processNode(id: string, processReplies: boolean, threadcap: Threadcap, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<Node> {
    // ensure node exists
    let node = threadcap.nodes[id];
    if (!node) {
        node = { };
        threadcap.nodes[id] = node;
    }

    // update the comment + commenter
    const updateComment = !node.commentAsof || node.commentAsof < updateTime;
    if (updateComment) {
        try {
            node.comment = await fetchComment(id, updateTime, fetcher, cache, callbacks);
            const { attributedTo } = node.comment;
            const existingCommenter = threadcap.commenters[attributedTo];
            if (!existingCommenter || existingCommenter.asof < updateTime) {
                threadcap.commenters[attributedTo] = await fetchCommenter(attributedTo, updateTime, fetcher, cache);
            }
            node.commentError = undefined;
        } catch (e) {
            node.comment = undefined;
            node.commentError = `${e.stack || e}`;
        }
        node.commentAsof = updateTime;
    }

    callbacks?.onEvent({ kind: 'node-processed', nodeId: id, part: 'comment', updated: updateComment });

    if (processReplies) {
        // update the replies
        const updateReplies = !node.repliesAsof || node.repliesAsof < updateTime;
        if (updateReplies) {
            try {
                node.replies = await fetchReplies(id, updateTime, fetcher, cache, callbacks);
                node.repliesError = undefined;
            } catch (e) {
                node.replies = undefined;
                node.repliesError = `${e.stack || e}`;
            }
            node.repliesAsof = updateTime;
        }
        callbacks?.onEvent({ kind: 'node-processed', nodeId: id, part: 'replies', updated: updateReplies });
    }

    return node;
}

async function fetchComment(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<Comment> {
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id, callbacks);
}

async function fetchCommenter(attributedTo: string, updateTime: Instant, fetcher: Fetcher, cache: Cache): Promise<Commenter> {
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}

async function fetchReplies(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<readonly string[]> {
    const fetchedObject = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    const object = unwrapActivityIfNecessary(fetchedObject, id, callbacks);
    const replies = object.type === 'PodcastEpisode' ? object.comments : object.replies; // castopod uses 'comments' url to an OrderedCollection
    if (replies === undefined) {
        const message = object.type === 'PodcastEpisode' ? `No 'comments' found on PodcastEpisode object` : `No 'replies' found on object`;
        callbacks?.onEvent({ kind: 'warning', url: id, nodeId: id, message, object });
        return [];
    }

    const rt: string[] = [];
    const fetched = new Set<string>();
    if (typeof replies === 'string') {
        const obj = await findOrFetchActivityPubObject(replies, updateTime, fetcher, cache);
        if (obj.type === 'OrderedCollection') {
            return await collectRepliesFromOrderedCollection(obj, updateTime, id, fetcher, cache, callbacks, fetched);
        } else {
            throw new Error(`Expected 'replies' to point to an OrderedCollection, found ${JSON.stringify(obj)}`);
        }
    } else if (replies.first) {
        if (typeof replies.first === 'object' && replies.first.type === 'CollectionPage') {
            if (!replies.first.items && !replies.first.next) throw new Error(`Expected 'replies.first.items' or 'replies.first.next' to be present, found ${JSON.stringify(replies.first)}`);
            if (Array.isArray(replies.first.items) && replies.first.items.length > 0) {
                collectRepliesFromItems(replies.first.items, rt, id, id, callbacks);
            }
            if (replies.first.next) {
                if (typeof replies.first.next === 'string') {
                    rt.push(...await collectRepliesFromPages(replies.first.next, updateTime, id, fetcher, cache, callbacks, fetched));
                } else {
                    throw new Error(`Expected 'replies.first.next' to be a string, found ${JSON.stringify(replies.first.next)}`);
                }
            }
            return rt;
        } else {
            throw new Error(`Expected 'replies.first.items' array, or 'replies.first.next' string, found ${JSON.stringify(replies.first)}`);
        }
    } else if (Array.isArray(replies)) {
        // Pleroma: found invalid  "replies": [], "replies_count": 0, on an object resulting from an AP c2s Create Activity
        if (replies.length > 0) throw new Error(`Expected 'replies' array to be empty, found ${JSON.stringify(replies)}`);
        return [];
    } else if (Array.isArray(replies.items)) {
        // Pleroma: items: [ 'url' ]
        collectRepliesFromItems(replies.items, rt, id, id, callbacks);
        return rt;
    } else {
        throw new Error(`Expected 'replies' to be a string, array or object with 'first' or 'items', found ${JSON.stringify(replies)}`);
    }
}

async function collectRepliesFromOrderedCollection(orderedCollection: any, after: Instant, nodeId: string, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined, fetched: Set<string>): Promise<readonly string[]> {
    if ((orderedCollection.items?.length || 0) > 0 || (orderedCollection.orderedItems?.length || 0) > 0) {
        throw new Error(`Expected OrderedCollection 'items'/'orderedItems' to be empty, found ${JSON.stringify(orderedCollection)}`);
    }
    if (orderedCollection.first === undefined && orderedCollection.totalItems === 0) {
        // fine, empty
        return [];
    } else if (typeof orderedCollection.first === 'string') {
        return await collectRepliesFromPages(orderedCollection.first, after, nodeId, fetcher, cache, callbacks, fetched);
    } else {
        throw new Error(`Expected OrderedCollection 'first' to be a string, found ${JSON.stringify(orderedCollection)}`);
    }
}

async function collectRepliesFromPages(url: string, after: Instant, nodeId: string, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined, fetched: Set<string>): Promise<readonly string[]> {
    const replies: string[] = [];
    let page = await findOrFetchActivityPubObject(url, after, fetcher, cache);
    while (true) {
        if (page.type !== 'CollectionPage' && page.type !== 'OrderedCollectionPage') {
            throw new Error(`Expected page 'type' of CollectionPage or OrderedCollectionPage, found ${JSON.stringify(page)}`);
        }
        if (page.items) {
            if (!Array.isArray(page.items)) throw new Error(`Expected page 'items' to be an array, found ${JSON.stringify(page)}`);
            collectRepliesFromItems(page.items, replies, nodeId, url, callbacks);
        }
        if (page.type === 'OrderedCollectionPage' && page.orderedItems) {
            if (!Array.isArray(page.orderedItems)) throw new Error(`Expected page 'orderedItems' to be an array, found ${JSON.stringify(page)}`);
            collectRepliesFromItems(page.orderedItems, replies, nodeId, url, callbacks);
        }
        if (page.next) {
            if (typeof page.next !== 'string') throw new Error(`Expected page 'next' to be a string, found ${JSON.stringify(page)}`);
            if (fetched.has(page.next)) return replies; // mastodon will return a page with items: [] and id === next!
            page = await findOrFetchActivityPubObject(page.next, after, fetcher, cache);
            fetched.add(page.next);
        } else {
            return replies;
        }
    }
}

function makeFetcherWithUserAgent(fetcher: Fetcher, userAgent: string): Fetcher {
    userAgent = userAgent.trim();
    if (userAgent.length === 0) throw new Error(`Expected non-blank user-agent`);
    return async (url, opts) => {
        const headers = { ...(opts?.headers || {}), 'user-agent': userAgent };
        return await fetcher(url, { headers });
    }
}

function unwrapActivityIfNecessary(object: any, id: string, callbacks: Callbacks | undefined): any {
    if (object.type === 'Create' && isStringRecord(object.object)) {
        callbacks?.onEvent({ kind: 'warning', url: id, nodeId: id, message: 'Unwrapping a Create activity where an object was expected', object });
        return object.object;
    }
    return object;
}

function collectRepliesFromItems(items: readonly any[], outReplies: string[], nodeId: string, url: string, callbacks: Callbacks | undefined) {
    for (const item of items) {
        if (typeof item === 'string' && !item.startsWith('{')) {
            // it's a link to another AP entity
            outReplies.push(item);
        } else {
            const itemObj = typeof item === 'string' ? JSON.parse(item) : item;
            const { id } = itemObj;
            if (typeof id !== 'string') throw new Error(`Expected item 'id' to be a string, found ${JSON.stringify(itemObj)}`);
            outReplies.push(id);
            if (typeof item === 'string') {
                callbacks?.onEvent({ kind: 'warning', nodeId, url, message: 'Found item incorrectly double encoded as a json string', object: itemObj });
            }
        }
    }
}

function computeComment(object: any, id: string, callbacks: Callbacks | undefined): Comment {
    object = unwrapActivityIfNecessary(object, id, callbacks);
    const content = computeContent(object);
    const attachments = computeAttachments(object);
    const url = computeUrl(object.url) || id; // pleroma: id is viewable (redirects to notice), no url returned
    const { published } = object;
    const attributedTo = computeAttributedTo(object.attributedTo);
    if (typeof published !== 'string') throw new Error(`Expected 'published' to be a string, found ${JSON.stringify(published)}`);
    return { url, published, attachments, content, attributedTo }
}

function computeUrl(url: unknown): string | undefined {
    if (url === undefined || url === null) return undefined;
    if (typeof url === 'string') return url;
    if (Array.isArray(url)) {
        const v = url.find(v => v.type === 'Link' && v.mediaType === 'text/html' && typeof v.href === 'string');
        if (v) return v.href;
    }
    throw new Error(`Expected 'url' to be a string, found ${JSON.stringify(url)}`);
}

function computeAttributedTo(attributedTo: unknown): string {
    if (typeof attributedTo === 'string') return attributedTo;
    if (Array.isArray(attributedTo) && attributedTo.length > 0) {
        if (attributedTo.every(v => typeof v === 'string')) return attributedTo[0];
        if (attributedTo.every(v => isStringRecord(v))) {
            for (const item of attributedTo) {
                if (item.type === 'Person' && typeof item.id === 'string') {
                    return item.id;
                }
            }
            throw new Error(`Expected 'attributedTo' object array to have a Person with an 'id', found ${JSON.stringify(attributedTo)}`);
        }
    }
    throw new Error(`Expected 'attributedTo' to be a string or non-empty string/object array, found ${JSON.stringify(attributedTo)}`);
}

function computeContent(obj: any): Record<string, string> {
    if (obj.type === 'PodcastEpisode' && isStringRecord(obj.description) && obj.description.type === 'Note') obj = obj.description; // castopod embeds the Note object inline as the 'description'
    const { content, contentMap } = obj;
    if (content !== undefined && typeof content !== 'string') throw new Error(`Expected 'content' to be a string, found ${JSON.stringify(content)}`);
    if (contentMap !== undefined && !isStringRecord(contentMap)) throw new Error(`Expected 'contentMap' to be a string record, found ${JSON.stringify(contentMap)}`);
    if (contentMap !== undefined) return contentMap;
    if (content !== undefined) return { und: content };
    throw new Error(`Expected either 'contentMap' or 'content' to be present ${JSON.stringify(obj)}`);
}

function computeAttachments(object: any): Attachment[] {
    const rt: Attachment[] = [];
    if (!object.attachment) return rt;
    const attachments = isReadonlyArray(object.attachment) ? object.attachment : [ object.attachment ];
    for (const attachment of attachments) {
        rt.push(computeAttachment(attachment));
    }
    return rt;
}

function computeAttachment(object: any): Attachment {
    if (typeof object !== 'object' || (object.type !== 'Document' && object.type !== 'Image')) throw new Error(`Expected attachment 'type' of Document or Image, found ${JSON.stringify(object.type)}`);
    const { mediaType, width, height, url } = object;
    if (typeof mediaType !== 'string') throw new Error(`Expected attachment 'mediaType' to be a string, found ${JSON.stringify(mediaType)}`);
    if (width !== undefined && typeof width !== 'number') throw new Error(`Expected attachment 'width' to be a number, found ${JSON.stringify(width)}`);
    if (height !== undefined && typeof height !== 'number') throw new Error(`Expected attachment 'height' to be a number, found ${JSON.stringify(height)}`);
    if (typeof url !== 'string') throw new Error(`Expected attachment 'url' to be a string, found ${JSON.stringify(url)}`);
    return { mediaType, width, height, url};
}

function computeCommenter(person: any, asof: Instant): Commenter {
    let icon: Icon | undefined;
    if (person.icon) {
        if (typeof person.icon !== 'object' || isReadonlyArray(person.icon) || person.icon.type !== 'Image') throw new Error(`Expected person 'icon' to be an object, found: ${JSON.stringify(person.icon)}`);
        icon = computeIcon(person.icon);
    }
    const { name, preferredUsername, url: apUrl, id } = person;
    if (name !== undefined && typeof name !== 'string') throw new Error(`Expected person 'name' to be a string, found: ${JSON.stringify(person)}`);
    if (preferredUsername !== undefined && typeof preferredUsername !== 'string') throw new Error(`Expected person 'preferredUsername' to be a string, found: ${JSON.stringify(person)}`);
    const nameOrPreferredUsername = name || preferredUsername;
    if (!nameOrPreferredUsername) throw new Error(`Expected person 'name' or 'preferredUsername', found: ${JSON.stringify(person)}`);
    if (apUrl !== undefined && typeof apUrl !== 'string') throw new Error(`Expected person 'url' to be a string, found: ${JSON.stringify(apUrl)}`);
    const url = apUrl || id;
    if (typeof url !== 'string')  throw new Error(`Expected person 'url' or 'id' to be a string, found: ${JSON.stringify(url)}`);
    const fqUsername = computeFqUsername(url, person.preferredUsername);
    return { icon, name: nameOrPreferredUsername, url, fqUsername, asof };
}

function computeIcon(image: any): Icon {
    const { url, mediaType } = image;
    if (typeof url !== 'string') throw new Error(`Expected icon 'url' to be a string, found: ${JSON.stringify(url)}`);
    if (mediaType !== undefined && typeof mediaType !== 'string')  throw new Error(`Expected icon 'mediaType' to be a string, found: ${JSON.stringify(mediaType)}`);
    return { url, mediaType };
}

function computeFqUsername(url: string, preferredUsername: string | undefined): string {
    // https://example.org/@user -> @user@example.org
    const u = new URL(url);
    const m = /^\/(@[^\/]+)$/.exec(u.pathname);
    const username = m ? m[1] : preferredUsername;
    if (!username) throw new Error(`Unable to compute username from url: ${url}`);
    return `${username}@${u.hostname}`;
}

function tryParseInt(value: string): number | undefined {
    try {
        return parseInt(value);
    } catch {
        return undefined;
    }
}

function tryParseIso8601(value: string): Instant | undefined {
    return isValidIso8601(value) ? value : undefined;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
