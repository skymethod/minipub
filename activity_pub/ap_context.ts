// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import activityStreams from './activitystreams.json' assert { type: 'json' };

export class ApContext {

    private readonly context: any;

    private constructor(context: any) {
        this.context = context;
    }
    
    static parse(context: any) {
        return new ApContext(context);
    }

    resolveIri(value: string): Iri {
        // https://json-ld.org/spec/FCGS/json-ld-api/20180607/#algorithm-1

        const i = value.indexOf(':');
        if (i < 0) {
            const { context } = this;
            const contexts: any[] = [];
            if (context === undefined) {
                contexts.push('https://www.w3.org/ns/activitystreams');
            } else if (typeof context === 'string') {
                contexts.push(context);
            } else if (Array.isArray(context)) {
                for (const item of context) {
                    if (typeof item === 'string') {
                        contexts.push(item);
                    } else {
                        throw new Error(`Unimplemented item: ${item}`);
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

            for (const item of contexts) {
                if (item === 'https://www.w3.org/ns/activitystreams') {
                    const asValue = (activityStreams['@context'] as any)[value];
                    if (asValue === undefined) {
                        return new Iri(value);
                    } else if (typeof asValue === 'string') {
                        return this.resolveIri(asValue);
                    } else {
                        throw new Error(`Unimplemented asValue: ${asValue}`);
                    }
                } else {
                    throw new Error(`Unimplemented context: ${context}`);
                }
            }
            return new Iri(value);
        } else {
            const prefix = value.substring(0, i);
            const suffix = value.substring(i + 1);
            if (prefix === '_' || suffix.startsWith('//')) return new Iri(value);
            const asValue = (activityStreams['@context'] as any)[prefix];
            if (typeof asValue !== 'string') {
                throw new Error(`Unimplemented asValue: ${asValue}`);
            }
            return new Iri(`${asValue}${suffix}`);
        }
    }

}
