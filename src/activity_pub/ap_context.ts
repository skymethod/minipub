// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import activityStreams from './activitystreams.json' with { type: 'json' };
import security from './security.json' with { type: 'json' };
import litepub from './litepub.json' with { type: 'json' };
import mastodon from './mastodon.json' with { type: 'json' };
import { isStringRecord } from '../check.ts';

export class ApContext {

    readonly parseCallback: ParseCallback;

    private readonly context: any; // the raw @context value

    private constructor(context: any, parseCallback: ParseCallback) {
        this.context = context;
        this.parseCallback = parseCallback;
    }
    
    static parse(context: any, parseCallback: ParseCallback = DEFAULT_PARSE_CALLBACK) {
        return new ApContext(context, parseCallback);
    }

    resolveIri(value: string): Iri  {
        const contexts = computeContexts(this.context);
        const rt = resolve(value, contexts);
        if (!(rt.target instanceof Iri)) throw new Error(`Bad value: ${value}, expected iri, found: ${rt.target}`);
        return rt.target;
    }

    resolve(value: string): Resolution {
        const contexts = computeContexts(this.context);
        return resolve(value, contexts);
    }

    isPleromaContext() {
        const stringContexts = computeContexts(this.context).filter(v => typeof v === 'string');
        return stringContexts.length === 2 
            && stringContexts[0] === 'https://www.w3.org/ns/activitystreams' 
            && isLitepubNamespace(stringContexts[1]);
    }
    
}

export interface ParseCallback {
    onUnresolvedProperty(name: string, value: any, context: ApContext, phase: 'check' | 'find'): void;
}

export interface Resolution {
    readonly target: Iri | '@type' | '@id';
    readonly type?: string;
    readonly languageMap?: boolean;
}

export class UnresolvedIriError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnresolvedIriError';
    }
}

export function isLitepubNamespace(value: string) {
    return value.endsWith('/schemas/litepub-0.1.jsonld') && (value.startsWith('https:') || value.startsWith('http:'));
}

//

const DEFAULT_PARSE_CALLBACK: ParseCallback = {
    onUnresolvedProperty: (name, value) => { throw new Error(`Unresolved property: "${name}": ${JSON.stringify(value)}`); }
}

// pleroma serves under every instance!  e.g. https://example.social/schemas/litepub-0.1.jsonld
// use a made-up canonical namespace (current gitlab source link)
const litepubNamespace = 'https://git.pleroma.social/pleroma/pleroma/-/blob/develop/priv/static/schemas/litepub-0.1.jsonld';

const knownContexts = new Map<string, any>([ 
    [ 'https://www.w3.org/ns/activitystreams', activityStreams['@context'] ],
    [ 'https://w3id.org/security/v1', security['@context'] ],
    [ litepubNamespace, litepub['@context'] ],
    [ 'http://joinmastodon.org/ns', mastodon['@context'] ], // unofficial jsonld from found contexts and https://github.com/mastodon/mastodon/blob/main/app/lib/activitypub/adapter.rb
]);

function findKnownContext(context: any) {
    if (typeof context === 'string' && isLitepubNamespace(context)) {
        context = litepubNamespace;
    }
    return knownContexts.get(context);
}

