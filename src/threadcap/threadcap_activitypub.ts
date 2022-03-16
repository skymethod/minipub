// deno-lint-ignore-file no-explicit-any
import { isReadonlyArray, isStringRecord } from '../check.ts';
import { Attachment, Cache, Callbacks, Comment, Commenter, Fetcher, Icon, Instant, Threadcap } from './threadcap.ts';
import { findOrFetchJson, ProtocolImplementation, ProtocolMethodOptions } from './threadcap_implementation.ts';

export const ActivityPubProtocolImplementation: ProtocolImplementation = {
    initThreadcap: initActivityPubThreadcap,
    fetchComment: fetchActivityPubComment,
    fetchCommenter: fetchActivityPubCommenter,
    fetchReplies: fetchActivityPubReplies,
};

//


async function findOrFetchActivityPubObject(url: string, after: Instant, fetcher: Fetcher, cache: Cache): Promise<any> {
    return await findOrFetchJson(url, after, fetcher, cache, { accept: 'application/activity+json' });
}

async function initActivityPubThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string') throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (!/^(Note|Article|Video|PodcastEpisode)$/.test(type)) throw new Error(`Unexpected type: ${type}`); // PodcastEpisode = castopod, handled below, non-standard AP
    if (typeof id !== 'string') throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return { protocol: 'activitypub', roots: [ id ], nodes: { }, commenters: { } };
}

async function fetchActivityPubComment(id: string, updateTime: Instant, callbacks: Callbacks | undefined, opts: ProtocolMethodOptions): Promise<Comment> {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id, callbacks);
}

async function fetchActivityPubCommenter(attributedTo: string, updateTime: Instant, opts: ProtocolMethodOptions): Promise<Commenter> {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}

async function fetchActivityPubReplies(id: string, updateTime: Instant, callbacks: Callbacks | undefined, opts: ProtocolMethodOptions): Promise<readonly string[]> {
    const { fetcher, cache } = opts;
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
