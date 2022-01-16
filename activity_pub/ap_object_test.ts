import { assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { ApObject } from './ap_object.ts';
import minipubActor from './ap_object_test_data/minipub_actor.json' assert { type: 'json' };
import mastodonActor from './ap_object_test_data/mastodon_actor.json' assert { type: 'json' };

Deno.test('ApObject', () => {

    const invalids = [
        1, null, undefined, [], new Error(), () => {},
        {}, { foo: 'bar' },
        // deno-lint-ignore no-explicit-any
        (() => { const e = new Error(); (e as any).type = 'foo'; return e; })(),
    ];
    for (const invalid of invalids) {
        assertThrows(() => ApObject.parseObj(invalid), undefined, undefined, `ApObject.parseObj(${JSON.stringify(invalid)})`);
    }

    // round trips
    const obj1 = { type: 'Person' };
    for (const obj of [ obj1, minipubActor, mastodonActor ]) {
        const ldo = ApObject.parseObj(obj);
        assertEquals(ldo.toObj(), obj);
    }

    // type resolution
    assertStrictEquals(ApObject.parseObj({ type: 'Person' }).type.toString(), 'https://www.w3.org/ns/activitystreams#Person');

});
