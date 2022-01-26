import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { computeCreateUser } from './create_user.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';

Deno.test('computeCreateUser', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = makeSqliteStorage();
    const { actorUuid } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(actorUuid), true);
});
