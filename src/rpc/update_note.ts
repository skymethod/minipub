import { UpdateNoteRequest, UpdateNoteResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { ActivityRecord, checkObjectRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';
import { computeContentMap } from './create_note.ts';
import { isStringRecord } from '../check.ts';

export async function computeUpdateNote(req: UpdateNoteRequest, origin: string, storage: BackendStorage): Promise<UpdateNoteResponse> {
    const { objectUuid, content } = req;

    const contentMap = computeContentMap(content);
    let modified = false;
    let activityUuid: string | undefined;

    // in a single transaction:
    await storage.transaction(async txn => {
        const objectRecord = await txn.get('object', objectUuid);
        if (objectRecord === undefined) throw new Error(`computeUpdateNote: Object ${objectUuid} not found`);
        if (!checkObjectRecord(objectRecord)) throw new Error(`computeUpdateNote: Object ${objectUuid} data is not valid`);
        if (objectRecord.deleted) throw new Error(`computeUpdateNote: Object ${objectUuid} was deleted on ${objectRecord.deleted}`);

        if (isStringRecord(objectRecord.activityPub.contentMap) && JSON.stringify(objectRecord.activityPub.contentMap) === JSON.stringify(contentMap)) {
            return; // no changes
        }

        objectRecord.activityPub.contentMap = contentMap;
        objectRecord.activityPub.content = Object.values(contentMap)[0] || ''; // currently required for the WordPress AP plugin: https://github.com/pfefferle/wordpress-activitypub/issues/138

        const apo = ApObject.parseObj(objectRecord.activityPub);

        const updated = new Date().toISOString();
        apo.set('updated', updated);
        objectRecord.activityPub = apo.toObj();

        await txn.put('object', objectUuid, objectRecord);
            
        // save activity
        activityUuid = newUuid();
        const { actorUuid } = objectRecord;
        const actorId = computeActorId({ origin, actorUuid });
        const activityId = computeActivityId({ origin, actorUuid, activityUuid });
        // move @context up to activity
        const object = objectRecord.activityPub;
        const context = object['@context'];
        delete object['@context'];
        const published = updated;
        const activity = {
            '@context': context,
            id: activityId,
            type: 'Update',
            actor: actorId,
            object,
            published,
        };
        const activityApo = ApObject.parseObj(activity);
        const activityRecord: ActivityRecord = {
            activityUuid,
            actorUuid,
            objectUuid,
            activityPub: activityApo.toObj(),   
        }
        await txn.put('activity', activityUuid, activityRecord);

        // add to actor activity index
        await txn.put('i-actor-activity-by-published', `${actorUuid}:${computeTimestamp(published)}:${activityUuid}`, { actorUuid, published, activityUuid });

        modified = true;
    });
    return { kind: 'update-note', objectUuid, modified, activityUuid };
}
