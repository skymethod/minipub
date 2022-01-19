import { isStringRecord } from './check.ts';
import { BackendStorage, BackendStorageListOptions, BackendStorageTransaction, BackendStorageValue } from './storage.ts';

const DEBUG = false;

export function makeInMemoryStorage(): BackendStorage {
    const values = new Map<string, BackendStorageValue>();
    return {
        // deno-lint-ignore no-explicit-any
        transaction: (closure: (txn: InMemoryStorageTransaction) => any) => {
            const tx = new InMemoryStorageTransaction(values);
            return closure(tx);
        }
    }
}

//

function packKey(domain: string, key: string): string {
    return `${domain}:${key}`;
}

//

class InMemoryStorageTransaction implements BackendStorageTransaction {

    private readonly values: Map<string, BackendStorageValue>;

    constructor(values: Map<string, BackendStorageValue>) {
        this.values = values;
    }

    rollback() {
        throw new Error();
    }

    get(domain: string, key: string): Promise<BackendStorageValue | undefined> {
        if (DEBUG) console.log(`get ${domain} ${key}`);
        return Promise.resolve(this.values.get(packKey(domain, key)));
    }

    put(domain: string, key: string, value: BackendStorageValue): Promise<void> {
        if (DEBUG) console.log(`put ${domain} ${key} ${isStringRecord(value) ? JSON.stringify(value, undefined, 2) : value}`);
        this.values.set(packKey(domain, key), value);
        return Promise.resolve();
    }

    putAll(_domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void> {
        throw new Error();
    }

    delete(domain: string, key: string): Promise<void> {
        if (DEBUG) console.log(`delete ${domain} ${key}`);
        this.values.delete(packKey(domain, key));
        return Promise.resolve();
    }

    list(domain: string, opts: BackendStorageListOptions = {}): Promise<Map<string, BackendStorageValue>> {
        if (DEBUG) console.log(`list ${domain} ${JSON.stringify(opts)}`);
        if (opts.start !== undefined) throw new Error(`InMemoryStorage: implement list start`);
        if (opts.end !== undefined) throw new Error(`InMemoryStorage: implement list end`);
        if (opts.prefix !== undefined) throw new Error(`InMemoryStorage: implement list prefix`);
        if (opts.reverse !== undefined) throw new Error(`InMemoryStorage: implement list reverse`);
        if (opts.limit !== undefined) throw new Error(`InMemoryStorage: implement list limit`);
        const prefix = domain + ':';
        const rt = new Map<string, BackendStorageValue>();
        for (const key of [...this.values.keys()].sort()) {
            if (key.startsWith(prefix)) {
                const value = this.values.get(key)!;
                rt.set(key.substring(prefix.length), value);
            }
        }
        return Promise.resolve(rt);
    }

}
