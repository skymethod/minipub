// deno-lint-ignore-file no-explicit-any

import { check, checkMatches, isNonEmpty, isStringRecord, isValidSha256 } from './check.ts';
import { isValidUuid } from './uuid.ts';

export function isValidExt(ext: string) {
    return /^[a-z]{3}$/.test(ext);
}

export function isValidBlobReferenceTag(tag: string) {
    return /^[a-z]+$/.test(tag);
}

//

export type BlobKey = { sha: string, ext: string };

export function checkBlobKey(obj: any): obj is BlobKey {
    return typeof obj === 'object'
        && check('sha', obj.sha, v => typeof v === 'string' && isValidSha256(v))
        && check('ext', obj.ext, v => typeof v === 'string' && isValidExt(v))
        ;
}

export function packBlobKey(key: BlobKey): string {
    return `${key.sha}.${key.ext}`;
}

export function unpackBlobKey(str: string): BlobKey {
    const [ _, sha, ext ] = checkMatches('str', str, /^([0-9a-f]{64})\.([a-z]{3})$/);
    return { sha, ext };
}

export type BlobReference = { key: BlobKey, tag: string };

export function checkBlobReference(obj: any): obj is BlobReference {
    return typeof obj === 'object'
        && checkBlobKey(obj.key)
        && check('tag', obj.tag, v => typeof v === 'string' && isValidBlobReferenceTag(v))
        ;
}

export interface Actor extends Record<string, unknown> {
    readonly uuid: string;
    readonly privateKeyPem: string;
    readonly blobReferences: Record<string, BlobReference>; // key = blob uuid
    readonly ld: Record<string, unknown>;
}

export function checkActor(obj: any): obj is Actor {
    return typeof obj === 'object'
        && check('uuid', obj.uuid, v => typeof v === 'string' && isValidUuid(v))
        && check('privateKeyPem', obj.privateKeyPem, v => typeof v === 'string' && isNonEmpty(v))
        && check('blobReferences', obj.blobReferences, v => isStringRecord(v) && isValidBlobReferences(v))
        && check('ld', obj.ld, v => isStringRecord(v))
        ;
}

function isValidBlobReferences(obj: any): boolean {
    return isStringRecord(obj) && Object.entries(obj).every(entry => {
        const [ blobUuid, blobReference ] = entry;
        check('blobUuid', blobUuid, v => typeof v === 'string' && isValidUuid(blobUuid));
        checkBlobReference(blobReference);
        return true;
    });
}
