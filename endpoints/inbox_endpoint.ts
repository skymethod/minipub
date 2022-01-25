import { ApObject } from '../activity_pub/ap_object.ts';
import { isStringRecord } from '../check.ts';
import { validateHttpSignature } from '../crypto.ts';
import { Fetcher } from '../fetcher.ts';
import { fetchPublicKey, GoneError } from '../fetch_public_key.ts';
import { BackendStorage } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { Responses } from './responses.ts';

export function matchInbox(method: string, pathname: string): { actorUuid: string } | undefined {
    if (method === 'POST') {
        const m = /^\/actors\/([0-9a-f]+)\/inbox$/.exec(pathname);
        if (m) {
            const actorUuid = m[1];
            if (isValidUuid(actorUuid)) {
                return { actorUuid };
            }
        }
    }
}

export async function computeInbox(request: Request, actorUuid: string, _storage: BackendStorage, fetcher: Fetcher): Promise<Response> {
    const { method, url, headers } = request;
    let body: string | undefined;
    try {
        body = await request.text();
        const { keyId, diffMillis } = await validateHttpSignature({ method, url, headers, body, publicKeyProvider: keyId => fetchPublicKey(keyId, fetcher) });
        console.log('computeInbox: valid!', { keyId, diffMillis, actorUuid });
        // TODO save? push event to actor?
        return Responses.accepted(`thanks, ${keyId}`);
    } catch (e) {
        if (body && e instanceof GoneError) {
            const { keyId, keyIdUrl } = e;
            // when mastodon deletes users, it posts a Delete activity with 'actor' and 'object' equal to the actor id url, and returns 410 from any fetch to that url
            // so we can't verify the signature obviously, since the actor is no longer available
            if (isDeleteActorRequestBody(body, keyIdUrl)) {
                console.log('computeInbox: delete actor, verified gone', { keyId, keyIdUrl });
                // TODO save? push event to actor?
                return Responses.accepted(`thanks, ${keyId}`);
            }
        }
        console.warn(`Error in computeInbox`, e.stack || e);
        return Responses.badRequest(`nope`);
    }
}

export function isDeleteActorRequestBody(body: string, keyIdUrl: string): boolean {
    const obj = JSON.parse(body);
    if (isStringRecord(obj) && isStringRecord(obj.signature) && obj.signature.type === 'RsaSignature2017') {
        // mastodon includes a non-standard property that is going to fail AP validation
        // https://docs.joinmastodon.org/spec/security/#ld-sign
        delete obj.signature;
    }
    const apo = ApObject.parseObj(obj);
    return apo.type.toString() === 'https://www.w3.org/ns/activitystreams#Delete' 
        && apo.optIriString('actor') === keyIdUrl
        && apo.optIriString('object') === keyIdUrl
        ;
}
