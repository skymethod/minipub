import { Fetcher } from '../fetcher.ts';
import { Cache, Callbacks, Comment, Commenter, Instant, TextResponse, Threadcap } from './threadcap.ts';

export interface ProtocolImplementation {
    initThreadcap(url: string, fetcher: Fetcher, cache: Cache): Promise<Threadcap>;
    fetchComment(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<Comment>;
    fetchCommenter(attributedTo: string, updateTime: Instant, fetcher: Fetcher, cache: Cache): Promise<Commenter>;
    fetchReplies(id: string, updateTime: Instant, fetcher: Fetcher, cache: Cache, callbacks: Callbacks | undefined): Promise<readonly string[]>;
}

// deno-lint-ignore no-explicit-any
export async function findOrFetchJson(url: string, after: Instant, fetcher: Fetcher, cache: Cache, accept: string): Promise<any> {
    const response = await findOrFetchTextResponse(url, after, fetcher, cache, accept);
    const { status, headers, bodyText } = response;
    if (status !== 200) throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
    const contentType = headers['content-type'] || '<none>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
    return JSON.parse(bodyText);
}

//

async function findOrFetchTextResponse(url: string, after: Instant, fetcher: Fetcher, cache: Cache, accept: string): Promise<TextResponse> {
    const existing = await cache.get(url, after);
    if (existing) return existing;
    const res = await fetcher(url, { headers: { accept }});
    const response: TextResponse = {
        status: res.status,
        headers: Object.fromEntries([...res.headers]),
        bodyText: await res.text(),
    }
    await cache.put(url, new Date().toISOString(), response);
    return response;
}
