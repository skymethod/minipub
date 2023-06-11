import { assert, assertStrictEquals } from 'https://deno.land/std@0.191.0/testing/asserts.ts';
import { CreateNoteRequest, UpdateNoteRequest } from '../rpc_model.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isStringRecord } from '../check.ts';
import { isValidUuid, newUuid } from '../uuid.ts';
import { computeUpdateNote } from './update_note.ts';
import { getRecord } from '../storage.ts';
import { checkActivityRecord } from '../domain_model.ts';

Deno.test('computeUpdateNote', async () => {

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
        to: [ 'https://another.social/users/bob' ],
        cc: [ 'https://www.w3.org/ns/activitystreams#Public' ],
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

    // update the content
    const updateReq: UpdateNoteRequest = {
        kind: 'update-note',
        objectUuid,
        content: {
            lang: 'en',
            value: 'Hello again'
        },
    };
    {
        const { objectUuid: objectUuid2, modified, activityUuid } = await computeUpdateNote(updateReq, origin, storage);
        assertStrictEquals(objectUuid2, objectUuid);
        assertStrictEquals(modified, true);
        assert(activityUuid && isValidUuid(activityUuid));

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
    }

    // update the content again, should not be modified or create an activity
    {
        const { objectUuid: objectUuid2, modified, activityUuid } = await computeUpdateNote(updateReq, origin, storage);
        assertStrictEquals(objectUuid2, objectUuid);
        assertStrictEquals(modified, false);
        assert(activityUuid === undefined);

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
    }

});
