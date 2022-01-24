import { assert } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { Fetcher } from '../fetcher.ts';
import { makeInMemoryStorage } from '../in_memory_storage.ts';
import { APPLICATION_ACTIVITY_JSON_UTF8 } from '../media_types.ts';
import { CreateUserRequest, LikeObjectRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { computeCreateUser } from './create_user.ts';
import { computeLikeObject } from './like_object.ts';

Deno.test('computeLikeObject', async () => {
    const storage = makeInMemoryStorage();
    const origin = 'https://example.social';
    
    // create user (we need a saved actor)
    const req1: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const { actorUuid } = await computeCreateUser(req1, origin, storage);
    
    const fetcher: Fetcher = (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET' && url === 'https://another.social/users/bob/objects/123') {
            const bob = ApObject.parseObj({ type: 'Note', id: url, });
            return Promise.resolve(new Response(bob.toJson(2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON_UTF8 }}));
        } else if (method === 'POST' && url === 'https://another.social/users/bob/inbox') {
            return Promise.resolve(new Response('thanks', { status: 202 }));
        }
        throw new Error(`${url} ${JSON.stringify(opts)}`);
    };
    
    const objectId = 'https://another.social/users/bob/objects/123';
    const req: LikeObjectRequest = {
        kind: 'like-object',
        actorUuid,
        objectId,
    };
    const { activityUuid } = await computeLikeObject(req, origin, storage, fetcher);
    assert(isValidUuid(activityUuid));
});
