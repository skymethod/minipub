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

// workaround for https://github.com/microsoft/TypeScript/issues/17002
// deno-lint-ignore no-explicit-any
export function isReadonlyArray(arg: any): arg is readonly any[] {
    return Array.isArray(arg);
}

export function isValidSha256(sha256: string) {
    return /^[0-9a-f]{64}$/.test(sha256);
}

export function isValidLang(lang: string) {
    return /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(lang);
}

export function isValidIso8601(text: string): boolean {
    // 2021-04-14T10:25:42Z
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(text);
}

export function isPositiveInteger(value: number) {
    return Number.isInteger(value) && value > 0;
}

export function isValidHttpStatus(value: number) {
    return Number.isInteger(value) && value >= 100 && value < 600;
}

export function isValidOrigin(origin: string) {
    // https-only
    // no port
    // no trailing slash
    // no underscores
    try {
        const { protocol, hostname, port } = new URL(origin);
        return protocol === 'https:' && isValidHostname(hostname) && port === '' && origin === `https://${hostname}`;
    } catch {
        return false;
    }
}

export function isValidHostname(hostname: string) {
    return /^[a-z0-9-]+(\.[a-z0-9-]+){1,5}$/.test(hostname);
}
