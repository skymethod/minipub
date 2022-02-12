import { assert, assertStrictEquals } from 'https://deno.land/std@0.125.0/testing/asserts.ts';
import { makeSqliteStorage } from '../sqlite_storage.ts';
import { computeGenerateAdminToken, computeRevokeAdminToken } from './manage_admin_token.ts';
import { getRecord } from '../storage.ts';

Deno.test('manageAdminToken', async () => {
    const storage = makeSqliteStorage();
    
    const { token } = await computeGenerateAdminToken({ kind: 'generate-admin-token'}, storage);

    const tokenFromStorage = async () => await storage.transaction(async txn => await getRecord(txn, 'token', 'admin'));
    const { token: storedToken } = await tokenFromStorage() || {};
    assertStrictEquals(storedToken, token);
    
    const { token: token2 } = await computeGenerateAdminToken({ kind: 'generate-admin-token'}, storage);
    assert(token2 !== token);

    await computeRevokeAdminToken({ kind: 'revoke-admin-token' }, storage);
    assertStrictEquals(await tokenFromStorage(), undefined);
});
