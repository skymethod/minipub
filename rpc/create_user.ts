import { CreateUserRequest, CreateUserResponse, LangString } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { newUuid } from '../uuid.ts';
import { exportKeyToPem, generateExportableRsaKeyPair } from '../crypto.ts';
import { ActorRecord, BlobReference } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { computeBlobInfo, computeImage, saveBlobIfNecessary } from './blob_info.ts';
import { computeActorId } from './urls.ts';

export async function computeCreateUser(req: CreateUserRequest, origin: string, storage: BackendStorage): Promise<CreateUserResponse> {
    // generate uuid, keypair
    const actorUuid = newUuid();
    const { privateKey, publicKey } = await generateExportableRsaKeyPair();
    const privateKeyPem = await exportKeyToPem(privateKey, 'private');
    const publicKeyPem = await exportKeyToPem(publicKey, 'public');

    const { username, icon, image } = req;
    // compute icon,image hash
    const iconBlobInfo = icon ? await computeBlobInfo('icon', icon) : undefined;
    const imageBlobInfo = image ? await computeBlobInfo('image', image) : undefined;
    
    const blobReferences: Record<string, BlobReference> = {};
    
    // in a single transaction:
    await storage.transaction(async txn => {
        // validate username is valid and unique (check not exists)
        const exists = (await txn.get('i-username-actor', username)) !== undefined;
        if (exists) throw new Error(`Username ${username} is unavailable`);

        const iconBlobUuid = await saveBlobIfNecessary('icon', iconBlobInfo, txn, blobReferences);
        const imageBlobUuid = await saveBlobIfNecessary('image', imageBlobInfo, txn, blobReferences);
        // now we have urls for image,icon (https://example.social/blobs/<blob-uuid>.<ext>)

        const published = new Date().toISOString();
        const actorId = computeActorId({ origin, actorUuid });
        const otherContext: Record<string, string> = {};
        if (req.manuallyApprovesFollowers !== undefined) otherContext['manuallyApprovesFollowers'] =  'as:manuallyApprovesFollowers';
        if (req.discoverable !== undefined) {
            otherContext['discoverable'] = 'toot:discoverable';
            otherContext['toot'] = 'http://joinmastodon.org/ns#';
        }
        const attachment = computeAttachment(req.metadata);
        if (attachment) {
            otherContext['schema'] = 'http://schema.org#';
            otherContext['PropertyValue'] = 'schema:PropertyValue';
            otherContext['value'] = 'schema:value';
        }

        let activityPub: Record<string, unknown> = {
            '@context': [
                'https://www.w3.org/ns/activitystreams',
                'https://w3id.org/security/v1', // for publicKey
                ...(Object.keys(otherContext).length > 0 ? [ otherContext ] : []),
            ],
            id: actorId,
            type: 'Person',

            // mastodon: Used for Webfinger lookup. Must be unique on the domain, and must correspond to a Webfinger acct: URI.
            preferredUsername: username, 

            // mastodon: doesn’t acknowledge inbox-less actors as compatible.
            inbox: `${actorId}/inbox`,
        
            // mastodon: Required for signatures.
            publicKey: { 
                id: `${actorId}#main-key`,
                owner: actorId,
                publicKeyPem,
            },
    
            // mastodon: Used as profile display name.
            name: req.name, 

            // mastodon: Used as profile bio.
            summaryMap: computeLangStringMap(req.summary), 

            // mastodon: Used as profile link.
            url: req.url, 

            // mastodon: Used as profile avatar.
            icon: icon && iconBlobInfo && iconBlobUuid ? computeImage({ actorUuid, blobUuid: iconBlobUuid, width: icon.size, height: icon.size, ext: iconBlobInfo.key.ext, mediaType: icon.mediaType, origin }) : undefined,
            
            // mastodon: Used as profile header.
            image: image && imageBlobInfo && imageBlobUuid ? computeImage({ actorUuid, blobUuid: imageBlobUuid, width: image.width, height: image.height, ext: imageBlobInfo.key.ext, mediaType: image.mediaType, origin }) : undefined,

            // mastodon: Will be shown as a locked account.
            manuallyApprovesFollowers: req.manuallyApprovesFollowers,

            // mastodon: Will be shown in the profile directory.
            discoverable: req.discoverable,

            // mastodon: Used for profile fields. See Profile metadata
            attachment,

            // activitystreams: create date
            published,
        };

        activityPub = ApObject.parseObj(activityPub).toObj(); // strip undefined values

        // save actor info (actor:<uuid>,json), including private fields and ld json to be returned as is
        const actor: ActorRecord = {
            actorUuid,
            privateKeyPem,
            blobReferences,
            activityPub,
        }
        await txn.put('actor', actorUuid, actor);

        // save username->actor-uuid index (i-username-actor:<username>, actor-uuid)
        await txn.put('i-username-actor', username, { actorUuid });
    });
    return { kind: 'create-user', actorUuid, blobReferences };
}

//

function computeLangStringMap(langString: LangString | undefined): Record<string, string> | undefined {
    if (!langString) return undefined;
    const rt: Record<string, string>  = {};
    rt[langString.lang] = langString.value;
    return rt;
}

function computeAttachment(metadata?: Record<string, string>): Attachment[] | undefined {
    const rt: Attachment[] = [];
    if (metadata) {
        for (const [ name, value ] of Object.entries(metadata)) {
            rt.push({ name, type: 'PropertyValue', value });
        }
    }
    return rt.length > 0 ? rt : undefined;
}

//

type Attachment = { name: string, type: string, value: string };
