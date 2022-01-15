
export async function activityPub(args: (string | number)[], options: Record<string, unknown>) {
    const [ url ] = args;
    if (typeof url !== 'string') throw new Error('Provide url, e.g. https://example.social/users/alice/statuses/123456');
    const ld = !!options.ld;

    const accept = ld ? 'application/ld+json' : 'application/activity+json';

    const res = await fetch(url, { headers: { accept } });
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
