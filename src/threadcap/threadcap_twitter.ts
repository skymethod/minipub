import { Comment, Commenter, Icon, Instant, Threadcap } from './threadcap.ts';
import { findOrFetchJson, ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions } from './threadcap_implementation.ts';

export const TwitterProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { debug } = opts;
        // https://twitter.com/Alice/status/1503123431766512353
        const { hostname, pathname } = new URL(url);
        const m = /^\/.*?\/status\/(\d+)$/.exec(pathname);
        if (!/^(mobile\.)?twitter\.com$/.test(hostname) || !m) throw new Error(`Unexpected tweet url: ${url}`);
        const [ _, id] = m;
        const tweetApiUrl = `https://api.twitter.com/2/tweets/${id}`;
        const obj = await findOrFetchTwitter(tweetApiUrl, new Date().toISOString(), opts);
        if (debug) console.log(JSON.stringify(obj, undefined, 2));
        return { protocol: 'twitter', roots: [ tweetApiUrl ], nodes: {}, commenters: {} };
    },
    
    async fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
        const { updateTime, debug, state } = opts;
        if (typeof state.conversationId === 'string') {
            const conversation = await findOrFetchConversation(state.conversationId, opts);
            const tweetId = id.split('/').pop()!;
            const tweet = conversation.tweets[tweetId];
            if (!tweet) throw new Error(`fetchComment: tweet ${tweetId} not found in conversation`);
            return computeCommentFromTweetObj(tweet);
        }
        const url = new URL(id);
        url.searchParams.set('tweet.fields', 'author_id,lang,created_at');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (debug) console.log(JSON.stringify(obj, undefined, 2));
        return computeCommentFromTweetObj(obj.data);
    },
    
    async fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
        const { updateTime, debug, state } = opts;
        if (typeof state.conversationId === 'string') {
            const conversation = await findOrFetchConversation(state.conversationId, opts);
            const userId = attributedTo.split('/').pop()!;
            const user = conversation.users[userId];
            if (!user) throw new Error(`fetchCommenter: user ${userId} not found in conversation`);
            return computeCommenterFromUserObj(user, updateTime);
        }
        const url = new URL(attributedTo);
        url.searchParams.set('user.fields', 'profile_image_url');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (debug) console.log('fetchCommenter', JSON.stringify(obj, undefined, 2));
        return computeCommenterFromUserObj(obj.data, updateTime);
    },
    
    async fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
        const m = /^https:\/\/api\.twitter\.com\/2\/tweets\/(.*?)$/.exec(id);
        if (!m) throw new Error(`Unexpected tweet id: ${id}`);
        const [ _, tweetId ] = m;
        const convo = await findOrFetchConversation(tweetId, opts);
        return Object.values(convo.tweets)
            .filter(v => v.referenced_tweets.some(w => w.type === 'replied_to' && w.id === tweetId))
            .map(v => `https://api.twitter.com/2/tweets/${v.id}`);
    },
};

//

// deno-lint-ignore no-explicit-any
function computeCommenterFromUserObj(obj: any, asof: Instant): Commenter {
    const name = obj.name;
    const fqUsername = '@' + obj.username;
    const userUrl = `https://twitter.com/${obj.username}`;

    // https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/user-profile-images-and-banners
    // 48x48
    const iconUrl = obj.profile_image_url;
    const iconUrlLower = (iconUrl || '').toLowerCase();
    const iconMediaType = iconUrlLower.endsWith('.jpg') ? 'image/jpeg' : iconUrlLower.endsWith('.png') ? 'image/png' : undefined;
    const icon: Icon | undefined = iconUrl ? { url: iconUrl, mediaType: iconMediaType } : undefined;
    return {
        asof,
        name,
        fqUsername,
        url: userUrl,
        icon,
    }
}
// deno-lint-ignore no-explicit-any
function computeCommentFromTweetObj(obj: any): Comment {
    const tweetId = obj.id;
    const text = obj.text;
    const authorId = obj.author_id;
    const lang = obj.lang;
    const createdAt = obj.created_at;
    const content: Record<string, string> = {};
    content[lang] = text;
    const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
    return {
        attachments: [],
        attributedTo: `https://api.twitter.com/2/users/${authorId}`,
        content,
        published: createdAt,
        url: tweetUrl,
    };
}

