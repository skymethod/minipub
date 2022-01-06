import { checkCreateUserRequest, checkUpdateUserRequest, RpcResponse, UpdateUserRequest, UpdateUserResponse } from '../rpc_model.ts';
import { APPLICATION_JSON_UTF8 } from '../media_types.ts';
import { BackendStorage } from '../storage.ts';
import { computeCreateUser } from '../rpc/create_user.ts';

export const matchRpc = (method: string, pathname: string) => method === 'POST' && pathname === '/rpc';

export async function computeRpc(request: { json(): Promise<unknown>; }, origin: string, storage: BackendStorage): Promise<Response> {
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json();
    const { kind } = body;
    if (kind === 'create-user' && checkCreateUserRequest(body)) return json(await computeCreateUser(body, origin, storage));
    if (kind === 'update-user' && checkUpdateUserRequest(body)) return json(await computeUpdateUser(body));
    throw new Error(`computeRpc: Unable to parse ${JSON.stringify(body)}`);
}

export function computeUpdateUser(_req: UpdateUserRequest): Promise<UpdateUserResponse> {
    throw new Error('computeUpdateUser: TODO');
}

//

function json(res: RpcResponse): Response {
    return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
}