import { check, isValidOrigin } from '../check.ts';
import { importKeyFromPem } from '../crypto.ts';
import { computeSystemActorResponse, computeWebfingerResponse, computeWebfingerSubject } from '../system_actor.ts';
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

    const actorUsername = 'system';
    const actorSubject = computeWebfingerSubject({ origin, actorUsername });
    const actorPathname = '/actor';

    const handler = async (request: Request, _connInfo: ConnInfo): Promise<Response> => {
        const { method, url, headers } = request;
        console.log(`${method} ${url}\n${[...headers].map(v => v.join(': ')).join(', ')}`);
        if (method !== 'GET') return new Response(`${method} not supported`, { status: 405 });
        const { pathname, searchParams } = new URL(url);
        if (pathname === actorPathname) {
            console.log(`returning actor`);
            const { body, contentType } = computeSystemActorResponse({ origin, actorUsername, actorPathname, url: origin, publicKeyPem });
            return new Response(JSON.stringify(body, undefined, 2), { headers: { 'content-type': contentType } });
        }
        if (pathname === `/.well-known/webfinger`) {
            const resource = searchParams.get('resource') ?? undefined;
            if (resource === actorSubject) {
                console.log(`returning webfinger`);
                const { body, contentType } = computeWebfingerResponse({ origin, actorUsername, actorPathname });
                return new Response(JSON.stringify(body, undefined, 2), { headers: { 'content-type': contentType } });
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
