import { assertEquals } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { LdObject } from './ld_object.ts';
import minipubActor from './ld_object_test_data/minipub_actor.json' assert { type: 'json' };

Deno.test('LdObject roundtrips', () => {
    const obj1 = {};
    for (const obj of [ obj1, minipubActor ]) {
        const ldo = LdObject.parseObj(obj);
        assertEquals(ldo.toObj(), obj);
    }
});
