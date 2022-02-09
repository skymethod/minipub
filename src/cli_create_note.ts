import { isValidLang, isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { CreateNoteRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';
import { MINIPUB_VERSION } from './version.ts';

export const createNoteDescription = 'Creates a Note object and associated Activity on the server';

export async function createNote(args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || args.length === 0) { dumpHelp(); return; }

    const [ actorUuid ] = args;
    const { 'in-reply-to': inReplyTo, content, 'content-lang': contentLang, to, cc } = options;

    if (typeof actorUuid !== 'string' || !isValidUuid(actorUuid)) throw new Error('Provide user uuid as an argument, e.g. minipub update-user <uuid>');
    if (inReplyTo !== undefined && (typeof inReplyTo !== 'string' || !isValidUrl(inReplyTo))) throw new Error(`'in-reply-to' should be a url`);
    if (typeof content !== 'string' || content === '') throw new Error(`'content' should be a non-empty string`);
    if (contentLang !== undefined && (typeof contentLang !== 'string' || !isValidLang(contentLang))) throw new Error(`'content-lang' should be a valid language code`);
    if (typeof to !== 'string' || !isValidUrl(to)) throw new Error(`'to' should be a valid url`);
    if (cc !== undefined && (typeof cc !== 'string' || !isValidUrl(cc))) throw new Error(`'cc' should be a valid url`);
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: CreateNoteRequest = {
        kind: 'create-note',
        actorUuid,
        inReplyTo,
        content: { lang: contentLang || 'und', value: content },
        to: [ to ],
        cc: cc ? [ cc ] : undefined,
    };
    await sendRpc(req, origin, privateKey);
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        createNoteDescription,
        '',
        'USAGE:',
        '    minipub create-note [ARGS] [OPTIONS]',
        '',
        'ARGS:',
        '    <actor-uuid>      The actor uuid responsible for creating the Note',
        '',
        'OPTIONS:',
        `    --origin          (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem             (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        '    --content         (required) Content used as the body of the Note',
        `    --content-lang    Language code for the content (default: 'und')`,
        `    --to              (required) ActivityPub 'to' attribute, should be a valid url`,
        `    --cc              ActivityPub 'cc' attribute, should be a valid url`,
        `    --in-reply-to     ActivityPub 'inReplyTo' attribute`,
        '',
        '    --help            Prints help information',
        '    --verbose         Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
