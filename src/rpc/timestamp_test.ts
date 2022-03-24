import { assertStrictEquals } from 'https://deno.land/std@0.131.0/testing/asserts.ts';
import { checkMatches } from '../check.ts';
import { computeTimestamp } from './timestamp.ts';

Deno.test('computeTimestamp', () => {
    const instants = [
        new Date().toISOString(),
        '2122-01-19T18:11:54.833Z',
        '2022-01-19T18:11:54Z',
        '2022-01-19T18:11:54.1Z',
        '2022-01-19T18:11:54.12Z',
        '2022-01-19T18:11:54.123Z',
        '2022-01-19T18:11:54.1234Z',
        '2022-01-19T18:11:54.12345Z',
    ];
    for (const instant of instants) {
        const timestamp = computeTimestamp(instant);
        checkMatches('timestamp', timestamp, /^\d{17}$/);
    }

    assertStrictEquals(computeTimestamp('2022-01-19T18:11:54Z'), '20220119181154000');
    assertStrictEquals(computeTimestamp('2022-01-19T18:11:54.1Z'), '20220119181154100');
    assertStrictEquals(computeTimestamp('2022-01-19T18:11:54.12Z'), '20220119181154120');
    assertStrictEquals(computeTimestamp('2022-01-19T18:11:54.123Z'), '20220119181154123');
    assertStrictEquals(computeTimestamp('2022-01-19T18:11:54.1234Z'), '20220119181154123');
});
