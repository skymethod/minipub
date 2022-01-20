import { APPLICATION_ACTIVITY_JSON, APPLICATION_JSON_UTF8, TEXT_PLAIN_UTF8 } from '../media_types.ts';
import { RpcResponse } from '../rpc_model.ts';

export function makeRpcResponseResponse(res: RpcResponse): Response {
    return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
}

export function makeActivityPubResponse(activityPub: Record<string, unknown>): Response {
    return new Response(JSON.stringify(activityPub, undefined, 2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON } });
}

export function makeNotFoundResponse(): Response {
    return new Response('not found', { status: 404, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
}

export function makeErrorResponse(e: unknown): Response {
    return new Response(`${e}`, { status: 500, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
}
