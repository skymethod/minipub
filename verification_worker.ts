import { validateHttpSignature } from './crypto.ts';
import { makeMinipubFetcher } from './fetcher.ts';
import { fetchPublicKey } from './fetch_public_key.ts';

const fetcher = makeMinipubFetcher();

export default {

    async fetch(request: Request): Promise<Response> {
        const { url, method, headers } = request;
        const targetUrl = url.substring(url.indexOf('?') + 1);
        const bodyText = request.body ? await request.text() : undefined;
        let data: Record<string, unknown> = {
            url,
            method,
            headers: [...headers].map(v => v.join(': ')),
            bodyText,
            targetUrl,
        }
        try {
            if (bodyText) {
                const u = new URL(targetUrl);
                const headers2 = new Headers(headers);
                headers2.set('host', u.hostname);
                const url2 = u.toString();
                const { keyId, diffMillis } = await validateHttpSignature({ method, url: url2, headers: headers2, body: bodyText, publicKeyProvider: keyId => fetchPublicKey(keyId, fetcher) });
                data = { ...data, keyId, diffMillis };
                console.log(JSON.stringify(data, undefined, 2));
            }
            return new Response(JSON.stringify(data, undefined, 2));
        } catch (e) {
            console.error(e);
            data = { ...data, error: `${e}` };
            console.log(JSON.stringify(data, undefined, 2), { status: 500 });
            return new Response(JSON.stringify(data, undefined, 2));
        }
    }

}
