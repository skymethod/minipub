// deno-lint-ignore-file no-explicit-any

import { check, isNonEmpty, isStringRecord, isValidUrl } from './check.ts';
import { BlobReference, FederationRecord } from './domain_model.ts';
import { isValidUuid } from './uuid.ts';

export type RpcRequest = CreateUserRequest 
    | UpdateUserRequest 
    | DeleteUserRequest 
    | CreateNoteRequest 
    | UpdateNoteRequest
    | DeleteNoteRequest
    | FederateActivityRequest 
    | DeleteFromStorageRequest 
    | LikeObjectRequest
    | UndoLikeRequest
    | GenerateAdminTokenRequest
    | RevokeAdminTokenRequest
    | ValidateAdminTokenRequest
    ;

export type RpcResponse = CreateUserResponse 
    | UpdateUserResponse 
    | DeleteUserResponse 
    | CreateNoteResponse 
    | UpdateNoteResponse 
    | DeleteNoteResponse 
    | FederateActivityResponse 
    | DeleteFromStorageResponse 
    | LikeObjectResponse
    | UndoLikeResponse
    | GenerateAdminTokenResponse
    | RevokeAdminTokenResponse
    | ValidateAdminTokenResponse
    ;

// validation

export function isValidUsername(username: string) {
    return /^[a-z0-9]{3,15}$/.test(username);
}

function isValidUserName(name: string) {
    return /^[a-zA-Z]+( [a-zA-Z]+)*$/.test(name);
}

function isValidBase64(base64: string) {
    return /^[a-zA-Z0-9+\/]+=*$/.test(base64);
}

function isValidMediaType(mediaType: string) {
    return /^[a-z]+\/[a-z]+$/.test(mediaType);
}

function checkUserMetadata(obj: any): obj is Record<string, string> {
    return typeof obj === 'object' && Object.entries(obj).every(v => {
        const [ name, value ] = v;
        return check('name', name, /^[a-zA-Z]+$/.test(name)) && check('value', value, typeof value === 'string' && isNonEmpty(value));
    });
}

// common types

export interface LangString { 
    readonly lang: string;
    readonly value: string;
}

function checkLangString(obj: any): obj is LangString {
    return typeof obj === 'object'
        && check('lang', obj.lang, v => typeof v === 'string' && /^[a-zA-Z-]+$/.test(v))
        && check('value', obj.value, v => typeof v === 'string' && isNonEmpty(v))
        ;
}

export interface Icon {
    readonly bytesBase64: string; // <= 128kb
    readonly size: number; // width and height
    readonly mediaType: string;  
}

function checkIcon(obj: any): obj is Icon {
    return typeof obj === 'object'
        && check('bytesBase64', obj.bytesBase64, v => typeof v === 'string' && isValidBase64(v))
        && check('size', obj.size, v => typeof v === 'number' && v > 0)
        && check('mediaType', obj.mediaType, v => typeof v === 'string' && isValidMediaType(v))
        ;
}

export interface Image { 
    readonly bytesBase64: string; // <= 128kb
    readonly width: number;
    readonly height: number;
    readonly mediaType: string;  
}

function checkImage(obj: any): obj is Image {
    return typeof obj === 'object'
        && check('bytesBase64', obj.bytesBase64, v => typeof v === 'string' && isValidBase64(v))
        && check('width', obj.width, v => typeof v === 'number' && v > 0)
        && check('height', obj.height, v => typeof v === 'number' && v > 0)
        && check('mediaType', obj.mediaType, v => typeof v === 'string' && isValidMediaType(v))
        ;
}

// create-user

export interface CreateUserRequest {
    readonly kind: 'create-user';
    readonly username: string;

    readonly name?: string,
    readonly summary?: LangString, // html
    readonly url?: string,
    readonly icon?: Icon, // PNG, GIF or JPG. At most 2 MB. Will be downscaled to 400x400px, seen 220x220, 400x400
    readonly image?: Image, // PNG, GIF or JPG. At most 2 MB. Will be downscaled to 1500x500px
    readonly manuallyApprovesFollowers?: boolean, // as:manuallyApprovesFollowers proposal https://www.w3.org/wiki/Activity_Streams_extensions
    readonly discoverable?: boolean, // toot:discoverable toot = http://joinmastodon.org/ns#
    readonly metadata?: Record<string, string>, // ap attachments, schema propertyvalue name to value
}

