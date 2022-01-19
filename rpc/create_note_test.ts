import { assert, assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { CreateNoteRequest } from '../rpc_model.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isStringRecord } from '../check.ts';
import { isValidUuid, newUuid } from '../uuid.ts';

Deno.test('computeCreateNote', async () => {
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
    const storage = makeInMemoryStorage();
    const { objectUuid } = await computeCreateNote(req, 'https://example.social', storage);
    assert(isValidUuid(objectUuid));

    const indexValues = await storage.transaction(async txn => {
        return await txn.list('i-actor-object-by-published');
    });
    assertStrictEquals(indexValues.size, 1);
    const indexValue = [...indexValues.values()][0];
    assert(isStringRecord(indexValue) && indexValue.actorUuid === actorUuid);
});
