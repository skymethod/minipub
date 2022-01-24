import { APPLICATION_JSON_UTF8 } from './media_types.ts';
import { computeHttpSignatureHeaders, exportKeyToPem, generateExportableRsaKeyPair, importKeyFromPem } from './crypto.ts';
import { parseFlags } from './deps_cli.ts';
import { RpcRequest } from './rpc_model.ts';
import { activityPub } from './cli_activity_pub.ts';
import { createUser } from './cli_create_user.ts';
import { updateUser } from './cli_update_user.ts';
import { createNote } from './cli_create_note.ts';
import { federateActivity } from './cli_federate_activity.ts';
import { newUuid } from './uuid.ts';
import { validateHttpSignature } from './cli_validate_http_signature.ts';
import { ApObject } from './activity_pub/ap_object.ts';
import { deleteFromStorage } from './cli_delete_from_storage.ts';
import { likeObject } from './cli_like_object.ts';

export async function parseRpcOptions(options: Record<string, unknown>) {
    const { origin, pem } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mp.whatever.com');
    if (typeof pem !== 'string') throw new Error('Provide path to admin pem, e.g. --pem /path/to/admin.private.pem');
    const privatePemText = (await Deno.readTextFile(pem)).trim();
    const privateKey = await importKeyFromPem(privatePemText, 'private');
    return { origin, privateKey };
}

export async function sendRpc(request: RpcRequest, origin: string, privateKey: CryptoKey) {
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

//

async function minipub(args: (string | number)[], options: Record<string, unknown>) {
    const command = args[0];
    const fn = { 
        generate, 
        'create-user': createUser, cu: createUser,
        'update-user': updateUser, uu: updateUser,
        'delete-from-storage': deleteFromStorage, dfs: deleteFromStorage,
        'create-note': createNote, cn: createNote,
        'federate-activity': federateActivity, fa: federateActivity,
        'activity-pub': activityPub, ap: activityPub,
        uuid,
        'validate-http-signature': validateHttpSignature, vhs: validateHttpSignature,
        'like-object': likeObject, lo: likeObject,
        tmp,
    }[command];
    if (options.help || !fn) {
        dumpHelp();
        return;
    }
    await fn(args.slice(1), options);
}

async function tmp() {
    const txt = await Deno.readTextFile('asdf');
    const obj = JSON.parse(txt);
    if (obj.signature && obj.signature.type === 'RsaSignature2017') {
        // https://docs.joinmastodon.org/spec/security/#ld-sign
        delete obj.signature;
    }
    const apo = ApObject.parseObj(obj);
    console.log(apo.toObj());
}

function uuid() {
    console.log(newUuid());
}

async function generate(_args: (string | number)[], options: Record<string, unknown>) {
    const json = !!options.json;

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

if (import.meta.main) {
    const args = parseFlags(Deno.args);
    if (args._.length > 0) {
        await minipub(args._, args);
        Deno.exit(0);
    }
    dumpHelp();
    Deno.exit(1);
}
