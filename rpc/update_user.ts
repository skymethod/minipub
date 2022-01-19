import { UpdateUserRequest, UpdateUserResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { BlobReference, checkActorRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { computeBlobInfo, computeImage, saveBlobIfNecessary } from './blob_info.ts';

export async function computeUpdateUser(req: UpdateUserRequest, origin: string, storage: BackendStorage): Promise<UpdateUserResponse> {
    const { actorUuid, name, username, icon, image } = req;

     // compute icon,image hash
     const iconBlobInfo = icon ? await computeBlobInfo('icon', icon) : undefined;
     const imageBlobInfo = image ? await computeBlobInfo('image', image) : undefined;
     
    let modified = false;

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
            apo.set('updated', new Date().toISOString());
            actor.activityPub = apo.toObj();
            await txn.put('actor', actorUuid, actor);
            
            if (username && oldUsername) {
                // save username->actor index (i-username-actor:<username>, actor-uuid)
                await txn.delete('i-username-actor', oldUsername)
                await txn.put('i-username-actor', username, { actorUuid });
            }

            modified = true;
        }

    });
    return { kind: 'update-user', actorUuid, modified };
}
