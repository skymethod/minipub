import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { UpdateUserRequest } from '../rpc_model.ts';
import { newUuid } from '../uuid.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { computeUpdateUser } from './update_user.ts';
import { Actor } from '../domain_model.ts';

Deno.test('computeUpdateUser', async () => {
    const uuid = newUuid();
    const storage = makeInMemoryStorage();
    const actor: Actor = {
        uuid,
        privateKeyPem: 'asdf',
        blobReferences: {},
        activityPub: {
            type: 'Person',
        },
    };
    await storage.transaction(async txn => {
        await txn.put('actor', uuid, actor);
    });

    const req: UpdateUserRequest = {
        kind: 'update-user',
        uuid,
        name: 'Alice Doe',
    };
    
    const { modified } = await computeUpdateUser(req, storage);
    assertStrictEquals(modified, true);

    const { modified: modified2 } = await computeUpdateUser(req, storage);
    assertStrictEquals(modified2, false);
});
