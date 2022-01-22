import { UpdateUserRequest, UpdateUserResponse } from '../rpc_model.ts';
import { BackendStorage, BackendStorageTransaction } from '../storage.ts';
import { ActivityRecord, BlobReference, checkActorRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { computeBlobInfo, computeImage, saveBlobIfNecessary } from './blob_info.ts';
import { newUuid } from '../uuid.ts';
import { computeActivityId, computeActorId } from './urls.ts';
import { computeTimestamp } from './timestamp.ts';

export async function computeUpdateUser(req: UpdateUserRequest, origin: string, storage: BackendStorage): Promise<UpdateUserResponse> {
    const { actorUuid, name, url, username, icon, image } = req;

     // compute icon,image hash
     const iconBlobInfo = icon ? await computeBlobInfo('icon', icon) : undefined;
     const imageBlobInfo = image ? await computeBlobInfo('image', image) : undefined;
     
    let modified = false;
    let activityUuid: string | undefined;

    const blobReferences: Record<string, BlobReference> = {};

    // in a single transaction:
    await storage.transaction(async txn => {
        const actor = await txn.get('actor', actorUuid);
        if (actor === undefined) throw new Error(`computeUpdateUser: Actor ${actorUuid} not found`);
        if (!checkActorRecord(actor)) throw new Error(`computeUpdateUser: Actor ${actorUuid} data is not valid`);

        if (username) {
            // validate username is valid and unique (check i-username-actor:<username> not exists)
            const exists = (await txn.get('i-username-actor', username)) !== undefined;
            if (exists) throw new Error(`Username ${username} is unavailable`);
        }

        const iconBlobUuid = await saveBlobIfNecessary('icon', iconBlobInfo, txn, blobReferences);
        const imageBlobUuid = await saveBlobIfNecessary('image', imageBlobInfo, txn, blobReferences);
        // now we have urls for image,icon (https://example.social/blobs/<blob-uuid>.<ext>)

        const apo = ApObject.parseObj(actor.activityPub);
        if (typeof name === 'string') {
            apo.set('name', name);
        } else if (name === null) {
            apo.delete('name');
        }
        if (typeof url === 'string') {
            apo.set('url', url);
        } else if (url === null) {
            apo.delete('url');
        }
        let oldUsername: string | undefined;
        if (username) {
            const oldUsernameVal = apo.get('preferredUsername');
            if (typeof oldUsernameVal !== 'string') throw new Error(`Unexpected oldUsernameVal: ${JSON.stringify(oldUsernameVal)}`);
            oldUsername = oldUsernameVal;
            apo.set('preferredUsername', username);
        }
        if (icon === null) {
            apo.delete('icon');
        } else if (icon !== undefined) {
            const apIcon = iconBlobInfo && iconBlobUuid ? computeImage({ actorUuid, blobUuid: iconBlobUuid, width: icon.size, height: icon.size, ext: iconBlobInfo.key.ext, mediaType: icon.mediaType, origin }) : undefined;
            if (apIcon) {
                apo.set('icon', apIcon);
            }
        }
        if (image === null) {
            apo.delete('image');
        } else if (image !== undefined) {
            const apImage = imageBlobInfo && imageBlobUuid ? computeImage({ actorUuid, blobUuid: imageBlobUuid, width: image.width, height: image.height, ext: imageBlobInfo.key.ext, mediaType: image.mediaType, origin }) : undefined;
            if (apImage) {
                apo.set('image', apImage);
            }
        }
        if (apo.modified) {
            const updated = new Date().toISOString();
            apo.set('updated', updated);

            for (const [ blobUuid, blobReference ] of Object.entries(blobReferences)) {
                actor.blobReferences[blobUuid] = blobReference;
            }

            actor.activityPub = apo.toObj();
            await txn.put('actor', actorUuid, actor);
            
            if (username && oldUsername) {
                // save username->actor index (i-username-actor:<username>, actor-uuid)
                await txn.delete('i-username-actor', oldUsername)
                await txn.put('i-username-actor', username, { actorUuid });
            }

            activityUuid = await saveActorActivity(txn, { type: 'Update', published: updated, origin, actorUuid, actorActivityPub: actor.activityPub });

            modified = true;
        }

    });
    return { kind: 'update-user', actorUuid, modified, activityUuid };
}

export async function saveActorActivity(txn: BackendStorageTransaction, opts: { type: 'Create' | 'Update', published: string, origin: string, actorUuid: string, actorActivityPub: Record<string, unknown> }): Promise<string> {
    const { type, published, origin, actorUuid, actorActivityPub } = opts;

    const activityUuid = newUuid();
    const activityId = computeActivityId({ origin, actorUuid, activityUuid });
    const actorId = computeActorId({ origin, actorUuid });
   
    // move the @context up to the activity
    const context = actorActivityPub['@context'];
    delete actorActivityPub['@context'];

    const activityApo = ApObject.parseObj({
        '@context': context,
        id: activityId,
        type,
        actor: actorId,
        object: actorActivityPub,
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
