import { assertStrictEquals } from 'https://deno.land/std@0.191.0/testing/asserts.ts';
import { makeSqliteStorage } from './sqlite_storage.ts';

Deno.test('SqliteStorage', async () => {
    
    const storage = makeSqliteStorage();

    let values = await storage.transaction(async tx => await tx.getAll('domain1', [ 'key1', 'key2' ]));
    assertStrictEquals(values.size, 0);
    await storage.transaction(async tx => await tx.put('domain1', 'key1', { value: 'value1' }));
    values = await storage.transaction(async tx => await tx.getAll('domain1', [ 'key1', 'key2' ]));
    assertStrictEquals(values.size, 1);
    await storage.transaction(async tx => await tx.put('domain1', 'key2', { value: 'value2' }));
    await storage.transaction(async tx => await tx.put('domain2', 'key3', { value: 'value3' }));
    values = await storage.transaction(async tx => await tx.getAll('domain1', [ 'key1', 'key2' ]));
    assertStrictEquals(values.size, 2);

});
