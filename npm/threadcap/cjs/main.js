function isNonEmpty(value) {
    return value.trim().length > 0;
}
function isStringRecord(obj) {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj) && obj.constructor === Object;
}
function isReadonlyArray(arg) {
    return Array.isArray(arg);
}
function isValidIso8601(text) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(text);
}
function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}
async function findOrFetchJson(url, after, fetcher, cache, opts) {
    const response = await findOrFetchTextResponse(url, after, fetcher, cache, opts);
    const { status, headers, bodyText } = response;
    if (status !== 200)
        throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
    const contentType = headers['content-type'] || '<none>';
    const foundJson = contentType.toLowerCase().includes('json') || contentType === '<none>' && bodyText.startsWith('{"');
    if (!foundJson)
        throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
    return JSON.parse(bodyText);
}
async function findOrFetchTextResponse(url, after, fetcher, cache, opts) {
    const existing = await cache.get(url, after);
    if (existing)
        return existing;
    const { accept, authorization } = opts;
    const headers = {
        accept
    };
    if (authorization)
        headers.authorization = authorization;
    const res = await fetcher(url, {
        headers
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
const ActivityPubProtocolImplementation = {
    initThreadcap: initActivityPubThreadcap,
    fetchComment: fetchActivityPubComment,
    fetchCommenter: fetchActivityPubCommenter,
    fetchReplies: fetchActivityPubReplies
};
async function mastodonFindReplies(id, opts) {
    const { after, fetcher, cache, debug } = opts;
    const statusId = await mastodonFindStatusIdForActivityPubId(id, after, fetcher, cache, debug);
    if (!statusId)
        return [];
    const { origin } = new URL(id);
    const url = new URL(origin);
    url.pathname = `/api/v1/statuses/${statusId}/context`;
    const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, {
        accept: 'application/json'
    });
    if (debug)
        console.log(JSON.stringify(obj, undefined, 2));
    const rt = [];
    if (isStringRecord(obj) && Array.isArray(obj.descendants)) {
        for (const descendant of obj.descendants) {
            if (isStringRecord(descendant) && typeof descendant.uri === 'string' && descendant.in_reply_to_id === statusId) {
                rt.push(descendant.uri);
            }
        }
    }
    return rt;
}
async function findOrFetchActivityPubObject(url, after, fetcher, cache) {
    return await findOrFetchJson(url, after, fetcher, cache, {
        accept: 'application/activity+json'
    });
}
async function initActivityPubThreadcap(url, opts) {
    const { fetcher, cache } = opts;
    const object = await findOrFetchActivityPubObject(url, new Date().toISOString(), fetcher, cache);
    const { id, type } = object;
    if (typeof type !== 'string')
        throw new Error(`Unexpected type for object: ${JSON.stringify(object)}`);
    if (!/^(Note|Article|Video|PodcastEpisode)$/.test(type))
        throw new Error(`Unexpected type: ${type}`);
    if (typeof id !== 'string')
        throw new Error(`Unexpected id for object: ${JSON.stringify(object)}`);
    return {
        protocol: 'activitypub',
        roots: [
            id
        ],
        nodes: {},
        commenters: {}
    };
}
async function fetchActivityPubComment(id, opts) {
    const { fetcher, cache, updateTime, callbacks } = opts;
    const object = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    return computeComment(object, id, callbacks);
}
async function fetchActivityPubCommenter(attributedTo, opts) {
    const { fetcher, cache, updateTime } = opts;
    const object = await findOrFetchActivityPubObject(attributedTo, updateTime, fetcher, cache);
    return computeCommenter(object, updateTime);
}
async function fetchActivityPubReplies(id, opts) {
    var _a;
    const { fetcher, cache, updateTime, callbacks, debug } = opts;
    const fetchedObject = await findOrFetchActivityPubObject(id, updateTime, fetcher, cache);
    const object = unwrapActivityIfNecessary(fetchedObject, id, callbacks);
    const replies = object.type === 'PodcastEpisode' ? object.comments : (_a = object.replies) !== null && _a !== void 0 ? _a : object.comments;
    if (replies === undefined) {
        let message = object.type === 'PodcastEpisode' ? `No 'comments' found on PodcastEpisode object` : `No 'replies' found on object`;
        const tryPleromaWorkaround = id.includes('/objects/');
        if (tryPleromaWorkaround) {
            message += ', trying Pleroma workaround';
        }
        callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
            kind: 'warning',
            url: id,
            nodeId: id,
            message,
            object
        });
        if (tryPleromaWorkaround) {
            return await mastodonFindReplies(id, {
                after: updateTime,
                fetcher,
                cache,
                debug
            });
        }
        return [];
    }
    const rt = [];
    const fetched = new Set();
    if (typeof replies === 'string') {
        const obj = await findOrFetchActivityPubObject(replies, updateTime, fetcher, cache);
        if (obj.type === 'OrderedCollection' || obj.type === 'OrderedCollectionPage') {
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
async function mastodonFindStatusIdForActivityPubId(id, after, fetcher, cache, debug) {
    const { origin } = new URL(id);
    const url = new URL(origin);
    url.pathname = '/api/v2/search';
    url.searchParams.set('q', id);
    url.searchParams.set('type', 'statuses');
    const obj = await findOrFetchJson(url.toString(), after, fetcher, cache, {
        accept: 'application/json'
    });
    if (debug)
        console.log(JSON.stringify(obj, undefined, 2));
    if (isStringRecord(obj) && Array.isArray(obj.statuses) && obj.statuses.length === 1) {
        const status = obj.statuses[0];
        if (isStringRecord(status) && typeof status.id === 'string' && status.id !== '') {
            return status.id;
        }
    }
    return undefined;
}
const LightningCommentsProtocolImplementation = {
    async initThreadcap(url, opts) {
        const { fetcher, cache } = opts;
        const time = new Date().toISOString();
        const comments = await findOrFetchLightningComments(url, time, fetcher, cache);
        const roots = comments.filter((v) => v.depth === 0).map((v) => computeUrlWithHash(url, `comment-${v.id}`));
        return {
            protocol: 'lightning',
            roots,
            nodes: {},
            commenters: {}
        };
    },
    async fetchComment(id, opts) {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#comment-(.*?)$/.exec(new URL(id).hash);
        if (m) {
            const [_, commentId] = m;
            const comments = await findOrFetchLightningComments(computeUrlWithHash(id, ''), updateTime, fetcher, cache);
            const comment = comments.find((v) => v.id === commentId);
            if (!comment)
                throw new Error(`Comment not found: ${commentId}`);
            return {
                attachments: [],
                attributedTo: computeUrlWithHash(id, `commenter-${computeCommenterId(comment.sender)}`),
                content: {
                    und: comment.message
                },
                published: comment.created
            };
        }
        throw new Error(`fetchComment: unexpected id=${id}`);
    },
    async fetchCommenter(attributedTo, opts) {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#commenter-(.*?)$/.exec(new URL(attributedTo).hash);
        if (m) {
            const [_, commenterId] = m;
            const comments = await findOrFetchLightningComments(computeUrlWithHash(attributedTo, ''), updateTime, fetcher, cache);
            const commenter = comments.map((v) => v.sender).find((v) => computeCommenterId(v) === commenterId);
            if (!commenter)
                throw new Error(`Commenter not found: ${commenterId}`);
            return {
                asof: updateTime,
                name: `${commenter.name} from ${commenter.app}`
            };
        }
        throw new Error(`fetchCommenter: unexpected attributedTo=${attributedTo}`);
    },
    async fetchReplies(id, opts) {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#comment-(.*?)$/.exec(new URL(id).hash);
        if (m) {
            const [_, commentId] = m;
            const url = computeUrlWithHash(id, '');
            const comments = await findOrFetchLightningComments(url, updateTime, fetcher, cache);
            const comment = comments.find((v) => v.id === commentId);
            if (!comment)
                throw new Error(`Comment not found: ${commentId}`);
            return comment.children.map((v) => computeUrlWithHash(url, `comment-${v}`));
        }
        throw new Error(`fetchReplies: unexpected id=${id}`);
    }
};
async function findOrFetchLightningComments(url, after, fetcher, cache) {
    const obj = await findOrFetchJson(url, after, fetcher, cache, {
        accept: 'application/json'
    });
    if (!isStringRecord(obj) || !isStringRecord(obj.data) || !Array.isArray(obj.data.comments))
        throw new Error(`Unable to find obj.data.comments array: ${JSON.stringify(obj)}`);
    return obj.data.comments.map((v, i) => {
        if (!isValidLightningComment(v))
            throw new Error(`Unexpected lightning comment at index ${i}: ${JSON.stringify(v)}`);
        return v;
    });
}
function computeUrlWithHash(url, hash) {
    const u = new URL(url);
    u.hash = hash;
    return u.toString();
}
function computeCommenterId(sender) {
    return sender.id === null ? `null-${sender.name}` : sender.id;
}
function isValidLightningComment(obj) {
    return isStringRecord(obj) && typeof obj.id === 'string' && isNonEmpty(obj.id) && typeof obj.message === 'string' && isNonEmpty(obj.message) && (typeof obj.parent === 'string' && isNonEmpty(obj.parent) || obj.parent === null) && Array.isArray(obj.children) && obj.children.every((v) => typeof v === 'string' && isNonEmpty(v)) && typeof obj.depth === 'number' && isNonNegativeInteger(obj.depth) && typeof obj.created === 'string' && isValidIso8601(obj.created) && isValidLightningSender(obj.sender);
}
function isValidLightningSender(obj) {
    return isStringRecord(obj) && typeof obj.app === 'string' && isNonEmpty(obj.app) && (obj.id === null || typeof obj.id === 'string' && isNonEmpty(obj.id)) && typeof obj.name === 'string' && isNonEmpty(obj.name);
}
const TwitterProtocolImplementation = {
    async initThreadcap(url, opts) {
        const { debug } = opts;
        const { hostname, pathname } = new URL(url);
        const m = /^\/.*?\/status\/(\d+)$/.exec(pathname);
        if (!/^(mobile\.)?twitter\.com$/.test(hostname) || !m)
            throw new Error(`Unexpected tweet url: ${url}`);
        const [_, id] = m;
        const tweetApiUrl = `https://api.twitter.com/2/tweets/${id}`;
        const obj = await findOrFetchTwitter(tweetApiUrl, new Date().toISOString(), opts);
        if (debug)
            console.log(JSON.stringify(obj, undefined, 2));
        return {
            protocol: 'twitter',
            roots: [
                tweetApiUrl
            ],
            nodes: {},
            commenters: {}
        };
    },
    async fetchComment(id, opts) {
        const { updateTime, debug, state } = opts;
        if (typeof state.conversationId === 'string') {
            const conversation = await findOrFetchConversation(state.conversationId, opts);
            const tweetId = id.split('/').pop();
            const tweet = conversation.tweets[tweetId];
            if (!tweet)
                throw new Error(`fetchComment: tweet ${tweetId} not found in conversation`);
            return computeCommentFromTweetObj(tweet);
        }
        const url = new URL(id);
        url.searchParams.set('tweet.fields', 'author_id,lang,created_at');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (debug)
            console.log(JSON.stringify(obj, undefined, 2));
        return computeCommentFromTweetObj(obj.data);
    },
    async fetchCommenter(attributedTo, opts) {
        const { updateTime, debug, state } = opts;
        if (typeof state.conversationId === 'string') {
            const conversation = await findOrFetchConversation(state.conversationId, opts);
            const userId = attributedTo.split('/').pop();
            const user = conversation.users[userId];
            if (!user)
                throw new Error(`fetchCommenter: user ${userId} not found in conversation`);
            return computeCommenterFromUserObj(user, updateTime);
        }
        const url = new URL(attributedTo);
        url.searchParams.set('user.fields', 'profile_image_url');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (debug)
            console.log('fetchCommenter', JSON.stringify(obj, undefined, 2));
        return computeCommenterFromUserObj(obj.data, updateTime);
    },
    async fetchReplies(id, opts) {
        const m = /^https:\/\/api\.twitter\.com\/2\/tweets\/(.*?)$/.exec(id);
        if (!m)
            throw new Error(`Unexpected tweet id: ${id}`);
        const [_, tweetId] = m;
        const convo = await findOrFetchConversation(tweetId, opts);
        return Object.values(convo.tweets).filter((v) => v.referenced_tweets.some((w) => w.type === 'replied_to' && w.id === tweetId)).map((v) => `https://api.twitter.com/2/tweets/${v.id}`);
    }
};
function computeCommenterFromUserObj(obj, asof) {
    const name = obj.name;
    const fqUsername = '@' + obj.username;
    const userUrl = `https://twitter.com/${obj.username}`;
    const iconUrl = obj.profile_image_url;
    const iconUrlLower = (iconUrl || '').toLowerCase();
    const iconMediaType = iconUrlLower.endsWith('.jpg') ? 'image/jpeg' : iconUrlLower.endsWith('.png') ? 'image/png' : undefined;
    const icon = iconUrl ? {
        url: iconUrl,
        mediaType: iconMediaType
    } : undefined;
    return {
        asof,
        name,
        fqUsername,
        url: userUrl,
        icon
    };
}
function computeCommentFromTweetObj(obj) {
    const tweetId = obj.id;
    const text = obj.text;
    const authorId = obj.author_id;
    const lang = obj.lang;
    const createdAt = obj.created_at;
    const content = {};
    content[lang] = text;
    const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
    return {
        attachments: [],
        attributedTo: `https://api.twitter.com/2/users/${authorId}`,
        content,
        published: createdAt,
        url: tweetUrl
    };
}
async function findOrFetchTwitter(url, after, opts) {
    const { fetcher, cache, bearerToken } = opts;
    const obj = await findOrFetchJson(url, after, fetcher, cache, {
        accept: 'application/json',
        authorization: `Bearer ${bearerToken}`
    });
    return obj;
}
async function findOrFetchConversation(tweetId, opts) {
    const { updateTime, state, debug } = opts;
    let { conversation } = state;
    if (!conversation) {
        const conversationId = await findOrFetchConversationId(tweetId, opts);
        state.conversationId = conversationId;
        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.set('query', `conversation_id:${conversationId}`);
        url.searchParams.set('expansions', `referenced_tweets.id,author_id`);
        url.searchParams.set('tweet.fields', `author_id,lang,created_at`);
        url.searchParams.set('user.fields', `id,name,username,profile_image_url`);
        url.searchParams.set('max_results', `100`);
        const tweets = {};
        const users = {};
        let nextToken;
        let i = 0;
        while (++i) {
            if (nextToken) {
                url.searchParams.set('next_token', nextToken);
            }
            else {
                url.searchParams.delete('next_token');
            }
            const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
            if (debug)
                console.log(`findOrFetchConversation nextToken=${nextToken}`, JSON.stringify(obj, undefined, 2));
            for (const tweetObj of obj.data) {
                const tweet = tweetObj;
                tweets[tweet.id] = tweet;
            }
            if (obj.includes && Array.isArray(obj.includes.users)) {
                for (const userObj of obj.includes.users) {
                    const user = userObj;
                    users[user.id] = user;
                }
            }
            if (obj.meta && typeof obj.meta.next_token === 'string') {
                nextToken = obj.meta.next_token;
                if (i === 50)
                    break;
            }
            else {
                break;
            }
        }
        conversation = {
            tweets,
            users
        };
        state.conversation = conversation;
    }
    return conversation;
}
async function findOrFetchConversationId(tweetId, opts) {
    const { updateTime, state, debug } = opts;
    let { conversationId } = state;
    if (typeof conversationId === 'string')
        return conversationId;
    const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
    url.searchParams.set('tweet.fields', 'conversation_id');
    const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
    if (debug)
        console.log('findOrFetchConversation', JSON.stringify(obj, undefined, 2));
    conversationId = obj.data.conversation_id;
    if (typeof conversationId !== 'string')
        throw new Error(`Unexpected conversationId in payload: ${JSON.stringify(obj, undefined, 2)}`);
    state.conversationId = conversationId;
    return conversationId;
}
function isValidProtocol(protocol) {
    return protocol === 'activitypub' || protocol === 'twitter' || protocol === 'lightning' || protocol === 'lightningcomments';
}
const MAX_LEVELS = 1000;
async function makeThreadcap(url, opts) {
    const { cache, userAgent, protocol, bearerToken, debug } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const implementation = computeProtocolImplementation(protocol);
    return await implementation.initThreadcap(url, {
        fetcher,
        cache,
        bearerToken,
        debug
    });
}
async function updateThreadcap(threadcap, opts) {
    const { userAgent, cache, updateTime, callbacks, maxLevels, maxNodes: maxNodesInput, startNode, keepGoing, bearerToken, debug } = opts;
    const fetcher = makeFetcherWithUserAgent(opts.fetcher, userAgent);
    const maxLevel = Math.min(Math.max(maxLevels === undefined ? 1000 : Math.round(maxLevels), 0), 1000);
    const maxNodes = maxNodesInput === undefined ? undefined : Math.max(Math.round(maxNodesInput), 0);
    if (startNode && !threadcap.nodes[startNode])
        throw new Error(`Invalid start node: ${startNode}`);
    if (maxLevel === 0)
        return;
    if (maxNodes === 0)
        return;
    const implementation = computeProtocolImplementation(threadcap.protocol);
    const state = {};
    const idsBylevel = [
        startNode ? [
            startNode
        ] : [
            ...threadcap.roots
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
            const node = await processNode(id, processReplies, threadcap, implementation, {
                updateTime,
                callbacks,
                state,
                fetcher,
                cache,
                bearerToken,
                debug
            });
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
    const endpointLimits = new Map();
    return async (url, opts) => {
        const { hostname, pathname } = new URL(url);
        const twitterEndpoint = computeTwitterEndpoint(hostname, pathname);
        const endpoint = twitterEndpoint || hostname;
        const limits = endpointLimits.get(endpoint);
        if (limits) {
            const { limit, remaining, reset } = limits;
            const millisTillReset = new Date(reset).getTime() - Date.now();
            const millisToWait = computeMillisToWait({
                endpoint,
                limit,
                remaining,
                reset,
                millisTillReset
            });
            if (millisToWait > 0) {
                callbacks === null || callbacks === void 0 ? void 0 : callbacks.onEvent({
                    kind: 'waiting-for-rate-limit',
                    endpoint,
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
        const limitHeader = twitterEndpoint ? 'x-rate-limit-limit' : 'x-ratelimit-limit';
        const remainingHeader = twitterEndpoint ? 'x-rate-limit-remaining' : 'x-ratelimit-remaining';
        const resetHeader = twitterEndpoint ? 'x-rate-limit-reset' : 'x-ratelimit-reset';
        const limit = tryParseInt(res.headers.get(limitHeader) || '');
        const remaining = tryParseInt(res.headers.get(remainingHeader) || '');
        const resetStr = res.headers.get(resetHeader) || '';
        const reset = twitterEndpoint ? tryParseEpochSecondsAsIso8601(resetStr) : tryParseIso8601(resetStr);
        if (limit !== undefined && remaining !== undefined && reset !== undefined) {
            endpointLimits.set(endpoint, {
                limit,
                remaining,
                reset
            });
        }
        return res;
    };
}
function computeTwitterEndpoint(hostname, pathname) {
    if (hostname === 'api.twitter.com') {
        return pathname.replaceAll(/\d{4,}/g, ':id');
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
function computeProtocolImplementation(protocol) {
    if (protocol === undefined || protocol === 'activitypub')
        return ActivityPubProtocolImplementation;
    if (protocol === 'lightning' || protocol === 'lightningcomments')
        return LightningCommentsProtocolImplementation;
    if (protocol === 'twitter')
        return TwitterProtocolImplementation;
    throw new Error(`Unsupported protocol: ${protocol}`);
}
async function processNode(id, processReplies, threadcap, implementation, opts) {
    const { updateTime, callbacks } = opts;
    let node = threadcap.nodes[id];
    if (!node) {
        node = {};
        threadcap.nodes[id] = node;
    }
    const updateComment = !node.commentAsof || node.commentAsof < updateTime;
    if (updateComment) {
        try {
            node.comment = await implementation.fetchComment(id, opts);
            const { attributedTo } = node.comment;
            const existingCommenter = threadcap.commenters[attributedTo];
            if (!existingCommenter || existingCommenter.asof < updateTime) {
                threadcap.commenters[attributedTo] = await implementation.fetchCommenter(attributedTo, opts);
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
                node.replies = await implementation.fetchReplies(id, opts);
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
function tryParseEpochSecondsAsIso8601(value) {
    const seconds = tryParseInt(value);
    return seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}
exports.isValidProtocol = isValidProtocol;
exports.MAX_LEVELS = MAX_LEVELS;
exports.makeThreadcap = makeThreadcap;
exports.updateThreadcap = updateThreadcap;
exports.InMemoryCache = InMemoryCache;
exports.computeDefaultMillisToWait = computeDefaultMillisToWait;
exports.makeRateLimitedFetcher = makeRateLimitedFetcher;
