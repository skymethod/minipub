import { checkObjectRecord } from '../domain_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { Responses } from './responses.ts';

export function matchObject(method: string, pathname: string): { actorUuid: string, objectUuid: string } | undefined {
    if (method === 'GET') {
        const m = /^\/actors\/([0-9a-f]+)\/objects\/([0-9a-f]+)$/.exec(pathname);
        if (m) {
            const [ _, actorUuid, objectUuid ] = m;
            if (isValidUuid(actorUuid) && isValidUuid(objectUuid)) {
                return { actorUuid, objectUuid };
            }
        }
    }
}

export async function computeObject(actorUuid: string, objectUuid: string, storage: BackendStorage): Promise<Response> {
    const object = await storage.transaction(async txn => await getRecord(txn, 'object', objectUuid));
    if (object && checkObjectRecord(object) && object.actorUuid === actorUuid) {
        return Responses.activityPub(object.activityPub);
    }
    return Responses.notFound();
}
