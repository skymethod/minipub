import { ParseCallback } from './activity_pub/ap_context.ts';
import { ApObject } from './activity_pub/ap_object.ts';
import { makeMinipubFetcher } from './fetcher.ts';
import { MINIPUB_VERSION } from './version.ts';

export const activityPubDescription = 'Fetch a url using the ActivityPub accept header and display the result';

export async function activityPub(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ url ] = args;
    if (typeof url !== 'string') throw new Error('Provide url as an argument, e.g. minipub activity-pub https://example.social/users/alice/statuses/123456');
    const ld = !!options.ld;
    const parse = !!options.parse;

    const accept = ld ? 'application/ld+json' : 'application/activity+json';

    const fetcher = makeMinipubFetcher();
    const res = await fetcher(url, { headers: { accept } });
    console.log(`${res.status} ${res.url}`);
    console.log([...res.headers].map(v => v.join(': ')).join('\n'));
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) {
        const obj = await res.json();
        console.log(JSON.stringify(obj, undefined, 2));
        if (parse) {
            let warnings = false;
            const callback: ParseCallback = {
                onUnresolvedProperty: (name, value, _context, phase) => {
                    if (phase === 'find') return;
                    console.warn(`Unresolved property: "${name}": ${JSON.stringify(value)}`);
                    warnings = true;
                }
            };
            ApObject.parseObj(obj, { callback });
            console.log(warnings ? 'Parsed ApObject with warnings' : 'Parsed ApObject ✅');
        }
    } else {
        console.log(await res.text());
    }

}

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        activityPubDescription,
        '',
        'USAGE:',
        '    minipub activity-pub [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <url>        Url to fetch, e.g. https://example.social/users/alice/statuses/123456',
        '',
        'OPTIONS:',
        '    --ld         Use the json-ld accept-header instead',
        '    --parse      Parse the ActivityPub response json for validity',
        '',
        '    --help       Prints help information',
        '    --verbose    Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
