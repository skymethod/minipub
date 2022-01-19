import { assert } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { CreateNoteRequest } from '../rpc_model.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isValidUrl } from '../check.ts';
import { newUuid } from '../uuid.ts';

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
        inbox: 'https://another.social/users/bob/inbox',
        sharedInbox: 'https://another.social/inbox',
        to: [ 'https://another.social/users/bob' ],
        cc: [ 'https://www.w3.org/ns/activitystreams#Public' ],
    };
    const storage = makeInMemoryStorage();
    const { objectId } = await computeCreateNote(req, 'https://example.social', storage);
    assert(isValidUrl(objectId));
});
