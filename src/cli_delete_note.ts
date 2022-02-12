import { parseRpcOptions, sendRpc } from './cli.ts';
import { DeleteNoteRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';
import { MINIPUB_VERSION } from './version.ts';

export const deleteNoteDescription = `Deletes an existing note object, and generates a Delete activity`;

export async function deleteNote(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ objectUuid ] = args;

    if (typeof objectUuid !== 'string' || !isValidUuid(objectUuid)) throw new Error('Provide note object uuid as an argument, e.g. minipub delete-note <uuid>');

    const { origin, privateKey } = await parseRpcOptions(options);

    const req: DeleteNoteRequest = {
        kind: 'delete-note',
        objectUuid,
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        deleteNoteDescription,
        '',
        'USAGE:',
        '    minipub delete-note [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <object-uuid>     The object uuid of the note object to delete',
        '',
        'OPTIONS:',
        `    --origin          (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem             (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '',
        '    --help            Prints help information',
        '    --verbose         Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
