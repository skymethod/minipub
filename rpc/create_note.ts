import { CreateNoteRequest, CreateNoteResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { ActivityRecord, ObjectRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId, computeObjectId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';

export async function computeCreateNote(req: CreateNoteRequest, origin: string, storage: BackendStorage): Promise<CreateNoteResponse> {
    const { actorUuid, inReplyTo, content, to, cc } = req;

    if (to.length === 0 && cc.length === 0) throw new Error(`Notes must have either a to or cc`);

    const objectUuid = newUuid();
    const objectId = computeObjectId({ origin, actorUuid, objectUuid });
    const actorId = computeActorId({ origin, actorUuid });
    const published = new Date().toISOString();
    const object = {
        id: objectId,
        type: 'Note',
        published,
        attributedTo: actorId,
        inReplyTo,
        contentMap: content,
        to,
        cc,
    };
    const objectApo = ApObject.parseObj(object, { includeDefaultContext: true });

    const activityUuid = newUuid();
    const activityId = computeActivityId({ origin, actorUuid, activityUuid });
    const activity = {
        id: activityId,
        type: 'Create',
        actor: actorId,
        object
    };
    const activityApo = ApObject.parseObj(activity, { includeDefaultContext: true });

    // in a single transaction:
    await storage.transaction(async txn => {

        // save note
        const objectRecord: ObjectRecord = {
            objectUuid,
            actorUuid,
            activityPub: objectApo.toObj(),   
        }
        await txn.put('object', objectUuid, objectRecord);

        // save activity
        const activityRecord: ActivityRecord = {
            activityUuid,
            actorUuid,
            activityPub: activityApo.toObj(),   
        }
        await txn.put('activity', activityUuid, activityRecord);

        // add to actor object index
        await txn.put('i-actor-object-by-published', `${actorUuid}:${computeTimestamp(published)}:${objectUuid}`, { actorUuid, published, objectUuid });

        // add to actor activity index
        await txn.put('i-actor-activity-by-published', `${actorUuid}:${computeTimestamp(published)}:${activityUuid}`, { actorUuid, published, activityUuid });
    });

    // federate activity
//   add to user's server-inbox index (i:user-server-inboxes:<actor-uuid>:sha(<inbox-url>),inbox-url)

    return { kind: 'create-note', objectId, activityId };
}
