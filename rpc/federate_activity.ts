import { FederateActivityRequest, FederateActivityResponse } from '../rpc_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { checkActivityRecord, checkActorRecord } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';
import { ApObjectValue } from '../activity_pub/ap_object_value.ts';
import { computeHttpSignatureHeaders, importKeyFromPem } from '../crypto.ts';
import { APPLICATION_ACTIVITY_JSON } from '../media_types.ts';
import { Iri, isIriArray } from '../activity_pub/iri.ts';
import { check } from '../check.ts';
import { Fetcher } from '../fetcher.ts';
import { computeActorId } from './urls.ts';

export async function computeFederateActivity(req: FederateActivityRequest, origin: string, storage: BackendStorage, fetcher: Fetcher): Promise<FederateActivityResponse> {
    const { activityUuid, dryRun } = req;

    const { activity, actor } = await storage.transaction(async txn => {
        const activity = await getRecord(txn, 'activity', activityUuid);
        if (!activity || !checkActivityRecord(activity)) throw new Error(`Activity ${activityUuid} not found`);
        const actor = await getRecord(txn, 'actor', activity.actorUuid);
        return { activity, actor };
    });
    const { actorUuid, activityPub } = activity;
    if (!actor || !checkActorRecord(actor)) throw new Error(`Actor ${actorUuid} not found`);
    const { privateKeyPem } = actor;

    const log: string[] = [];
    const apo = ApObject.parseObj(activityPub);
    
    const send = async (inbox: string) => {
        const actorId = computeActorId({ origin, actorUuid });
        const keyId = `${actorId}#main-key`;
        const privateKey = await importKeyFromPem(privateKeyPem, 'private');
        await sendServerToServerActivityPub({ 
            fetcher, 
            url: inbox, 
            activityPub, 
            keyId,
            dryRun,
            privateKey,
            log,
        });
    };

    // Create Note
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Create') {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Note') {
                const recipients = findNonPublicRecipientsForNote(object);
                if (recipients.size > 1) throw new Error(`Cannot send to more than one recipient for now`);
                let inbox: string | undefined;
                if (recipients.size === 1) {
                    const recipient = [...recipients][0];
                    const inboxes = await findInboxesForActorUrl(recipient, log, fetcher);
                    if (inboxes) {
                        log.push(JSON.stringify(inboxes));
                        inbox = inboxes.inbox;
                        if (inbox) {
                            await send(inbox);
                        }
                    }
                }
                return { kind: 'federate-activity', log, inbox };
            }
        }
    }

    // Update Person
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Update') {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Person') {
                const { inbox } = req;
                if (!inbox) throw new Error(`'inbox' must be specified for Update Person federation`);
                await send(inbox);
                return { kind: 'federate-activity', log, inbox };
            }
        }
    }

    throw new Error(`Activity not supported: ${JSON.stringify(activity, undefined, 2)}`);
}

export function findNonPublicRecipientsForNote(note: ApObjectValue): Set<string> {
    const urls = new Set([ ...findRecipientsForNoteProperty(note, 'to'), ...findRecipientsForNoteProperty(note, 'cc') ].map(v => v.toString()));
    urls.delete('https://www.w3.org/ns/activitystreams#Public');
    return urls;
}

//

function findRecipientsForNoteProperty(note: ApObjectValue, propertyName: string): readonly Iri[] {
    const value = note.opt(propertyName);
    if (value === undefined) return [];
    if (value instanceof Iri) return [ value ];
    if (typeof value === 'string') return [ new Iri(value) ];
    if (isIriArray(value)) return value;
    throw new Error(`findRecipientsForNoteProperty: Unimplemented ${propertyName} value ${JSON.stringify(value)}`);    
}

async function findInboxesForActorUrl(actorUrl: string, log: string[], fetcher: Fetcher): Promise<{ inbox: string, sharedInbox?: string } | undefined> {
    try {
        const res = await fetcher(actorUrl, { headers: { accept: 'application/activity+json' } });
        if (res.status !== 200) throw new Error(`Unexpected status for ${actorUrl}: ${res.status}, expected 200, body=${await res.text()}`);
        const contentType = res.headers.get('content-type') || '<missing>';
        if (!contentType.toLowerCase().includes('json')) throw new Error(`Unexpected contentType for ${actorUrl}: ${contentType}, expected json, body=${await res.text()}`);
        const apo = ApObject.parseObj(await res.json());
        check('type', apo.getIriString('type'), v => v === 'https://www.w3.org/ns/activitystreams#Person');
        check('id', apo.getIriString('id'), v => v === actorUrl);
        const inbox = apo.optIriString('inbox');
        if (inbox === undefined) {
            log.push(`No inbox found for actor: ${actorUrl}`);
            return undefined;
        }
        const sharedInbox = apo.optIriString('sharedInbox');
        return { inbox, sharedInbox };
    } catch (e) {
        log.push(`Error in findInboxesForActorUrl: ${e.stack || e}`);
    }
}

async function sendServerToServerActivityPub(opts: { activityPub: Record<string, unknown>, url: string, keyId: string, privateKey: CryptoKey, dryRun?: boolean, fetcher: Fetcher, log: string[] }) {
    const { activityPub, url, keyId, privateKey, dryRun, fetcher, log } = opts;
    const body = JSON.stringify(activityPub, undefined, 2);
    const method = 'POST';
    const { signature, date, digest, stringToSign } = await computeHttpSignatureHeaders({ method, url, body, privateKey, keyId });
    const headers = { date, signature, digest, 'content-type': APPLICATION_ACTIVITY_JSON };
    log.push(`EXTERNAL FETCH ${method} ${url}`);
    log.push('request headers:');
    log.push(Object.entries(headers).map(v => v.join(': ')).join('\n'));
    log.push('request stringToSign:');
    log.push(stringToSign);
    log.push('request body:');
    log.push(body);
    if (dryRun) {
        log.push('DRY RUN!');
        return;
    }
    // const res = await fetcher(`http://localhost:5899/?${url}`, { method, headers, body }); // to test signature verification
    const res = await fetcher(url, { method, headers, body });
    log.push('response:');
    log.push(`${res.status} ${res.url}`);
    log.push('response headers:');
    log.push(Object.entries(res.headers).map(v => v.join(': ')).join('\n'));
    log.push('response body:');
    log.push(await res.text());
}
