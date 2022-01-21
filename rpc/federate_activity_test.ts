import { assert, assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { CreateNoteRequest, CreateUserRequest, FederateActivityRequest } from '../rpc_model.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { computeCreateNote } from './create_note.ts';
import { isValidUuid } from '../uuid.ts';
import { computeFederateActivity } from './federate_activity.ts';
import { Fetcher } from '../fetcher.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { APPLICATION_ACTIVITY_JSON_UTF8 } from '../media_types.ts';
import { computeCreateUser } from './create_user.ts';

Deno.test('computeFederateActivity', async () => {
    const storage = makeInMemoryStorage();
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
            const bob = ApObject.parseObj({ type: 'Person', id: url, inbox: 'https://another.social/users/bob/inbox' });
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
    const { log, inbox } = await computeFederateActivity(req3, origin, storage, fetcher);
    assertStrictEquals(inbox, 'https://another.social/users/bob/inbox');
    assert(log.length > 0);
    // console.log(log.join('\n'));
});
