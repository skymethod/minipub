import { isNonEmpty, isNonNegativeInteger, isStringRecord, isValidIso8601 } from '../check.ts';
import { Cache, Comment, Commenter, Fetcher, Instant, Threadcap } from './threadcap.ts';
import { findOrFetchJson, ProtocolImplementation, ProtocolMethodOptions, ProtocolUpdateMethodOptions } from './threadcap_implementation.ts';

export const LightningCommentsProtocolImplementation: ProtocolImplementation = {
    async initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap> {
        const { fetcher, cache } = opts;
        const time: Instant = new Date().toISOString();
        const comments = await findOrFetchLightningComments(url, time, fetcher, cache); // will throw if invalid
        const roots = comments.filter(v => v.depth === 0).map(v => computeUrlWithHash(url, `comment-${v.id}`));
        return { protocol: 'lightning', roots, nodes: {}, commenters: {} };
    },
    
    async fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment> {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#comment-(.*?)$/.exec(new URL(id).hash);
        if (m) {
            const [ _, commentId] = m;
            const comments = await findOrFetchLightningComments(computeUrlWithHash(id, ''), updateTime, fetcher, cache);
            const comment = comments.find(v => v.id === commentId);
            if (!comment) throw new Error(`Comment not found: ${commentId}`);
            return {
                attachments: [],
                attributedTo: computeUrlWithHash(id, `commenter-${computeCommenterId(comment.sender)}`),
                content: { und: comment.message },
                published: comment.created,
            }
        }
        throw new Error(`fetchComment: unexpected id=${id}`);
    },
    
    async fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter> {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#commenter-(.*?)$/.exec(new URL(attributedTo).hash);
        if (m) {
            const [ _, commenterId] = m;
            const comments = await findOrFetchLightningComments(computeUrlWithHash(attributedTo, ''), updateTime, fetcher, cache);
            const commenter = comments.map(v => v.sender).find(v => computeCommenterId(v) === commenterId);
            if (!commenter) throw new Error(`Commenter not found: ${commenterId}`);
            return {
                asof: updateTime,
                name: `${commenter.name} from ${commenter.app}`,
            }
        }
        throw new Error(`fetchCommenter: unexpected attributedTo=${attributedTo}`);
    },
    
    async fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]> {
        const { fetcher, cache, updateTime } = opts;
        const m = /^#comment-(.*?)$/.exec(new URL(id).hash);
        if (m) {
            const [ _, commentId] = m;
            const url = computeUrlWithHash(id, '');
            const comments = await findOrFetchLightningComments(url, updateTime, fetcher, cache);
            const comment = comments.find(v => v.id === commentId);
            if (!comment) throw new Error(`Comment not found: ${commentId}`);
            return comment.children.map(v => computeUrlWithHash(url, `comment-${v}`));
        }
        throw new Error(`fetchReplies: unexpected id=${id}`);
    },
};

//

async function findOrFetchLightningComments(url: string, after: Instant, fetcher: Fetcher, cache: Cache): Promise<readonly LightningComment[]> {
    const obj = await findOrFetchJson(url, after, fetcher, cache, { accept: 'application/json' });
    if (!isStringRecord(obj) || !isStringRecord(obj.data) || !Array.isArray(obj.data.comments)) throw new Error(`Unable to find obj.data.comments array: ${JSON.stringify(obj)}`);
    return obj.data.comments.map((v, i) => {
        if (!isValidLightningComment(v)) throw new Error(`Unexpected lightning comment at index ${i}: ${JSON.stringify(v)}`);
        return v;
    });
}

function computeUrlWithHash(url: string, hash: string): string {
    const u = new URL(url);
    u.hash = hash;
    return u.toString();
}

function computeCommenterId(sender: LightningSender) {
    return sender.id === null ? `null-${sender.name}` : sender.id;
}

//

interface LightningComment {
    readonly id: string; // e.g. Niyj1piMHD9erP6Cfq1N
    readonly message: string; // text
    readonly payment: number; // e.g. 100
    readonly parent: string | null; // e.g. o2vypxvTiS05iK5oDoHm or null
    readonly children: readonly string[];// e.g. [ "Niyj1piMHD9erP6Cfq1N" ]
    readonly depth: number; // e.g. 0 or 1 (multiple roots)
    readonly created: Instant; // e.g. 2022-03-14T10:25:45.455Z
    readonly sender: LightningSender;
}

// deno-lint-ignore no-explicit-any
function isValidLightningComment(obj: any): obj is LightningComment {
    return isStringRecord(obj) 
        && typeof obj.id === 'string' && isNonEmpty(obj.id)
        && typeof obj.message === 'string' && isNonEmpty(obj.message)
        && (typeof obj.parent === 'string' && isNonEmpty(obj.parent) || obj.parent === null)
        && Array.isArray(obj.children) && obj.children.every(v => typeof v === 'string' && isNonEmpty(v))
        && typeof obj.depth === 'number' && isNonNegativeInteger(obj.depth)
        && typeof obj.created === 'string' && isValidIso8601(obj.created)
        && isValidLightningSender(obj.sender)
        ;
}

interface LightningSender {
    readonly app: string; // e.g. PodSqueeze
    readonly id: string | null; // e.g. 1VUCMUGSgkOAK6Ls3Cj5, found null
    readonly name: string; // e.g. @alice or Alice Doe
}

// deno-lint-ignore no-explicit-any
function isValidLightningSender(obj: any): obj is LightningSender {
    return isStringRecord(obj) 
        && typeof obj.app === 'string' && isNonEmpty(obj.app)
        && (obj.id === null || typeof obj.id === 'string' && isNonEmpty(obj.id))
        && typeof obj.name === 'string' && isNonEmpty(obj.name)
        ;
}
