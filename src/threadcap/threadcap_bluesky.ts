import { Threadcap, Comment, Commenter, Node } from './threadcap.ts';
import { isStringRecord } from '../check.ts';
import { ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions, destructureThreadcapUrl, findOrFetchJson } from './threadcap_implementation.ts';

export const BlueskyProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { debug, fetcher, updateTime = new Date().toISOString(), cache } = opts;

        // https://bsky.app/profile/did/post/postId => at://did/app.bsky.feed.post/postId
        const { protocol, pathname } = destructureThreadcapUrl(url);
        const atUri = (() => {
            if (protocol === 'at:') return url;
            if (protocol === 'https:')  {
                const [ _, did, postId ] = /^\/profile\/([^/]+)\/post\/([^/]+)$/.exec(pathname) ?? [];
                if (did && postId) return `at://${did}/app.bsky.feed.post/${postId}`;
            }
            throw new Error(`Unexpected bluesky url: ${url}`);
        })();

        const res = await findOrFetchJson(makeUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread', { uri: atUri, depth: 0, parentHeight: 0 }), updateTime, fetcher, cache, { accept: 'application/json' });
        if (!isGetPostThreadResponse(res)) throw new Error(`Expected GetPostThreadResponse: ${JSON.stringify(res)}`);
        if (debug) console.log(JSON.stringify(res, undefined, 2));
        const { uri, author } = res.thread.post;
        const nodes: Record<string, Node> = {};
        nodes[uri] = {
            replies: [],
            repliesAsof: updateTime,
            comment: {
                attachments: [],
                content: { und: res.thread.post.record.text },
                attributedTo: author.did,
            },
            commentAsof: updateTime,
        };
        const commenters: Record<string, Commenter> = {};
        commenters[author.did] = {
            asof: updateTime,
            name: author.displayName,
            icon: {
                url: author.avatar,
            }
        };
        return { protocol: 'bluesky', roots: [ uri ], nodes, commenters };
    },
    
    async fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
        await Promise.resolve();
        throw new Error(`fetchComment(${JSON.stringify({ id, opts })}) not implemented`);
    },
    
    async fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
        await Promise.resolve();
        throw new Error(`fetchCommenter(${JSON.stringify({ attributedTo, opts })}) not implemented`);
    },
    
    async fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
        await Promise.resolve();
        throw new Error(`fetchReplies(${JSON.stringify({ id, opts })}) not implemented`);
    },
};

//

function makeUrl(url: string, queryParams: Record<string, string | number>): string {
    const u = new URL(url);
    Object.entries(queryParams).forEach(([ n, v ]) => u.searchParams.set(n, v.toString()));
    return u.toString();
}

type GetPostThreadResponse = {
    thread: {
        '$type': 'app.bsky.feed.defs#threadViewPost',
        post: {
            uri: string, // at://...
            cid: string,
            author: {
                did: string,
                handle: string,
                displayName: string,
                avatar: string,
                labels: unknown[],
            },
            record: {
                '$type': 'app.bsky.feed.post',
                // others
                text: string,
            },
        }
    }
}

function isGetPostThreadResponse(obj: unknown): obj is GetPostThreadResponse {
    return isStringRecord(obj)
        && isStringRecord(obj.thread)
        && obj.thread['$type'] === 'app.bsky.feed.defs#threadViewPost'
        && isStringRecord(obj.thread.post)
        && typeof obj.thread.post.uri === 'string'
        && isStringRecord(obj.thread.post.author)
        && typeof obj.thread.post.author.did === 'string'
        && typeof obj.thread.post.author.handle === 'string'
        && typeof obj.thread.post.author.displayName === 'string'
        && typeof obj.thread.post.author.avatar === 'string'
        && Array.isArray(obj.thread.post.author.labels)
        && isStringRecord(obj.thread.post.record)
        && obj.thread.post.record['$type'] === 'app.bsky.feed.post'
        && typeof obj.thread.post.record.text === 'string'
        ;
}