function resolve(value: string, contexts: any[]): Resolution {
    // https://json-ld.org/spec/FCGS/json-ld-api/20180607/#algorithm-1
    if (value === '@id' || value === '@type') return { target: value, type: '@id' };

    const i = value.indexOf(':');
    if (i < 0) {
        for (const item of contexts) {
            const knownContext = findKnownContext(item);
            if (knownContext) {
                const rt = tryResolve(value, knownContext, contexts);
                if (rt === undefined) continue;
                return rt;
            } else if (isStringRecord(item)) {
                const rt = tryResolve(value, item, contexts);
                if (rt === undefined) continue;
                return rt;
            } else {
                throw new Error(`resolve(${value}): Unimplemented item: ${JSON.stringify(item)}`);
            }
        }
        if (value === '@type' || value === '@id') return { target: value, type: '@id' };
        throw new UnresolvedIriError(`Unable to resolve iri for value: ${value}`);
    } else {
        const prefix = value.substring(0, i);
        const suffix = value.substring(i + 1);
        if (prefix === '_' || suffix.startsWith('//')) return { target: new Iri(value) };

        for (const item of contexts) {
            const knownContext = findKnownContext(item);
            if (knownContext) {
                const rt = tryResolve(prefix, knownContext, contexts);
                if (rt === undefined) continue;
                if (!(rt.target instanceof Iri)) throw new Error(`Expected iri for resolved prefix ${prefix}, found: ${rt.target}`);
                return { target: new Iri(`${rt.target}${suffix}`) };
            } else if (isStringRecord(item)) {
                const rt = tryResolve(prefix, item, contexts);
                if (rt === undefined) continue;
                if (!(rt.target instanceof Iri)) throw new Error(`Expected iri for resolved prefix ${prefix}, found: ${rt.target}`);
                return { target: new Iri(`${rt.target}${suffix}`) };
            } else {
                throw new Error(`resolve(${value}): Unimplemented item: ${JSON.stringify(item)}`);
            }
        }
        throw new Error(value);
    }
}

function tryResolve(value: string, context: any, contexts: any[]): Resolution | undefined {
    const contextArr = [];
    if (Array.isArray(context)) {
        contextArr.push(...context);
    } else if (isStringRecord(context)) {
        contextArr.push(context);
    } else {
        throw new Error(`tryResolve: Unimplemented context: ${JSON.stringify(context)}`);
    }
   
    for (const context of contextArr) {
        if (isStringRecord(context)) {
            const contextValue = context[value];
            if (contextValue === undefined) {
                return undefined;
            } else if (typeof contextValue === 'string') {
                return resolve(contextValue, contexts);
            } else if (isStringRecord(contextValue) && typeof contextValue['@id'] === 'string') {
                const res = resolve(contextValue['@id'], contexts);
                if (res === undefined) return undefined;
                if (typeof contextValue['@type'] === 'string') {
                    // {"@id":"ldp:inbox","@type":"@id"}
                    // {"@id":"as:published","@type":"xsd:dateTime"}
                    return { target: res.target, type: contextValue['@type'] };
                } else if (contextValue['@container'] === '@language') {
                    // {"@id":"as:content","@container":"@language"}
                    return { target: res.target, languageMap: true };
                }
            }
            throw new Error(`tryResolve: Unimplemented contextValue: ${JSON.stringify(contextValue)}`);
        } else if (typeof context === 'string') {
            const knownContext = findKnownContext(context);
            if (knownContext) {
                const rt = tryResolve(value, knownContext, contexts);
                if (rt === undefined) continue;
                return rt;
            }
        } else {
            throw new Error(`tryResolve: Unimplemented context: ${JSON.stringify(context)}`);
        }
    }
}

function computeContexts(context: any): any[] {
    const contexts: any[] = [];
    if (context === undefined) {
        // noop
    } else if (typeof context === 'string') {
        contexts.push(context);
    } else if (Array.isArray(context)) {
        for (const item of context) {
            if (typeof item === 'string') {
                contexts.push(item);
            } else if (isStringRecord(item)) {
                contexts.push(item);
            } else {
                throw new Error(`Unimplemented item: ${JSON.stringify(item)}`);
            }
        }
    } else {
        throw new Error(`Unimplemented context: ${context}`);
    }

    if (!contexts.includes('https://www.w3.org/ns/activitystreams')) {
        // must assume normative context still applies
        // https://www.w3.org/TR/activitystreams-core/#jsonld
        contexts.unshift('https://www.w3.org/ns/activitystreams');
    }
    return contexts;
}
