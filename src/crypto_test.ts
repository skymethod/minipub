import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/assert_strict_equals.ts';
import { computeHttpSignatureHeaders, generateExportableRsaKeyPair, validateHttpSignature } from './crypto.ts';

Deno.test('http signatures', async () => {
    const { privateKey, publicKey } = await generateExportableRsaKeyPair();
    const keyId = 'admin';
    const method = 'POST';
    const url = 'https://example.com/path/to/rpc';
    const body = 'the body';
    const { signature, date, digest } = await computeHttpSignatureHeaders({ method, url, body, privateKey, keyId} );

    const headers = new Headers({ signature, date, digest, host: 'localhost:2022' });
    const publicKeyProvider = (v: string) => {
        if (v !== keyId) throw new Error(`Bad keyId: ${v}, expected ${keyId}`);
        return Promise.resolve(publicKey);
    }
    const { keyId: actualKeyId } = await validateHttpSignature({ method, url, headers, body, publicKeyProvider });
    assertStrictEquals(actualKeyId, keyId);
});
