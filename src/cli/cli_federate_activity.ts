import { parseRpcOptions, sendRpc } from '../cli.ts';
import { FederateActivityRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const federateActivityDescription = `Federates an existing activity to its remote recipients, if any`;

export async function federateActivity(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ activityUuid ] = args;
    const dryRun = !!options['dry-run'];

    if (typeof activityUuid !== 'string' || !isValidUuid(activityUuid)) throw new Error('Provide activity uuid as an argument, e.g. minipub federate-activity <uuid>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: FederateActivityRequest = {
        kind: 'federate-activity',
        activityUuid,
        dryRun,
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        federateActivityDescription,
        '',
        'USAGE:',
        '    minipub federate-activity [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <activity-uuid>    The activity uuid to federate',
        '',
        'OPTIONS:',
        `    --origin           (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem              (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        `    --dry-run          Compute the receipients and the remote http call, but don't actually make the call`,
        '',
        '    --help             Prints help information',
        '    --verbose          Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
