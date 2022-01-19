import { isValidLang, isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { CreateNoteRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function createNote(args: (string | number)[], options: Record<string, unknown>) {
    const [ actorUuid ] = args;
    const { 'in-reply-to': inReplyTo, content, 'content-lang': contentLang, to } = options;

    if (typeof actorUuid !== 'string' || !isValidUuid(actorUuid)) throw new Error('Provide user uuid as an argument, e.g. minipub update-user <uuid>');
    if (inReplyTo !== undefined && (typeof inReplyTo !== 'string' || !isValidUrl(inReplyTo))) throw new Error('InReplyTo should be a url');
    if (typeof content !== 'string' || content === '') throw new Error('Content should be a non-empty string');
    if (contentLang !== undefined && (typeof contentLang !== 'string' || !isValidLang(contentLang))) throw new Error('ContentLang should be a valid lang');
    if (typeof to !== 'string' || !isValidUrl(to)) throw new Error('To should be a valid url');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: CreateNoteRequest = {
        kind: 'create-note',
        actorUuid,
        inReplyTo,
        content: { lang: 'en', value: content },
        to: [ to ]
    };
    await sendRpc(req, origin, privateKey);
}
