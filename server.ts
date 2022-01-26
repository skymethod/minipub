import { check, isValidOrigin } from './check.ts';
import { validateHttpSignature } from './crypto.ts';
import { Responses } from './endpoints/responses.ts';
import { matchRpc } from './endpoints/rpc_endpoint.ts';
import { Fetcher, makeMinipubFetcher } from './fetcher.ts';

export type ServerRequestOptions = { origin: string, adminIp: string, adminPublicKey: CryptoKey, requestIp: string };
export type ServerRequestOptionsProvider = () => Promise<ServerRequestOptions>;

export type ServerRequestRouterOptions = { isRpc: boolean, method: string, pathname: string, searchParams: URLSearchParams, headers: Headers, bodyText: string | undefined, canonicalUrl: string, fetcher: Fetcher };
export type ServerRequestRouter = (opts: ServerRequestRouterOptions) => Promise<Response | undefined>;

export async function computeServerResponse(request: Request, optionsProvider: ServerRequestOptionsProvider, router: ServerRequestRouter): Promise<Response> {
    const response = await computeResponse(request, optionsProvider, router);
    console.log(`${response.status} response, content-type=${response.headers.get('content-type')}`);
    return response;
}

//

async function computeResponse(request: Request, optionsProvider: ServerRequestOptionsProvider, router: ServerRequestRouter): Promise<Response> {
    const { url, method, headers } = request;
    const urlObj = new URL(url);
    const { pathname, searchParams } = urlObj;
    console.log(`${method} ${url}`);
    try {
        const { origin, requestIp, adminIp, adminPublicKey } = await optionsProvider();
        check('origin', origin, isValidOrigin);
        const fetcher = makeMinipubFetcher({ origin });
        const bodyText = request.body ? await request.text() : undefined;
        if (!!request.body || bodyText) console.log('request.hasBody', !!request.body, 'bodyText', bodyText);
        const whitelisted = requestIp.split(',').map(v => v.trim()).includes(adminIp);
        if (!whitelisted) {
            for (const [ name, value ] of headers.entries()) {
                console.log(`  ${name}: ${value}`);
            }
        }
        console.log('whitelisted', whitelisted);
        let canonicalUrl = url;
        if (urlObj.origin !== origin) {
            canonicalUrl = url.replace(urlObj.origin, origin);
            console.log('canonicalUrl', canonicalUrl);
        }

        const isRpc = whitelisted && !!bodyText && matchRpc(method, pathname);
        if (isRpc) {
            // auth is required (admin)
            // check http signature
            const publicKeyProvider = (keyId: string) => {
                if (keyId !== 'admin') throw new Error(`Unsupported keyId: ${keyId}`);
                return Promise.resolve(adminPublicKey);
            };
            const { diffMillis } = await validateHttpSignature({ method, url: request.url, body: bodyText, headers: request.headers, publicKeyProvider });
            console.log(`admin request sent ${diffMillis} millis ago`);
        }

        const response = await router({ isRpc, method, pathname, searchParams, headers, bodyText, canonicalUrl, fetcher });
        if (response) return response;
    
        return Responses.notFound();
    } catch (e) {
        console.error('Error in server', e.stack || e);
        return Responses.internalServerError(e);
    }
}
