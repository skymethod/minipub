import { FederateActivityRequest, FederateActivityResponse } from '../rpc_model.ts';
import { BackendStorage, getRecord } from '../storage.ts';
import { checkActivityRecord, checkActorRecord, checkFederationRecord, FederationRecipientState, FederationRecord } from '../domain_model.ts';
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

    const apo = ApObject.parseObj(activityPub);
    
    const sender = async (inbox: string, log: string[]) => {
        const actorId = computeActorId({ origin, actorUuid });
        const keyId = `${actorId}#main-key`;
        const privateKey = await importKeyFromPem(privateKeyPem, 'private');
        return await sendServerToServerActivityPub({ 
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
                const published = apo.getString('published');
                const getRecipients = () => Promise.resolve(findNonPublicRecipientsForNote(object));
                return await federate({ getRecipients, recipientType: 'actor', actorUuid, activityUuid, published, storage, fetcher, sender });
            }
        }
    }

    // Update Person
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Update') {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Person') {
                const published = apo.getString('published');
                const getRecipients = () => Promise.resolve(findNonPublicRecipientsForNote(object));
                return await federate({ getRecipients, recipientType: 'inbox', actorUuid, activityUuid, published, storage, fetcher, sender });
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

export async function findInboxUrlsForActor(actorUuid: string, storage: BackendStorage): Promise<Set<string>> {
    const records = await storage.transaction(async txn => await txn.list('federation', { prefix: `${actorUuid}:` }));
    const inboxUrls = new Set<string>();
    for (const record of records.values()) {
        if (!checkFederationRecord(record)) continue;
        for (const state of Object.values(record.recipientStates)) {
            if (state.status === 'posted') {
                const inboxUrl = state.sharedInbox || state.inbox;
                if (inboxUrl) {
                    inboxUrls.add(inboxUrl);
                }
            }
        }
    }
    return inboxUrls;
}

//

async function computeInitialReceipientStates(getRecipients: () => Promise<Set<string>>): Promise<Record<string, FederationRecipientState>>  {
    const rt : Record<string, FederationRecipientState> = {};
    for (const recipient of await getRecipients()) {
        rt[recipient] = { status: 'initial' };
    }
    return rt;
}

async function federate(opts: { 
        getRecipients: () => Promise<Set<string>>, 
        recipientType: 'actor' | 'inbox', 
        actorUuid: string, 
        activityUuid: string, 
        published: string, 
        storage: BackendStorage, 
        fetcher: Fetcher, 
        sender: (inbox: string, log: string[]) => Promise<number | undefined> 
    }): Promise<FederateActivityResponse> {
    const { getRecipients, recipientType, actorUuid, activityUuid, storage, published, fetcher, sender } = opts;
    const recordKey = `${actorUuid}:${activityUuid}`;
    const storedRecord = await storage.transaction(async txn => await getRecord(txn, 'federation', recordKey));
    const record = storedRecord && checkFederationRecord(storedRecord) 
        ? storedRecord
        : { activityUuid, published, actorUuid, recipientStates: await computeInitialReceipientStates(getRecipients) } as FederationRecord;
    if (!storedRecord) {
        // save it, getting the recipients might have been expensive
        await storage.transaction(async txn => await txn.put('federation', recordKey, record));
    }
    const recipientLogs: Record<string, string[]> = {};

    let modified = false;
    const workRecipient = async (recipient: string, state: FederationRecipientState, log: string[]) => {
        if (state.status === 'initial' || state.status === 'discovery-failed') {
            modified = true;
            if (recipientType === 'inbox') {
                state.status = 'discovered';
                state.inbox = recipient;
            } else {
                state.discoveryAttempts = (state.discoveryAttempts || 0) + 1;
                try {
                    const { inbox, sharedInbox } = await findInboxesForActorUrl(recipient, fetcher);
                    state.status = 'discovered';
                    state.error = undefined;
                    state.inbox = inbox;
                    state.sharedInbox = sharedInbox;
                } catch (e) {
                    state.status = 'discovery-failed';
                    state.error = `${e}`;
                    return;
                }
            }
        }
        const inbox = state.inbox || state.sharedInbox;
        if (inbox && (state.status === 'discovered' || state.status === 'post-failed')) {
            state.postAttempts = (state.postAttempts || 0) + 1;
            let responseStatus: number | undefined;
            try {
                responseStatus = await sender(inbox, log);
                if (responseStatus !== undefined) {
                    state.status = 'posted';
                    state.error = undefined;
                    modified = true;
                    state.postResponseStatus = responseStatus.toString();
                }
            } catch (e) {
                state.status = 'post-failed';
                state.error = `${e}`;
                modified = true;
            } finally {
                if (responseStatus !== undefined) {
                    state.postResponseTime = new Date().toISOString();
                }
                if (!modified) {
                    // back out the attempt, we didn't make the call
                    state.postAttempts = state.postAttempts === 1 ? undefined : (state.postAttempts - 1);
                }
            }
        }
    }
    for (const [ recipient, state ] of Object.entries(record.recipientStates)) {
        const recipientLog: string[] = [];
        recipientLogs[recipient] = recipientLog;
        await workRecipient(recipient, state, recipientLog);
    }
    if (modified) {
        await storage.transaction(async txn => await txn.put('federation', recordKey, record));
    }

    return { kind: 'federate-activity', record, recipientLogs, modified };
}


function findRecipientsForNoteProperty(note: ApObjectValue, propertyName: string): readonly Iri[] {
    const value = note.opt(propertyName);
    if (value === undefined) return [];
    if (value instanceof Iri) return [ value ];
    if (typeof value === 'string') return [ new Iri(value) ];
    if (isIriArray(value)) return value;
    throw new Error(`findRecipientsForNoteProperty: Unimplemented ${propertyName} value ${JSON.stringify(value)}`);    
}

async function findInboxesForActorUrl(actorUrl: string, fetcher: Fetcher): Promise<{ inbox?: string, sharedInbox?: string }> {
    const res = await fetcher(actorUrl, { headers: { accept: 'application/activity+json' } });
    if (res.status !== 200) throw new Error(`Unexpected status for ${actorUrl}: ${res.status}, expected 200, body=${await res.text()}`);
    const contentType = res.headers.get('content-type') || '<missing>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Unexpected contentType for ${actorUrl}: ${contentType}, expected json, body=${await res.text()}`);
    const apo = ApObject.parseObj(await res.json());
    check('type', apo.getIriString('type'), v => v === 'https://www.w3.org/ns/activitystreams#Person');
    check('id', apo.getIriString('id'), v => v === actorUrl);
    const inbox = apo.optIriString('inbox');
    const sharedInbox = apo.optIriString('sharedInbox');
    return { inbox, sharedInbox };
}

async function sendServerToServerActivityPub(opts: { activityPub: Record<string, unknown>, url: string, keyId: string, privateKey: CryptoKey, dryRun?: boolean, fetcher: Fetcher, log: string[] }): Promise<number | undefined> {
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
        return undefined;
    }
    // const res = await fetcher(`http://localhost:5899/?${url}`, { method, headers, body }); // to test signature verification
    const res = await fetcher(url, { method, headers, body });
    log.push('response:');
    log.push(`${res.status} ${res.url}`);
    log.push('response headers:');
    log.push(Object.entries(res.headers).map(v => v.join(': ')).join('\n'));
    log.push('response body:');
    log.push(await res.text());
    return res.status;
}