export function checkCreateUserRequest(obj: any): obj is CreateUserRequest {
    return typeof obj === 'object' 
        && check('kind', obj.kind, v => v === 'create-user')
        && check('username', obj.username, v => typeof v === 'string' && isValidUsername(v))
        && check('name', obj.name, v => v === undefined || typeof v === 'string' && isValidUserName(v))
        && check('summary', obj.summary, v => v === undefined || checkLangString(v))
        && check('url', obj.url, v => v === undefined || typeof v === 'string' && isValidUrl(v))
        && check('icon', obj.icon, v => v === undefined || checkIcon(v))
        && check('image', obj.image, v => v === undefined || checkImage(v))
        && check('manuallyApprovesFollowers', obj.manuallyApprovesFollowers, v => v === undefined || typeof v === 'boolean')
        && check('discoverable', obj.discoverable, v => v === undefined || typeof v === 'boolean')
        && check('metadata', obj.metadata, v => v === undefined || checkUserMetadata(v))
        ;
}

export interface CreateUserResponse {
    readonly kind: 'create-user';
    readonly actorUuid: string;
    readonly blobReferences: Record<string, BlobReference>;
    readonly activityUuid: string;
}

// update-user

export interface UpdateUserRequest {
    readonly kind: 'update-user',
    readonly actorUuid: string,
  
    readonly username?: string,
    readonly name?: string | null, // null to clear
    readonly summary?: LangString | null,
    readonly url?: string | null,
    readonly icon?: Icon | null,
    readonly image?: Image | null,
    readonly manuallyApprovesFollowers?: boolean | null,
    readonly discoverable?: boolean | null,
    readonly metadata?: Record<string, string> | null,
}

export function checkUpdateUserRequest(obj: any): obj is UpdateUserRequest {
    return typeof obj === 'object' 
        && check('kind', obj.kind, v => v === 'update-user')
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('username', obj.username, v => v === undefined || v === null || typeof v === 'string' && isValidUserName(v))
        && check('name', obj.name, v => v === undefined || v === null || typeof v === 'string' && isValidUserName(v))
        && check('summary', obj.summary, v => v === undefined || v === null || checkLangString(v))
        && check('url', obj.url, v => v === undefined || v === null || typeof v === 'string' && isValidUrl(v))
        && check('icon', obj.icon, v => v === undefined || v === null || checkIcon(v))
        && check('image', obj.image, v => v === undefined || v === null || checkImage(v))
        && check('manuallyApprovesFollowers', obj.manuallyApprovesFollowers, v => v === undefined || v === null || typeof v === 'boolean')
        && check('discoverable', obj.discoverable, v => v === undefined || v === null || typeof v === 'boolean')
        && check('metadata', obj.metadata, v => v === undefined || v === null || checkUserMetadata(v))
        ;
}

export interface UpdateUserResponse {
    readonly kind: 'update-user';
    readonly actorUuid: string;
    readonly modified: boolean;
    readonly activityUuid?: string; // if modified
}

// delete-user

export interface DeleteUserRequest {
    readonly kind: 'delete-user',
    readonly actorUuid: string,
}

export interface DeleteUserResponse {
    readonly kind: 'delete-user';
    readonly actorUuid: string;
    readonly deleted: boolean;
}

// create-note

export interface CreateNoteRequest {
    readonly kind: 'create-note';
    readonly actorUuid: string;
    readonly inReplyTo?: string; // e.g. https://example.social/users/someone/statuses/123123123123123123
    readonly content: LangString; // e.g. <p>Hello world</p>
    readonly to: readonly string[]; // e.g. https://example.social/users/someone
    readonly cc?: readonly string[]; // e.g. https://www.w3.org/ns/activitystreams#Public
}

export function checkCreateNoteRequest(obj: any): obj is CreateNoteRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'create-note')
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('inReplyTo', obj.inReplyTo, v => v === undefined || typeof v === 'string' && isValidUrl(v))
        && check('content', obj.content, v => checkLangString(v))
        && check('to', obj.to, v => Array.isArray(v) && v.every(w => typeof w === 'string' && isValidUrl(w)))
        && check('cc', obj.cc, v => v === undefined || Array.isArray(v) && v.every(w => typeof w === 'string' && isValidUrl(w)))
        ;
}

export interface CreateNoteResponse {
    readonly kind: 'create-note';
    readonly objectUuid: string,
    readonly activityUuid: string,
}

// update-note

export interface UpdateNoteRequest {
    readonly kind: 'update-note';
    readonly objectUuid: string;
    readonly content: LangString; // e.g. <p>Hello world</p>
}

