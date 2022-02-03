import { isPositiveInteger, isValidUrl } from './check.ts';
import { computeMinipubUserAgent } from './fetcher.ts';
import { Cache, Callbacks, Instant, makeRateLimitedFetcher, makeThreadcap, MAX_LEVELS, Threadcap, updateThreadcap } from './threadcap/threadcap.ts';
import { MINIPUB_VERSION } from './version.ts';

export const threadcapDescription = 'Enumerates an ActivityPub reply thread for a given root post url';

export async function threadcap(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ urlOrPath ] = args;
    if (typeof urlOrPath !== 'string') throw new Error('Provide url to root post (or local path to a saved threadcap) as an argument, e.g. minipub threadcap https://example.social/users/alice/statuses/123456');
    const { 'max-levels': maxLevels, 'max-nodes': maxNodes, out, 'start-node': startNode } = options;
    if (maxLevels !== undefined && (typeof maxLevels !== 'number' || !isPositiveInteger(maxLevels))) throw new Error(`'max-levels' should be a positive integer, if provided`);
    if (maxNodes !== undefined && (typeof maxNodes !== 'number' || !isPositiveInteger(maxNodes))) throw new Error(`'max-nodes' should be a positive integer, if provided`);
    if (out !== undefined && (typeof out !== 'string' || isValidUrl(out))) throw new Error(`'out' should be a valid path for where to save the threadcap, if provided`);
    if (startNode !== undefined && (typeof startNode !== 'string' || !isValidUrl(startNode))) throw new Error(`'start-node' should be a valid node id for where to start updating the threadcap, if provided`);

    let maxLevelProcessed = 0;
    let nodesProcessed = 0;
    const callbacks: Callbacks = {
        onEvent: event => {
            if (event.kind === 'waiting-for-rate-limit') {
                const { millisToWait, hostname, limit, remaining, reset, millisTillReset } = event;
                console.log(`Waiting ${(millisToWait / 1000).toFixed(2)}s before calling ${hostname}, ${JSON.stringify({ limit, remaining, reset, millisTillReset })}`);
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
    const loggedFetcher = async (url: string, opts?: { headers?: Record<string, string>}) => {
        console.log(`fetching: ${url}`);
        const res = await fetch(url, opts);
        fetches++;
        console.log(`${res.status} ${res.url}`);
        console.log([...res.headers].map(v => v.join(': ')).join('\n') + '\n');
        return res;
    };
    const fetcher = makeRateLimitedFetcher(loggedFetcher, { callbacks });
    const cache = new InMemoryCache();

    const userAgent = computeMinipubUserAgent();
    const threadcap = isValidUrl(urlOrPath) ? await makeThreadcap(urlOrPath, { userAgent, fetcher, cache }) : JSON.parse(await Deno.readTextFile(urlOrPath));
    const updateTime = new Date().toISOString();
    await updateThreadcap(threadcap, { updateTime, maxLevels, maxNodes, startNode, userAgent, fetcher, cache, callbacks });
    const threadcapJson = JSON.stringify(threadcap, undefined, 2);
    console.log(threadcapJson);
    const outFile = out ? out : !isValidUrl(urlOrPath) ? urlOrPath : undefined;
    if (outFile) {
        await Deno.writeTextFile(outFile, threadcapJson);
    }
    dumpNode(threadcap.root, threadcap, 0);
    console.log({ fetches, nodesProcessed, maxLevelProcessed });
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
        '    <url>           Url to fetch, e.g. https://example.social/users/alice/statuses/123456',
        '',
        'OPTIONS:',
        `    --max-levels    If provided, stop processing the thread after descending this many levels (positive integer, default: ${MAX_LEVELS})`,
        `    --max-nodes     If provided, stop processing the thread after processing this many nodes (positive integer, default: unlimited)`,
        `    --out           If provided, save the threadcap out to this file (local path)`,
        '',
        '    --help          Prints help information',
        '    --verbose       Toggle verbose output (when applicable)',
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

//

class InMemoryCache implements Cache {
    private readonly map = new Map<string, { response: Response, fetched: Instant }>();

    get(id: string, after: Instant): Promise<Response | undefined> {
        const { response, fetched } = this.map.get(id) || {};
        return Promise.resolve(response && fetched && fetched > after ? response.clone() : undefined);
    }

    put(id: string, fetched: Instant, response: Response): Promise<void> {
        this.map.set(id, { response, fetched });
        return Promise.resolve();
    }

}
