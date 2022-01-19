import { check } from '../check.ts';
import { checkActorRecord, isValidExt, packBlobKey } from '../domain_model.ts';
import { getMediaTypeForExt } from '../media_types.ts';
import { BackendStorage, getRecord, getUint8Array } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { makeNotFoundResponse } from './responses.ts';

export function matchBlob(method: string, pathname: string): { actorUuid: string, blobUuid: string, ext: string } | undefined {
    if (method === 'GET') {
        const m = /^\/actors\/([0-9a-f]+)\/blobs\/([0-9a-f]+)\.([a-z]+)$/.exec(pathname);
        if (m) {
            const [ _, actorUuid, blobUuid, ext ] = m;
            if (isValidUuid(actorUuid) && isValidUuid(blobUuid) && isValidExt(ext)) {
                return { actorUuid, blobUuid, ext };
            }
        }
    }
}

export async function computeBlob(actorUuid: string, blobUuid: string, ext: string, storage: BackendStorage): Promise<Response> {
    check('actorUuid', actorUuid, isValidUuid);
    check('blobUuid', blobUuid, isValidUuid);
    check('ext', ext, isValidExt);

    const bytes = await storage.transaction(async txn => {
        const actor = await getRecord(txn, 'actor', actorUuid);
        if (actor && checkActorRecord(actor)) {
            const ref = actor.blobReferences[blobUuid];
            if (ref) {
                if (ref.key.ext === ext) {
                    return await getUint8Array(txn, 'blob', packBlobKey(ref.key));
                }
            }
        }
    });
    const mediaType = getMediaTypeForExt(ext);
    if (bytes && mediaType) return new Response(bytes, { headers: { 'content-type': mediaType } } );
    return makeNotFoundResponse();
}
