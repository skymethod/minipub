import { Bytes } from '../deps.ts';
import { BlobKey, BlobReference, packBlobKey } from '../domain_model.ts';
import { getExtForMediaType } from '../media_types.ts';
import { BackendStorageTransaction, putIfNotExists } from '../storage.ts';
import { newUuid } from '../uuid.ts';

export type BlobInfo = { key: BlobKey, bytes: Uint8Array };

//

export async function computeBlobInfo(tag: string, opts: { bytesBase64: string, mediaType: string }): Promise<BlobInfo> {
    const { bytesBase64, mediaType } = opts;
    const bytes = Bytes.ofBase64(bytesBase64);
    if (bytes.length > MAX_STORAGE_VALUE) throw new Error(`Bad ${tag} byte length: ${bytes.length} is too large`);
    const sha = (await bytes.sha256()).hex();
    const ext = getExtForMediaType(mediaType); if (!ext) throw new Error(`Bad ${tag} media type: ${mediaType}`);
    const key = { sha, ext };
    return { key, bytes: bytes.array() };
}

export async function saveBlobIfNecessary(tag: string, info: BlobInfo | undefined, txn: BackendStorageTransaction, blobReferences: Record<string, BlobReference>): Promise<string | undefined> {
    if (info) {
        // save blob if new (blob:<sha256>.<ext>, bytes)
        const { key, bytes } = info;
        await putIfNotExists(txn, 'blob', packBlobKey(key), bytes);
        const blobUuid = newUuid();
        blobReferences[blobUuid] = { key, tag };
        return blobUuid;
    }
}

export function computeImage(opts: { actorUuid: string, blobUuid: string, width: number, height: number, ext: string, mediaType: string, origin: string }) {
    const { actorUuid, blobUuid, width, height, ext, mediaType, origin } = opts;
    return {
        type: 'Image',
        url: `${origin}/actors/${actorUuid}/blobs/${blobUuid}.${ext}`,
        width,
        height,
        mediaType,
    }
}

//

const MAX_STORAGE_VALUE = 128 * 1024; // 128kb is max size for a single DO storage value
