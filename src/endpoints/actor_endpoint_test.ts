import { assertStrictEquals } from 'https://deno.land/std@0.191.0/testing/asserts.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { computeActor } from './actor_endpoint.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { APPLICATION_ACTIVITY_JSON } from '../media_types.ts';

Deno.test('computeActor', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = makeSqliteStorage();
    const { actorUuid } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(actorUuid), true);

    const res = await computeActor(actorUuid, storage);
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('content-type'), APPLICATION_ACTIVITY_JSON);
    const obj = await res.json();
    assertStrictEquals(obj.id, `https://example.social/actors/${actorUuid}`);
});
