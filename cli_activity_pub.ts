import { ApObject, ParseCallback } from './activity_pub/ap_object.ts';

export async function activityPub(args: (string | number)[], options: Record<string, unknown>) {
    const [ url ] = args;
    if (typeof url !== 'string') throw new Error('Provide url, e.g. https://example.social/users/alice/statuses/123456');
    const ld = !!options.ld;
    const parse = !!options.parse;

    const accept = ld ? 'application/ld+json' : 'application/activity+json';

    const res = await fetch(url, { headers: { accept } });
    console.log(`${res.status} ${res.url}`);
    console.log([...res.headers].map(v => v.join(': ')).join('\n'));
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) {
        const obj = await res.json();
        console.log(JSON.stringify(obj, undefined, 2));
        if (parse) {
            let warnings = false;
            const parseCallback: ParseCallback = {
                onUnresolvedProperty: (name, value, _context) => {
                    console.warn(`Unresolved property: "${name}": ${JSON.stringify(value)}`);
                    warnings = true;
                }
            };
            ApObject.parseObj(obj, parseCallback);
            console.log(warnings ? 'Parsed ApObject with warnings' : 'Parsed ApObject ✅');
        }
    } else {
        console.log(await res.text());
    }

}