// deno-lint-ignore no-explicit-any
async function findOrFetchTwitter(url: string, after: Instant, opts: ProtocolMethodOptions): Promise<any> {
    const { fetcher, cache, bearerToken } = opts;
    const obj = await findOrFetchJson(url, after, fetcher, cache, { accept: 'application/json', authorization: `Bearer ${bearerToken}` });
// x-rate-limit-limit: 300
// x-rate-limit-remaining: 299
// x-rate-limit-reset: 1647396188
    return obj;
}

async function findOrFetchConversation(tweetId: string, opts: ProtocolUpdateMethodOptions): Promise<Conversation> {
    const { updateTime, state, debug } = opts;
    let { conversation } = state;
    if (!conversation) {
        const conversationId = await findOrFetchConversationId(tweetId, opts);
        state.conversationId = conversationId;
        // https://developer.twitter.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-recent
        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.set('query', `conversation_id:${conversationId}`);
        url.searchParams.set('expansions', `referenced_tweets.id,author_id`);
        url.searchParams.set('tweet.fields', `author_id,lang,created_at`);
        url.searchParams.set('user.fields', `id,name,username,profile_image_url`);
        url.searchParams.set('max_results', `100`); // must be between 10 and 100
        const tweets: Record<string, Tweet> = {};
        const users: Record<string, User> = {};
        let nextToken: string | undefined;
        let i = 0;
        while (++i) {
            if (nextToken) {
                url.searchParams.set('next_token', nextToken);
            } else {
                url.searchParams.delete('next_token');
            }
            const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
            if (debug) console.log(`findOrFetchConversation nextToken=${nextToken}`, JSON.stringify(obj, undefined, 2));
           
            for (const tweetObj of obj.data) {
                const tweet = tweetObj as Tweet;
                tweets[tweet.id] = tweet;
            }
            if (obj.includes && Array.isArray(obj.includes.users)) {
                for (const userObj of obj.includes.users) {
                    const user = userObj as User;
                    users[user.id] = user;
                }
            }
            if (obj.meta && typeof obj.meta.next_token === 'string') {
                nextToken = obj.meta.next_token;
                if (i === 50) break; // 5000 tweets! 
            } else {
                break;
            }
        }
        conversation = { tweets, users };
        state.conversation = conversation;
    }
    return conversation as Conversation;
}

async function findOrFetchConversationId(tweetId: string, opts: ProtocolUpdateMethodOptions): Promise<string> {
    const { updateTime, state, debug } = opts;
    let { conversationId } = state;
    if (typeof conversationId === 'string') return conversationId;
    const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
    url.searchParams.set('tweet.fields', 'conversation_id');
    const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
    if (debug) console.log('findOrFetchConversation', JSON.stringify(obj, undefined, 2));
    conversationId = obj.data.conversation_id;
    if (typeof conversationId !== 'string') throw new Error(`Unexpected conversationId in payload: ${JSON.stringify(obj, undefined, 2)}`);
    state.conversationId = conversationId;
    return conversationId;
}

//

interface Conversation {
    readonly tweets: Record<string, Tweet>; // by tweetId
    readonly users: Record<string, Tweet>; // by userId
}

interface TweetReference {
    readonly type: string;
    readonly id: string;
}

interface Tweet {
    readonly id: string;
    readonly text: string;
    readonly created_at?: Instant;
    readonly author_id?: string;
    readonly lang?: string;
    readonly referenced_tweets: readonly TweetReference[];
}

interface User {
    readonly id: string;
    readonly name: string;
    readonly username: string;
    readonly profile_image_url: string;
}
