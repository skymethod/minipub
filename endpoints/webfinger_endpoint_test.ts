import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { APPLICATION_JRD_JSON } from '../media_types.ts';
import { computeWebfinger } from './webfinger_endpoint.ts';

Deno.test('computeWebfinger', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = makeInMemoryStorage();
    const origin = 'https://example.social';
    const { uuid } = await computeCreateUser(req, origin, storage);
    assertStrictEquals(isValidUuid(uuid), true);

    const res = await computeWebfinger('alice', 'example.social', origin, storage);
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('content-type'), APPLICATION_JRD_JSON);
    const obj = await res.json();
    assertStrictEquals(obj.subject, 'acct:alice@example.social');
    assertStrictEquals(obj.links[0].href, `https://example.social/actors/${uuid}`);
});
