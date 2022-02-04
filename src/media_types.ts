import { BiMap } from './bimap.ts';

export const APPLICATION_JSON_UTF8 = 'application/json; charset=utf-8';
export const TEXT_PLAIN_UTF8 = 'text/plain; charset=utf-8';

// https://www.w3.org/TR/activitypub/#retrieving-objects
export const APPLICATION_LD_JSON_PROFILE_ACTIVITYSTREAMS = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

// https://www.w3.org/TR/activitystreams-core/#media-type
export const APPLICATION_ACTIVITY_JSON = 'application/activity+json';

// mastodon/pleroma returns
export const APPLICATION_ACTIVITY_JSON_UTF8 = 'application/activity+json; charset=utf-8';

// JSON Resource Descriptor (JRD) Media Type https://datatracker.ietf.org/doc/html/rfc7033#section-10.2
export const APPLICATION_JRD_JSON = 'application/jrd+json';

export const IMAGE_JPEG = 'image/jpeg';
export const IMAGE_PNG = 'image/png';

export function getMediaTypeForExt(ext: string) {
    return MEDIA_TYPE_TO_EXT.reverseGet(ext);
}

export function getExtForMediaType(mediaType: string) {
    return MEDIA_TYPE_TO_EXT.get(mediaType);
}

//

const MEDIA_TYPE_TO_EXT = new BiMap<string, string>([
    [ IMAGE_JPEG, 'jpg' ],
    [ IMAGE_PNG, 'png' ],
]);
