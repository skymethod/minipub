import { isStringRecord } from './check.ts';
import { ColoFromTrace, DurableObjectState, DurableObjectStorage, DurableObjectStorageTransaction, DurableObjectStorageValue } from './deps.ts';
import { computeActor, matchActor } from './endpoints/actor_endpoint.ts';
import { computeRpc, matchRpc } from './endpoints/rpc_endpoint.ts';
import { BackendStorage, BackendStorageTransaction, BackendStorageValue } from './storage.ts';

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
        const { pathname, origin } = new URL(url);
        const { colo, state } = this;
        const durableObjectName = headers.get('do-name');
        console.log('logprops:', { colo, durableObjectClass: 'BackendDO', durableObjectId: state.id.toString(), durableObjectName });

        try {
            const storage = Tx.makeStorage(state.storage);
            if (matchRpc(method, pathname)) return await computeRpc(request, origin, storage);
            const actor = matchActor(method, pathname); if (actor) return await computeActor(actor.actorUuid, storage);
            throw new Error('Not implemented');
        } catch (e) {
            return new Response(`${e}`, { status: 500 });
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

}
