import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.127.0/testing/asserts.ts';
import { CreateNoteRequest, CreateUserRequest, FederateActivityRequest } from '../rpc_model.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isValidUuid } from '../uuid.ts';
import { computeFederateActivity, findInboxUrlsForActor, findNonPublicRecipientsForObject } from './federate_activity.ts';
import { Fetcher } from '../fetcher.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { APPLICATION_ACTIVITY_JSON_UTF8 } from '../media_types.ts';
import { computeCreateUser } from './create_user.ts';

Deno.test('computeFederateActivity', async () => {
    const storage = makeSqliteStorage();
    const origin = 'https://example.social';

    // create user (we need a saved actor)
    const req1: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const { actorUuid } = await computeCreateUser(req1, origin, storage);

    // create note
    const req2: CreateNoteRequest = {
        kind: 'create-note',
        actorUuid,
        inReplyTo: 'https://another.social/users/bob/statuses/123',
        content: {
            lang: 'en',
            value: 'Hello'
        },
        to: [ 'https://another.social/users/bob' ],
    };
    const { activityUuid } = await computeCreateNote(req2, origin, storage);
    assert(isValidUuid(activityUuid));

    // send federation request
    const fetcher: Fetcher = (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET' && url === 'https://another.social/users/bob') {
            const bob = ApObject.parseObj({ type: 'Person', id: url, inbox: 'https://another.social/users/bob/inbox', endpoints: { sharedInbox: 'https://another.social/inbox' } });
            return Promise.resolve(new Response(bob.toJson(2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON_UTF8 }}));
        } else if (method === 'POST' && url === 'https://another.social/users/bob/inbox') {
            return Promise.resolve(new Response('thanks', { status: 202 }));
        }
        throw new Error(`${url} ${JSON.stringify(opts)}`);
    };
    const req3: FederateActivityRequest = {
        kind: 'federate-activity',
        activityUuid,
    };
    {
        const { record, recipientLogs, modified } = await computeFederateActivity(req3, origin, storage, fetcher);
        // console.log(record);
        assert(modified);
        assertStrictEquals(Object.values(record.recipientStates)[0].inbox, 'https://another.social/users/bob/inbox');
        assert(Object.keys(recipientLogs).length === 1);
        assert(Object.values(recipientLogs)[0].length > 0);
    }
    {
        const { recipientLogs, modified } = await computeFederateActivity(req3, origin, storage, fetcher);
        // console.log(record);
        assert(!modified);
        assert(Object.values(recipientLogs)[0].length === 0);
    }

    const inboxUrls = await findInboxUrlsForActor(actorUuid, storage);
    assertEquals(inboxUrls, new Set([ 'https://another.social/inbox' ]));
});

Deno.test('findNonPublicRecipientsForObject', () => {
    let recipients = new Set<string>();

    recipients = findNonPublicRecipientsForObject(ApObject.parseObj({ type: 'Note'}));
    assertStrictEquals(recipients.size, 0);

    recipients = findNonPublicRecipientsForObject(ApObject.parseObj({ type: 'Note', to: 'https://another.social/users/bob' }));
    assertEquals(recipients, new Set([ 'https://another.social/users/bob' ]));

    recipients = findNonPublicRecipientsForObject(ApObject.parseObj({ type: 'Note', cc: 'https://another.social/users/bob' }));
    assertEquals(recipients, new Set([ 'https://another.social/users/bob' ]));

    recipients = findNonPublicRecipientsForObject(ApObject.parseObj({ type: 'Note', cc: [ 'https://another.social/users/bob' ] }));
    assertEquals(recipients, new Set([ 'https://another.social/users/bob' ]));

    recipients = findNonPublicRecipientsForObject(ApObject.parseObj({ type: 'Note', to: 'https://www.w3.org/ns/activitystreams#Public', cc: [ 'https://another.social/users/bob' ] }));
    assertEquals(recipients, new Set([ 'https://another.social/users/bob' ]));
});
