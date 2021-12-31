import { APPLICATION_JSON_UTF8 } from './content_types.ts';
import { computeHttpSignatureHeaders, exportKeyToPem, generateExportableRsaKeyPair, importKeyFromPem } from './crypto.ts';
import { parseFlags } from './deps_cli.ts';
import { ReplyRequest } from './rpc.ts';

const args = parseFlags(Deno.args);
if (args._.length > 0) {
    await minipub(args._, args);
    Deno.exit(0);
}

dumpHelp();

Deno.exit(1);

async function minipub(args: (string | number)[], options: Record<string, unknown>) {
    const command = args[0];
    const fn = { generate, reply }[command];
    if (options.help || !fn) {
        dumpHelp();
        return;
    }
    await fn(args.slice(1), options);
}

async function generate(_args: (string | number)[], options: Record<string, unknown>) {
    const json = Object.keys(options).includes('json');

    const key = await generateExportableRsaKeyPair();
    
    const privatePemText = await exportKeyToPem(key.privateKey, 'private');
    const publicPemText = await exportKeyToPem(key.publicKey, 'public');
    if (json) {
        console.log(JSON.stringify({ privatePemText, publicPemText }, undefined, 2));
    } else {
        console.log(privatePemText);
        console.log(publicPemText);
    }
}

async function reply(_args: (string | number)[], options: Record<string, unknown>) {
    const { pem, origin, inReplyTo, content, inbox, to } = options;
    if (typeof pem !== 'string') throw new Error('Provide path to admin pem, e.g. --pem /path/to/admin.private.pem');
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (typeof inReplyTo !== 'string') throw new Error('Provide inReplyTo, e.g. --inReplyTo https://example.social/users/someone/statuses/123123123123123123');
    if (typeof content !== 'string') throw new Error('Provide content, e.g. --content "<p>Hello world</p>"');
    if (typeof inbox !== 'string') throw new Error('Provide inbox, e.g. --inbox https://example.social/users/someone/inbox');
    if (typeof to !== 'string') throw new Error('Provide to, e.g. --inbox https://example.social/users/someone');

    const privatePemText = (await Deno.readTextFile(pem)).trim();
    const privateKey = await importKeyFromPem(privatePemText, 'private');
    console.log(privateKey);

    const req: ReplyRequest = { 
        kind: 'reply', 
        inReplyTo,
        content,
        inbox,
        to,
    };
    const body = JSON.stringify(req);
    const method = 'POST';
    const url = `${origin}/rpc`;
    const keyId = 'admin';
    const { signature, date, digest, stringToSign } = await computeHttpSignatureHeaders({ method, url, body, privateKey, keyId })
    const headers = new Headers({ date, signature, digest, 'content-type': APPLICATION_JSON_UTF8 });
    console.log([...headers].map(v => v.join(': ')).join('\n'));
    console.log(stringToSign);

    const res = await fetch(url, { method, body, headers });
    console.log(res);
    console.log(await res.text());
}

function dumpHelp() {
    const lines = [
        `minipub-cli`,
        'Tools for minipub',
        '',
        'USAGE:',
        '',
        'FLAGS:',
        '    -h, --help        Prints help information',
        '        --verbose     Toggle verbose output (when applicable)',
        '',
        'ARGS:',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
