import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { CreateNoteRequest, CreateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { APPLICATION_ACTIVITY_JSON } from '../media_types.ts';
import { computeCreateNote } from '../rpc/create_note.ts';
import { computeObject } from './object_endpoint.ts';

Deno.test('computeObject', async () => {
    const req1: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const origin = 'https://example.social';
    const storage = makeInMemoryStorage();
    const { actorUuid } = await computeCreateUser(req1, origin, storage);
    assertStrictEquals(isValidUuid(actorUuid), true);

    const req2: CreateNoteRequest = {
        kind: 'create-note',
        actorUuid,
        content: { lang: 'en', value: 'Hello' },
        to: [ 'https://www.w3.org/ns/activitystreams#Public' ],
    }
    const { objectUuid } = await computeCreateNote(req2, origin, storage);
    const res = await computeObject(actorUuid, objectUuid, storage);
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get('content-type'), APPLICATION_ACTIVITY_JSON);
    const obj = await res.json();
    assertStrictEquals(obj.id, `https://example.social/actors/${actorUuid}/objects/${objectUuid}`);
});
