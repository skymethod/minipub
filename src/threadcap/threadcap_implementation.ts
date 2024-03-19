import { Fetcher } from '../fetcher.ts';
import { Cache, Callbacks, Comment, Commenter, Instant, TextResponse, Threadcap } from './threadcap.ts';

export interface ProtocolMethodOptions {
    readonly bearerToken?: string;
    readonly fetcher: Fetcher;
    readonly cache: Cache;
    readonly debug?: boolean;
    readonly updateTime?: Instant;
}

export interface ProtocolUpdateMethodOptions extends ProtocolMethodOptions {
    readonly updateTime: Instant;
    readonly callbacks?: Callbacks;
    readonly state: Record<string, unknown>;
}

export interface ProtocolImplementation {
    initThreadcap(url: string, opts: ProtocolMethodOptions): Promise<Threadcap>;
    fetchComment(id: string, opts: ProtocolUpdateMethodOptions): Promise<Comment>;
    fetchCommenter(attributedTo: string, opts: ProtocolUpdateMethodOptions): Promise<Commenter>;
    fetchReplies(id: string, opts: ProtocolUpdateMethodOptions): Promise<readonly string[]>;
}

// deno-lint-ignore no-explicit-any
export async function findOrFetchJson(url: string, after: Instant, fetcher: Fetcher, cache: Cache, opts: { accept: string, authorization?: string }): Promise<any> {
    const response = await findOrFetchTextResponse(url, after, fetcher, cache, opts);
    const { status, headers, bodyText } = response;
    if (status !== 200) throw new Error(`Expected 200 response for ${url}, found ${status} body=${bodyText}`);
    const contentType = headers['content-type'] || '<none>';
    const foundJson = contentType.toLowerCase().includes('json') || contentType === '<none>' && bodyText.startsWith('{"');
    if (!foundJson) throw new Error(`Expected json response for ${url}, found ${contentType} body=${bodyText}`);
    return JSON.parse(bodyText);
}

export function isValidThreadcapUrl(url: string): boolean {
    try {
        const { protocol } = destructureThreadcapUrl(url);
        return [ 'http:', 'https:', 'nostr:', 'at:' ].includes(protocol);
    } catch {
        return false;
    }
}

export function destructureThreadcapUrl(url: string): { protocol: string, hostname: string, pathname: string, searchParams: URLSearchParams } {
    // need to tunnel invalid hostname for at://did:plc:something/path
    const m = /^(at:\/\/)([^/]+)(\/.*?)$/.exec(url);
    const tmpUrl = m ? `${m[1]}${m[2].replaceAll(':', '%3A')}${m[3]}` : undefined;
    const { protocol, hostname: tmpHostname, pathname, searchParams } = new URL(tmpUrl ?? url);
    const hostname = tmpUrl ? tmpHostname.replaceAll('%3A', ':') : tmpHostname;
    return { protocol, hostname, pathname, searchParams };
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
        headers: objectFromEntries([...res.headers]),
        bodyText: await res.text(),
    }
    await cache.put(url, new Date().toISOString(), response);
    return response;
}

function objectFromEntries<T>(entries: [ string, T ][]): Record<string, T> { // for < es2019
    return [...entries].reduce((obj, [ key, value ]) => {
        obj[key] = value;
        return obj;
    }, {} as Record<string, T>);
}
