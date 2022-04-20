import { BackendStorage, BackendStorageListOptions, BackendStorageTransaction, BackendStorageValue } from './storage.ts';
import { DB, RowObject } from 'https://deno.land/x/sqlite@v3.2.0/mod.ts';
import { isStringRecord } from './check.ts';

export function makeSqliteStorage(path = ':memory:'): BackendStorage {
    const db = new DB(path);
    db.query(`CREATE TABLE IF NOT EXISTS ${STORAGE} (key TEXT PRIMARY KEY, text_value TEXT, blob_value BLOB)`);
    return {
        // deno-lint-ignore no-explicit-any
        transaction: (closure: (txn: SqliteStorageTransaction) => any) => {
            const tx = new SqliteStorageTransaction(db);
            try {
                return db.transaction(() => {
                    const rt = closure(tx);
                    if (tx.rolledBack) throw new RollbackError();
                    return rt;
                });
            } catch (e) {
                if (e instanceof RollbackError) return undefined;
                throw e;
            }
        }
    }
}

//

const STORAGE = `storage1`;

function packKey(domain: string, key: string): string {
    return `${domain}:${key}`;
}

function unpackValue(row: RowObject): BackendStorageValue {
    if (typeof row.text_value === 'string') return JSON.parse(row.text_value);
    if (row.blob_value instanceof Uint8Array) return row.blob_value;
    throw new Error(`SqliteStorage: no value for ${JSON.stringify(row)}`);
}

//

class SqliteStorageTransaction implements BackendStorageTransaction {
    private readonly db: DB;

    rolledBack = false;

    constructor(db: DB) {
        this.db = db;
    }

    rollback(): void {
        this.rolledBack = true;
    }

    get(domain: string, key: string): Promise<BackendStorageValue | undefined> {
        if (this.rolledBack) throw new Error('rollback() was called');
        const dbKey = packKey(domain, key);
        const entries = this.db.queryEntries(`select text_value, blob_value from ${STORAGE} where key = ?`, [ dbKey ]);
        if (entries.length === 0) return Promise.resolve(undefined);
        return Promise.resolve(unpackValue(entries[0]));
    }

    getAll(domain: string, keys: string[]): Promise<Map<string, BackendStorageValue>> {
        if (this.rolledBack) throw new Error('rollback() was called');
        const rt = new Map<string, BackendStorageValue>();
        if (keys.length > 0) {
            const dbKeys = keys.map(v => packKey(domain, v));
            const params = dbKeys.map(_ => '?').join(', ');
            const entries = this.db.queryEntries(`select key, text_value, blob_value from ${STORAGE} where key in (${params})`, dbKeys);
            for (const entry of entries) {
                const { key } = entry;
                if (typeof key === 'string') {
                    const value = unpackValue(entry);
                    rt.set(key.substring(domain.length + 1), value);
                }
            }
        }
        return Promise.resolve(rt);
    }

    put(domain: string, key: string, value: BackendStorageValue): Promise<void> {
        if (this.rolledBack) throw new Error('rollback() was called');
        const dbKey = packKey(domain, key);
        if (isStringRecord(value)) {
            this.db.query(`replace into ${STORAGE}(key, text_value, blob_value) values (?, ?, ?)`, [ dbKey, JSON.stringify(value), undefined ]);
        } else {
            this.db.query(`replace into ${STORAGE}(key, text_value, blob_value) values (?, ?, ?)`, [ dbKey, undefined, value ]);
        }
        return Promise.resolve();
    }

    delete(domain: string, key: string): Promise<boolean> {
        if (this.rolledBack) throw new Error('rollback() was called');
        const dbKey = packKey(domain, key);
        this.db.query(`delete from ${STORAGE} where key = ?`, [ dbKey ]);
        const existed = this.db.changes > 0;
        return Promise.resolve(existed);
    }

    putAll(domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void> {
        if (this.rolledBack) throw new Error('rollback() was called');
        throw new Error(`SqliteStorage.putAll(${domainsToKeysToValues}) not implemented`);
    }

    list(domain: string, opts: BackendStorageListOptions = {}): Promise<Map<string,BackendStorageValue>> {
        if (this.rolledBack) throw new Error('rollback() was called');
        if (opts.start !== undefined) throw new Error(`SqliteStorage: implement list start`);
        if (opts.end !== undefined) throw new Error(`SqliteStorage: implement list end`);
        if (opts.reverse !== undefined) throw new Error(`SqliteStorage: implement list reverse`);
        if (opts.limit !== undefined) throw new Error(`SqliteStorage: implement list limit`);
        const prefix = domain + ':';
        const searchPrefix = prefix + (opts.prefix || '');
        const rt = new Map<string,BackendStorageValue>();
        const entries = this.db.queryEntries(`select key, text_value, blob_value from ${STORAGE} where key like ? order by key`, [ `${searchPrefix}%` ]);
        for (const entry of entries) {
            if (typeof entry.key !== 'string') throw new Error(`Bad entry: ${JSON.stringify(entry)}`);
            rt.set(entry.key.substring(prefix.length), unpackValue(entry));
        }
        return Promise.resolve(rt);
    }

}

class RollbackError extends Error { }
