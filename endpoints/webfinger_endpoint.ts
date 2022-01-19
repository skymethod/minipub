import { APPLICATION_ACTIVITY_JSON, APPLICATION_JRD_JSON } from '../media_types.ts';
import { computeActorId } from '../rpc/urls.ts';
import { isValidUsername } from '../rpc_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { isValidUuid } from '../uuid.ts';
import { makeNotFoundResponse } from './responses.ts';

// /.well-known/webfinger?resource=acct:bob@my-example.com

export function matchWebfinger(method: string, pathname: string, searchParams: URLSearchParams): { username: string, domain: string } | undefined {
    if (method === 'GET' && pathname === '/.well-known/webfinger') {
        const resource = searchParams.get('resource');
        if (typeof resource === 'string') {
            const m = /^acct:(.*?)@(.*?)$/.exec(resource);
            if (m) {
                const [ _, username, domain ] = m;
                return { username, domain };
            }
        }
    }
}

export async function computeWebfinger(username: string, domain: string, origin: string, storage: BackendStorage): Promise<Response> {
    const originHost = new URL(origin).host;
    if (domain === originHost && isValidUsername(username)) {
        const { actorUuid } = await storage.transaction(async txn => await getRecord(txn, 'i-username-actor', username) || {});
        if (typeof actorUuid === 'string' && isValidUuid(actorUuid)) {
            const subject = `acct:${username}@${originHost}`;
            const res = {
                subject,
                links: [
                    {
                        rel: 'self',
                        type: APPLICATION_ACTIVITY_JSON,
                        href: computeActorId({ origin, actorUuid }),
                    }
                ]
            }
            return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JRD_JSON } });
        }
    }
    return makeNotFoundResponse();
}
