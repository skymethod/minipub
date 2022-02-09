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
import { ParseCallback } from '../activity_pub/ap_context.ts';

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
    const privateKey = await importKeyFromPem(privateKeyPem, 'private');

    const apo = ApObject.parseObj(activityPub);
    const { recipientProvider, recipientType } = computeRecipientProviderForActivity(apo, actorUuid, storage, fetcher);
    const published = apo.getString('published');
    
    const sender = async (inbox: string, log: string[]) => {
        const actorId = computeActorId({ origin, actorUuid });
        const keyId = `${actorId}#main-key`;

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

    const recordKey = `${actorUuid}:${activityUuid}`;
    const storedRecord = await storage.transaction(async txn => await getRecord(txn, 'federation', recordKey));
    const record = storedRecord && checkFederationRecord(storedRecord) 
        ? storedRecord
        : { activityUuid, published, actorUuid, recipientStates: await computeInitialReceipientStates(recipientProvider) } as FederationRecord;
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
                    check('responseStatus', responseStatus, responseStatus >= 200 && responseStatus < 300);
                }
            } catch (e) {
                state.status = 'post-failed';
                state.error = `${e}`;
                modified = true;
            } finally {
                if (responseStatus !== undefined) {
                    state.postResponseTime = new Date().toISOString();
                } else {
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

export async function fetchRemoteNoteAttributedTo(objectId: string, fetcher: Fetcher): Promise<string> {
    const apo = await fetchActivityPub(objectId, fetcher);
    if (apo.type.toString() !== 'https://www.w3.org/ns/activitystreams#Note') throw new Error(`Bad objectId: ${objectId}, only remote Notes are supported`);
    return apo.getIriString('attributedTo');
}

export async function fetchActivityPub(url: string, fetcher: Fetcher): Promise<ApObject> {
    const res = await fetcher(url, { headers: { accept: 'application/activity+json' } });
    if (res.status !== 200) throw new Error(`Unexpected status for ${url}: ${res.status}, expected 200, body=${await res.text()}`);
    const contentType = res.headers.get('content-type') || '<missing>';
    if (!contentType.toLowerCase().includes('json')) throw new Error(`Unexpected contentType for ${url}: ${contentType}, expected json, body=${await res.text()}`);
    // be lenient with external ActivityPub data
    const callback: ParseCallback = {
        onUnresolvedProperty: (name, value, _context, phase) => {
            if (phase === 'find') return;
            console.warn(`Unresolved property: "${name}": ${JSON.stringify(value)}`);
        }
    };
    return ApObject.parseObj(await res.json(), { callback });
}

//

function computeRecipientProviderForActivity(apo: ApObject, actorUuid: string, storage: BackendStorage, fetcher: Fetcher): { recipientProvider: () => Promise<Set<string>>, recipientType: 'actor' | 'inbox' } {

    // Create/Update Note
    if (['https://www.w3.org/ns/activitystreams#Create', 'https://www.w3.org/ns/activitystreams#Update'].includes(apo.getIriString('type'))) {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Note') {
                return {
                    recipientProvider: () => Promise.resolve(findNonPublicRecipientsForNote(object)), 
                    recipientType: 'actor',
                };
            }
        }
    }

    // Update Person
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Update') {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Person') {
                return {
                    recipientProvider: () => findInboxUrlsForActor(actorUuid, storage), 
                    recipientType: 'inbox',
                };
            }
        }
    }

    // Like Object
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Like') {
        const object = apo.get('object');
        if (object instanceof Iri) {
            return {
                recipientProvider: async () => {
                    const attributedTo = await fetchRemoteNoteAttributedTo(object.toString(), fetcher);
                    return new Set([ attributedTo ]);
                },
                recipientType: 'actor',
            };
        }
    }

    // Undo Like
    if (apo.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Undo') {
        const object = apo.get('object');
        if (object instanceof ApObjectValue) {
            if (object.getIriString('type') === 'https://www.w3.org/ns/activitystreams#Like') {
                const object_ = object.get('object');
                if (object_ instanceof Iri) {
                    return {
                        recipientProvider: async () => {
                            const attributedTo = await fetchRemoteNoteAttributedTo(object_.toString(), fetcher);
                            return new Set([ attributedTo ]);
                        },
                        recipientType: 'actor',
                    };
                }
            }
        }
    }

    throw new Error(`Activity not supported: ${apo.toJson(2)}`);
}

async function computeInitialReceipientStates(recipientProvider: () => Promise<Set<string>>): Promise<Record<string, FederationRecipientState>>  {
    const rt : Record<string, FederationRecipientState> = {};
    for (const recipient of await recipientProvider()) {
        rt[recipient] = { status: 'initial' };
    }
    return rt;
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
    const apo = await fetchActivityPub(actorUrl, fetcher);
    check('type', apo.getIriString('type'), v => v === 'https://www.w3.org/ns/activitystreams#Person' || v === 'https://www.w3.org/ns/activitystreams#Service');
    check('id', apo.getIriString('id'), v => v === actorUrl);
    const inbox = apo.optIriString('inbox');
    const endpoints = apo.opt('endpoints');
    const sharedInbox = endpoints instanceof ApObjectValue ? endpoints.optIriString('sharedInbox') : undefined;
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
    log.push(...Object.entries(headers).map(v => v.join(': ')));
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
    log.push(...[...res.headers].map(v => v.join(': ')));
    log.push('response body:');
    log.push(await res.text());
    return res.status;
}
