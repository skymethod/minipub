import { parseRpcOptions, sendRpc } from './cli.ts';
import { DeleteFromStorageRequest } from './rpc_model.ts';
import { MINIPUB_VERSION } from './version.ts';

export const deleteFromStorageDescription = `Deletes a value from backend storage on the server`;

export async function deleteFromStorage(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ domain, key ] = args;

    if (typeof domain !== 'string') throw new Error('Provide domain as the first argument, e.g. minipub delete-from-storage <domain> <key>');
    if (typeof key !== 'string') throw new Error('Provide key as the second argument, e.g. minipub delete-from-storage <domain> <key>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: DeleteFromStorageRequest = {
        kind: 'delete-from-storage',
        domain,
        key,
    };
    await sendRpc(req, origin, privateKey);
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        deleteFromStorageDescription,
        '',
        'USAGE:',
        '    minipub delete-from-storage [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        `    <domain>     Storage domain (e.g. actor)`,
        `    <key>        Storage key within the domain (e.g. 85eaf1888c1e42948b5623c88568d19d)`,
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
