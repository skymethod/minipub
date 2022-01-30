import { makeMinipubFetcher } from './fetcher.ts';
import { Cache, createThreadcap, updateThreadcap } from './threadcap/threadcap.ts';
import { MINIPUB_VERSION } from './version.ts';

export const threadcapDescription = 'Enumerates an ActivityPub reply thread for a given root post url';

export async function threadcap(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ url ] = args;
    if (typeof url !== 'string') throw new Error('Provide url as an argument, e.g. minipub threadcap https://example.social/users/alice/statuses/123456');

    const minipubFetcher = makeMinipubFetcher();
    const fetcher = async (url: string, opts?: { headers?: Record<string, string>}) => {
        console.log(`fetching: ${url}`);
        const res = await minipubFetcher(url, opts);
        console.log(`${res.status} ${res.url}`);
        console.log([...res.headers].map(v => v.join(': ')).join('\n') + '\n');
        return res;
    }
    const cache = new InMemoryCache();

    const threadcap = await createThreadcap(url, { fetcher, cache });
    const updateTime = new Date().toISOString();
    await updateThreadcap(threadcap, { updateTime, fetcher, cache });
    console.log(JSON.stringify(threadcap, undefined, 2));
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
        '    <url>        Url to fetch, e.g. https://example.social/users/alice/statuses/123456',
        '',
        'OPTIONS:',
        '    --help       Prints help information',
        '    --verbose    Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}

//

class InMemoryCache implements Cache {
    private readonly map = new Map<string, { response: Response, fetched: string }>();

    get(id: string, after: string): Promise<Response | undefined> {
        const { response, fetched } = this.map.get(id) || {};
        return Promise.resolve(response && fetched && fetched > after ? response : undefined);
    }

    put(id: string, fetched: string, response: Response): Promise<void> {
        this.map.set(id, { response, fetched });
        return Promise.resolve();
    }

}
