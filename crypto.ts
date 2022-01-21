import { Bytes, chunk, toIMF } from './deps.ts';

export async function computeHttpSignatureHeaders(opts: { method: string, url: string, body: string, privateKey: CryptoKey, keyId: string }): Promise<{ signature: string, date: string, digest: string, stringToSign: string }> {
    const { method, url, body, privateKey, keyId } = opts;
    const { pathname, hostname } = new URL(url);
    const digest = `SHA-256=${(await Bytes.ofUtf8(body).sha256()).base64()}`;
    const date = toIMF(new Date());
    const stringToSign = `(request-target): ${method.toLowerCase()} ${pathname}\nhost: ${hostname}\ndate: ${date}\ndigest: ${digest}`;
    const signatureBytes = await rsaSign(privateKey, Bytes.ofUtf8(stringToSign));
    const signature = `keyId="${keyId}",headers="(request-target) host date digest",signature="${signatureBytes.base64()}"`;
    return { signature, date, digest, stringToSign };
}

export async function validateHttpSignature(opts: { method: string, url: string, headers: Headers, body: string, publicKeyProvider: (keyId: string) => Promise<CryptoKey>, allowedSecondsInThePast?: number, allowedSecondsInTheFuture?: number }): Promise<{ keyId: string, diffMillis: number }> {
    const { method, url, headers, body, publicKeyProvider, allowedSecondsInThePast, allowedSecondsInTheFuture } = opts;

    // check required headers
    const date = headers.get('date');
    if (!date) throw new Error(`Date header is required`);
    const digest = headers.get('digest');
    if (!digest) throw new Error(`Digest header is required`);
    const signature = headers.get('signature');
    if (!signature) throw new Error(`Signature header is required`);

    // check signature
    const { keyId: sigKeyId, headers: sigHeaders, signature: sigSignature } = parseSignatureHeader(signature);
    const lines: string[] = [];
    for (const name of sigHeaders.split(/\s+/)) {
        const value = name === '(request-target)' ? `${method.toLowerCase()} ${new URL(url).pathname}`
            : name === 'host' ? headers.get(name) || new URL(url).hostname
            : headers.get(name);
        if (!value) throw new Error(`Bad signature (${name} not found): ${signature}`);
        lines.push(`${name}: ${value}`);
    }
    const stringToSign = lines.join('\n');
    const verified = await rsaVerify(await publicKeyProvider(sigKeyId), Bytes.ofBase64(sigSignature), Bytes.ofUtf8(stringToSign));
    if (!verified) throw new Error(`Bad signature: ${sigSignature}`);

    // check digest
    const [ digestName, digestValue ] = splitOne(digest, '=');
    if (digestName === 'SHA-256') {
        const expectedDigest = (await Bytes.ofUtf8(body).sha256()).base64();
        if (expectedDigest !== digestValue) throw new Error(`Bad SHA-256 ${digestValue}, expected ${expectedDigest}`);
    } else {
        throw new Error(`Digest ${digestName} is not supported`);
    }
    
    // check date
    const now = new Date();
    const sent = new Date(date);
    const diffMillis = now.getTime() - sent.getTime();
    const allowedMillisInThePast = (allowedSecondsInThePast || DEFAULT_ALLOWED_SECONDS_IN_THE_PAST) * 1000;
    const allowedMillisInTheFuture = (allowedSecondsInTheFuture || DEFAULT_ALLOWED_SECONDS_IN_THE_FUTURE) * 1000;
    if (-diffMillis < -allowedMillisInThePast || -diffMillis > allowedMillisInTheFuture) throw new Error(`Bad date ${date}, diffMillis ${diffMillis} is outside the allowed range`);

    return { keyId: sigKeyId, diffMillis };
}

function parseSignatureHeader(signature: string): { keyId: string, headers: string, signature: string } {
    const map = new Map<string, string>();
    for (const nvp of signature.split(',')) {
        const m = /^\s*([a-zA-Z]+)\s*=\s*"(.*?)"\s*$/.exec(nvp);
        if (!m) throw new Error(`Bad signature: ${signature}`);
        const name = m[1];
        const value = m[2];
        map.set(name, value);
    }
    const keyId = map.get('keyId');
    if (!keyId) throw new Error(`Bad signature (missing keyId): ${signature}`);
    const headers = map.get('headers');
    if (!headers) throw new Error(`Bad signature (missing headers): ${signature}`);
    const signature_ = map.get('signature');
    if (!signature_) throw new Error(`Bad signature (missing signature): ${signature}`);
    return { keyId, headers, signature: signature_ };
}

export async function generateExportableRsaKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // equivalent to 65537
            hash: { name: 'SHA-256' },
        },
        true, // extractable
        ['sign', 'verify'],
    );
}

export async function rsaSign(privateKey: CryptoKey, data: Bytes): Promise<Bytes> {
    const buf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data.array());
    return new Bytes(new Uint8Array(buf));
}

export async function rsaVerify(publicKey: CryptoKey, signature: Bytes, data: Bytes) {
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature.array(), data.array());
}

export async function exportKeyToPem(key: CryptoKey, type: 'private' | 'public'): Promise<string> {
    const exported = new Bytes(new Uint8Array(await crypto.subtle.exportKey(type === 'private' ? 'pkcs8' : 'spki', key)));
    const b64 = exported.base64();
    const typeUpper = type.toUpperCase();
    return [`-----BEGIN ${typeUpper} KEY-----`, ...chunk([...b64], 64).map(v => v.join('')), `-----END ${typeUpper} KEY-----`].join('\n');
}

export async function importKeyFromPem(pemText: string, type: 'private' | 'public'): Promise<CryptoKey> {
    const typeUpper = type.toUpperCase();
    const b64 = pemText.substring(`-----BEGIN ${typeUpper} KEY-----`.length, pemText.length - `-----END ${typeUpper} KEY-----`.length).replaceAll(/\s+/g, '');
    const pemBytes = Bytes.ofBase64(b64);
    return await crypto.subtle.importKey(
        type === 'private' ? 'pkcs8' : 'spki',
        pemBytes.array(),
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
        },
        false, // extractable
        [ type === 'private' ? 'sign' : 'verify' ],
    );
}

//

const DEFAULT_ALLOWED_SECONDS_IN_THE_PAST = 60 * 60 * 12; // 12 hours
const DEFAULT_ALLOWED_SECONDS_IN_THE_FUTURE = 60 * 60; // 1 hour

function splitOne(str: string, sep: string): [string, string] {
    const [ first, ...rest] = str.split(sep);
    return [ first, rest.join(sep) ];
}
