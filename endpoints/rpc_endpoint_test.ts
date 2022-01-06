import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { computeCreateUser } from './rpc_endpoint.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';

Deno.test('rpc endpoint', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = makeInMemoryStorage();
    const { uuid } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(uuid), true);
});
