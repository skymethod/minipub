import { isStringRecord } from './check.ts';
import { DurableObjectStorage, DurableObjectStorageTransaction, DurableObjectStorageValue } from './deps.ts';
import { BackendStorage, BackendStorageListOptions, BackendStorageTransaction, BackendStorageValue } from './storage.ts';

export class DurableObjectBackendStorage implements BackendStorage {
    private readonly storage: DurableObjectStorage;

    constructor(storage: DurableObjectStorage) {
        this.storage = storage;
    }

    transaction<T>(closure: (txn: BackendStorageTransaction) => T | PromiseLike<T>): Promise<T> {
        return this.storage.transaction(txn => {
            const tx = new DurableObjectBackendStorageTransaction(txn);
            return closure(tx);
        });
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

class DurableObjectBackendStorageTransaction implements BackendStorageTransaction {

    private readonly transaction: DurableObjectStorageTransaction;
    
    constructor(transaction: DurableObjectStorageTransaction) {
        this.transaction = transaction;
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
        if (opts.start !== undefined) throw new Error(`DurableObjectBackendStorageTransaction: implement list start`);
        if (opts.end !== undefined) throw new Error(`DurableObjectBackendStorageTransaction: implement list end`);
        if (opts.reverse !== undefined) throw new Error(`DurableObjectBackendStorageTransaction: implement list reverse`);
        if (opts.limit !== undefined) throw new Error(`DurableObjectBackendStorageTransaction: implement list limit`);
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
