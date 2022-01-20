import { checkCreateNoteRequest, checkCreateUserRequest, checkFederateActivityRequest, checkUpdateUserRequest } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { computeCreateUser } from '../rpc/create_user.ts';
import { computeUpdateUser } from '../rpc/update_user.ts';
import { computeCreateNote } from '../rpc/create_note.ts';
import { makeRpcResponseResponse } from './responses.ts';
import { computeFederateActivity } from '../rpc/federate_activity.ts';
import { Fetcher } from '../fetcher.ts';

export const matchRpc = (method: string, pathname: string) => method === 'POST' && pathname === '/rpc';

export async function computeRpc(request: { json(): Promise<unknown>; }, origin: string, storage: BackendStorage, fetcher: Fetcher): Promise<Response> {
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json();
    const { kind } = body;
    if (kind === 'create-user' && checkCreateUserRequest(body)) return makeRpcResponseResponse(await computeCreateUser(body, origin, storage));
    if (kind === 'update-user' && checkUpdateUserRequest(body)) return makeRpcResponseResponse(await computeUpdateUser(body, origin, storage));
    if (kind === 'create-note' && checkCreateNoteRequest(body)) return makeRpcResponseResponse(await computeCreateNote(body, origin, storage));
    if (kind === 'federate-activity' && checkFederateActivityRequest(body)) return makeRpcResponseResponse(await computeFederateActivity(body, origin, storage, fetcher));
    throw new Error(`computeRpc: Unable to parse ${JSON.stringify(body)}`);
}
