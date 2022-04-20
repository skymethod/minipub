import { isStringRecord } from './check.ts';

export interface BackendStorage {
    transaction<T>(closure: (txn: BackendStorageTransaction) => T | PromiseLike<T>): Promise<T>;
}

export type BackendStorageValue = Record<string, unknown> | Uint8Array;

export interface BackendStorageTransaction {
    rollback(): void;
    get(domain: string, key: string): Promise<BackendStorageValue | undefined>;
    getAll(domain: string, keys: string[]): Promise<Map<string, BackendStorageValue>>;
    put(domain: string, key: string, value: BackendStorageValue): Promise<void>;
    delete(domain: string, key: string): Promise<boolean>; // returns existed
    putAll(domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void>;
    list(domain: string, opts?: BackendStorageListOptions): Promise<Map<string, BackendStorageValue>>;
}

export interface BackendStorageListOptions {
    /** Key at which the list results should start, inclusive. */
    readonly start?: string;

    /** Key at which the list results should end, exclusive. */
    readonly end?: string;

    /** Restricts results to only include key-value pairs whose keys begin with the prefix. */
    readonly prefix?: string;

    /** If true, return results in descending lexicographic order instead of the default ascending order. */
    readonly reverse?: boolean;

    /** Maximum number of key-value pairs to return.  */
    readonly limit?: number;
}

export async function getRecord(tx: BackendStorageTransaction, domain: string, key: string): Promise<Record<string, unknown> | undefined> {
    const value = await tx.get(domain, key);
    if (value === undefined || isStringRecord(value)) return value;
    throw new Error(`Bad stored value for ${domain} ${key}: expected record, found ${value}`);
}

export async function getUint8Array(tx: BackendStorageTransaction, domain: string, key: string): Promise<Uint8Array | undefined> {
    const value = await tx.get(domain, key);
    if (value === undefined || value instanceof Uint8Array) return value;
    throw new Error(`Bad stored value for ${domain} ${key}: expected Uint8Array, found ${value}`);
}

export async function putIfNotExists(tx: BackendStorageTransaction, domain: string, key: string, value: BackendStorageValue): Promise<boolean> {
    const existing = await tx.get(domain, key);
    if (existing) return false;
    await tx.put(domain, key, value);
    return true;
}
