import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { computeCreateUser } from './rpc_endpoint.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { computeActor } from './actor_endpoint.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { APPLICATION_ACTIVITY_JSON } from '../content_types.ts';

Deno.test('endpoints', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = makeInMemoryStorage();
    const { uuid } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(uuid), true);

    const res = await computeActor(uuid, storage);
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('content-type'), APPLICATION_ACTIVITY_JSON);
    const obj = await res.json();
    assertStrictEquals(obj.id, `https://example.social/actors/${uuid}`);
});
