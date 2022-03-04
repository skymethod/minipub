import { assert } from 'https://deno.land/std@0.128.0/testing/asserts.ts';
import { isDeleteActorRequestBody } from './inbox_endpoint.ts';

Deno.test('isDeleteActorRequestBody', () => {
    const obj = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: 'https://example.social/users/Alice#delete',
        type: 'Delete',
        actor: 'https://example.social/users/Alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: 'https://example.social/users/Alice'
    };
    assert(isDeleteActorRequestBody(JSON.stringify(obj), 'https://example.social/users/Alice'));

    const bad1 = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: 'https://example.social/users/Alice#delete',
        type: 'Delete',
        actor: 'https://example.social/users/Alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: 'https://example.social/users/Alice'
    };
    assert(!isDeleteActorRequestBody(JSON.stringify(bad1), 'https://example.social/users/Alice1'));

    const bad2 = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: 'https://example.social/users/Alice#delete',
        type: 'Delete',
        actor: 'https://example.social/users/Alice',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: 'https://example.social/users/Alice/Note1'
    };
    assert(!isDeleteActorRequestBody(JSON.stringify(bad2), 'https://example.social/users/Alice'));

    const found = `{"@context":"https://www.w3.org/ns/activitystreams","id":"https://example.social/users/Alice#delete","type":"Delete","actor":"https://example.social/users/Alice","to":["https://www.w3.org/ns/activitystreams#Public"],"object":"https://example.social/users/Alice","signature":{"type":"RsaSignature2017","creator":"https://example.social/users/Alice#main-key","created":"2022-01-22T02:53:20Z","signatureValue":"O9y03dS0qaMJDnKow76cjL/DHIr6+90+owjj+7TQP3jdHHfSaLPVO+2gbPCXr0NiGiNxx7ctVgcbqF8aXae7me4neZS39TKOtmRVs2bfFocLt2dN38WpDply4N/qO9uBblyGDzeaBGI5ygLvfT9+6LoGS888JCIxHe9JHRXVCCUxWUEHdTvO3QptVIjevhLBjsNAfSD65vNv2amWcQZun3bPWSR+dV+RGGqQTMy3aVHhTntFNpjMzpWj3lxgFfQDkW4DATcYiVcAR/da4h9GF9fhhrSjmEM7SnS6ckzikKd0/78DYGKCBbio29tmYdoHbZHNUTXOzNXIDWi6549aKA=="}}`;
    assert(isDeleteActorRequestBody(found, 'https://example.social/users/Alice'));
});
