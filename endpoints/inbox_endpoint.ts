import { validateHttpSignature } from '../crypto.ts';
import { fetchPublicKey } from '../fetch_public_key.ts';
import { BackendStorage } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { makeAcceptedResponse, makeBadRequestResponse } from './responses.ts';

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

export async function computeInbox(request: Request, actorUuid: string, _storage: BackendStorage): Promise<Response> {
    const { method, url, headers } = request;
    try {
        const body = await request.text();
        const { keyId, diffMillis } = await validateHttpSignature({ method, url, headers, body, publicKeyProvider: fetchPublicKey });
        console.log('computeInbox: valid!', { keyId, diffMillis, actorUuid });

        // TODO save? push event to actor?

        return makeAcceptedResponse(`thanks, ${keyId}`);
    } catch (e) {
        console.warn(`Error in computeInbox`, e.stack || e);
        return makeBadRequestResponse(`nope`);
    }
}
