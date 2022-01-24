import { LikeObjectRequest, LikeObjectResponse } from '../rpc_model.ts';
import { BackendStorage, BackendStorageTransaction } from '../storage.ts';
import { ActivityRecord, checkActorRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';

export async function computeLikeObject(req: LikeObjectRequest, origin: string, storage: BackendStorage): Promise<LikeObjectResponse> {
    const { actorUuid, objectId } = req;

    // in a single transaction:
    const activityUuid = await storage.transaction(async txn => {
        const actor = await txn.get('actor', actorUuid);
        if (actor === undefined) throw new Error(`computeLikeObject: Actor ${actorUuid} not found`);
        if (!checkActorRecord(actor)) throw new Error(`computeLikeObject: Actor ${actorUuid} data is not valid`);

        // TODO ensure it's remote

        // TODO fetch object, ensure it's an object and ensure id matches

        // TODO ensure not already liked?

        const published = new Date().toISOString();
        return await saveLikeObjectActivity(txn, { published, origin, actorUuid, objectId });
    });

    return { kind: 'like-object', activityUuid };
}

export async function saveLikeObjectActivity(txn: BackendStorageTransaction, opts: { published: string, origin: string, actorUuid: string, objectId: string}): Promise<string> {
    const { published, origin, actorUuid, objectId } = opts;

    const activityUuid = newUuid();
    const activityId = computeActivityId({ origin, actorUuid, activityUuid });
    const actorId = computeActorId({ origin, actorUuid });

    const activityApo = ApObject.parseObj({
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: activityId,
        type: 'Like',
        actor: actorId,
        object: objectId,
        published,
    });

    // save activity
    const activityRecord: ActivityRecord = {
        activityUuid,
        actorUuid,
        activityPub: activityApo.toObj(),
    }
    await txn.put('activity', activityUuid, activityRecord);

    // add to actor activity index
    await txn.put('i-actor-activity-by-published', `${actorUuid}:${computeTimestamp(published)}:${activityUuid}`, { actorUuid, published, activityUuid });
    return activityUuid;
}
