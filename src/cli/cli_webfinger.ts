import { check, checkMatches, isValidHostname } from '../check.ts';
import { makeMinipubFetcher } from '../fetcher.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const webfingerDescription = 'Remote lookup of a fediverse user at a domain';

export async function webfinger(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ userAtHost ] = args;
    const m = /^@?(.*?)@(.*?)$/.exec(typeof userAtHost === 'string' ? userAtHost : '');
    if (!m) throw new Error('Provide user@host as an argument, e.g. minipub webfinger bob@example.social');
    const [ _, user, host ] = m;
    checkMatches('user', user, /^[a-zA-Z0-9_-]+$/);
    check('host', host, isValidHostname);
    const url = `https://${host}/.well-known/webfinger?resource=acct:${user}@${host}`;

    const fetcher = makeMinipubFetcher();
    const res = await fetcher(url);
    console.log(`${res.status} ${res.url}`);
    console.log([...res.headers].map(v => v.join(': ')).join('\n'));
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) {
        const obj = await res.json();
        console.log(JSON.stringify(obj, undefined, 2));
    } else {
        console.log(await res.text());
    }
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        webfingerDescription,
        '',
        'USAGE:',
        '    minipub webfinger [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <user@host>    The user@host to lookup (e.g. bob@example.social)',
        '',
        'OPTIONS:',
        '    --help         Prints help information',
        '    --verbose      Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
