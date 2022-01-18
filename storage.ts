import { isStringRecord } from './check.ts';

export interface BackendStorage {
    transaction<T>(closure: (txn: BackendStorageTransaction) => T | PromiseLike<T>): Promise<T>;
}

export type BackendStorageValue = Record<string, unknown> | Uint8Array;

export interface BackendStorageTransaction {
    rollback(): void;
    get(domain: string, key: string): Promise<BackendStorageValue | undefined>;
    put(domain: string, key: string, value: BackendStorageValue): Promise<void>;
    delete(domain: string, key: string): Promise<void>;
    putAll(domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void>;
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
