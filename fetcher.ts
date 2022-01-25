import { MINIPUB_VERSION } from './version.ts';

export type Fetcher = (url: string, opts?: { method?: 'GET' | 'POST', headers?: Record<string, string>, body?: string }) => Promise<Response>;

export function makeMinipubFetcher(opts: UserAgentOptions = {}): Fetcher {
    const userAgent = computeMinipubUserAgent(opts);
    return async (url, opts = {}) => {
        const headers = { ...(opts.headers || {}), 'user-agent': userAgent };
        opts = { ...opts, headers };
        return await fetch(url, opts);
    }
}

export type UserAgentOptions = { origin?: string };

//

function computeMinipubUserAgent(opts: UserAgentOptions) {
    const { origin } = opts;
    const pieces: string[] = [];
    const denoVersion = globalThis && globalThis.Deno && globalThis.Deno.version && typeof globalThis.Deno.version.deno === 'string' ? globalThis.Deno.version.deno : undefined;
    if (denoVersion) pieces.push(`Deno/${denoVersion}`);
    if (origin) pieces.push(`+${origin}`);
    return `minipub/${MINIPUB_VERSION} (${pieces.join('; ')})`;
}
