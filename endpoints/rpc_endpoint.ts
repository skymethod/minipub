import { checkCreateNoteRequest, checkCreateUserRequest, checkDeleteFromStorageRequest, checkFederateActivityRequest, checkLikeObjectRequest, checkUndoLikeRequest, checkUpdateUserRequest } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { computeUpdateUser } from '../rpc/update_user.ts';
import { computeCreateNote } from '../rpc/create_note.ts';
import { Responses } from './responses.ts';
import { computeFederateActivity } from '../rpc/federate_activity.ts';
import { Fetcher } from '../fetcher.ts';
import { computeDeleteFromStorage } from '../rpc/delete_from_storage.ts';
import { computeLikeObject } from '../rpc/like_object.ts';
import { computeUndoLike } from '../rpc/undo_like.ts';

export const matchRpc = (method: string, pathname: string) => method === 'POST' && pathname === '/rpc';

export async function computeRpc(request: { json(): Promise<unknown>; }, origin: string, storage: BackendStorage, fetcher: Fetcher): Promise<Response> {
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json();
    const { kind } = body;
    const computeRpcResponse = async () => {
        if (kind === 'create-user' && checkCreateUserRequest(body)) return await computeCreateUser(body, origin, storage);
        if (kind === 'update-user' && checkUpdateUserRequest(body)) return await computeUpdateUser(body, origin, storage);
        if (kind === 'create-note' && checkCreateNoteRequest(body)) return await computeCreateNote(body, origin, storage);
        if (kind === 'federate-activity' && checkFederateActivityRequest(body)) return await computeFederateActivity(body, origin, storage, fetcher);
        if (kind === 'delete-from-storage' && checkDeleteFromStorageRequest(body)) return await computeDeleteFromStorage(body, storage);
        if (kind === 'like-object' && checkLikeObjectRequest(body)) return await computeLikeObject(body, origin, storage, fetcher);
        if (kind === 'undo-like' && checkUndoLikeRequest(body)) return await computeUndoLike(body, origin, storage);
        throw new Error(`computeRpc: Unable to parse ${JSON.stringify(body)}`);
    }
    return Responses.rpc(await computeRpcResponse());
}
