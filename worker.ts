import { TEXT_PLAIN_UTF8, APPLICATION_ACTIVITY_JSON } from './media_types.ts';
import { computeHttpSignatureHeaders } from './crypto.ts';
import { DurableObjectNamespace, IncomingRequestCf } from './deps.ts';
import { matchActor } from './endpoints/actor_endpoint.ts';
import { matchBlob } from './endpoints/blob_endpoint.ts';
import { matchRpc } from './endpoints/rpc_endpoint.ts';
import { newUuid } from './uuid.ts';
export { BackendDO } from './backend_do.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
        const { url, method, headers } = request;
        console.log(`${method} ${url}`);
        const { pathname } = new URL(url);
        const signature = headers.get('signature');
        if (signature) console.log(`signature: ${signature}`);
        const bodyText = request.body ? await request.text() : undefined;
        if (bodyText) {
            console.log(bodyText);
        }
        const { origin, adminIp, adminPublicKeyPem, backendNamespace, backendName } = env;
        if (origin && adminIp && adminPublicKeyPem && backendNamespace && backendName) {
            const whitelisted = ((headers.get('cf-connecting-ip') || '') + ',').startsWith(`${adminIp},`);
            console.log('whitelisted', whitelisted);

            if (matchRpc(method, pathname) && whitelisted) {
                const doHeaders = new Headers(headers);
                doHeaders.set('do-name', backendName);
                return await backendNamespace.get(backendNamespace.idFromName(backendName)).fetch(url, { method, headers: doHeaders, body: bodyText });
            }

            if (matchActor(method, pathname)) {
                const doHeaders = new Headers(headers);
                doHeaders.set('do-name', backendName);
                return await backendNamespace.get(backendNamespace.idFromName(backendName)).fetch(url, { method, headers: doHeaders, body: bodyText });
            }

            if (matchBlob(method, pathname)) {
                const doHeaders = new Headers(headers);
                doHeaders.set('do-name', backendName);
                return await backendNamespace.get(backendNamespace.idFromName(backendName)).fetch(url, { method, headers: doHeaders, body: bodyText });
            }

/*
            const testUser1Id = `${origin}/actors/${testUser1Slug}`;

            // rpc endpoint
            if (url.pathname === '/rpc' && whitelisted && request.method === 'POST' && bodyText) {
                const adminPublicKey = await importKeyFromPem(adminPublicKeyPem, 'public');
                const publicKeyProvider = (keyId: string) => {
                    if (keyId !== 'admin') throw new Error(`Unsupported keyId: ${keyId}`);
                    return adminPublicKey;
                };
                try {
                    const { diffMillis } = await validateHttpSignature({ method, url: request.url, body: bodyText, headers: request.headers, publicKeyProvider });
                    console.log(`admin request sent ${diffMillis} millis ago`);
                    const obj = JSON.parse(bodyText);
                    console.log(JSON.stringify(obj, undefined, 2));

                    if (isReplyRequest(obj)) {
                        // issue activity pub federation call
                        const { inReplyTo, content, inbox, to, dryRun } = obj;
                        const privateKey = await importKeyFromPem(testUser1PrivateKeyPem, 'private');
                        
                        await sendReply({ inReplyTo, inbox, content, origin, actorId: testUser1Id, to, privateKey, dryRun });
                        // TODO save to storage
                        return new Response(JSON.stringify({ status: dryRun ? 'unsent' : 'sent' }), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
                    }
                    if (isUpdateProfileRequest(obj)) {
                        // issue activity pub federation call
                        const { inbox, dryRun } = obj;
                        const privateKey = await importKeyFromPem(testUser1PrivateKeyPem, 'private');
                        
                        const object = computeActorObject(testUser1Id, testUser1Name, testUser1PublicKeyPem);
                        await sendUpdateProfile({ inbox, origin, actorId: testUser1Id, privateKey, object, dryRun });
                        return new Response(JSON.stringify({ status: dryRun ? 'unsent' : 'sent' }), { headers: { 'content-type': APPLICATION_JSON_UTF8 } });
                    }
                    throw new Error(`Unknown rpc request: ${JSON.stringify(obj)}`);
                } catch (e) {
                    return new Response(`${e}`, { status: 400, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
                }
            }

            // webfinger endpoint
            if (url.pathname === '/.well-known/webfinger') {
                // /.well-known/webfinger?resource=acct:bob@my-example.com
                const resource = url.searchParams.get('resource');
                const testUser1Account = `acct:${testUser1Name}@${new URL(origin).hostname}`;
                console.log(resource, testUser1Account);
                if (resource === testUser1Account) {
                    const res = {
                        subject: testUser1Account,
                        links: [
                            {
                                rel: 'self',
                                type: 'application/activity+json',
                                href: testUser1Id,
                            }
                        ]
                    }
                    return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_JRD_JSON } });
                }
            }
            */
        }
        return new Response('not found', { status: 404, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
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
