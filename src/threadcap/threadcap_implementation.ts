import { Fetcher } from '../fetcher.ts';
import { Cache, Callbacks, Comment, Commenter, Instant, TextResponse, Threadcap } from './threadcap.ts';

export interface ProtocolMethodOptions {
    readonly bearerToken?: string;
    readonly fetcher: Fetcher;
    readonly cache: Cache;
}

export interface ProtocolImplementation {
    initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap>;
    fetchComment(id: string, updateTime: Instant, callbacks: Callbacks | undefined, opts: ProtocolMethodOptions): Promise<Comment>;
    fetchCommenter(attributedTo: string, updateTime: Instant, opts: ProtocolMethodOptions): Promise<Commenter>;
    fetchReplies(id: string, updateTime: Instant, callbacks: Callbacks | undefined, opts: ProtocolMethodOptions): Promise<readonly string[]>;
}

// deno-lint-ignore no-explicit-any
export async function findOrFetchJson(url: string, after: Instant, fetcher: Fetcher, cache: Cache, opts: { accept: string, authorization?: string }): Promise<any> {
    const response = await findOrFetchTextResponse(url, after, fetcher, cache, opts);
    const { status, headers, bodyText } = response;
    if (status !== 200) throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
    const contentType = headers['content-type'] || '<none>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
    return JSON.parse(bodyText);
}

//

async function findOrFetchTextResponse(url: string, after: Instant, fetcher: Fetcher, cache: Cache, opts: { accept: string, authorization?: string }): Promise<TextResponse> {
    const existing = await cache.get(url, after);
    if (existing) return existing;
    const { accept, authorization } = opts;
    const headers: Record<string, string> = { accept };
    if (authorization) headers.authorization = authorization;
    const res = await fetcher(url, { headers });
    const response: TextResponse = {
        status: res.status,
        headers: Object.fromEntries([...res.headers]),
        bodyText: await res.text(),
    }
    await cache.put(url, new Date().toISOString(), response);
    return response;
}
