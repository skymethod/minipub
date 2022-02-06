import { isStringRecord } from './check.ts';
import { ColoFromTrace, DurableObjectState, DurableObjectStorage, DurableObjectStorageTransaction, DurableObjectStorageValue } from './deps.ts';
import { computeActivity, matchActivity } from './endpoints/activity_endpoint.ts';
import { computeActor, matchActor } from './endpoints/actor_endpoint.ts';
import { computeBlob, matchBlob } from './endpoints/blob_endpoint.ts';
import { computeObject, matchObject } from './endpoints/object_endpoint.ts';
import { Responses } from './endpoints/responses.ts';
import { computeRpc, matchRpc } from './endpoints/rpc_endpoint.ts';
import { computeWebfinger, matchWebfinger } from './endpoints/webfinger_endpoint.ts';
import { makeMinipubFetcher } from './fetcher.ts';
import { BackendStorage, BackendStorageListOptions, BackendStorageTransaction, BackendStorageValue } from './storage.ts';

export class BackendDO {

    private readonly state: DurableObjectState;

    private colo!: string;

    constructor(state: DurableObjectState) {
        this.state = state;
        
        this.state.blockConcurrencyWhile(async () => {
            this.colo = await new ColoFromTrace().get();
        });
    }

    async fetch(request: Request): Promise<Response> {
        const { method, url, headers } = request;
        const { pathname, origin, searchParams } = new URL(url);
        const { colo, state } = this;
        const durableObjectName = headers.get('do-name');
        console.log('logprops:', { colo, durableObjectClass: 'BackendDO', durableObjectId: state.id.toString(), durableObjectName });

        try {
            const fetcher = makeMinipubFetcher({ origin });

            const storage = Tx.makeStorage(state.storage);
            if (matchRpc(method, pathname)) return await computeRpc(request, origin, storage, fetcher); // assumes auth happened earlier
            const actor = matchActor(method, pathname); if (actor) return await computeActor(actor.actorUuid, storage);
            const object = matchObject(method, pathname); if (object) return await computeObject(object.actorUuid, object.objectUuid, storage);
            const activity = matchActivity(method, pathname); if (activity) return await computeActivity(activity.actorUuid, activity.activityUuid, storage);
            const blob = matchBlob(method, pathname); if (blob) return await computeBlob(blob.actorUuid, blob.blobUuid, blob.ext, storage);
            const webfinger = matchWebfinger(method, pathname, searchParams); if (webfinger) return await computeWebfinger(webfinger.username, webfinger.domain, origin, storage);
            throw new Error('Not implemented');
        } catch (e) {
            console.error('Error in BackendDO', `${e.stack || e}`);
            return Responses.internalServerError(e);
        }
    }
    
}

//

function packKey(domain: string, key: string): string {
    return `${domain}:${key}`;
}

function unpackValue(value: DurableObjectStorageValue): BackendStorageValue {
    if (value instanceof Uint8Array) return value;
    if (isStringRecord(value)) return value;
    throw new Error(`unpackValue: unable to unpack ${JSON.stringify(value)}`);
}

//

class Tx implements BackendStorageTransaction {

    private readonly transaction: DurableObjectStorageTransaction;
    
    constructor(transaction: DurableObjectStorageTransaction) {
        this.transaction = transaction;
    }

    static makeStorage(storage: DurableObjectStorage): BackendStorage {
        return {
            transaction: closure => {
                return storage.transaction(txn => {
                    const tx = new Tx(txn);
                    return closure(tx);
                });
            }
        }
    }

    rollback() {
        this.transaction.rollback();
    }

    async get(domain: string, key: string): Promise<BackendStorageValue | undefined> {
        const value = await this.transaction.get(packKey(domain, key));
        return value ? unpackValue(value) : undefined;
    }

    async put(domain: string, key: string, value: BackendStorageValue): Promise<void> {
        await this.transaction.put(packKey(domain, key), value);
    }

    async putAll(domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void> {
        const values: Record<string, unknown> = {};
        for (const [ domain, keysToValues ] of Object.entries(domainsToKeysToValues)) {
            for (const [ key, value ] of Object.entries(keysToValues)) {
                values[packKey(domain, key)] = value;
            }
        }
        await this.transaction.put(values);
    }

    async delete(domain: string, key: string): Promise<boolean> {
        return await this.transaction.delete(packKey(domain, key));
    }

    async list(domain: string, opts: BackendStorageListOptions = {}): Promise<Map<string, BackendStorageValue>> {
        if (opts.start !== undefined) throw new Error(`InMemoryStorage: implement list start`);
        if (opts.end !== undefined) throw new Error(`InMemoryStorage: implement list end`);
        if (opts.reverse !== undefined) throw new Error(`InMemoryStorage: implement list reverse`);
        if (opts.limit !== undefined) throw new Error(`InMemoryStorage: implement list limit`);
        const prefix = domain + ':';
        const searchPrefix = prefix + (opts.prefix || '');
        const values = await this.transaction.list({ prefix: searchPrefix });
        const rt = new Map<string, BackendStorageValue>();
        for (const [ key, value ] of values) {
            rt.set(key.substring(prefix.length), unpackValue(value));
        }
        return rt;
    }

}