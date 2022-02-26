function isStringRecord(obj) {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj) && obj.constructor === Object;
}
function isReadonlyArray(arg) {
    return Array.isArray(arg);
}
function isValidIso8601(text) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(text);
}
const MAX_LEVELS = 1000;
async function makeThreadcap(url, opts) {
    const { cache, userAgent } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string')
        throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (!/^(Note|Article|Video|PodcastEpisode)$/.test(type))
        throw new Error(`Unexpected type: ${type}`);
    if (typeof id !== 'string')
        throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return {
        root: id,
        nodes: {},
        commenters: {}
    };
}
async function updateThreadcap(threadcap, opts) {
    const { userAgent, cache, updateTime, callbacks, maxLevels, maxNodes: maxNodesInput, startNode, keepGoing } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const maxLevel = Math.min(Math.max(maxLevels === undefined ? 1000 : Math.round(maxLevels), 0), 1000);
    const maxNodes = maxNodesInput === undefined ? undefined : Math.max(Math.round(maxNodesInput), 0);
    if (startNode && !threadcap.nodes[startNode])
        throw new Error(`Invalid start node: ${startNode}`);
    if (maxLevel === 0)
        return;
    if (maxNodes === 0)
        return;
    const idsBylevel = [
        [
            startNode || threadcap.root
        ]
    ];
    let remaining = 1;
    let processed = 0;
    const processLevel = async (level) => {
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'process-level',
            phase: 'before',
            level: level + 1
        });
        const nextLevel = level + 1;
        for (const id of idsBylevel[level] || []) {
            const processReplies = nextLevel < maxLevel;
            const node = await processNode(id, processReplies, threadcap, updateTime, fetcher, cache, callbacks);
            remaining--;
            processed++;
            if (maxNodes && processed >= maxNodes)
                return;
            if (keepGoing && !keepGoing())
                return;
            if (node.replies && nextLevel < maxLevel) {
                if (!idsBylevel[nextLevel])
                    idsBylevel[nextLevel] = [];
                idsBylevel[nextLevel].push(...node.replies);
                remaining += node.replies.length;
            }
            callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
                kind: 'nodes-remaining',
                remaining
            });
        }
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'process-level',
            phase: 'after',
            level: level + 1
        });
        if (idsBylevel[nextLevel])
            await processLevel(nextLevel);
    };
    await processLevel(0);
}
class InMemoryCache {
    constructor() {
        Object.defineProperty(this, "map", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "onReturningCachedResponse", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    get(id, after) {
        const { response, fetched } = this.map.get(id) || {};
        if (response && fetched && fetched > after) {
            if (this.onReturningCachedResponse)
                this.onReturningCachedResponse(id, after, fetched, response);
            return Promise.resolve(response);
        }
        return Promise.resolve(undefined);
    }
    put(id, fetched, response) {
        this.map.set(id, {
            response,
            fetched
        });
        return Promise.resolve();
    }
}
function computeDefaultMillisToWait(input) {
    const { remaining, millisTillReset } = input;
    if (remaining >= 100)
        return 0;
    return remaining > 0 ? Math.round(millisTillReset / remaining) : millisTillReset;
}
function makeRateLimitedFetcher(fetcher, opts1 = {}) {
    const { callbacks } = opts1;
    const computeMillisToWait = opts1.computeMillisToWait || computeDefaultMillisToWait;
    const hostLimits = new Map();
    return async (url, opts) => {
        const hostname = new URL(url).hostname;
        const limits = hostLimits.get(hostname);
        if (limits) {
            const { limit, remaining, reset } = limits;
            const millisTillReset = new Date(reset).getTime() - Date.now();
            const millisToWait = computeMillisToWait({
                hostname,
                limit,
                remaining,
                reset,
                millisTillReset
            });
            if (millisToWait > 0) {
                callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
                    kind: 'waiting-for-rate-limit',
                    hostname,
                    millisToWait,
                    millisTillReset,
                    limit,
                    remaining,
                    reset
                });
                await sleep(millisToWait);
            }
        }
        const res = await fetcher(url, opts);
        const limit = tryParseInt(res.headers.get('x-ratelimit-limit') || '');
        const remaining = tryParseInt(res.headers.get('x-ratelimit-remaining') || '');
        const reset = tryParseIso8601(res.headers.get('x-ratelimit-reset') || '');
        if (limit !== undefined && remaining !== undefined && reset !== undefined) {
            hostLimits.set(hostname, {
                limit,
                remaining,
                reset
            });
        }
        return res;
    };
}
const APPLICATION_ACTIVITY_JSON = 'application/activity+json';
async function findOrFetchActivityPubObject(url, after, fetcher, cache) {
    const response = await findOrFetchActivityPubResponse(url, after, fetcher, cache);
    const { status, headers, bodyText } = response;
    if (status !== 200)
        throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
    const contentType = headers['content-type'] || '<none>';
    if (!contentType.toLowerCase().includes('json'))
        throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
    return JSON.parse(bodyText);
}
async function findOrFetchActivityPubResponse(url, after, fetcher, cache) {
    const existing = await cache.get(url, after);
    if (existing)
        return existing;
    const res = await fetcher(url, {
        headers: {
            accept: APPLICATION_ACTIVITY_JSON
        }
    });
    const response = {
        status: res.status,
        headers: Object.fromEntries([
            ...res.headers
        ]),
        bodyText: await res.text()
    };
    await cache.put(url, new Date().toISOString(), response);
    return response;
}
async function processNode(id, processReplies, threadcap, updateTime, fetcher, cache, callbacks) {
    let node = threadcap.nodes[id];
    if (!node) {
        node = {};
        threadcap.nodes[id] = node;
    }
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
        }
        catch (e) {
            node.comment = undefined;
            node.commentError = `${e.stack || e}`;
        }
        node.commentAsof = updateTime;
    }
    callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
        kind: 'node-processed',
        nodeId: id,
        part: 'comment',
        updated: updateComment
    });
    if (processReplies) {
        const updateReplies = !node.repliesAsof || node.repliesAsof < updateTime;
        if (updateReplies) {
            try {
                node.replies = await fetchReplies(id, updateTime, fetcher, cache, callbacks);
                node.repliesError = undefined;
            }
            catch (e) {
                node.replies = undefined;
                node.repliesError = `${e.stack || e}`;
            }
            node.repliesAsof = updateTime;
        }
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'node-processed',
            nodeId: id,
            part: 'replies',
            updated: updateReplies
        });
    }
    return node;
}
async function fetchComment(id, updateTime, fetcher, cache, callbacks) {
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id, callbacks);
}
async function fetchCommenter(attributedTo, updateTime, fetcher, cache) {
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}
async function fetchReplies(id, updateTime, fetcher, cache, callbacks) {
    const fetchedObject = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    const object = unwrapActivityIfNecessary(fetchedObject, id, callbacks);
    const replies = object.type === 'PodcastEpisode' ? object.comments : object.replies;
    if (replies === undefined) {
        const message = object.type === 'PodcastEpisode' ? `No 'comments' found on PodcastEpisode object` : `No 'replies' found on object`;
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'warning',
            url: id,
            nodeId: id,
            message,
            object
        });
        return [];
    }
    const rt = [];
    const fetched = new Set();
    if (typeof replies === 'string') {
        const obj = await findOrFetchActivityPubObject(replies, updateTime, fetcher, cache);
        if (obj.type === 'OrderedCollection') {
            return await collectRepliesFromOrderedCollection(obj, updateTime, id, fetcher, cache, callbacks, fetched);
        }
        else {
            throw new Error(`Expected 'replies' to point to an OrderedCollection, found ${JSON.stringify(obj)}`);
        }
    }
    else if (replies.first) {
        if (typeof replies.first === 'object' && replies.first.type === 'CollectionPage') {
            if (!replies.first.items && !replies.first.next)
                throw new Error(`Expected 'replies.first.items' or 'replies.first.next' to be present, found ${JSON.stringify(replies.first)}`);
            if (Array.isArray(replies.first.items) && replies.first.items.length > 0) {
                collectRepliesFromItems(replies.first.items, rt, id, id, callbacks);
            }
            if (replies.first.next) {
                if (typeof replies.first.next === 'string') {
                    rt.push(...await collectRepliesFromPages(replies.first.next, updateTime, id, fetcher, cache, callbacks, fetched));
                }
                else {
                    throw new Error(`Expected 'replies.first.next' to be a string, found ${JSON.stringify(replies.first.next)}`);
                }
            }
            return rt;
        }
        else {
            throw new Error(`Expected 'replies.first.items' array, or 'replies.first.next' string, found ${JSON.stringify(replies.first)}`);
        }
    }
    else if (Array.isArray(replies)) {
        if (replies.length > 0)
            throw new Error(`Expected 'replies' array to be empty, found ${JSON.stringify(replies)}`);
        return [];
    }
    else if (Array.isArray(replies.items)) {
        collectRepliesFromItems(replies.items, rt, id, id, callbacks);
        return rt;
    }
    else {
        throw new Error(`Expected 'replies' to be a string, array or object with 'first' or 'items', found ${JSON.stringify(replies)}`);
    }
}
async function collectRepliesFromOrderedCollection(orderedCollection, after, nodeId, fetcher, cache, callbacks, fetched) {
    var _a, _b;
    if ((((_a = orderedCollection.items) === null || _a === void 0 ? void 0 : _a.length) || 0) > 0 || (((_b = orderedCollection.orderedItems) === null || _b === void 0 ? void 0 : _b.length) || 0) > 0) {
        throw new Error(`Expected OrderedCollection 'items'/'orderedItems' to be empty, found ${JSON.stringify(orderedCollection)}`);
    }
    if (orderedCollection.first === undefined && orderedCollection.totalItems === 0) {
        return [];
    }
    else if (typeof orderedCollection.first === 'string') {
        return await collectRepliesFromPages(orderedCollection.first, after, nodeId, fetcher, cache, callbacks, fetched);
    }
    else {
        throw new Error(`Expected OrderedCollection 'first' to be a string, found ${JSON.stringify(orderedCollection)}`);
    }
}
async function collectRepliesFromPages(url, after, nodeId, fetcher, cache, callbacks, fetched) {
    const replies = [];
    let page = await findOrFetchActivityPubObject(url, after, fetcher, cache);
    while (true) {
        if (page.type !== 'CollectionPage' && page.type !== 'OrderedCollectionPage') {
            throw new Error(`Expected page 'type' of CollectionPage or OrderedCollectionPage, found ${JSON.stringify(page)}`);
        }
        if (page.items) {
            if (!Array.isArray(page.items))
                throw new Error(`Expected page 'items' to be an array, found ${JSON.stringify(page)}`);
            collectRepliesFromItems(page.items, replies, nodeId, url, callbacks);
        }
        if (page.type === 'OrderedCollectionPage' && page.orderedItems) {
            if (!Array.isArray(page.orderedItems))
                throw new Error(`Expected page 'orderedItems' to be an array, found ${JSON.stringify(page)}`);
            collectRepliesFromItems(page.orderedItems, replies, nodeId, url, callbacks);
        }
        if (page.next) {
            if (typeof page.next !== 'string')
                throw new Error(`Expected page 'next' to be a string, found ${JSON.stringify(page)}`);
            if (fetched.has(page.next))
                return replies;
            page = await findOrFetchActivityPubObject(page.next, after, fetcher, cache);
            fetched.add(page.next);
        }
        else {
            return replies;
        }
    }
}
function makeFetcherWithUserAgent(fetcher, userAgent) {
    userAgent = userAgent.trim();
    if (userAgent.length === 0)
        throw new Error(`Expected non-blank user-agent`);
    return async (url, opts) => {
        const headers = {
            ...(opts === null || opts === void 0 ? void 0 : opts.headers) || {},
            'user-agent': userAgent
        };
        return await fetcher(url, {
            headers
        });
    };
}
function unwrapActivityIfNecessary(object, id, callbacks) {
    if (object.type === 'Create' && isStringRecord(object.object)) {
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'warning',
            url: id,
            nodeId: id,
            message: 'Unwrapping a Create activity where an object was expected',
            object
        });
        return object.object;
    }
    return object;
}
function collectRepliesFromItems(items, outReplies, nodeId, url, callbacks) {
    for (const item of items) {
        if (typeof item === 'string' && !item.startsWith('{')) {
            outReplies.push(item);
        }
        else {
            const itemObj = typeof item === 'string' ? JSON.parse(item) : item;
            const { id } = itemObj;
            if (typeof id !== 'string')
                throw new Error(`Expected item 'id' to be a string, found ${JSON.stringify(itemObj)}`);
            outReplies.push(id);
            if (typeof item === 'string') {
                callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
                    kind: 'warning',
                    nodeId,
                    url,
                    message: 'Found item incorrectly double encoded as a json string',
                    object: itemObj
                });
            }
        }
    }
}
function computeComment(object, id, callbacks) {
    object = unwrapActivityIfNecessary(object, id, callbacks);
    const content = computeContent(object);
    const attachments = computeAttachments(object);
    const url = computeUrl(object.url) || id;
    const { published } = object;
    const attributedTo = computeAttributedTo(object.attributedTo);
    if (typeof published !== 'string')
        throw new Error(`Expected 'published' to be a string, found ${JSON.stringify(published)}`);
    return {
        url,
        published,
        attachments,
        content,
        attributedTo
    };
}
function computeUrl(url) {
    if (url === undefined || url === null)
        return undefined;
    if (typeof url === 'string')
        return url;
    if (Array.isArray(url)) {
        const v1 = url.find((v) => v.type === 'Link' && v.mediaType === 'text/html' && typeof v.href === 'string');
        if (v1)
            return v1.href;
    }
    throw new Error(`Expected 'url' to be a string, found ${JSON.stringify(url)}`);
}
function computeAttributedTo(attributedTo) {
    if (typeof attributedTo === 'string')
        return attributedTo;
    if (Array.isArray(attributedTo) && attributedTo.length > 0) {
        if (attributedTo.every((v) => typeof v === 'string'))
            return attributedTo[0];
        if (attributedTo.every((v) => isStringRecord(v))) {
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
function computeContent(obj) {
    if (obj.type === 'PodcastEpisode' && isStringRecord(obj.description) && obj.description.type === 'Note')
        obj = obj.description;
    const { content, contentMap } = obj;
    if (content !== undefined && typeof content !== 'string')
        throw new Error(`Expected 'content' to be a string, found ${JSON.stringify(content)}`);
    if (contentMap !== undefined && !isStringRecord(contentMap))
        throw new Error(`Expected 'contentMap' to be a string record, found ${JSON.stringify(contentMap)}`);
    if (contentMap !== undefined)
        return contentMap;
    if (content !== undefined)
        return {
            und: content
        };
    throw new Error(`Expected either 'contentMap' or 'content' to be present ${JSON.stringify(obj)}`);
}
function computeAttachments(object) {
    const rt = [];
    if (!object.attachment)
        return rt;
    const attachments = isReadonlyArray(object.attachment) ? object.attachment : [
        object.attachment
    ];
    for (const attachment of attachments) {
        rt.push(computeAttachment(attachment));
    }
    return rt;
}
function computeAttachment(object) {
    if (typeof object !== 'object' || object.type !== 'Document' && object.type !== 'Image')
        throw new Error(`Expected attachment 'type' of Document or Image, found ${JSON.stringify(object.type)}`);
    const { mediaType, width, height, url } = object;
    if (typeof mediaType !== 'string')
        throw new Error(`Expected attachment 'mediaType' to be a string, found ${JSON.stringify(mediaType)}`);
    if (width !== undefined && typeof width !== 'number')
        throw new Error(`Expected attachment 'width' to be a number, found ${JSON.stringify(width)}`);
    if (height !== undefined && typeof height !== 'number')
        throw new Error(`Expected attachment 'height' to be a number, found ${JSON.stringify(height)}`);
    if (typeof url !== 'string')
        throw new Error(`Expected attachment 'url' to be a string, found ${JSON.stringify(url)}`);
    return {
        mediaType,
        width,
        height,
        url
    };
}
function computeCommenter(person, asof) {
    let icon;
    if (person.icon) {
        if (typeof person.icon !== 'object' || isReadonlyArray(person.icon) || person.icon.type !== 'Image')
            throw new Error(`Expected person 'icon' to be an object, found: ${JSON.stringify(person.icon)}`);
        icon = computeIcon(person.icon);
    }
    const { name, preferredUsername, url: apUrl, id } = person;
    if (name !== undefined && typeof name !== 'string')
        throw new Error(`Expected person 'name' to be a string, found: ${JSON.stringify(person)}`);
    if (preferredUsername !== undefined && typeof preferredUsername !== 'string')
        throw new Error(`Expected person 'preferredUsername' to be a string, found: ${JSON.stringify(person)}`);
    const nameOrPreferredUsername = name || preferredUsername;
    if (!nameOrPreferredUsername)
        throw new Error(`Expected person 'name' or 'preferredUsername', found: ${JSON.stringify(person)}`);
    if (apUrl !== undefined && typeof apUrl !== 'string')
        throw new Error(`Expected person 'url' to be a string, found: ${JSON.stringify(apUrl)}`);
    const url = apUrl || id;
    if (typeof url !== 'string')
        throw new Error(`Expected person 'url' or 'id' to be a string, found: ${JSON.stringify(url)}`);
    const fqUsername = computeFqUsername(url, person.preferredUsername);
    return {
        icon,
        name: nameOrPreferredUsername,
        url,
        fqUsername,
        asof
    };
}
function computeIcon(image) {
    const { url, mediaType } = image;
    if (typeof url !== 'string')
        throw new Error(`Expected icon 'url' to be a string, found: ${JSON.stringify(url)}`);
    if (mediaType !== undefined && typeof mediaType !== 'string')
        throw new Error(`Expected icon 'mediaType' to be a string, found: ${JSON.stringify(mediaType)}`);
    return {
        url,
        mediaType
    };
}
function computeFqUsername(url, preferredUsername) {
    const u = new URL(url);
    const m = /^\/(@[^\/]+)$/.exec(u.pathname);
    const username = m ? m[1] : preferredUsername;
    if (!username)
        throw new Error(`Unable to compute username from url: ${url}`);
    return `${username}@${u.hostname}`;
}
function tryParseInt(value) {
    try {
        return parseInt(value);
    }
    catch {
        return undefined;
    }
}
function tryParseIso8601(value) {
    return isValidIso8601(value) ? value : undefined;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.MAX_LEVELS = MAX_LEVELS;
exports.makeThreadcap = makeThreadcap;
exports.updateThreadcap = updateThreadcap;
exports.InMemoryCache = InMemoryCache;
exports.computeDefaultMillisToWait = computeDefaultMillisToWait;
exports.makeRateLimitedFetcher = makeRateLimitedFetcher;
