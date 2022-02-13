import { parseRpcOptions, sendRpc } from '../cli.ts';
import { UndoLikeRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const undoLikeDescription = 'Creates a Undo activity for a given local Like activity on the server';

export async function undoLike(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ activityUuid ] = args;

    if (typeof activityUuid !== 'string' || !isValidUuid(activityUuid)) throw new Error('Provide the like activity uuid as the first argument, e.g. minipub undo-like <uuid>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: UndoLikeRequest = {
        kind: 'undo-like',
        activityUuid,
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        undoLikeDescription,
        '',
        'USAGE:',
        '    minipub undo-like [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <activity-uuid>    The uuid of the original Like activity',
        '',
        'OPTIONS:',
        `    --origin           (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem              (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '',
        '    --help             Prints help information',
        '    --verbose          Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
