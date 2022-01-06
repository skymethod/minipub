import { APPLICATION_ACTIVITY_JSON } from '../content_types.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';

export function matchActor(method: string, pathname: string): { actorUuid: string } | undefined {
    if (method === 'GET') {
        const m = /^\/actors\/([0-9a-f]+)$/.exec(pathname);
        if (m) {
            const actorUuid = m[1];
            if (isValidUuid(actorUuid)) {
                return { actorUuid };
            }
        }
    }
}

export async function computeActor(actorUuid: string, storage: BackendStorage): Promise<Response> {
    const ld = await storage.transaction(async txn => {
        const actor = await getRecord(txn, 'actor', actorUuid);
        return actor ? actor.ld : undefined;
    });
    if (ld) return json(ld);
    return new Response('not found', { status: 404 });
}

//

// deno-lint-ignore no-explicit-any
function json(res: any): Response {
    return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON } });
}
