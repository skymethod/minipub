import { CreateNoteRequest, CreateNoteResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { ActivityRecord, ObjectRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId, computeObjectId } from './urls.ts';

export async function computeCreateNote(req: CreateNoteRequest, origin: string, storage: BackendStorage): Promise<CreateNoteResponse> {
    const { actorUuid, inReplyTo, content, inbox, sharedInbox, to, cc } = req;

    if (to.length === 0 && cc.length === 0) throw new Error(`Notes must have either a to or cc`);

    const objectUuid = newUuid();
    const objectId = computeObjectId({ origin, actorUuid, objectUuid });
    const actorId = computeActorId({ origin, actorUuid });
    const object = {
        id: objectId,
        type: 'Note',
        published: new Date().toISOString(),
        attributedTo: actorId,
        inReplyTo,
        contentMap: content,
        to,
    };
    const objectApo = ApObject.parseObj(object);

    const activityUuid = newUuid();
    const activityId = computeActivityId({ origin, actorUuid, activityUuid });
    const activity = {
        id: activityId,
        type: 'Create',
        actor: actorId,
        object
    };
    const activityApo = ApObject.parseObj(activity);

    // in a single transaction:
    await storage.transaction(async txn => {

        // save note
        const objectRecord: ObjectRecord = {
            uuid: objectUuid,
            actorUuid,
            activityPub: objectApo.toObj(),   
        }
        await txn.put('object', objectUuid, objectRecord);

        // save activity
        const activityRecord: ActivityRecord = {
            uuid: activityUuid,
            actorUuid,
            activityPub: activityApo.toObj(),   
        }
        await txn.put('activity', activityUuid, activityRecord);

//   add to user's object index (i:user-objects:<actor-uuid>:<note-uuid>,note-uuid)
//   add to user's activity index (i:user-activities:<actor-uuid>:<activity-uuid>,activity-uuid)
//   add to user's server-inbox index (i:user-server-inboxes:<actor-uuid>:sha(<inbox-url>),inbox-url)

    });

    // federate activity

    return { kind: 'create-note', objectId, activityId };
}
