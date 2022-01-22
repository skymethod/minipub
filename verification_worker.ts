import { importKeyFromPem, validateHttpSignature } from './crypto.ts';
import { check } from './check.ts';
import { APPLICATION_ACTIVITY_JSON } from './media_types.ts';

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
                const { keyId, diffMillis } = await validateHttpSignature({ method, url: url2, headers: headers2, body: bodyText, publicKeyProvider: fetchPublicKey });
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

export async function fetchPublicKey(keyId: string): Promise<CryptoKey> {
    const i = keyId.indexOf('#');
    const url = keyId.substring(0, i);
    console.log(`fetchPublicKey: fetching ${url}`);
    const res = await fetch(url, { headers: { accept: APPLICATION_ACTIVITY_JSON } });
    check('res.status', res.status, res.status === 200);
    const obj = await res.json();
    const { id } = obj;
    const { id: publicKeyId, owner, publicKeyPem } = obj.publicKey;
    if (publicKeyId !== keyId) throw new Error(`Bad publicKeyId: ${publicKeyId}, expected ${keyId}`);
    if (owner !== id) throw new Error(`Bad owner: ${owner}, expected ${id}`);
    return await importKeyFromPem(publicKeyPem, 'public');
}
