import { LikeObjectRequest, LikeObjectResponse } from '../rpc_model.ts';
import { BackendStorage, BackendStorageTransaction } from '../storage.ts';
import { ActivityRecord, checkActorRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';
import { Fetcher } from '../fetcher.ts';
import { fetchActivityPub } from './federate_activity.ts';

export async function computeLikeObject(req: LikeObjectRequest, origin: string, storage: BackendStorage, fetcher: Fetcher): Promise<LikeObjectResponse> {
    const { actorUuid, objectId } = req;

    // ensure remote note object with id matching input objectId
    await checkObjectId(objectId, { fetcher, origin });

    // in a single transaction:
    const activityUuid = await storage.transaction(async txn => {
        const actor = await txn.get('actor', actorUuid);
        if (actor === undefined) throw new Error(`computeLikeObject: Actor ${actorUuid} not found`);
        if (!checkActorRecord(actor)) throw new Error(`computeLikeObject: Actor ${actorUuid} data is not valid`);

        const likeKey = `${actorUuid}:${objectId}`;
        const like = await txn.get('like', likeKey);
        if (like) throw new Error(`computeLikeObject: Actor ${actorUuid} already liked ${objectId}`);

        const published = new Date().toISOString();
        await txn.put('like', likeKey, { actorUuid, objectId, published });

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

//

async function checkObjectId(objectId: string, opts: { fetcher: Fetcher, origin: string }) {
    const { fetcher, origin } = opts;

    // ensure it's remote
    const u = new URL(objectId);
    if (u.origin === origin) throw new Error(`Bad objectId: ${objectId}, only likes of remote objects are supported`);

    // fetch object, ensure it's an object and ensure id matches
    const apo = await fetchActivityPub(objectId, fetcher);
    const type = apo.type.toString();
    if (type !== 'https://www.w3.org/ns/activitystreams#Note') throw new Error(`Bad objectId: ${objectId}, only likes of remote Note objects are supported, found ${type}`);
    const id = apo.getIriString('id');
    if (id !== objectId) throw new Error(`Bad objectId: ${objectId}, remote object id is ${id}`);
}
