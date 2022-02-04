import { UndoLikeRequest, UndoLikeResponse } from '../rpc_model.ts';
import { BackendStorage, BackendStorageTransaction } from '../storage.ts';
import { ActivityRecord, checkActivityRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';

export async function computeUndoLike(req: UndoLikeRequest, origin: string, storage: BackendStorage): Promise<UndoLikeResponse> {
    const { activityUuid } = req;

    const { actorUuid, activityPub } = await storage.transaction(async txn => {
        const activity = await txn.get('activity', activityUuid);
        if (activity === undefined) throw new Error(`Activity ${activityUuid} not found`);
        if (!checkActivityRecord(activity)) throw new Error(`Activity ${activityUuid} data is not valid`);
        return activity;
    });

    const apo = ApObject.parseObj(activityPub);
    if (apo.type.toString() !== 'https://www.w3.org/ns/activitystreams#Like') throw new Error(`Can only undo a like activity, found: ${apo.toJson()}`);
    const objectId = apo.get('object');
    const likeKey = `${actorUuid}:${objectId}`;

    const undoActivityUuid = await storage.transaction(async txn => {
        const like = await txn.get('like', likeKey);
        if (!like) throw new Error(`Actor ${actorUuid} does not like ${objectId}`);

        const published = new Date().toISOString();
        await txn.delete('like', likeKey);

        return await saveUndoLikeActivity(txn, { published, origin, actorUuid, likeActivityPub: activityPub });
    });

    return { kind: 'undo-like', activityUuid: undoActivityUuid };
}

export async function saveUndoLikeActivity(txn: BackendStorageTransaction, opts: { published: string, origin: string, actorUuid: string, likeActivityPub: Record<string, unknown> }): Promise<string> {
    const { published, origin, actorUuid, likeActivityPub } = opts;

    const activityUuid = newUuid();
    const activityId = computeActivityId({ origin, actorUuid, activityUuid });
    const actorId = computeActorId({ origin, actorUuid });

    // move the @context up to the activity
    const context = likeActivityPub['@context'];
    delete likeActivityPub['@context'];

    const activityApo = ApObject.parseObj({
        '@context': context,
        id: activityId,
        type: 'Undo',
        actor: actorId,
        object: likeActivityPub,
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
