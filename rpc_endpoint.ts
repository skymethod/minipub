import { checkCreateUserRequest, checkUpdateUserRequest, CreateUserRequest, CreateUserResponse, LangString, RpcResponse, UpdateUserRequest, UpdateUserResponse } from './rpc_model.ts';
import { APPLICATION_JSON_UTF8 } from './content_types.ts';
import { BackendStorage, putIfNotExists } from './storage.ts';
import { newUuid } from './uuid.ts';
import { exportKeyToPem, generateExportableRsaKeyPair } from './crypto.ts';
import { Bytes } from './deps.ts';

export const matchRpc = (method: string, pathname: string) => method === 'POST' && pathname === '/rpc';

export async function computeRpc(request: { json(): Promise<unknown>; }, origin: string, storage: BackendStorage): Promise<Response> {
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json();
    const { kind } = body;
    if (kind === 'create-user' && checkCreateUserRequest(body)) return json(await computeCreateUser(body, origin, storage));
    if (kind === 'update-user' && checkUpdateUserRequest(body)) return json(await computeUpdateUser(body));
    throw new Error(`computeRpc: Unable to parse ${JSON.stringify(body)}`);
}

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
    
    // in a single transaction:
    await storage.transaction(async txn => {
        // validate username is valid and unique (check i-username-uuid:<username> not exists)
        const exists = (await txn.get('i-username-uuid', username)) !== undefined;
        if (exists) throw new Error(`Username ${username} is unavailable`);

        const saveBlobIfNecessary = async (info: BlobInfo | undefined) => {
            if (info) {
                // save blob if new (blob:<sha256>.<ext>, bytes)
                const { sha, ext, bytes } = info;
                const blobKey = `${sha}.${ext}`;
                await putIfNotExists(txn, 'blob', blobKey, bytes);
                // save owned blob if new
                const ownedBlobKey = (await Bytes.ofUtf8(`${uuid}.${blobKey}`).sha256()).hex();
                await putIfNotExists(txn, 'owned-blob', ownedBlobKey, { uuid, blobKey });
                return ownedBlobKey;
            }
        }
        const iconBlobKey = await saveBlobIfNecessary(iconBlobInfo);
        const imageBlobKey = await saveBlobIfNecessary(imageBlobInfo);
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

        const ld: Record<string, unknown> = {
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
            icon: icon && iconBlobInfo && iconBlobKey ? computeImage({ blobKey: iconBlobKey, width: icon.size, height: icon.size, ext: iconBlobInfo.ext, mediaType: icon.mediaType, origin }) : undefined,
            
            // mastodon: Used as profile header.
            image: image && imageBlobInfo && imageBlobKey ? computeImage({ blobKey: imageBlobKey, width: image.width, height: image.height, ext: imageBlobInfo.ext, mediaType: image.mediaType, origin }) : undefined,

            // mastodon: Will be shown as a locked account.
            manuallyApprovesFollowers: req.manuallyApprovesFollowers,

            // mastodon: Will be shown in the profile directory.
            discoverable: req.discoverable,

            // mastodon: Used for profile fields. See Profile metadata
            attachment,

            // activitystreams: create date
            published,
        };

        // save actor info (actor:<uuid>,json), including private fields and ld json to be returned as is
        const actor = {
            uuid,
            privateKeyPem,
            ld,
        }
        await txn.put('actor', uuid, actor);

        // save username->actor-uuid index (i-username-uuid:<username>, actor-uuid)
        await txn.put('i-username-uuid', username, { uuid });
    });
    return { kind: 'create-user', uuid };
}

export function computeUpdateUser(_req: UpdateUserRequest): Promise<UpdateUserResponse> {
    throw new Error('computeUpdateUser: TODO');
}

//

const MEDIA_TYPES = new Map<string, string>([
    [ 'image/jpeg', 'jpg' ],
    [ 'image/png', 'png' ],
]);

const MAX_STORAGE_VALUE = 128 * 1024; // 128kb is max size for a single DO storage value

type BlobInfo = { sha: string, ext: string, bytes: Uint8Array };

type Attachment = { name: string, type: string, value: string };

async function computeBlobInfo(tag: string, opts: { bytesBase64: string, mediaType: string }): Promise<BlobInfo> {
    const { bytesBase64, mediaType } = opts;
    const bytes = Bytes.ofBase64(bytesBase64);
    if (bytes.length > MAX_STORAGE_VALUE) throw new Error(`Bad ${tag} byte length: ${bytes.length} is too large`);
    const sha = (await bytes.sha256()).hex();
    const ext = MEDIA_TYPES.get(mediaType); if (!ext) throw new Error(`Bad ${tag} media type: ${mediaType}`);
    return { sha, ext, bytes: bytes.array() };
}

function json(res: RpcResponse): Response {
    return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
}

function computeLangStringMap(langString: LangString | undefined): Record<string, string> | undefined {
    if (!langString) return undefined;
    const rt: Record<string, string>  = {};
    rt[langString.lang] = langString.value;
    return rt;
}

function computeImage(opts: { blobKey: string, width: number, height: number, ext: string, mediaType: string, origin: string }) {
    const { blobKey, width, height, ext, mediaType, origin } = opts;
    return {
        type: 'Image',
        url: `${origin}/blobs/${blobKey}.${ext}`,
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
