// deno-lint-ignore-file no-explicit-any

import { check, isNonEmpty, isValidUrl } from './check.ts';
import { BlobReference } from './domain_model.ts';
import { isValidUuid } from './uuid.ts';

export type RpcRequest = CreateUserRequest | UpdateUserRequest | DeleteUserRequest | ReplyRequest | SendActivityRequest;
export type RpcResponse = CreateUserResponse | UpdateUserResponse | DeleteUserResponse | ReplyResponse | SendActivityResponse;

// validation

export function isValidUsername(username: string) {
    return /^[a-z0-9]{4,15}$/.test(username);
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
    readonly uuid: string;
    readonly blobReferences: Record<string, BlobReference>;
}

// update-user

export interface UpdateUserRequest {
    readonly kind: 'update-user',
    readonly uuid: string,
  
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
        && check('kind', obj.kind, v => v === 'create-user')
        && check('uuid', obj.uuid, v => typeof v === 'string' && isValidUuid(v))
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
    readonly uuid: string;
    readonly modified: boolean;
}

// delete-user

export interface DeleteUserRequest {
    readonly kind: 'delete-user',
    readonly uuid: string,
}

export interface DeleteUserResponse {
    readonly kind: 'delete-user';
    readonly uuid: string;
    readonly deleted: boolean;
}

// reply

export interface ReplyRequest {
    readonly kind: 'reply';
    readonly actorUuid: string;
    readonly inReplyTo: string; // e.g. https://example.social/users/someone/statuses/123123123123123123
    readonly content: LangString; // e.g. <p>Hello world</p>
    readonly inbox: string; // e.g. https://example.social/users/someone/inbox
    readonly sharedInbox?: string; // e.g. https://example.social/inbox
    readonly to: string; // e.g. https://example.social/users/someone
}

export interface ReplyResponse {
    readonly kind: 'reply';
}

// send-activity

export interface SendActivityRequest {
    readonly kind: 'send-activity';
    readonly actorUuid: string;
    readonly inboxUrl: string;
    readonly activityId: string;
    readonly queued: string; // iso8601
}

export interface SendActivityResponse {
    readonly kind: 'send-activity';
}
