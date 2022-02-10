import { DeleteNoteRequest, DeleteNoteResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { ActivityRecord, checkObjectRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';

export async function computeDeleteNote(req: DeleteNoteRequest, origin: string, storage: BackendStorage): Promise<DeleteNoteResponse> {
    const { objectUuid } = req;

    // in a single transaction:
    const activityUuid = await storage.transaction(async txn => {
        const objectRecord = await txn.get('object', objectUuid);
        if (objectRecord === undefined) throw new Error(`computeDeleteNote: Object ${objectUuid} not found`);
        if (!checkObjectRecord(objectRecord)) throw new Error(`computeDeleteNote: Object ${objectUuid} data is not valid`);

        if (objectRecord.deleted) throw new Error(`computeDeleteNote: Object ${objectUuid} was already deleted on ${objectRecord.deleted}`);

        const apo = ApObject.parseObj(objectRecord.activityPub);
        if (apo.type.toString() !== 'https://www.w3.org/ns/activitystreams#Note') throw new Error(`computeDeleteNote: Object ${objectUuid} is not a Note, found ${apo.type}`);

        const deleted = new Date().toISOString();
        apo.set('deleted', deleted);
        objectRecord.activityPub = apo.toObj();

        objectRecord.deleted = deleted;

        await txn.put('object', objectUuid, objectRecord);

        // save activity
        const activityUuid = newUuid();
        const { actorUuid } = objectRecord;
        const actorId = computeActorId({ origin, actorUuid });
        const activityId = computeActivityId({ origin, actorUuid, activityUuid });
        
        const published = deleted;
        const activity = {
            id: activityId,
            type: 'Delete',
            actor: actorId,
            to: apo.optIriStringOrStrings('to'), // needed for federation, this info is now gone from the inline object
            cc: apo.optIriStringOrStrings('cc'),
            object: {
                id: apo.getIriString('id'),
                type: 'Tombstone',
                formerType: 'Note', // verified above
                published: apo.getString('published'),
                updated: apo.optString('updated'),
                deleted: apo.getString('deleted'),
            },
            published,
        };
        const activityApo = ApObject.parseObj(activity, { includeDefaultContext: true });
        const activityRecord: ActivityRecord = {
            activityUuid,
            actorUuid,
            objectUuid,
            activityPub: activityApo.toObj(),   
        }
        await txn.put('activity', activityUuid, activityRecord);

        // add to actor activity index
        await txn.put('i-actor-activity-by-published', `${actorUuid}:${computeTimestamp(published)}:${activityUuid}`, { actorUuid, published, activityUuid });

        return activityUuid;
    });
    return { kind: 'delete-note', objectUuid, activityUuid };
}
