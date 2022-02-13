import { parseRpcOptions, sendRpc } from '../cli.ts';
import { RevokeAdminTokenRequest } from '../rpc_model.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const revokeAdminTokenDescription = `Revokes the existing admin bearer token, allowing access only via http-signed calls`;

export async function revokeAdminToken(_args: (string | number)[], options: Record<string, unknown>) {
    if (options.help) { dumpHelp(); return; }

    const { origin, privateKey } = await parseRpcOptions(options);

    const req: RevokeAdminTokenRequest = {
        kind: 'revoke-admin-token',
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        revokeAdminTokenDescription,
        '',
        'USAGE:',
        '    minipub revoke-admin-token [ARGS] [OPTIONS]',
        '',
        'OPTIONS:',
        `    --origin     (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem        (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '',
        '    --help       Prints help information',
        '    --verbose    Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
