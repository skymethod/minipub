import { assert, assertRejects } from 'https://deno.land/std@0.125.0/testing/asserts.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { Fetcher } from '../fetcher.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { APPLICATION_ACTIVITY_JSON_UTF8 } from '../media_types.ts';
import { CreateUserRequest, LikeObjectRequest, UndoLikeRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { computeCreateUser } from './create_user.ts';
import { computeLikeObject } from './like_object.ts';
import { computeUndoLike } from './undo_like.ts';

Deno.test('computeUndoLike', async () => {
    const storage = makeSqliteStorage();
    const origin = 'https://example.social';
    
    // create user (we need a saved actor)
    const req1: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const { actorUuid } = await computeCreateUser(req1, origin, storage);
    
    // create the like
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

    // undo the like
    const req2: UndoLikeRequest = {
        kind: 'undo-like',
        activityUuid,
    };
    const { activityUuid: undoActivityUuid } = await computeUndoLike(req2, origin, storage);
    assert(isValidUuid(undoActivityUuid) && undoActivityUuid !== activityUuid);

    // can't undo the like again
    assertRejects(async () => {
        await computeUndoLike(req2, origin, storage);
    });
});
