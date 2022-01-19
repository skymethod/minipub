import { assert, assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { UpdateUserRequest } from '../rpc_model.ts';
import { newUuid } from '../uuid.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { computeUpdateUser } from './update_user.ts';
import { ActorRecord } from '../domain_model.ts';
import { Bytes } from '../deps.ts';
import { isStringRecord } from '../check.ts';

Deno.test('computeUpdateUser', async () => {
    const actorUuid = newUuid();
    const storage = makeInMemoryStorage();
    const actor: ActorRecord = {
        actorUuid,
        privateKeyPem: 'asdf',
        blobReferences: {},
        activityPub: {
            type: 'Person',
        },
    };
    await storage.transaction(async txn => {
        await txn.put('actor', actorUuid, actor);
    });

    const req: UpdateUserRequest = {
        kind: 'update-user',
        actorUuid,
        name: 'Alice Doe',
    };
    
    const { modified } = await computeUpdateUser(req, 'https://example.social', storage);
    assertStrictEquals(modified, true);

    const { modified: modified2 } = await computeUpdateUser(req, 'https://example.social', storage);
    assertStrictEquals(modified2, false);

    const req2: UpdateUserRequest = {
        kind: 'update-user',
        actorUuid,
        icon: { bytesBase64: Bytes.ofUtf8('(not actually a png').base64(), size: 1, mediaType: 'image/png' },
    };
    await computeUpdateUser(req2, 'https://example.social', storage);

    const ap = await storage.transaction(async txn => {
        const tmp = await txn.get('actor', actorUuid);
        return tmp && isStringRecord(tmp) && isStringRecord(tmp.activityPub) ? tmp.activityPub : undefined;
    });
    assert(ap !== undefined && isStringRecord(ap.icon) && ap.icon.type === 'Image' && ap.icon.width === 1, JSON.stringify(ap));

});
