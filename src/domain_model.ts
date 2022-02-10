// deno-lint-ignore-file no-explicit-any

import { check, checkMatches, isNonEmpty, isPositiveInteger, isStringRecord, isValidIso8601, isValidSha256, isValidUrl } from './check.ts';
import { isValidUuid } from './uuid.ts';

export function isValidExt(ext: string) {
    return /^[a-z]{3}$/.test(ext);
}

export function isValidBlobReferenceTag(tag: string) {
    return /^[a-z]+$/.test(tag);
}

// BlobKey

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

// BlobReference

export type BlobReference = { key: BlobKey, tag: string };

export function checkBlobReference(obj: any): obj is BlobReference {
    return typeof obj === 'object'
        && checkBlobKey(obj.key)
        && check('tag', obj.tag, v => typeof v === 'string' && isValidBlobReferenceTag(v))
        ;
}

// Actor

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

// Object

export interface ObjectRecord extends Record<string, unknown> {
    readonly objectUuid: string;
    readonly actorUuid: string;
    activityPub: Record<string, unknown>;
    deleted?: string; // time (instant) of deletion
}

export function checkObjectRecord(obj: any): obj is ObjectRecord {
    return isStringRecord(obj)
        && check('objectUuid', obj.objectUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v) && v !== obj.uuid)
        && check('activityPub', obj.activityPub, v => isStringRecord(v))
        && check('deleted', obj.deleted, v => v === undefined || (typeof v === 'string' && isValidIso8601(v)))
        ;
}

// Activity

export interface ActivityRecord extends Record<string, unknown> {
    readonly activityUuid: string;
    readonly actorUuid: string;
    readonly objectUuid?: string;
    readonly activityPub: Record<string, unknown>;
}

export function checkActivityRecord(obj: any): obj is ActivityRecord {
    return isStringRecord(obj)
        && check('activityUuid', obj.activityUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v) && v !== obj.activityUuid)
        && check('objectUuid', obj.objectUuid, v => v === undefined || (typeof v === 'string' && isValidUuid(v) && v !== obj.activityUuid))
        && check('activityPub', obj.activityPub, v => isStringRecord(v))
        ;
}

// Federation

export interface FederationRecord extends Record<string, unknown> {
    readonly activityUuid: string;
    readonly published: string; // instant
    readonly actorUuid: string;
    readonly recipientStates: Record<string, FederationRecipientState>; // key = recipient iri
}

export function checkFederationRecord(obj: any): obj is FederationRecord {
    return isStringRecord(obj)
        && check('activityUuid', obj.activityUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('published', obj.published, v => typeof v === 'string' && isValidIso8601(v))
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v) && v !== obj.activityUuid)
        && check('recipientStates', obj.recipientStates, v => isStringRecord(v) && Object.keys(v).every(isValidUrl) && Object.values(v).every(checkFederationRecipientState))
        ;
}

export type FederationRecipientStatus = 'initial' | 'discovered' | 'discovery-failed' | 'posted' | 'post-failed';

export interface FederationRecipientState {
    status: FederationRecipientStatus; // discover the inboxes first, then POST to one of them
    error?: string; // latest error, either for discovery or posting, cleared on success
    inbox?: string; // discovered
    sharedInbox?: string; // discovered
    discoveryAttempts?: number; // give up after a certain amount
    postAttempts?: number; // give up after a certain amount
    postResponseTime?: string; // instant of the latest POST /inbox response
    postResponseStatus?: string; // http status (or known error string code) of the latest POST /inbox response
}

export function checkFederationRecipientState(obj: any): obj is FederationRecipientState {
    return isStringRecord(obj)
        && check('status', obj.status, v => typeof v === 'string' && checkFederationRecipientStatus(v))
        && check('error', obj.error, v => v === undefined || typeof v === 'string')
        && check('inbox', obj.inbox, v => v === undefined || (typeof v === 'string' && isValidUrl(v)))
        && check('sharedInbox', obj.sharedInbox, v => v === undefined || (typeof v === 'string' && isValidUrl(v)))
        && check('discoveryAttempts', obj.discoveryAttempts, v => v === undefined || (typeof v === 'number' && isPositiveInteger(v)))
        && check('postAttempts', obj.postAttempts, v => v === undefined || (typeof v === 'number' && isPositiveInteger(v)))
        && check('postResponseTime', obj.postResponseTime, v => v === undefined || (typeof v === 'string' && isValidIso8601(v)))
        && check('postResponseStatus', obj.postResponseStatus, v => v === undefined || typeof v === 'string')
        ;
}

function checkFederationRecipientStatus(status: string): status is FederationRecipientStatus {
    return status === 'initial' || status === 'discovered' || status === 'discovery-failed' || status === 'posted' || status === 'post-failed';
}
