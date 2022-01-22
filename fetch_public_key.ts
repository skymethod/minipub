import { check } from './check.ts';
import { importKeyFromPem } from './crypto.ts';
import { APPLICATION_ACTIVITY_JSON } from './media_types.ts';

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
