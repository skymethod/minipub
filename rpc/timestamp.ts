import { checkMatches } from '../check.ts';

export function computeTimestamp(instant: string): string {
    const m = checkMatches('instant', instant, /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/);
    const [ _, yyyy, mm, dd, hh, min, ss, ms ] = m;
    const millis = (ms || '').substring(1).padEnd(3, '0').substring(0, 3);
    return [ yyyy, mm, dd, hh, min, ss, millis].join('');
}
