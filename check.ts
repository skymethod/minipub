export function check<T>(name: string, value: T, isValid: boolean | ((value: T) => boolean)): boolean {
    const valid = typeof isValid === 'boolean' && isValid || typeof isValid === 'function' && isValid(value);
    if (!valid) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

export function isNonEmpty(value: string) {
    return value.trim().length > 0;
}

export function isValidUrl(url: string) {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http' || protocol === 'https';
    } catch {
        return false;
    }
}

// deno-lint-ignore no-explicit-any
export function isStringRecord(obj: any): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}
