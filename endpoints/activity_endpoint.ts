import { checkActivityRecord } from '../domain_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { makeActivityPubResponse, makeNotFoundResponse } from './responses.ts';

export function matchActivity(method: string, pathname: string): { actorUuid: string, activityUuid: string } | undefined {
    if (method === 'GET') {
        const m = /^\/actors\/([0-9a-f]+)\/activities\/([0-9a-f]+)$/.exec(pathname);
        if (m) {
            const [ _, actorUuid, activityUuid ] = m;
            if (isValidUuid(actorUuid) && isValidUuid(activityUuid)) {
                return { actorUuid, activityUuid };
            }
        }
    }
}

export async function computeActivity(actorUuid: string, activityUuid: string, storage: BackendStorage): Promise<Response> {
    const activity = await storage.transaction(async txn => await getRecord(txn, 'activity', activityUuid));
    if (activity && checkActivityRecord(activity) && activity.actorUuid === actorUuid) {
        return makeActivityPubResponse(activity.activityPub);
    }
    return makeNotFoundResponse();
}
