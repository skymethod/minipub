import { assertStrictEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { isStringRecord } from './check.ts';
import { computeCreateUser } from './rpc_endpoint.ts';
import { CreateUserRequest } from './rpc_model.ts';
import { BackendStorageTransaction } from './storage.ts';
import { BackendStorageValue } from './storage.ts';
import { BackendStorage } from './storage.ts';
import { isValidUuid } from './uuid.ts';

Deno.test('rpc endpoint', async () => {
    const req: CreateUserRequest = {
        kind: 'create-user',
        username: 'alice',
    };
    const storage = InMemoryStorageTransaction.makeStorage();
    const { uuid } = await computeCreateUser(req, 'https://example.social', storage);
    assertStrictEquals(isValidUuid(uuid), true);
});

//

const DEBUG = false;

class InMemoryStorageTransaction implements BackendStorageTransaction {

    static makeStorage(): BackendStorage {
        return {
            // deno-lint-ignore no-explicit-any
            transaction: (closure: (txn: InMemoryStorageTransaction) => any) => {
                const tx = new InMemoryStorageTransaction();
                return closure(tx);
            }
        }
    }

    rollback() {
        throw new Error();
    }

    get(domain: string, key: string): Promise<BackendStorageValue | undefined> {
        if (DEBUG) console.log(`get ${domain} ${key}`);
        return Promise.resolve(undefined);
    }

    put(domain: string, key: string, value: BackendStorageValue): Promise<void> {
        if (DEBUG) console.log(`put ${domain} ${key} ${isStringRecord(value) ? JSON.stringify(value, undefined, 2) : value}`);
        return Promise.resolve();
    }

    putAll(_domainsToKeysToValues: Record<string, Record<string, BackendStorageValue>>): Promise<void> {
        throw new Error();
    }

}
