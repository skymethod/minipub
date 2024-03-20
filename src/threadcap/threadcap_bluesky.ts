import { Threadcap, Comment, Commenter, Node } from './threadcap.ts';
import { isStringRecord } from '../check.ts';
import { ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions, destructureThreadcapUrl, findOrFetchJson } from './threadcap_implementation.ts';

export const BlueskyProtocolImplementation: ProtocolImplementation = {

    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { debug, fetcher, updateTime = new Date().toISOString(), cache } = opts;

        // https://bsky.app/profile/did/post/postId => at://did/app.bsky.feed.post/postId
        const { protocol, pathname } = destructureThreadcapUrl(url);

        const resolveDid = async (handleOrDid: string): Promise<string> => {
            if (handleOrDid.startsWith('did:')) return handleOrDid;
            const res = await findOrFetchJson(makeUrl('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile', { actor: handleOrDid }), updateTime, fetcher, cache, { accept: 'application/json' });
            if (!isGetProfileResponse(res))  throw new Error(JSON.stringify(res, undefined, 2));
            return res.did;
        }
        const atUri = await (async () => {
            if (protocol === 'at:') return url;
            if (protocol === 'https:')  {
                const [ _, handleOrDid, postId ] = /^\/profile\/([^/]+)\/post\/([^/]+)$/.exec(pathname) ?? [];
                if (handleOrDid && postId) return `at://${await resolveDid(handleOrDid)}/app.bsky.feed.post/${postId}`;
            }
            throw new Error(`Unexpected bluesky url: ${url}`);
        })();

        const res = await findOrFetchJson(makeUrl('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread', { uri: atUri, depth: 1000 /* max 1000 */, parentHeight: 0 }), updateTime, fetcher, cache, { accept: 'application/json' });
        if (!isGetPostThreadResponse(res)) throw new Error(`Expected GetPostThreadResponse: ${JSON.stringify(res, undefined, 2)}`);
        if (debug) console.log(JSON.stringify(res, undefined, 2));

        const nodes: Record<string, Node> = {};
        const commenters: Record<string, Commenter> = {};

        function processThread(thread: ThreadViewPost): string {
            const { uri, author, replyCount } = thread.post;
       
            let replies: string[] | undefined;
            if (replyCount === undefined) {
                if (thread.replies !== undefined) throw new Error(`Expected no thread.replies for undefined replyCount`);
            } else {
                const diff = replyCount - (thread.replies?.length ?? 0);
                if (diff < 0 || diff > 1) throw new Error(`Expected thread.replies.length ${thread.replies?.length} for replyCount ${replyCount}`);
                replies = [];
                for (const reply of thread.replies ?? []) {
                    const replyUri = processThread(reply);
                    replies.push(replyUri);
                }
            }
            nodes[uri] = {
                replies,
                repliesAsof: updateTime,
                comment: {
                    attachments: [],
                    content: { und: thread.post.record.text },
                    attributedTo: author.did,
                },
                commentAsof: updateTime,
            };
            
            commenters[author.did] = {
                asof: updateTime,
                name: author.displayName ?? author.handle,
                fqUsername: author.handle,
                icon: author.avatar ? { url: author.avatar } : undefined,
            };

            return uri;
        }

        const uri = processThread(res.thread);

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
    thread: ThreadViewPost,
};

function isGetPostThreadResponse(obj: unknown): obj is GetPostThreadResponse {
    return isStringRecord(obj)
        && isThreadViewPost(obj.thread)
        ;
}

type ThreadViewPost = {
    '$type': 'app.bsky.feed.defs#threadViewPost',
    post: {
        uri: string, // at://...
        cid: string,
        author: {
            did: string,
            handle: string,
            displayName?: string,
            avatar?: string,
            labels: unknown[],
        },
        record: {
            '$type': 'app.bsky.feed.post',
            // others
            text: string,
        },
        replyCount?: number,
    },
    replies?: ThreadViewPost[],
};

function isThreadViewPost(obj: unknown): obj is ThreadViewPost {
    return isStringRecord(obj)
        && obj['$type'] === 'app.bsky.feed.defs#threadViewPost'
        && isStringRecord(obj.post)
        && typeof obj.post.uri === 'string'
        && isStringRecord(obj.post.author)
        && typeof obj.post.author.did === 'string'
        && typeof obj.post.author.handle === 'string'
        && (obj.post.author.displayName === undefined || typeof obj.post.author.displayName === 'string')
        && (obj.post.author.avatar === undefined || typeof obj.post.author.avatar === 'string')
        && Array.isArray(obj.post.author.labels)
        && isStringRecord(obj.post.record)
        && obj.post.record['$type'] === 'app.bsky.feed.post'
        && typeof obj.post.record.text === 'string'
        && (obj.post.replyCount === undefined || typeof obj.post.replyCount === 'number')
        && (obj.replies === undefined || Array.isArray(obj.replies) && obj.replies.every(isThreadViewPost))
        ;
}

type GetProfileResponse = {
    did: string,
    handle: string,
    displayName: string,
    avatar?: string,
    // others
}

function isGetProfileResponse(obj: unknown): obj is GetProfileResponse {
    return isStringRecord(obj)
        && typeof obj.did === 'string'
        && typeof obj.handle === 'string'
        && typeof obj.displayName === 'string'
        && (obj.avatar === undefined || typeof obj.avatar === 'string')
        ;
}
