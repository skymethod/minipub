import { checkActorRecord } from '../domain_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { makeActivityPubResponse, makeNotFoundResponse } from './responses.ts';

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
    const actor = await storage.transaction(async txn => await getRecord(txn, 'actor', actorUuid));
    if (actor && checkActorRecord(actor)) {
        return makeActivityPubResponse(actor.activityPub);
    }
    return makeNotFoundResponse();
}
