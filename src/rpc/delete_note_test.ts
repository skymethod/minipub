import { assert, assertStrictEquals } from 'https://deno.land/std@0.131.0/testing/asserts.ts';
import { CreateNoteRequest, DeleteNoteRequest } from '../rpc_model.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isStringRecord } from '../check.ts';
import { isValidUuid, newUuid } from '../uuid.ts';
import { getRecord } from '../storage.ts';
import { ActorRecord, checkActivityRecord } from '../domain_model.ts';
import { computeDeleteNote } from './delete_note.ts';
import { computeObject } from '../endpoints/object_endpoint.ts';
import { computeFederateActivity } from './federate_activity.ts';
import { exportKeyToPem, generateExportableRsaKeyPair } from '../crypto.ts';

Deno.test('computeDeleteNote', async () => {

    const origin = 'https://example.social';
    const storage = makeSqliteStorage();

    // initial note
    const actorUuid = newUuid();
    const req: CreateNoteRequest = {
        kind: 'create-note',
        actorUuid,
        inReplyTo: 'https://another.social/users/bob/statuses/123',
        content: {
            lang: 'en',
            value: 'Hello'
        },
        to: [ 'https://www.w3.org/ns/activitystreams#Public' ],
        cc: [ 'https://another.social/users/bob' ],
    };
    const { objectUuid } = await computeCreateNote(req, origin, storage);
    assert(isValidUuid(objectUuid));

    {
        const indexValues = await storage.transaction(async txn => {
            return await txn.list('i-actor-object-by-published');
        });
        assertStrictEquals(indexValues.size, 1);
        const indexValue = [...indexValues.values()][0];
        assert(isStringRecord(indexValue) && indexValue.actorUuid === actorUuid);
    }
    {
        const indexValues = await storage.transaction(async txn => {
            return await txn.list('i-actor-activity-by-published');
        });
        assertStrictEquals(indexValues.size, 1);
    }

    // ensure it's accessible
    assertStrictEquals((await computeObject(actorUuid, objectUuid, storage)).status, 200);
    
    // delete it
    const deleteReq: DeleteNoteRequest = {
        kind: 'delete-note',
        objectUuid,
    };
    let deleteActivityUuid = '';
    {
        const { objectUuid: objectUuid2, activityUuid } = await computeDeleteNote(deleteReq, origin, storage);
        assertStrictEquals(objectUuid2, objectUuid);
        assert(activityUuid && isValidUuid(activityUuid));
        deleteActivityUuid = activityUuid;

        {
            const indexValues = await storage.transaction(async txn => {
                return await txn.list('i-actor-object-by-published');
            });
            assertStrictEquals(indexValues.size, 1);
            const indexValue = [...indexValues.values()][0];
            assert(isStringRecord(indexValue) && indexValue.actorUuid === actorUuid);
        }
        {
            const indexValues = await storage.transaction(async txn => {
                return await txn.list('i-actor-activity-by-published');
            });
            assertStrictEquals(indexValues.size, 2);
        }

        // ensure we saved the @context at the activity level, not the object level
        const activityRecord = await storage.transaction(async txn => await getRecord(txn, 'activity', activityUuid));
        assert(activityRecord && checkActivityRecord(activityRecord)
             && activityRecord.activityPub['@context'] === 'https://www.w3.org/ns/activitystreams'
             // deno-lint-ignore no-explicit-any
             && (activityRecord.activityPub.object as any)['@context'] === undefined
        );
        // console.log(JSON.stringify(activityRecord.activityPub, undefined, 2));
    }

    // ensure it's inaccessible
    assertStrictEquals((await computeObject(actorUuid, objectUuid, storage)).status, 404);
    
    // federate it
    const { privateKey } = await generateExportableRsaKeyPair();
    const privateKeyPem = await exportKeyToPem(privateKey, 'private');
    const actorRecord: ActorRecord =  { actorUuid, privateKeyPem, blobReferences: {}, activityPub: {} };
    await storage.transaction(async tx => await tx.put('actor', actorUuid, actorRecord));
    const { record, recipientLogs } = await computeFederateActivity({ kind: 'federate-activity', activityUuid: deleteActivityUuid }, origin, storage, async (url, opts) => {
        await Promise.resolve();
        const inbox = 'https://another.social/users/bob/inbox';
        if (url === 'https://another.social/users/bob') {
            const actorAp = {
                type: 'Person',
                id: url,
                inbox,
            }
            return new Response(JSON.stringify(actorAp), { headers: { 'content-type': 'application/json' }});
        } else if (url === inbox) {
            return new Response('thanks', { status: 202 });
        }
        throw new Error(url);
    });
    assert(record && recipientLogs);
    // console.log(JSON.stringify(record, undefined, 2));
    // console.log(JSON.stringify(recipientLogs, undefined, 2));
    // console.log(Object.values(recipientLogs)[0].at(-1));
});
