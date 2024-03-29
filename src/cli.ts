import { APPLICATION_JSON_UTF8 } from './media_types.ts';
import { computeHttpSignatureHeaders, importKeyFromPem } from './crypto.ts';
import { parseArgs } from './cli/deps_cli.ts';
import { RpcRequest } from './rpc_model.ts';
import { activityPub, activityPubDescription } from './cli/cli_activity_pub.ts';
import { createUser, createUserDescription } from './cli/cli_create_user.ts';
import { updateUser, updateUserDescription } from './cli/cli_update_user.ts';
import { createNote, createNoteDescription } from './cli/cli_create_note.ts';
import { federateActivity, federateActivityDescription } from './cli/cli_federate_activity.ts';
import { newUuid } from './uuid.ts';
import { validateHttpSignature } from './cli/cli_validate_http_signature.ts';
import { deleteFromStorage, deleteFromStorageDescription } from './cli/cli_delete_from_storage.ts';
import { likeObject, likeObjectDescription } from './cli/cli_like_object.ts';
import { undoLike, undoLikeDescription } from './cli/cli_undo_like.ts';
import { makeMinipubFetcher } from './fetcher.ts';
import { webfinger, webfingerDescription } from './cli/cli_webfinger.ts';
import { server, serverDescription } from './cli/cli_server.ts';
import { MINIPUB_VERSION } from './version.ts';
import { generateKeypair, generateKeypairDescription } from './cli/cli_generate_keypair.ts';
import { threadcap, threadcapDescription } from './cli/cli_threadcap.ts';
import { generateNpm } from './cli/cli_generate_npm.ts';
import { updateNote, updateNoteDescription } from './cli/cli_update_note.ts';
import { deleteNote, deleteNoteDescription } from './cli/cli_delete_note.ts';
import { generateAdminToken, generateAdminTokenDescription } from './cli/cli_generate_admin_token.ts';
import { revokeAdminToken, revokeAdminTokenDescription } from './cli/cli_revoke_admin_token.ts';
import { mastodonFindReplies } from './threadcap/threadcap_activitypub.ts';
import { InMemoryCache } from './threadcap/threadcap.ts';
import { systemActorServer, systemActorServerDescription } from './cli/cli_system_actor_server.ts';

export async function parseRpcOptions(options: Record<string, unknown>) {
    const { origin, pem } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://comments.example.com');
    if (typeof pem !== 'string') throw new Error('Provide path to admin pem, e.g. --pem /path/to/admin.private.pem');
    const privatePemText = (await Deno.readTextFile(pem)).trim();
    const privateKey = await importKeyFromPem(privatePemText, 'private');
    return { origin, privateKey };
}

export async function sendRpc(request: RpcRequest, origin: string, credential: { privateKey: CryptoKey } | { bearerToken: string }) {
    const body = JSON.stringify(request);
    const method = 'POST';
    const url = `${origin}/rpc`;
    if (_verbose) console.log(`${method} ${url}`);

    const keyId = 'admin';
    let headers: Record<string, string> = { 'content-type': APPLICATION_JSON_UTF8 };
    if ('privateKey' in credential) {
        // http-signature-based authorization
        const { privateKey } = credential;
        const { signature, date, digest, stringToSign } = await computeHttpSignatureHeaders({ method, url, body, privateKey, keyId });
        headers = { ...headers, date, signature, digest };
        if (_verbose) console.log(`stringToSign: ${stringToSign.replaceAll('\n', '\\n')}`);
    } else {
        // bearer-token-based authorization
        headers = { ...headers, authorization: `Bearer ${credential.bearerToken}` };
    }
    if (_verbose) console.log(Object.entries(headers).map(v => v.join(': ')).join('\n'));
    if (_verbose) console.log(JSON.stringify(request, undefined, 2));

    const fetcher = makeMinipubFetcher();
    const res = await fetcher(url, { method, body, headers });
    console.log(res);
    console.log(await res.text());
}

//

let _verbose = false;

async function minipub(args: (string | number)[], options: Record<string, unknown>) {
    _verbose = !!options.verbose;
    const command = args[0];
    const fn = { 
        'activity-pub': activityPub, ap: activityPub,
        'create-note': createNote, cn: createNote,
        'create-user': createUser, cu: createUser,
        'delete-from-storage': deleteFromStorage, dfs: deleteFromStorage,
        'delete-note': deleteNote, dn: deleteNote,
        'federate-activity': federateActivity, fa: federateActivity,
        'generate-admin-token': generateAdminToken, gat: generateAdminToken,
        'generate-keypair': generateKeypair, gk: generateKeypair,
        'generate-npm': generateNpm, gn: generateNpm,
        'like-object': likeObject, lo: likeObject,
        'revoke-admin-token': revokeAdminToken, rat: revokeAdminToken,
        'system-actor-server': systemActorServer, sas: systemActorServer,
        'undo-like': undoLike, ul: undoLike,
        'update-note': updateNote, un: updateNote,
        'update-user': updateUser, uu: updateUser,
        'validate-http-signature': validateHttpSignature, vhs: validateHttpSignature,
        server,
        tmp,
        uuid,
        threadcap, tc: threadcap,
        webfinger, wf: webfinger,
    }[command];
    if (!fn) {
        dumpHelp();
        return;
    }
    await fn(args.slice(1), options);
}

async function tmp(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, token } = options;
    if (typeof origin === 'string' && typeof token === 'string') {
        await sendRpc({ kind: 'delete-note', objectUuid: newUuid() }, origin, { bearerToken: token });
    }
    const { 'mastodon-replies': mastodonReplies } = options;
    if (typeof mastodonReplies === 'string') {
        const replies = await mastodonFindReplies(mastodonReplies, { after: new Date().toISOString(), fetcher: fetch, cache: new InMemoryCache(), debug: true });
        console.log(replies);
    }
}

function uuid() {
    console.log(newUuid());
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
        `    activity-pub            ${activityPubDescription}`,
        `    create-note             ${createNoteDescription}`,
        `    create-user             ${createUserDescription}`,
        `    delete-from-storage     ${deleteFromStorageDescription}`,
        `    delete-note             ${deleteNoteDescription}`,
        `    federate-activity       ${federateActivityDescription}`,
        `    generate-admin-token    ${generateAdminTokenDescription}`,
        `    generate-keypair        ${generateKeypairDescription}`,
        `    like-object             ${likeObjectDescription}`,
        `    revoke-admin-token      ${revokeAdminTokenDescription}`,
        `    server                  ${serverDescription}`,
        `    system-actor-server     ${systemActorServerDescription}`,
        `    threadcap               ${threadcapDescription}`,
        `    undo-like               ${undoLikeDescription}`,
        `    update-note             ${updateNoteDescription}`,
        `    update-user             ${updateUserDescription}`,
        `    uuid                    Generates a new Minipub uuid`,
        `    webfinger               ${webfingerDescription}`,
        '',
        '    For any multiple-word command you can also use its abbreviation as an alias',
        '    e.g. "minipub ap <args>" for "minipub activity-pub <args>"',

        '',
        'OPTIONS:',
        '    --help                 Prints help information',
        '    --verbose              Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}

if (import.meta.main) {
    const args = parseArgs(Deno.args);
    if (args._.length > 0) {
        await minipub(args._, args);
        Deno.exit(0);
    }
    dumpHelp();
    Deno.exit(1);
}
