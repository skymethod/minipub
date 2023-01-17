import { check, isValidOrigin } from '../check.ts';
import { importKeyFromPem } from '../crypto.ts';
import { MINIPUB_VERSION } from '../version.ts';
import { ConnInfo, serve } from './deps_cli.ts';

export const systemActorServerDescription = 'Starts a local server to serve a system actor';

export async function systemActorServer(_args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || Object.keys(options).filter(v => v !== '_').length === 0) { dumpHelp(); return; }

    if (options.port !== undefined && typeof options.port !== 'number') throw new Error(`Provide a valid port number to use for the server, or leave unspecified for default port.  e.g. minipub system-actor-server --port 2023`);
    const port = typeof options.port === 'number' ? options.port : 2023;
    if (typeof options.origin !== 'string') throw new Error('Provide the origin over which this server will be accessed publicly.  e.g. minipub system-actor-server --origin https://actor.example.com');
    if (typeof options['public-key-pem'] !== 'string') throw new Error(`Provide a path to the system actor public key pem text file.  e.g. minipub system-actor-server --public-key-pem /path/to/system-actor.public.pem`);
    const { origin, 'public-key-pem': publicKeyPemPath } = options;
    const _verbose = !!options.verbose;

    check('origin', origin, isValidOrigin);
    const publicKeyPem = await Deno.readTextFile(publicKeyPemPath);
    await importKeyFromPem(publicKeyPem, 'public'); // validation

    const preferredUsername = 'System';

    const handler = async (request: Request, _connInfo: ConnInfo): Promise<Response> => {
        const { method, url, headers } = request;
        console.log(`${method} ${url}\n${[...headers].map(v => v.join(': ')).join(', ')}`);
        if (method !== 'GET') return new Response(`${method} not supported`, { status: 405 });
        const { pathname, searchParams } = new URL(url);
        if (pathname === '/actor') {
            console.log(`returning actor`);
            const json = JSON.stringify(systemActorJson({ origin, preferredUsername, url: origin, publicKeyPem }), undefined, 2);
            return new Response(json, { headers: { 'content-type': 'application/activity+json; charset=utf-8' } });
        }
        if (pathname === `/.well-known/webfinger`) {
            const resource = searchParams.get('resource') ?? undefined;
            if (resource === `acct:${preferredUsername}@${new URL(origin).host}`) {
                console.log(`returning webfinger`);
                const json = JSON.stringify(webfingerJson({ origin, preferredUsername }), undefined, 2);
                return new Response(json, { headers: { 'content-type': 'application/jrd+json; charset=utf-8' } });
            }
        }
        await Promise.resolve();
        console.log('NOT FOUND');
        return new Response('not found', { status: 404 });
    };

    console.log(`Local server: http://localhost:${port}, assuming public access at ${origin}`);
    await serve(handler, { port });
}

//

const webfingerJson = ({ origin, preferredUsername }: { origin: string, preferredUsername: string }) => ({
    'subject': `acct:${preferredUsername}@${new URL(origin).host}`,
    'aliases': [`${origin}/actor`],
    'links': [
        { 'rel': 'self', 'type': 'application/activity+json', 'href': `${origin}/actor` }
    ]
});

const systemActorJson = ({ origin, preferredUsername, url, publicKeyPem }: { origin: string, preferredUsername: string, url: string, publicKeyPem: string }) => ({
    '@context': [
        'https://www.w3.org/ns/activitystreams', 
        'https://w3id.org/security/v1', 
        { 
            'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers', 
            'toot': 'http://joinmastodon.org/ns#', 
            'featured': { '@id': 'toot:featured', '@type': '@id' }, 
            'featuredTags': { '@id': 'toot:featuredTags', '@type': '@id' }, 
            'alsoKnownAs': { '@id': 'as:alsoKnownAs', '@type': '@id' }, 
            'movedTo': { '@id': 'as:movedTo', '@type': '@id' }, 
            'schema': 'http://schema.org#', 
            'PropertyValue': 'schema:PropertyValue', 
            'value': 'schema:value', 
            'discoverable': 'toot:discoverable', 
            'Device': 'toot:Device', 
            'Ed25519Signature': 'toot:Ed25519Signature', 
            'Ed25519Key': 'toot:Ed25519Key', 
            'Curve25519Key': 'toot:Curve25519Key', 
            'EncryptedMessage': 'toot:EncryptedMessage', 
            'publicKeyBase64': 'toot:publicKeyBase64', 
            'deviceId': 'toot:deviceId', 
            'claim': { '@type': '@id', '@id': 'toot:claim' }, 
            'fingerprintKey': { '@type': '@id', '@id': 'toot:fingerprintKey' }, 
            'identityKey': { '@type': '@id', '@id': 'toot:identityKey' }, 
            'devices': { '@type': '@id', '@id': 'toot:devices' }, 
            'messageFranking': 'toot:messageFranking', 
            'messageType': 'toot:messageType', 
            'cipherText': 'toot:cipherText', 
            'suspended': 'toot:suspended' 
        }
    ], 
    'id': `${origin}/actor`, 
    'type': 'Application', 
    'inbox': `${origin}/actor/inbox`, // required, but never called
    preferredUsername,
    url,
    'manuallyApprovesFollowers': true, 
    'publicKey': { 
        'id': `${origin}/actor#main-key`, 
        'owner': `${origin}/actor`, 
        publicKeyPem,
    }, 
});

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        systemActorServerDescription,
        '',
        'USAGE:',
        '    minipub system-actor-server [OPTIONS]',
        '',
        'OPTIONS:',
        `    --port                    Port that the local server will listen on (default: 2023)`,
        `    --origin                  (required) Origin over which this server will be accessed publicly (e.g. https://actor.example.com)`,
        `    --public-key-pem          (required) Path to the system actor public key pem file (e.g. /path/to/system-actor.public.pem)`,
        '',
        '    --help                    Prints help information',
        '    --verbose                 Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
