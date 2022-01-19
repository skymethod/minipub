import { TEXT_PLAIN_UTF8, APPLICATION_ACTIVITY_JSON } from './media_types.ts';
import { computeHttpSignatureHeaders, importKeyFromPem, validateHttpSignature } from './crypto.ts';
import { DurableObjectNamespace, IncomingRequestCf } from './deps.ts';
import { matchActor } from './endpoints/actor_endpoint.ts';
import { matchBlob } from './endpoints/blob_endpoint.ts';
import { matchRpc } from './endpoints/rpc_endpoint.ts';
import { newUuid } from './uuid.ts';
import { matchWebfinger } from './endpoints/webfinger_endpoint.ts';
import { matchObject } from './endpoints/object_endpoint.ts';
import { makeErrorResponse, makeNotFoundResponse } from './endpoints/responses.ts';
export { BackendDO } from './backend_do.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
        const { url, method, headers } = request;
        const urlObj = new URL(url);
        const { pathname, searchParams } = urlObj;
        const signature = headers.get('signature');
        if (signature) console.log(`signature: ${signature}`);
        try {
            const bodyText = request.body ? await request.text() : undefined;
            if (bodyText) {
                console.log(bodyText);
            }
            const { origin, adminIp, adminPublicKeyPem, backendNamespace, backendName } = env;
            if (origin && adminIp && adminPublicKeyPem && backendNamespace && backendName) {
                const whitelisted = ((headers.get('cf-connecting-ip') || '') + ',').startsWith(`${adminIp},`);
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
                        return adminPublicKey;
                    };
                    const { diffMillis } = await validateHttpSignature({ method, url: request.url, body: bodyText, headers: request.headers, publicKeyProvider });
                    console.log(`admin request sent ${diffMillis} millis ago`);
                }
                const routeToDurableObject = isRpc
                    || matchActor(method, pathname)
                    || matchObject(method, pathname)
                    || matchBlob(method, pathname)
                    || matchWebfinger(method, pathname, searchParams)
                    ;

                if (routeToDurableObject) {
                    const doHeaders = new Headers(headers);
                    doHeaders.set('do-name', backendName);
                    return await backendNamespace.get(backendNamespace.idFromName(backendName)).fetch(canonicalUrl, { method, headers: doHeaders, body: bodyText });
                }
            }
            return makeNotFoundResponse();
        } catch (e) {
            return makeErrorResponse(e);
        }
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

async function sendReply(opts: { origin: string, actorId: string, inReplyTo: string, content: string, to: string, inbox: string, privateKey: CryptoKey, dryRun?: boolean }) {
    const { origin, actorId, inReplyTo, content, to, inbox, privateKey, dryRun } = opts;
    const activityId = `${origin}/activities/${newUuid()}`;
    const objectId = `${origin}/objects/${newUuid()}`;

    const req = {
        '@context': 'https://www.w3.org/ns/activitystreams',

        id: activityId,
        type: 'Create',
        actor: actorId,

        object: {
            id: objectId,
            type: 'Note',
            published: new Date().toISOString(),
            attributedTo: actorId,
            inReplyTo,
            content,
            to,
        }
    };
    const url = inbox;
    const keyId = `${actorId}#main-key`;
    await sendServerToServerActivityPub({ req, url, keyId, privateKey, dryRun });
}

async function sendUpdateProfile(opts: { origin: string, actorId: string, inbox: string, privateKey: CryptoKey, object: unknown, dryRun?: boolean }) {
    const { origin, actorId, inbox, privateKey, object, dryRun } = opts;
    const activityId = `${origin}/activities/${newUuid()}`;

    const req = {
        '@context': 'https://www.w3.org/ns/activitystreams',

        id: activityId,
        type: 'Update',
        actor: actorId,

        object,
    };
    const url = inbox;
    const keyId = `${actorId}#main-key`;
    await sendServerToServerActivityPub({ req, url, keyId, privateKey, dryRun });
}

async function sendServerToServerActivityPub(opts: { req: unknown, url: string, keyId: string, privateKey: CryptoKey, dryRun?: boolean }) {
    const { req, url, keyId, privateKey, dryRun } = opts;
    const body = JSON.stringify(req, undefined, 2);
    const method = 'POST';
    const { signature, date, digest, stringToSign } = await computeHttpSignatureHeaders({ method, url, body, privateKey, keyId });
    const headers = new Headers({ date, signature, digest, 'content-type': APPLICATION_ACTIVITY_JSON });
    console.log(`EXTERNAL FETCH ${method} ${url}`);
    console.log('headers:');
    console.log([...headers].map(v => v.join(': ')).join('\n'));
    console.log('stringToSign:');
    console.log(stringToSign);
    console.log('body:');
    console.log(body);
    if (dryRun) {
        console.log('DRY RUN!');
        return;
    }
    const request = new Request(url, { method, headers, body });
    const res = await fetch(request);
    console.log(res);
    console.log(await res.text());
}
