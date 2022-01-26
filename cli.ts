import { APPLICATION_JSON_UTF8 } from './media_types.ts';
import { computeHttpSignatureHeaders, exportKeyToPem, generateExportableRsaKeyPair, importKeyFromPem } from './crypto.ts';
import { parseFlags } from './deps_cli.ts';
import { RpcRequest } from './rpc_model.ts';
import { activityPub, activityPubDescription } from './cli_activity_pub.ts';
import { createUser } from './cli_create_user.ts';
import { updateUser } from './cli_update_user.ts';
import { createNote, createNoteDescription } from './cli_create_note.ts';
import { federateActivity } from './cli_federate_activity.ts';
import { newUuid } from './uuid.ts';
import { validateHttpSignature } from './cli_validate_http_signature.ts';
import { ApObject } from './activity_pub/ap_object.ts';
import { deleteFromStorage } from './cli_delete_from_storage.ts';
import { likeObject } from './cli_like_object.ts';
import { undoLike } from './cli_undo_like.ts';
import { makeMinipubFetcher } from './fetcher.ts';
import { webfinger } from './cli_webfinger.ts';
import { server } from './cli_server.ts';
import { MINIPUB_VERSION } from './version.ts';

export async function parseRpcOptions(options: Record<string, unknown>) {
    const { origin, pem } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://comments.example.com');
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
    const headers = { date, signature, digest, 'content-type': APPLICATION_JSON_UTF8 };
    console.log(Object.entries(headers).map(v => v.join(': ')).join('\n'));
    console.log(stringToSign);

    const fetcher = makeMinipubFetcher();
    const res = await fetcher(url, { method, body, headers });
    console.log(res);
    console.log(await res.text());
}

//

async function minipub(args: (string | number)[], options: Record<string, unknown>) {
    const command = args[0];
    const fn = { 
        'activity-pub': activityPub, ap: activityPub,
        'create-note': createNote, cn: createNote,
        'create-user': createUser, cu: createUser,
        'delete-from-storage': deleteFromStorage, dfs: deleteFromStorage,
        'federate-activity': federateActivity, fa: federateActivity,
        'like-object': likeObject, lo: likeObject,
        'undo-like': undoLike, ul: undoLike,
        'update-user': updateUser, uu: updateUser,
        'validate-http-signature': validateHttpSignature, vhs: validateHttpSignature,
        generate, 
        server,
        tmp,
        uuid,
        webfinger,
    }[command];
    if (!fn) {
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
        `minipub-cli ${MINIPUB_VERSION}`,
        'Tools for minipub',
        '',
        'USAGE:',
        '    minipub [command] [ARGS] [OPTIONS]',
        '',
        'COMMANDS:',
        `    activity-pub   ${activityPubDescription}`,
        `    create-note   ${createNoteDescription}`,
        '',
        '    For any multiple-word command you can also use its abbreviation as an alias',
        '    e.g. "minipub ap <args>" for "minipub activity-pub <args>"',

        '',
        'OPTIONS:',
        '    --help         Prints help information',
        '    --verbose      Toggle verbose output (when applicable)',
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
