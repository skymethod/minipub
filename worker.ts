import { APPLICATION_JRD_JSON, APPLICATION_JSON_UTF8, APPLICATION_ACTIVITY_JSON_UTF8, TEXT_PLAIN_UTF8, APPLICATION_ACTIVITY_JSON } from './content_types.ts';
import { computeHttpSignatureHeaders, importKeyFromPem, validateHttpSignature } from './crypto.ts';
import { DurableObjectNamespace, IncomingRequestCf } from './deps.ts';
import { isReplyRequest, isUpdateProfileRequest } from './rpc.ts';
export { StorageDO } from './storage_do.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
        const { method } = request;
        console.log(`${method} ${request.url}`);
        const url = new URL(request.url);
        const signature = request.headers.get('signature');
        if (signature) console.log(`signature: ${signature}`);
        const bodyText = request.body ? await request.text() : undefined;
        if (bodyText) {
            console.log(bodyText);
        }
        const { origin, testUser1Slug, testUser1Name, testUser1PublicKeyPem, testUser1PrivateKeyPem, adminIp, adminPublicKeyPem } = env;
        if (origin && testUser1Slug && testUser1Name && testUser1PublicKeyPem && testUser1PrivateKeyPem && adminIp && adminPublicKeyPem) {
            const whitelisted = ((request.headers.get('cf-connecting-ip') || '') + ',').startsWith(`${adminIp},`);
            console.log('whitelisted', whitelisted);
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
            
            // actor endpoint
            if (url.pathname === `/actors/${testUser1Slug}`) {
                const res = {
                    '@context': [
                        'https://www.w3.org/ns/activitystreams',
                        'https://w3id.org/security/v1',
                    ],
                    ...computeActorObject(testUser1Id, testUser1Name, testUser1PublicKeyPem)
                };
                return new Response(JSON.stringify(res, undefined, 2), { headers: { 'content-type': APPLICATION_ACTIVITY_JSON_UTF8 } });
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
            await Promise.resolve();
        }
        return new Response('not found', { status: 404, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
    }

}

function computeActorObject(actorId: string, preferredUsername: string, publicKeyPem: string) {
    return {
        id: actorId,
        type: 'Person',
        preferredUsername, // mastodon: Used for Webfinger lookup. Must be unique on the domain, and must correspond to a Webfinger acct: URI.
        inbox: `${actorId}/inbox`,
    
        // mastodon: Required for signatures.
        publicKey: { 
            id: `${actorId}#main-key`,
            owner: actorId,
            publicKeyPem,
        },

        name: undefined, // mastodon: Used as profile display name.
    }
}

//

export interface WorkerEnv {
    readonly version?: string;
    readonly pushId?: string;
    readonly origin?: string;
    readonly storageNamespace?: DurableObjectNamespace;
    readonly testUser1Name?: string;
    readonly testUser1Slug?: string;
    readonly testUser1PublicKeyPem?: string;
    readonly testUser1PrivateKeyPem?: string;
    readonly adminIp?: string;
    readonly adminPublicKeyPem?: string;
}

//

function newSlug(): string {
    return crypto.randomUUID().toLowerCase().replaceAll('-', '');
}

async function sendReply(opts: { origin: string, actorId: string, inReplyTo: string, content: string, to: string, inbox: string, privateKey: CryptoKey, dryRun?: boolean }) {
    const { origin, actorId, inReplyTo, content, to, inbox, privateKey, dryRun } = opts;
    const activityId = `${origin}/activities/${newSlug()}`;
    const objectId = `${origin}/objects/${newSlug()}`;

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
    const activityId = `${origin}/activities/${newSlug()}`;

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
