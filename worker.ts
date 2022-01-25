import { importKeyFromPem, validateHttpSignature } from './crypto.ts';
import { DurableObjectNamespace, IncomingRequestCf } from './deps.ts';
import { matchActor } from './endpoints/actor_endpoint.ts';
import { matchBlob } from './endpoints/blob_endpoint.ts';
import { matchRpc } from './endpoints/rpc_endpoint.ts';
import { matchWebfinger } from './endpoints/webfinger_endpoint.ts';
import { matchObject } from './endpoints/object_endpoint.ts';
import { Responses } from './endpoints/responses.ts';
import { matchActivity } from './endpoints/activity_endpoint.ts';
import { computeInbox, matchInbox } from './endpoints/inbox_endpoint.ts';
import { check, isValidOrigin } from './check.ts';
import { makeMinipubFetcher } from "./fetcher.ts";
export { BackendDO } from './backend_do.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
        const response = await computeResponse(request, env);
        console.log(`${response.status} response, content-type=${response.headers.get('content-type')}`);
        return response;
    }

}

//

export interface WorkerEnv {
    readonly version?: string;
    readonly pushId?: string;
    readonly origin?: string;
    readonly backendNamespace?: DurableObjectNamespace;
    readonly backendName?: string;
    readonly adminIp?: string;
    readonly adminPublicKeyPem?: string;
}

//

async function computeResponse(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
    const { url, method, headers } = request;
    const urlObj = new URL(url);
    const { pathname, searchParams } = urlObj;
    console.log(`${method} ${url}`);
    try {
        const bodyText = request.body ? await request.text() : undefined;
        if (!!request.body || bodyText) console.log('request.hasBody', !!request.body, 'bodyText', bodyText);
        const { origin, adminIp, adminPublicKeyPem, backendNamespace, backendName } = env;
        if (origin && adminIp && adminPublicKeyPem && backendNamespace && backendName) {
            check('origin', origin, isValidOrigin);
            const whitelisted = ((headers.get('cf-connecting-ip') || '') + ',').startsWith(`${adminIp},`);
            if (!whitelisted) {
                for (const [ name, value ] of headers.entries()) {
                    console.log(`  ${name}: ${value}`);
                }
            }
            console.log('whitelisted', whitelisted);
            let canonicalUrl = url;
            if (urlObj.origin !== origin) {
                canonicalUrl = url.replace(urlObj.origin, origin);
                console.log('canonicalUrl', canonicalUrl);
            }

            const isRpc = whitelisted && bodyText && matchRpc(method, pathname);
            if (isRpc) {
                // auth is required (admin)
                // check http signature
                const adminPublicKey = await importKeyFromPem(adminPublicKeyPem, 'public');
                const publicKeyProvider = (keyId: string) => {
                    if (keyId !== 'admin') throw new Error(`Unsupported keyId: ${keyId}`);
                    return Promise.resolve(adminPublicKey);
                };
                const { diffMillis } = await validateHttpSignature({ method, url: request.url, body: bodyText, headers: request.headers, publicKeyProvider });
                console.log(`admin request sent ${diffMillis} millis ago`);
            }

            // routes handled by durable object
            const routeToDurableObject = isRpc
                || matchActor(method, pathname)
                || matchObject(method, pathname)
                || matchActivity(method, pathname)
                || matchBlob(method, pathname)
                || matchWebfinger(method, pathname, searchParams)
                ;

            if (routeToDurableObject) {
                const doHeaders = new Headers(headers);
                doHeaders.set('do-name', backendName);
                const body = (method === 'GET' || method === 'HEAD') ? undefined : bodyText;
                return await backendNamespace.get(backendNamespace.idFromName(backendName)).fetch(canonicalUrl, { method, headers: doHeaders, body });
            }

            // routes handled in entry-point worker
            const fetcher = makeMinipubFetcher({ origin });
            const inbox = matchInbox(method, pathname); if (inbox && bodyText) return await computeInbox(request, bodyText, inbox.actorUuid, fetcher);
        }
        return Responses.notFound();
    } catch (e) {
        console.error('Error in worker', e.stack || e);
        return Responses.internalServerError(e);
    }
}
