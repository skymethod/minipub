import { sendRpc } from '../cli.ts';
import { parseUserOptions } from './cli_create_user.ts';
import { UpdateUserRequest } from '../rpc_model.ts';
import { isValidUuid } from '../uuid.ts';
import { MINIPUB_VERSION } from '../version.ts';

export const updateUserDescription = 'Updates a existing user (Actor) on the server';

export async function updateUser(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ actorUuid ] = args;
    if (typeof actorUuid !== 'string' || !isValidUuid(actorUuid)) throw new Error('Provide user uuid as an argument, e.g. minipub update-user <uuid>');
    const { origin, privateKey, username, icon, name, url } = await parseUserOptions(options);
    if ([username, name, icon].every(v => v === undefined)) throw new Error(`Specify at least one property to update`);

    const req: UpdateUserRequest = {
        kind: 'update-user',
        actorUuid,
        username,
        name,
        url,
        icon,
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        updateUserDescription,
        '',
        'USAGE:',
        '    minipub update-user [OPTIONS]',
        '',
        'OPTIONS:',
        `    --origin       (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem          (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        `    --username     New unique username for the user`,
        `    --name         New display name of the user`,
        `    --url          New url of the user profile`,
        `    --icon         New local path to square profile icon, either a .png or .jpg file`,
        `    --icon-size    New width of the square profile icon, in pixels`,
        '',
        '    --help         Prints help information',
        '    --verbose      Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
