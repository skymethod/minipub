export function check<T>(name: string, value: T, isValid: boolean | ((value: T) => boolean)): boolean {
    const valid = typeof isValid === 'boolean' && isValid || typeof isValid === 'function' && isValid(value);
    if (!valid) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

export function checkMatches(name: string, value: string, pattern: RegExp): RegExpExecArray {
    const m = pattern.exec(value);
    if (!m) throw new Error(`Bad ${name}: ${value}`);
    return m; 
}

export function isNonEmpty(value: string) {
    return value.trim().length > 0;
}

export function isValidUrl(url: string) {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

// deno-lint-ignore no-explicit-any
export function isStringRecord(obj: any): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj) && obj.constructor === Object;
}

export function isValidSha256(sha256: string) {
    return /^[0-9a-f]{64}$/.test(sha256);
}

export function isValidLang(lang: string) {
    return /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(lang);
}
