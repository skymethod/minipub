// deno-lint-ignore-file no-explicit-any
import { isReadonlyArray, isStringRecord } from '../check.ts';

export interface Threadcap {
    readonly root: string; // ActivityPub id of the root object
    readonly nodes: Record<string, Node>; // ActivityPub id -> Node state
    readonly commenters: Record<string, Commenter>; // attributedTo -> Commenter
}

export interface Node {

    // inline comment info, enough to render the comment itself (no replies)
    comment?: Comment;
    commentAsof?: string; // instant

    // AP ids of the direct children, once known completely
    replies?: readonly string[];
    repliesAsof?: string; // instant
}

export interface Comment {
    readonly url?: string;
    readonly published?: string;
    readonly attachments: Attachment[];
    readonly content: Record<string, string>; // lang (or 'und') -> html
    readonly attributedTo: string;
}

export interface Attachment {
    readonly mediaType: string;
    readonly width?: number;
    readonly height?: number;
    readonly url: string;
}

export interface Commenter {
    readonly icon?: Icon; // new users don't have icons
    readonly name: string;
    readonly url: string;
    readonly fqUsername: string; // e.g. @user@example.com
    readonly asof: string; // instant
}

export interface Icon {
    readonly url: string;
    readonly mediaType?: string;
}

export interface Cache {
    get(id: string, after: string): Promise<Response | undefined>;
    put(id: string, fetched: string, response: Response): Promise<void>;
}

export interface Callbacks {
    onWarning(nodeId: string, url: string, message: string): void;
}

export type Fetcher = (url: string, opts?: { headers?: Record<string, string> }) => Promise<Response>;

//

export async function createThreadcap(url: string, opts: { fetcher: Fetcher, cache: Cache }): Promise<Threadcap> {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string') throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (type !== 'Note') throw new Error(`Unexpected type: ${type}`);
    if (typeof id !== 'string') throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return { root: id, nodes: { }, commenters: { } };
}

export async function updateThreadcap(threadcap: Threadcap, opts: { updateTime: string, fetcher: Fetcher, cache: Cache, callbacks?: Callbacks }) {
    const { fetcher, cache, updateTime, callbacks } = opts;

    // ensure node exists
    const id = threadcap.root;
    let node = threadcap.nodes[id];
    if (!node) {
        node = { };
        threadcap.nodes[id] = node;
    }

    // update the comment + commenter
    node.comment = await fetchComment(id, updateTime, fetcher, cache);
    const { attributedTo } = node.comment;
    const existingCommenter = threadcap.commenters[attributedTo];
    if (!existingCommenter || existingCommenter.asof < updateTime) {
        threadcap.commenters[attributedTo] = await fetchCommenter(attributedTo, updateTime, fetcher, cache);
    }
    node.commentAsof = updateTime;

    // TODO: callback? UI could update at least this comment's content at this point

    // update the replies
    node.replies = await fetchReplies(id, updateTime, fetcher, cache, callbacks);
    node.repliesAsof  = updateTime;

    // TODO: breadth-first descent down into children, up to some optional maxLevel
}

//

const APPLICATION_ACTIVITY_JSON = 'application/activity+json';

async function findOrFetchActivityPubObject(url: string, after: string, fetcher: Fetcher, cache: Cache): Promise<any> {
    const response = await findOrFetchActivityPubResponse(url, after, fetcher, cache);
    const { status, headers } = response;
    if (status !== 200) throw new Error(`Expected 200 response for ${url}, found ${status} body=${await response.text()}`);
    const contentType = headers.get('content-type') || '<none>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Expected json response for ${url}, found ${contentType} body=${await response.text()}`);
    return await response.json();
}

async function findOrFetchActivityPubResponse(url: string, after: string, fetcher: Fetcher, cache: Cache): Promise<Response> {
    const existing = await cache.get(url, after);
    if (existing) return existing;
    const res = await fetcher(url, { headers: { accept: APPLICATION_ACTIVITY_JSON }});
    await cache.put(url, new Date().toISOString(), res);
    return res;
}

async function fetchComment(id: string, updateTime: string, fetcher: Fetcher, cache: Cache): Promise<Comment> {
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id);
}

async function fetchCommenter(attributedTo: string, updateTime: string, fetcher: Fetcher, cache: Cache): Promise<Commenter> {
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}

async function fetchReplies(id: string, updateTime: string, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<readonly string[]> {
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    const { replies } = object;
    if (!replies) throw new Error(`Expected 'replies', found ${JSON.stringify(object)}`);

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
            if (Array.isArray(replies.first.items) && replies.first.items.length > 0) {
                collectRepliesFromItems(replies.first.items, rt, id, id, callbacks);
                return rt;
            }
            if (replies.first.next) {
                if (typeof replies.first.next === 'string') {
                    return await collectRepliesFromPages(replies.first.next, updateTime, id, fetcher, cache, callbacks, fetched);
                } else {
                    throw new Error(`Expected 'replies.first.next' to be a string, found ${JSON.stringify(replies.first.next)}`);
                }
            }
            throw new Error(`Expected 'replies.first.next' to be a string, found ${JSON.stringify(replies.first.next)}`);
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

async function collectRepliesFromOrderedCollection(orderedCollection: any, after: string, nodeId: string, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined, fetched: Set<string>): Promise<readonly string[]> {
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

async function collectRepliesFromPages(url: string, after: string, nodeId: string, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined, fetched: Set<string>): Promise<readonly string[]> {
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
                if (callbacks) callbacks.onWarning(nodeId, url, 'Found item incorrectly double encoded as a json string');
            }
        }
    }
}

function computeComment(object: any, id: string): Comment {
    const content = computeContent(object);
    const attachments = computeAttachments(object);
    const url = (object.url === null ? undefined : object.url) || id; // pleroma: id is viewable (redirects to notice), no url returned
    const { attributedTo, published } = object;
    if (typeof attributedTo !== 'string') throw new Error(`Expected 'attributedTo' to be a string, found ${JSON.stringify(attributedTo)}`);
    if (typeof published !== 'string') throw new Error(`Expected 'published' to be a string, found ${JSON.stringify(published)}`);
    if (url !== undefined && typeof url !== 'string') throw new Error(`Expected 'url' to be a string, found ${JSON.stringify(url)}`);
    return { url, published, attachments, content, attributedTo }
}

function computeContent(obj: any): Record<string, string> {
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

function computeCommenter(person: any, asof: string): Commenter {
    let icon: Icon | undefined;
    if (person.icon) {
        if (typeof person.icon !== 'object' || isReadonlyArray(person.icon) || person.icon.type !== 'Image') throw new Error(`Expected person 'icon' to be an object, found: ${JSON.stringify(person.icon)}`);
        icon = computeIcon(person.icon);
    }
    const { name, url: apUrl, id } = person;
    if (typeof name !== 'string') throw new Error(`Expected person 'name' to be a string, found: ${JSON.stringify(name)}`);
    if (apUrl !== undefined && typeof apUrl !== 'string') throw new Error(`Expected person 'url' to be a string, found: ${JSON.stringify(apUrl)}`);
    const url = apUrl || id;
    if (typeof url !== 'string')  throw new Error(`Expected person 'url' or 'id' to be a string, found: ${JSON.stringify(url)}`);
    const fqUsername = computeFqUsername(url, person.preferredUsername);
    return { icon, name, url, fqUsername, asof };
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
