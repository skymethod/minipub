import { validateHttpSignature as validateHttpSignature_ } from '../crypto.ts';
import { makeMinipubFetcher } from '../fetcher.ts';
import { fetchPublicKey } from '../fetch_public_key.ts';

export async function validateHttpSignature(args: (string | number)[], _options: Record<string, unknown>) {
    const [ inputFilePath ] = args;

    if (typeof inputFilePath !== 'string') throw new Error('Provide input file path as an argument, e.g. minipub validate-http-signature <path-to-input-file>');

    const txt = await Deno.readTextFile(inputFilePath);
    let started = false;
    let url: string | undefined;
    let body: string | undefined;
    const prefixLen = ' | [log] '.length;
    const headers = new Headers();
    for (const line of txt.split('\n')) {
        if (started) {
            if (!body) {
                body = line.substring(prefixLen);
            } else {
                // | [log]   accept-encoding: gzip
                const trimmed = line.substring(prefixLen).trim();
                const i = trimmed.indexOf(':');
                if (i < 0) {
                    break;
                } else {
                    const name = trimmed.substring(0, i);
                    const value = trimmed.substring(i + 1).trim();
                    headers.set(name, value);
                }
            }
        } else {
            const m = /^ \| \[log\] POST (https:\/\/.*?\/[0-9a-f]{32}\/inbox)$/.exec(line);
            if (m) {
                url = m[1];
                started = true;
            }
        }
        
    }
    if (url && body) {
        console.log('found ' + url);
        const fetcher = makeMinipubFetcher();
        const { keyId, diffMillis } = await validateHttpSignature_({ method: 'POST', url, headers, body, publicKeyProvider: keyId => fetchPublicKey(keyId, fetcher) });
        console.log('valid!', { keyId, diffMillis });
    } else {
        console.warn('No POST /inbox found');
    }
}
