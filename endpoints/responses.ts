import { APPLICATION_ACTIVITY_JSON, APPLICATION_JSON_UTF8, TEXT_PLAIN_UTF8 } from '../media_types.ts';
import { RpcResponse } from '../rpc_model.ts';

export class Responses {

    static rpc(res: RpcResponse): Response {
        return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
    }

    static activityPub(activityPub: Record<string, unknown>): Response {
        return new Response(JSON.stringify(activityPub, undefined, 2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON, 'access-control-allow-origin': '*' } });
    }

    static accepted(body: string): Response {
        return new Response(body, { status: 202, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
    }

    static badRequest(body: string): Response {
        return new Response(body, { status: 400, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
    }

    static notFound(): Response {
        return new Response('not found', { status: 404, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
    }

    // deno-lint-ignore no-explicit-any
    static internalServerError(e: any): Response {
        return new Response(`${e.stack || e}`, { status: 500, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
    }

}
