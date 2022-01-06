import { APPLICATION_JSON_UTF8, getMediaTypeForExt } from './media_types.ts';
import { computeHttpSignatureHeaders, exportKeyToPem, generateExportableRsaKeyPair, importKeyFromPem } from './crypto.ts';
import { parseFlags, extname } from './deps_cli.ts';
import { CreateUserRequest, Icon, RpcRequest } from './rpc_model.ts';
import { Bytes } from './deps.ts';

const args = parseFlags(Deno.args);
if (args._.length > 0) {
    await minipub(args._, args);
    Deno.exit(0);
}

dumpHelp();

Deno.exit(1);

async function minipub(args: (string | number)[], options: Record<string, unknown>) {
    const command = args[0];
    const fn = { generate, reply, updateProfile, createUser }[command];
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

async function createUser(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, username, icon, iconSize } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (typeof username !== 'string') throw new Error('Provide username, e.g. --username alice');
    if (icon !== undefined && typeof icon !== 'string') throw new Error('Icon should be file path, e.g. --icon /path/to/alice.jpg');
    if (iconSize !== undefined && typeof iconSize !== 'number') throw new Error('Icon size should be number, e.g. --icon-size 150');

    const privateKey = await readPrivateKey(options);

    const computeIcon = async () => {
        if (icon && iconSize) {
            const bytes = await Deno.readFile(icon);
            const ext = extname(icon).substring(1);
            const mediaType = getMediaTypeForExt(ext);
            if (!mediaType) throw new Error(`Unknown to computed media type for ${ext}`);
            const rt: Icon = {
                bytesBase64: new Bytes(bytes).base64(),
                size: iconSize,
                mediaType,
            }
            return rt;
        }
    }
    const icon_ = await computeIcon();

    const req: CreateUserRequest = {
        kind: 'create-user',
        username,
        icon: icon_,
    };
    await sendRpc(req, origin, privateKey);
}

async function updateProfile(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, inbox } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (typeof inbox !== 'string') throw new Error('Provide inbox, e.g. --inbox https://example.social/users/someone/inbox');
    const dryRun = computeDryRun(options);

    const privateKey = await readPrivateKey(options);

    throw new Error('TODO');
    // const req: UpdateProfileRequest = { 
    //     kind: 'update-profile', 
    //     inbox,
    //     dryRun,
    // };
    // await sendRpc(req, origin, privateKey);
}

async function reply(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, inReplyTo, content, inbox, to } = options;
    
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (typeof inReplyTo !== 'string') throw new Error('Provide inReplyTo, e.g. --inReplyTo https://example.social/users/someone/statuses/123123123123123123');
    if (typeof content !== 'string') throw new Error('Provide content, e.g. --content "<p>Hello world</p>"');
    if (typeof inbox !== 'string') throw new Error('Provide inbox, e.g. --inbox https://example.social/users/someone/inbox');
    if (typeof to !== 'string') throw new Error('Provide to, e.g. --inbox https://example.social/users/someone');

    const privateKey = await readPrivateKey(options);

    throw new Error('TODO');
    // const req: ReplyRequest = { 
    //     kind: 'reply', 
    //     inReplyTo,
    //     content,
    //     inbox,
    //     to,
    // };
    // await sendRpc(req, origin, privateKey);
}

function computeDryRun(options: Record<string, unknown>) {
    return Object.keys(options).includes('dryRun');
}

async function readPrivateKey(options: Record<string, unknown>) {
    const { pem } = options;
    if (typeof pem !== 'string') throw new Error('Provide path to admin pem, e.g. --pem /path/to/admin.private.pem');
    const privatePemText = (await Deno.readTextFile(pem)).trim();
    return await importKeyFromPem(privatePemText, 'private');
}

async function sendRpc(request: RpcRequest, origin: string, privateKey: CryptoKey) {
    const body = JSON.stringify(request);
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
