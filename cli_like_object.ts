import { isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { LikeObjectRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';
import { MINIPUB_VERSION } from './version.ts';

export const likeObjectDescription = 'Creates a local Like activity on the server for a given remote object id';

export async function likeObject(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ actorUuid, objectId ] = args;

    if (typeof actorUuid !== 'string' || !isValidUuid(actorUuid)) throw new Error('Provide user uuid as the first argument, e.g. minipub like-object <actor-uuid> <object-id>');
    if (typeof objectId !== 'string' || !isValidUrl(objectId)) throw new Error('Provide the remote object id (should be an url) as the second argument, e.g. minipub like-object <actor-uuid> <object-id>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: LikeObjectRequest = {
        kind: 'like-object',
        actorUuid,
        objectId,
    };
    await sendRpc(req, origin, privateKey);
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        likeObjectDescription,
        '',
        'USAGE:',
        '    minipub like-object [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <actor-uuid>    The uuid of the user doing the liking',
        '    <object-id>     Remote ActivityPub object id target of the like (e.g. https://example.social/users/bob/statuses/123456123456123456)',
        '',
        'OPTIONS:',
        `    --origin        (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem           (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '',
        '    --help          Prints help information',
        '    --verbose       Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
