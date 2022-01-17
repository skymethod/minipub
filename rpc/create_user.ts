import { CreateUserRequest, CreateUserResponse, LangString } from '../rpc_model.ts';
import { BackendStorage, putIfNotExists } from '../storage.ts';
import { newUuid } from '../uuid.ts';
import { exportKeyToPem, generateExportableRsaKeyPair } from '../crypto.ts';
import { Bytes } from '../deps.ts';
import { Actor, BlobKey, BlobReference, packBlobKey } from '../domain_model.ts';
import { getExtForMediaType } from '../media_types.ts';
import { ApObject } from '../activity_pub/ap_object.ts';

export async function computeCreateUser(req: CreateUserRequest, origin: string, storage: BackendStorage): Promise<CreateUserResponse> {
    // generate uuid, keypair
    const uuid = newUuid();
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
        // validate username is valid and unique (check i-username-uuid:<username> not exists)
        const exists = (await txn.get('i-username-uuid', username)) !== undefined;
        if (exists) throw new Error(`Username ${username} is unavailable`);

        const saveBlobIfNecessary = async (tag: string, info: BlobInfo | undefined) => {
            if (info) {
                // save blob if new (blob:<sha256>.<ext>, bytes)
                const { key, bytes } = info;
                await putIfNotExists(txn, 'blob', packBlobKey(key), bytes);
                const blobUuid = newUuid();
                blobReferences[blobUuid] = { key, tag };
                return blobUuid;
            }
        }
        const iconBlobUuid = await saveBlobIfNecessary('icon', iconBlobInfo);
        const imageBlobUuid = await saveBlobIfNecessary('image', imageBlobInfo);
        // now we have urls for image,icon (https://example.social/blobs/<blob-uuid>.<ext>)

        const published = new Date().toISOString();
        const actorId = `${origin}/actors/${uuid}`;
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
            icon: icon && iconBlobInfo && iconBlobUuid ? computeImage({ actorUuid: uuid, blobUuid: iconBlobUuid, width: icon.size, height: icon.size, ext: iconBlobInfo.key.ext, mediaType: icon.mediaType, origin }) : undefined,
            
            // mastodon: Used as profile header.
            image: image && imageBlobInfo && imageBlobUuid ? computeImage({ actorUuid: uuid, blobUuid: imageBlobUuid, width: image.width, height: image.height, ext: imageBlobInfo.key.ext, mediaType: image.mediaType, origin }) : undefined,

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
        const actor: Actor = {
            uuid,
            privateKeyPem,
            blobReferences,
            activityPub,
        }
        await txn.put('actor', uuid, actor);

        // save username->actor-uuid index (i-username-uuid:<username>, actor-uuid)
        await txn.put('i-username-uuid', username, { uuid });
    });
    return { kind: 'create-user', uuid, blobReferences };
}

//

const MAX_STORAGE_VALUE = 128 * 1024; // 128kb is max size for a single DO storage value

async function computeBlobInfo(tag: string, opts: { bytesBase64: string, mediaType: string }): Promise<BlobInfo> {
    const { bytesBase64, mediaType } = opts;
    const bytes = Bytes.ofBase64(bytesBase64);
    if (bytes.length > MAX_STORAGE_VALUE) throw new Error(`Bad ${tag} byte length: ${bytes.length} is too large`);
    const sha = (await bytes.sha256()).hex();
    const ext = getExtForMediaType(mediaType); if (!ext) throw new Error(`Bad ${tag} media type: ${mediaType}`);
    const key = { sha, ext };
    return { key, bytes: bytes.array() };
}

function computeLangStringMap(langString: LangString | undefined): Record<string, string> | undefined {
    if (!langString) return undefined;
    const rt: Record<string, string>  = {};
    rt[langString.lang] = langString.value;
    return rt;
}

function computeImage(opts: { actorUuid: string, blobUuid: string, width: number, height: number, ext: string, mediaType: string, origin: string }) {
    const { actorUuid, blobUuid, width, height, ext, mediaType, origin } = opts;
    return {
        type: 'Image',
        url: `${origin}/actors/${actorUuid}/blobs/${blobUuid}.${ext}`,
        width,
        height,
        mediaType,
    }
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

type BlobInfo = { key: BlobKey, bytes: Uint8Array };

type Attachment = { name: string, type: string, value: string };
