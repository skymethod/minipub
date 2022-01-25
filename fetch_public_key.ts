import { check, isValidUrl } from './check.ts';
import { importKeyFromPem } from './crypto.ts';
import { Fetcher } from './fetcher.ts';
import { APPLICATION_ACTIVITY_JSON } from './media_types.ts';

export async function fetchPublicKey(keyId: string, fetcher: Fetcher): Promise<CryptoKey> {
    const i = keyId.indexOf('#');
    const url = keyId.substring(0, i);
    check('url', url, isValidUrl);
    console.log(`fetchPublicKey: fetching ${url}`);
    const res = await fetcher(url, { headers: { accept: APPLICATION_ACTIVITY_JSON } });
    if (res.status === 410) throw new GoneError(keyId, url);
    check('res.status', res.status, res.status === 200);
    const obj = await res.json();
    const { id } = obj;
    const { id: publicKeyId, owner, publicKeyPem } = obj.publicKey;
    if (publicKeyId !== keyId) throw new Error(`Bad publicKeyId: ${publicKeyId}, expected ${keyId}`);
    if (owner !== id) throw new Error(`Bad owner: ${owner}, expected ${id}`);
    return await importKeyFromPem(publicKeyPem, 'public');
}

export class GoneError extends Error {
    readonly keyId: string;
    readonly keyIdUrl: string;

    constructor(keyId: string, keyIdUrl: string) {
        super(`Gone: ${keyId}`);
        this.keyId = keyId;
        this.keyIdUrl = keyIdUrl;
    }

}
