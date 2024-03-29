import { isNonEmpty, isPositiveInteger, isValidUrl } from '../check.ts';
import { computeMinipubUserAgent } from '../fetcher.ts';
import { InMemoryCache, Callbacks, makeRateLimitedFetcher, makeThreadcap, MAX_LEVELS, Threadcap, updateThreadcap, isValidProtocol, makeSigningAwareFetcher } from '../threadcap/threadcap.ts';
import { isValidThreadcapUrl, destructureThreadcapUrl } from '../threadcap/threadcap_implementation.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const threadcapDescription = 'Enumerates an ActivityPub reply thread for a given root post url';

export async function threadcap(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ urlOrPath ] = args;
    if (typeof urlOrPath !== 'string') throw new Error('Provide url to root post (or local path to a saved threadcap) as an argument, e.g. minipub threadcap https://example.social/users/alice/statuses/123456');
    const { 'max-levels': maxLevels, 'max-nodes': maxNodes, out, 'start-node': startNode, 'bearer-token': bearerTokenOpt, protocol: protocolOpt, 'key-id': keyId, 'private-key-pem': privateKeyPemPath, 'signing-mode': signingMode } = options;
    if (maxLevels !== undefined && (typeof maxLevels !== 'number' || !isPositiveInteger(maxLevels))) throw new Error(`'max-levels' should be a positive integer, if provided`);
    if (maxNodes !== undefined && (typeof maxNodes !== 'number' || !isPositiveInteger(maxNodes))) throw new Error(`'max-nodes' should be a positive integer, if provided`);
    if (out !== undefined && (typeof out !== 'string' || isValidThreadcapUrl(out))) throw new Error(`'out' should be a valid path for where to save the threadcap, if provided`);
    if (startNode !== undefined && (typeof startNode !== 'string' || !isValidThreadcapUrl(startNode))) throw new Error(`'start-node' should be a valid node id for where to start updating the threadcap, if provided`);
    if (protocolOpt !== undefined && (typeof protocolOpt !== 'string' || !isValidProtocol(protocolOpt))) throw new Error(`'protocol' should be one of: 'activitypub' or 'twitter', if provided`);
    if (keyId !== undefined && (typeof keyId !== 'string' || !isValidUrl(keyId))) throw new Error(`'key-id' should be a url with a hash fragment, e.g. https://social.example/actor#main-key`);
    if (privateKeyPemPath !== undefined && typeof privateKeyPemPath !== 'string') throw new Error(`'private-key-pem' should be a path to the system actor private key pem text file`);
    if (keyId && !privateKeyPemPath || !keyId && privateKeyPemPath) throw new Error(`Either specify both 'key-id' and 'private-key-pem', or neither`);
    if (signingMode !== undefined && !(signingMode === 'always' || signingMode === 'when-needed')) throw new Error(`'signing-mode' should be one of: 'always' or 'when-needed', if provided`);

    const privateKeyPemText = privateKeyPemPath ? await Deno.readTextFile(privateKeyPemPath) : undefined;
    const verbose = !!options.verbose;
    let maxLevelProcessed = 0;
    let nodesProcessed = 0;
    const callbacks: Callbacks = {
        onEvent: event => {
            if (event.kind === 'waiting-for-rate-limit') {
                const { millisToWait, endpoint, limit, remaining, reset, millisTillReset } = event;
                console.log(`Waiting ${(millisToWait / 1000).toFixed(2)}s before calling ${endpoint}, ${JSON.stringify({ limit, remaining, reset, millisTillReset })}`);
            } else if (event.kind === 'node-processed') {
                nodesProcessed++;
            } else if (event.kind === 'process-level') {
                maxLevelProcessed = Math.max(maxLevelProcessed, event.level);
            } else if (event.kind === 'warning') {
                const { url, nodeId, message, object } = event;
                console.warn(`WARNING: ${message}\n${nodeId}\n${url !== nodeId ? `${url}\n` : ''}`, object);
            } else {
                console.log(JSON.stringify(event));
            }
        }
    };

    let fetches = 0;
    const loggedFetcher = async (url: string, { headers = {} }: { headers?: Record<string, string> } = {}) => {
        console.log(`fetching: ${url}`);
        const res = await fetch(url, { headers });
        fetches++;
        console.log(`${res.status} ${res.url}`);
        console.log([...res.headers].map(v => v.join(': ')).join('\n') + '\n');
        return res;
    };
    const signingAwareFetcher = keyId && privateKeyPemText ? await makeSigningAwareFetcher(loggedFetcher, { keyId, privateKeyPemText, mode: signingMode }) : undefined;
    const fetcher = makeRateLimitedFetcher(signingAwareFetcher ?? loggedFetcher, { callbacks });
    const cache = new InMemoryCache();
    let cacheHits = 0;
    cache.onReturningCachedResponse = id => { cacheHits++; console.log(`Returning CACHED response for ${id}`); };

    const userAgent = computeMinipubUserAgent();
    const u = isValidThreadcapUrl(urlOrPath) ? destructureThreadcapUrl(urlOrPath) : undefined;
    const protocol = protocolOpt ? protocolOpt
        : u?.hostname === 'twitter.com' ? 'twitter'
        : u?.hostname === 'bsky.app' ? 'bluesky'
        : u?.protocol === 'at:' ? 'bluesky'
        : u?.protocol === 'nostr:' ? 'nostr'
        : undefined;
    let bearerToken: string | undefined = undefined;
    if (protocol === 'twitter') {
        if (typeof bearerTokenOpt !== 'string' || !isNonEmpty(bearerTokenOpt)) throw new Error(`'bearer-token' should be non-empty`);
        bearerToken = bearerTokenOpt.startsWith('/') ? await Deno.readTextFile(bearerTokenOpt) : bearerTokenOpt;
    }

    const debug = verbose;
    const updateTime = new Date().toISOString();
    const threadcap = isValidThreadcapUrl(urlOrPath) ? await makeThreadcap(urlOrPath, { userAgent, fetcher, updateTime, cache, protocol, bearerToken, debug }) : JSON.parse(await Deno.readTextFile(urlOrPath));
    await updateThreadcap(threadcap, { updateTime, maxLevels, maxNodes, startNode, userAgent, fetcher, cache, callbacks, bearerToken, debug });
    const threadcapJson = JSON.stringify(threadcap, undefined, 2);
    console.log(threadcapJson);
    const outFile = out ? out : !isValidThreadcapUrl(urlOrPath) ? urlOrPath : undefined;
    if (outFile) {
        await Deno.writeTextFile(outFile, threadcapJson);
    }
    for (const root of threadcap.roots) {
        console.log();
        dumpNode(root, threadcap, 0);
    }
    console.log({ fetches, nodesProcessed, maxLevelProcessed, cacheHits });
    if (outFile) console.log(`Saved threadcap json to: ${outFile}`);
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        threadcapDescription,
        '',
        'USAGE:',
        '    minipub threadcap [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <url>             Url to fetch, e.g. https://example.social/users/alice/statuses/123456',
        '',
        'OPTIONS:',
        `    --max-levels      If provided, stop processing the thread after descending this many levels (positive integer, default: ${MAX_LEVELS})`,
        `    --max-nodes       If provided, stop processing the thread after processing this many nodes (positive integer, default: unlimited)`,
        `    --out             If provided, save the threadcap out to this file (local path)`,
        `    --protocol        If provided, use this protocol to capture the thread (activitypub, twitter, default: activitypub)`,
        `    --bearer-token    If provided, bearer token to use for api calls needing auth (string value or /path/to/token.txt)`,
        '',
        '    --help            Prints help information',
        '    --verbose         Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}

//

function dumpNode(id: string, threadcap: Threadcap, level: number) {
    const prefix = '  '.repeat(level);
    const n = threadcap.nodes[id];
    if (!n || !n.comment) return; // only dump nodes with comment info
    const commenter = threadcap.commenters[n.comment.attributedTo];
    if (level > 0) console.log();
    console.log(`${prefix}${commenter.name} ${commenter.fqUsername} ${n.comment.published}`);
    console.log(`${prefix}${Object.values(n.comment.content)[0]}`);
    if (n.replies) {
        for (const reply of n.replies) {
            dumpNode(reply, threadcap, level + 1);
        }
    }
}
