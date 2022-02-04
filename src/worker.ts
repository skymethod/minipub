import { importKeyFromPem } from './crypto.ts';
import { DurableObjectNamespace, IncomingRequestCf } from './deps.ts';
import { matchActor } from './endpoints/actor_endpoint.ts';
import { matchBlob } from './endpoints/blob_endpoint.ts';
import { matchWebfinger } from './endpoints/webfinger_endpoint.ts';
import { matchObject } from './endpoints/object_endpoint.ts';
import { matchActivity } from './endpoints/activity_endpoint.ts';
import { computeInbox, matchInbox } from './endpoints/inbox_endpoint.ts';
import { computeServerResponse, ServerRequestOptionsProvider, ServerRequestRouter } from './server.ts';
export { BackendDO } from './backend_do.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {

        const optionsProvider: ServerRequestOptionsProvider = async () => {
            const { origin, adminIp, adminPublicKeyPem } = env;
            if (typeof origin !== 'string') throw new Error(`Missing 'origin' environment variable`);
            if (typeof adminIp !== 'string') throw new Error(`Missing 'adminIp' environment variable`);
            if (typeof adminPublicKeyPem !== 'string') throw new Error(`Missing 'adminPublicKeyPem' environment variable`);

            const adminPublicKey = await importKeyFromPem(adminPublicKeyPem, 'public');

            const requestIp = request.headers.get('cf-connecting-ip') || '';

            return { origin, adminIp, adminPublicKey, requestIp };
        };

        const router: ServerRequestRouter = async opts => {
            const { isRpc, method, pathname, searchParams, headers, bodyText, canonicalUrl, fetcher } = opts;

            const { backendName, backendNamespace } = env;
            if (typeof backendName !== 'string') throw new Error(`Missing 'backendName' environment variable`);
            if (backendNamespace === undefined) throw new Error(`Missing 'backendNamespace' environment variable`);

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
            const inbox = matchInbox(method, pathname); if (inbox && bodyText) return await computeInbox(request, bodyText, inbox.actorUuid, fetcher);
        }
        return await computeServerResponse(request, optionsProvider, router);
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
