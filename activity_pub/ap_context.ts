// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import activityStreams from './activitystreams.json' assert { type: 'json' };
import security from './security.json' assert { type: 'json' };
import { isStringRecord } from '../check.ts';

export class ApContext {

    private readonly context: any;

    private constructor(context: any) {
        this.context = context;
    }
    
    static parse(context: any) {
        return new ApContext(context);
    }

    resolveIri(value: string): Iri  {
        const contexts = computeContexts(this.context);
        const rt = resolve(value, contexts);
        if (!(rt instanceof Iri)) throw new Error(`Bad value: ${value}, expected iri`);
        return rt;
    }

    resolve(value: string): IriOrKeyword {
        const contexts = computeContexts(this.context);
        return resolve(value, contexts);
    }

}

//

type IriOrKeyword = Iri | '@type' | '@id';

function resolve(value: string, contexts: any[]): IriOrKeyword {
    // https://json-ld.org/spec/FCGS/json-ld-api/20180607/#algorithm-1
    if (value === '@id' || value === '@type') return value;

    const knownContexts = new Map<string, any>([ 
        [ 'https://www.w3.org/ns/activitystreams', activityStreams['@context'] ],
        [ 'https://w3id.org/security/v1', security['@context'] ],
    ]);
    const i = value.indexOf(':');
    if (i < 0) {
        for (const item of contexts) {
            const knownContext = knownContexts.get(item);
            if (knownContext) {
                const rt = tryResolveValue(value, knownContext, contexts);
                if (rt === undefined) continue;
                return rt;
            } else if (isStringRecord(item)) {
                const rt = tryResolveValue(value, item, contexts);
                if (rt === undefined) continue;
                return rt;
            } else {
                throw new Error(`resolve(${value}): Unimplemented item: ${JSON.stringify(item)}`);
            }
        }
        return value === '@type' ? '@type' : value === '@id' ? '@id' : new Iri(value);
    } else {
        const prefix = value.substring(0, i);
        const suffix = value.substring(i + 1);
        if (prefix === '_' || suffix.startsWith('//')) return new Iri(value);

        for (const item of contexts) {
            const knownContext = knownContexts.get(item);
            if (knownContext) {
                const rt = tryResolveValue(prefix, knownContext, contexts);
                if (rt === undefined) continue;
                return new Iri(`${rt}${suffix}`);
            } else if (isStringRecord(item)) {
                const rt = tryResolveValue(prefix, item, contexts);
                if (rt === undefined) continue;
                return new Iri(`${rt}${suffix}`);
            } else {
                throw new Error(`resolve(${value}): Unimplemented item: ${JSON.stringify(item)}`);
            }
        }
        throw new Error(value);
    }
}

function tryResolveValue(value: string, context: Record<string, unknown>, contexts: any[]): IriOrKeyword | undefined {
    const contextValue = context[value];
    if (contextValue === undefined) {
        return undefined;
    } else if (typeof contextValue === 'string') {
        return resolve(contextValue, contexts);
    } else if (isStringRecord(contextValue) && typeof contextValue['@type'] === 'string' && typeof contextValue['@id'] === 'string') {
        // {"@id":"ldp:inbox","@type":"@id"}
        // {"@id":"as:published","@type":"xsd:dateTime"}
        return resolve(contextValue['@id'], contexts);
    } else {
        throw new Error(`tryResolveValue: Unimplemented contextValue: ${JSON.stringify(contextValue)}`);
    }
}

function computeContexts(context: any) {
    const contexts: any[] = [];
    if (context === undefined) {
        contexts.push('https://www.w3.org/ns/activitystreams');
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
