import { assert, assertEquals, assertStrictEquals, assertThrows } from 'https://deno.land/std@0.119.0/testing/asserts.ts';
import { ApObject, ParseCallback } from './ap_object.ts';
import minipubActor from './ap_object_test_data/minipub_actor.json' assert { type: 'json' };
import mastodonActor from './ap_object_test_data/mastodon_actor.json' assert { type: 'json' };
import mastodonStatus from './ap_object_test_data/mastodon_status.json' assert { type: 'json' };
import pleromaNote from './ap_object_test_data/pleroma_note.json' assert { type: 'json' };
import { Iri } from './iri.ts';
import { ApObjectValue, LanguageMap } from './ap_object_value.ts';

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

    // slightly more lenient property policy
    const parseCallback: ParseCallback = {
        onUnresolvedProperty: (name, value, context) => {
            if (name === 'repliesCount' && typeof value === 'number' && context.isPleromaContext()) {
                // found unknown "repliesCount" in Pleroma Note objects
            } else {
                throw new Error(`Unknown unresolved property: "${name}": ${JSON.stringify(value)}`);
            }
        }
    };

    // round trips
    const obj1 = { type: 'Person' };
    for (const obj of [ obj1, minipubActor, mastodonActor, mastodonStatus, pleromaNote ]) {
        const apo = ApObject.parseObj(obj, parseCallback);
        assertEquals(apo.toObj(), obj);
    }

    // type resolution
    assertStrictEquals(ApObject.parseObj({ type: 'Person' }).type.toString(), 'https://www.w3.org/ns/activitystreams#Person');

    // get iri value by expanded property iri
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('http://joinmastodon.org/ns#featured').toString(), new Iri('https://example.social/users/alice/collections/featured').toString());
    // get iri value by prefixed property iri
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('toot:featured').toString(), new Iri('https://example.social/users/alice/collections/featured').toString());
    // get iri value by compact property name
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('featured').toString(), new Iri('https://example.social/users/alice/collections/featured').toString());
    // get date value
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('published'), '2020-09-14T00:00:00Z');
    // get type by property name
    assertStrictEquals(ApObject.parseObj({ type: 'Person' }).get('type').toString(), 'https://www.w3.org/ns/activitystreams#Person');
    // get string value
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('name'), 'Alice Doe');
    // get boolean value
    assertStrictEquals(ApObject.parseObj(mastodonActor).get('discoverable'), false);

    // get subobject
    assert(ApObject.parseObj(mastodonActor).get('endpoints') instanceof ApObjectValue);
    assert(!(ApObject.parseObj(mastodonActor).get('endpoints') instanceof ApObject));

    // get subobject value
    assert(ApObject.parseObj(mastodonActor).get('endpoints') instanceof ApObjectValue);
    assert((ApObject.parseObj(mastodonActor).get('endpoints') as ApObjectValue).get('as:sharedInbox').toString(), 'https://example.social/inbox');

    // content map
    assert(ApObject.parseObj(mastodonStatus).get('contentMap') instanceof LanguageMap);
    assertStrictEquals((ApObject.parseObj(mastodonStatus).get('contentMap') as LanguageMap).get('en'), ApObject.parseObj(mastodonStatus).get('content'));
});
