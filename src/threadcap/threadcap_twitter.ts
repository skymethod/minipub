import { Comment, Commenter, Icon, Instant, Threadcap } from './threadcap.ts';
import { findOrFetchJson, ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions } from './threadcap_implementation.ts';

export const TwitterProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        // https://twitter.com/Alice/status/1503123431766512353
        const { hostname, pathname } = new URL(url);
        const m = /^\/.*?\/status\/(\d+)$/.exec(pathname);
        if (hostname !== 'twitter.com' || !m) throw new Error(`Unexpected tweet url: ${url}`);
        const [ _, id] = m;
        const tweetApiUrl = `https://api.twitter.com/2/tweets/${id}`;
        const obj = await findOrFetchTwitter(tweetApiUrl, new Date().toISOString(), opts);
        if (DEBUG) console.log(JSON.stringify(obj, undefined, 2));
        return { protocol: 'twitter', roots: [ tweetApiUrl ], nodes: {}, commenters: {} };
    },
    
    async fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
        const { updateTime } = opts;
        const url = new URL(id);
        url.searchParams.set('tweet.fields', 'author_id,lang,created_at');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (DEBUG) console.log(JSON.stringify(obj, undefined, 2));
        const tweetId = obj.data.id;
        const text = obj.data.text;
        const authorId = obj.data.author_id;
        const lang = obj.data.lang;
        const createdAt = obj.data.created_at;
        const content: Record<string, string> = {};
        content[lang] = text;
        const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
        return {
            attachments: [],
            attributedTo: `https://api.twitter.com/2/users/${authorId}`,
            content,
            published: createdAt,
            url: tweetUrl,
        }
    },
    
    async fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
        const { updateTime } = opts;
        const url = new URL(attributedTo);
        url.searchParams.set('user.fields', 'url,profile_image_url');
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (DEBUG) console.log('fetchCommenter', JSON.stringify(obj, undefined, 2));
        const name = obj.data.name;
        const fqUsername = '@' + obj.data.username;
        const userUrl = `https://twitter.com/${obj.data.username}`;

        // https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/user-profile-images-and-banners
        // 48x48
        const iconUrl = obj.data.profile_image_url;
        const iconUrlLower = (iconUrl || '').toLowerCase();
        const iconMediaType = iconUrlLower.endsWith('.jpg') ? 'image/jpeg' : iconUrlLower.endsWith('.png') ? 'image/png' : undefined;
        const icon: Icon | undefined = iconUrl ? { url: iconUrl, mediaType: iconMediaType } : undefined;
        return {
            asof: updateTime,
            name,
            fqUsername,
            url: userUrl,
            icon,
        }
    },
    
    async fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
        const { updateTime } = opts;
        const m = /^https:\/\/api\.twitter\.com\/2\/tweets\/(.*?)$/.exec(id);
        if (!m) throw new Error(`Unexpected tweet id: ${id}`);
        const [ _, tweetId ] = m;
        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.set('query', `conversation_id:${tweetId}`);
        url.searchParams.set('expansions', `referenced_tweets.id`);
        const obj = await findOrFetchTwitter(url.toString(), updateTime, opts);
        if (DEBUG) console.log('fetchReplies', JSON.stringify(obj, undefined, 2));
        // deno-lint-ignore no-explicit-any
        return obj.data.filter((v: any) => v.referenced_tweets.some((w: any) => w.type === 'replied_to' && w.id === tweetId)).map((v: any) => v.id).map((v: any) => `https://api.twitter.com/2/tweets/${v}`);
    },
};

//

const DEBUG = false;

// deno-lint-ignore no-explicit-any
async function findOrFetchTwitter(url: string, after: Instant, opts: ProtocolMethodOptions): Promise<any> {
    const { fetcher, cache, bearerToken } = opts;
    const obj = await findOrFetchJson(url, after, fetcher, cache, { accept: 'application/json', authorization: `Bearer ${bearerToken}` });
// x-rate-limit-limit: 300
// x-rate-limit-remaining: 299
// x-rate-limit-reset: 1647396188
    return obj;
}
