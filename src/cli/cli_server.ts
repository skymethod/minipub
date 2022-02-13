import { check, isValidOrigin } from '../check.ts';
import { importKeyFromPem } from '../crypto.ts';
import { ConnInfo, serve, ensureDir, dirname } from './deps_cli.ts';
import { computeActivity, matchActivity } from '../endpoints/activity_endpoint.ts';
import { computeActor, matchActor } from '../endpoints/actor_endpoint.ts';
import { computeBlob, matchBlob } from '../endpoints/blob_endpoint.ts';
import { computeInbox, matchInbox } from '../endpoints/inbox_endpoint.ts';
import { computeObject, matchObject } from '../endpoints/object_endpoint.ts';
import { computeRpc, matchRpc } from '../endpoints/rpc_endpoint.ts';
import { computeWebfinger, matchWebfinger } from '../endpoints/webfinger_endpoint.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeServerResponse, ServerAdminBearerTokenChecker, ServerRequestOptionsProvider, ServerRequestRouter } from '../server.ts';
import { MINIPUB_VERSION } from '../version.ts';
import { computeValidateAdminToken } from '../rpc/manage_admin_token.ts';

export const serverDescription = 'Starts a local Minipub server';

export async function server(_args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || Object.keys(options).filter(v => v !== '_').length === 0) { dumpHelp(); return; }

    if (options.port !== undefined && typeof options.port !== 'number') throw new Error(`Provide a valid port number to use for the server, or leave unspecified for default port.  e.g. minipub server --port 2022`);
    const port = typeof options.port === 'number' ? options.port : 2022;
    if (typeof options.db !== 'string') throw new Error('Provide the path to the db used for storage.  e.g. minipub server --db /path/to/storage.db');
    if (typeof options.origin !== 'string') throw new Error('Provide the origin over which this server will be accessed publicly.  e.g. minipub server --origin https://comments.example.com');
    if (typeof options['admin-ip'] !== 'string') throw new Error('Provide the admin ip address, used for rpc calls.  e.g. minipub server --admin-ip 123.21.23.123');
    if (typeof options['admin-public-key-pem'] !== 'string') throw new Error(`Provide a path to the admin's public key pem text file, used for rpc calls.  e.g. minipub server --admin-public-key-pem /path/to/admin.public.pem`);
    const { origin, 'admin-ip': adminIp, 'admin-public-key-pem': adminPublicKeyPem } = options;

    check('origin', origin, isValidOrigin);
    const adminPublicKey = await importKeyFromPem(await Deno.readTextFile(adminPublicKeyPem), 'public');

    await ensureDir(dirname(options.db));
    const storage = makeSqliteStorage(options.db);

    const handler = async (request: Request, connInfo: ConnInfo): Promise<Response> => {

        const computeRequestIp = () => {
            const rt = connInfo.remoteAddr.transport === 'tcp' ? connInfo.remoteAddr.hostname : '<unknown>';
            const cfConnectingIp = request.headers.get('cf-connecting-ip');
            if (cfConnectingIp && rt === '127.0.0.1') {
                // cloudflared tunnel
                return cfConnectingIp;
            }
            return rt;
        };

        const optionsProvider: ServerRequestOptionsProvider = () => {
            const requestIp = computeRequestIp();
            return Promise.resolve({ origin, adminIp, adminPublicKey, requestIp });
        };

        const router: ServerRequestRouter = async opts => {
            const { method, pathname, searchParams, bodyText, fetcher } = opts;

            const inbox = matchInbox(method, pathname); if (inbox && bodyText) return await computeInbox(request, bodyText, inbox.actorUuid, fetcher);
            
            if (matchRpc(method, pathname) && bodyText) return await computeRpc({ json: () => Promise.resolve(JSON.parse(bodyText)) }, origin, storage, fetcher); // assumes auth happened earlier
            const actor = matchActor(method, pathname); if (actor) return await computeActor(actor.actorUuid, storage);
            const object = matchObject(method, pathname); if (object) return await computeObject(object.actorUuid, object.objectUuid, storage);
            const activity = matchActivity(method, pathname); if (activity) return await computeActivity(activity.actorUuid, activity.activityUuid, storage);
            const blob = matchBlob(method, pathname); if (blob) return await computeBlob(blob.actorUuid, blob.blobUuid, blob.ext, storage);
            const webfinger = matchWebfinger(method, pathname, searchParams); if (webfinger) return await computeWebfinger(webfinger.username, webfinger.domain, origin, storage);

        };

        const adminTokenChecker: ServerAdminBearerTokenChecker = async token => {
            const { valid } = await computeValidateAdminToken({ kind: 'validate-admin-token', token }, storage);
            return valid;
        };
        
        return await computeServerResponse(request, optionsProvider, router, adminTokenChecker);
    };

    console.log(`Local server: http://localhost:${port}, assuming public access at ${origin}`);
    await serve(handler, { port });
}


//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        serverDescription,
        '',
        'USAGE:',
        '    minipub server [OPTIONS]',
        '',
        'OPTIONS:',
        `    --port                    Port that the local server will listen on (default: 2022)`,
        `    --db                      (required) Local file path to the underlying database file used for storage (e.g. path/to/storage.db)`,
        `    --origin                  (required) Origin over which this server will be accessed publicly (e.g. https://comments.example.com)`,
        `    --admin-ip                (required) IP address from which to allow admin rpc calls (e.g. 1.2.3.4)`,
        `    --admin-public-key-pem    (required) Path to the admin's public key pem file (e.g. /path/to/admin.public.pem)`,
        '',
        '    --help                    Prints help information',
        '    --verbose                 Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
