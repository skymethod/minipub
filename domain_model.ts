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

export interface ActorRecord extends Record<string, unknown> {
    readonly actorUuid: string;
    readonly privateKeyPem: string;
    readonly blobReferences: Record<string, BlobReference>; // key = blob uuid
    activityPub: Record<string, unknown>;
}

export function checkActorRecord(obj: any): obj is ActorRecord {
    return isStringRecord(obj)
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('privateKeyPem', obj.privateKeyPem, v => typeof v === 'string' && isNonEmpty(v))
        && check('blobReferences', obj.blobReferences, v => isStringRecord(v) && isValidBlobReferences(v))
        && check('activityPub', obj.activityPub, v => isStringRecord(v))
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

export interface ObjectRecord extends Record<string, unknown> {
    readonly objectUuid: string;
    readonly actorUuid: string;
    readonly activityPub: Record<string, unknown>;
}

export function checkObjectRecord(obj: any): obj is ObjectRecord {
    return isStringRecord(obj)
        && check('objectUuid', obj.objectUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v) && v !== obj.uuid)
        && check('activityPub', obj.activityPub, v => isStringRecord(v))
        ;
}

export interface ActivityRecord extends Record<string, unknown> {
    readonly activityUuid: string;
    readonly actorUuid: string;
    readonly activityPub: Record<string, unknown>;
}

export function checkActivityRecord(obj: any): obj is ActivityRecord {
    return isStringRecord(obj)
        && check('activityUuid', obj.activityUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v) && v !== obj.uuid)
        && check('activityPub', obj.activityPub, v => isStringRecord(v))
        ;
}
