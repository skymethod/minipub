import { isValidLang } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { UpdateNoteRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';
import { MINIPUB_VERSION } from './version.ts';

export const updateNoteDescription = `Updates the content for an existing note object, and generates an Update activity if modified`;

export async function updateNote(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ objectUuid ] = args;

    if (typeof objectUuid !== 'string' || !isValidUuid(objectUuid)) throw new Error('Provide note object uuid as an argument, e.g. minipub update-note <uuid>');

    const { content, 'content-lang': contentLang } = options;
    if (typeof content !== 'string' || content === '') throw new Error(`'content' should be a non-empty string`);
    if (contentLang !== undefined && (typeof contentLang !== 'string' || !isValidLang(contentLang))) throw new Error(`'content-lang' should be a valid language code`);

    const { origin, privateKey } = await parseRpcOptions(options);

    const req: UpdateNoteRequest = {
        kind: 'update-note',
        objectUuid,
        content: { lang: contentLang || 'und', value: content },
    };
    await sendRpc(req, origin, { privateKey });
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        updateNoteDescription,
        '',
        'USAGE:',
        '    minipub update-note [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <object-uuid>     The object uuid of the note object to update',
        '',
        'OPTIONS:',
        `    --origin          (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem             (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '    --content         (required) New content used as the body of the Note',
        `    --content-lang    Language code for the content (default: 'und')`,
        '',
        '    --help            Prints help information',
        '    --verbose         Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
