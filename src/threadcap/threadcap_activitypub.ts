// deno-lint-ignore-file no-explicit-any
import { isNonEmpty, isReadonlyArray, isStringRecord } from '../check.ts';
import { Attachment, Cache, Callbacks, Comment, Commenter, Fetcher, Icon, Instant, Threadcap } from './threadcap.ts';
import { findOrFetchJson, ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions } from './threadcap_implementation.ts';

export const ActivityPubProtocolImplementation: ProtocolImplementation = {
    initThreadcap: initActivityPubThreadcap,
    fetchComment: fetchActivityPubComment,
    fetchCommenter: fetchActivityPubCommenter,
    fetchReplies: fetchActivityPubReplies,
};

export async function mastodonFindReplies(id: string, opts: { after: Instant, fetcher: Fetcher, cache: Cache, debug?: boolean }): Promise<readonly string[]> {
    const { after, fetcher, cache, debug } = opts;
    const statusId = await mastodonFindStatusIdForActivityPubId(id, after, fetcher, cache, debug);
    if (!statusId) return [];

    // https://pleroma.example/api/v1/statuses/ADEfV123Q7oXygK123/context
    const { origin } = new URL(id);
    const url = new URL(origin);
    url.pathname = `/api/v1/statuses/${statusId}/context`;
    const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, { accept: 'application/json' });
    if (debug) console.log(JSON.stringify(obj, undefined, 2));
    const rt: string[] = [];
    if (isStringRecord(obj) && Array.isArray(obj.descendants)) {
        for (const descendant of obj.descendants) {
            if (isStringRecord(descendant) && typeof descendant.uri === 'string' && descendant.in_reply_to_id === statusId) {
                rt.push(descendant.uri);
            }
        }
    }
    return rt;
}

//

async function findOrFetchActivityPubObject(url: string, after: Instant, fetcher: Fetcher, cache: Cache): Promise<any> {
    return await findOrFetchJson(url, after, fetcher, cache, { accept: 'application/activity+json' });
}

async function initActivityPubThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string') throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (!/^(Note|Article|Video|PodcastEpisode|Question)$/.test(type)) throw new Error(`Unexpected type: ${type}`); // PodcastEpisode = castopod, handled below, non-standard AP
    if (typeof id !== 'string') throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return { protocol: 'activitypub', roots: [ id ], nodes: { }, commenters: { } };
}

async function fetchActivityPubComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
    const { fetcher, cache, updateTime, callbacks } = opts;
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id, callbacks);
}

async function fetchActivityPubCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
    const { fetcher, cache, updateTime } = opts;
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}

async function fetchActivityPubReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
    const { fetcher, cache, updateTime, callbacks, debug } = opts;
    const fetchedObject = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    const object = unwrapActivityIfNecessary(fetchedObject, id, callbacks);
    // castopod uses 'comments' url to an OrderedCollection
    // so does PeerTube
    // also found 'comments' url to an OrderedCollectionPage (no 'replies')
    const replies = object.type === 'PodcastEpisode' ? object.comments : (object.replies ?? object.comments); 
    if (replies === undefined) {
        let message = object.type === 'PodcastEpisode' ? `No 'comments' found on PodcastEpisode object` : `No 'replies' found on object`;
        const tryPleromaWorkaround = id.includes('/objects/');
        if (tryPleromaWorkaround) {
            message += ', trying Pleroma workaround';
        }
        callbacks?.onEvent({ kind: 'warning', url: id, nodeId: id, message, object });

        if (tryPleromaWorkaround) {
            // pleroma doesn't currently implement 'replies', so fallback to the mastodon api
            return await mastodonFindReplies(id, { after: updateTime, fetcher, cache, debug });
        }
        return [];
    }

    const rt: string[] = [];
    const fetched = new Set<string>();
    if (typeof replies === 'string') {
        const obj = await findOrFetchActivityPubObject(replies, updateTime, fetcher, cache);
        if (obj.type === 'OrderedCollection' || obj.type === 'OrderedCollectionPage') {
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
    const summary = computeSummary(object);
    const attachments = computeAttachments(object);
    const url = computeUrl(object.url) || id; // pleroma: id is viewable (redirects to notice), no url returned
    const { published } = object;
    const attributedTo = computeAttributedTo(object.attributedTo);
    if (typeof published !== 'string') throw new Error(`Expected 'published' to be a string, found ${JSON.stringify(published)}`);
    const questionOptions = computeQuestionOptions(object);
    return { url, published, attachments, content, attributedTo, summary, questionOptions }
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

function computeQuestionOptions(obj: any): string[] | undefined {
    let rt: string[] | undefined;
    if (obj.type === 'Question') {
        for (const prop of [ 'oneOf', 'anyOf' ]) {
            const val = obj[prop];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (isStringRecord(item) && item.type === 'Note' && typeof item.name === 'string') {
                        if (!rt) rt = [];
                        rt.push(item.name);
                    } else {
                        throw new Error(`Unsupported Question '${prop}' item: ${JSON.stringify(item)}`);
                    }
                }
                return rt;
            } else if (val !== undefined) {
                throw new Error(`Unsupported Question '${prop}' value: ${JSON.stringify(val)}`);
            }
        }
    }
    return rt;
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
    const rt = computeLanguageTaggedValues(obj, 'content', 'contentMap');
    if (!rt) throw new Error(`Expected either 'contentMap' or 'content' to be present ${JSON.stringify(obj)}`);
    return rt;
}

function computeSummary(obj: any): Record<string, string> | undefined {
    return computeLanguageTaggedValues(obj, 'summary', 'summaryMap');
}

function computeLanguageTaggedValues(obj: any, stringProp: string, mapProp: string): Record<string, string> | undefined {
    if (obj.type === 'PodcastEpisode' && isStringRecord(obj.description) && obj.description.type === 'Note') obj = obj.description; // castopod embeds the Note object inline as the 'description'
    const stringVal = obj[stringProp] ?? undefined;
    const mapVal = obj[mapProp] ?? undefined;
    if (stringVal !== undefined && typeof stringVal !== 'string') throw new Error(`Expected '${stringProp}' to be a string, found ${JSON.stringify(stringVal)}`);
    if (mapVal !== undefined && !(isStringRecord(mapVal) && Object.values(mapVal).every(v => typeof v === 'string'))) throw new Error(`Expected '${mapProp}' to be a string record, found ${JSON.stringify(mapVal)}`);
    if (mapVal !== undefined) return mapVal;
    if (stringVal !== undefined) return { und: stringVal };
    if (obj.type === 'Video' && typeof obj.name === 'string' && isNonEmpty(obj.name)) return { und: obj.name }; // workaround for PeerTube
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

async function mastodonFindStatusIdForActivityPubId(id: string, after: Instant, fetcher: Fetcher, cache: Cache, debug?: boolean): Promise<string | undefined> {
    // https://pleroma.example/api/v2/search?q=https://pleroma.example/notice/ADEfV123Q7oXygK123
    const { origin } = new URL(id);
    const url = new URL(origin);
    url.pathname = '/api/v2/search';
    url.searchParams.set('q', id);
    url.searchParams.set('type', 'statuses');
    const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, { accept: 'application/json' });
    if (debug) console.log(JSON.stringify(obj, undefined, 2));
    if (isStringRecord(obj) && Array.isArray(obj.statuses) && obj.statuses.length === 1) {
        const status = obj.statuses[0];
        if (isStringRecord(status) && typeof status.id === 'string' && status.id !== '') {
            return status.id;
        }
    }
    return undefined;
}