export function checkUpdateNoteRequest(obj: any): obj is UpdateNoteRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'update-note')
        && check('objectUuid', obj.objectUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('content', obj.content, v => checkLangString(v))
        ;
}

export interface UpdateNoteResponse {
    readonly kind: 'update-note';
    readonly objectUuid: string;
    readonly modified: boolean;
    readonly activityUuid?: string; // if modified
}

// delete-note

export interface DeleteNoteRequest {
    readonly kind: 'delete-note';
    readonly objectUuid: string;
}

export function checkDeleteNoteRequest(obj: any): obj is DeleteNoteRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'delete-note')
        && check('objectUuid', obj.objectUuid, v => typeof v === 'string' && isValidUuid(v))
        ;
}

export interface DeleteNoteResponse {
    readonly kind: 'delete-note';
    readonly objectUuid: string;
    readonly activityUuid: string;
}

// federate-activity

export interface FederateActivityRequest {
    readonly kind: 'federate-activity';
    readonly activityUuid: string;
    readonly dryRun?: boolean;
}

export function checkFederateActivityRequest(obj: any): obj is FederateActivityRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'federate-activity')
        && check('activityUuid', obj.activityUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('dryRun', obj.dryRun, v => v === undefined || typeof v === 'boolean')
        ;
}

export interface FederateActivityResponse {
    readonly kind: 'federate-activity';
    readonly record: FederationRecord;
    readonly recipientLogs: Record<string, string[]>; // key = recipient iri
    readonly modified: boolean;
}

// delete-from-storage

export interface DeleteFromStorageRequest {
    readonly kind: 'delete-from-storage';
    readonly domain: string;
    readonly key: string;
}

export function checkDeleteFromStorageRequest(obj: any): obj is DeleteFromStorageRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'delete-from-storage')
        && check('domain', obj.domain, v => typeof v === 'string')
        && check('key', obj.key, v => typeof v === 'string')
        ;
}

export interface DeleteFromStorageResponse {
    readonly kind: 'delete-from-storage';
    readonly existed: boolean;
}

// like object

export interface LikeObjectRequest {
    readonly kind: 'like-object';
    readonly actorUuid: string;
    readonly objectId: string; // remote objectId, ie the canonical "id" of the object/Note coming back from an AP request
}

export function checkLikeObjectRequest(obj: any): obj is LikeObjectRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'like-object')
        && check('actorUuid', obj.actorUuid, v => typeof v === 'string' && isValidUuid(v))
        && check('objectId', obj.objectId, v => typeof v === 'string' && isValidUrl(v))
        ;
}

export interface LikeObjectResponse {
    readonly kind: 'like-object';
    readonly activityUuid: string;
}

// undo like

export interface UndoLikeRequest {
    readonly kind: 'undo-like';
    readonly activityUuid: string;
}

export function checkUndoLikeRequest(obj: any): obj is UndoLikeRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'undo-like')
        && check('activityUuid', obj.activityUuid, v => typeof v === 'string' && isValidUuid(v))
        ;
}

export interface UndoLikeResponse {
    readonly kind: 'undo-like';
    readonly activityUuid: string;
}

// generate admin token

export interface GenerateAdminTokenRequest {
    readonly kind: 'generate-admin-token';
}

export function checkGenerateAdminTokenRequest(obj: any): obj is GenerateAdminTokenRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'generate-admin-token')
        ;
}

export interface GenerateAdminTokenResponse {
    readonly kind: 'generate-admin-token';
    readonly token: string;
}

// revoke admin token

export interface RevokeAdminTokenRequest {
    readonly kind: 'revoke-admin-token';
}

export function checkRevokeAdminTokenRequest(obj: any): obj is RevokeAdminTokenRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'revoke-admin-token')
        ;
}

export interface RevokeAdminTokenResponse {
    readonly kind: 'revoke-admin-token';
    readonly existed: boolean;
}

// validate admin token

export interface ValidateAdminTokenRequest {
    readonly kind: 'validate-admin-token';
    readonly token: string;
}

export function checkValidateAdminTokenRequest(obj: any): obj is ValidateAdminTokenRequest {
    return isStringRecord(obj)
        && check('kind', obj.kind, v => v === 'validate-admin-token')
        && check('token', obj.token, v => typeof v === 'string')
        ;
}

export interface ValidateAdminTokenResponse {
    readonly kind: 'validate-admin-token';
    readonly valid: boolean;
}
