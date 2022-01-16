import { check, isStringRecord } from '../check.ts';
import { ApContext } from './ap_context.ts';
import { Iri } from './iri.ts';

// common behavior for both top-level AP objects and subobjects (object property values);
export class ApObjectValue {
    protected readonly context: ApContext;
    protected readonly record: Record<string, unknown>;

    protected constructor(context: ApContext, record: Record<string, unknown>) {
        this.context = context;
        this.record = record;
    }

    get(property: string): Iri | string | boolean | ApObjectValue | LanguageMap {
        const propertyResolution = this.context.resolve(property);
        const expanded = propertyResolution.target;
        for (const [ name, value ] of Object.entries(this.record)) {
            if (name !== '@context') {
                const resolution = this.context.resolve(name);
                if (resolution && resolution.languageMap === propertyResolution.languageMap) {
                    if (resolution.target.toString() === expanded.toString()) {
                        if (resolution.type === '@id') {
                            if (typeof value === 'string') {
                                return this.context.resolveIri(value);
                            } else if (isStringRecord(value)) {
                                // inline object
                                // {"sharedInbox":"https://example.social/inbox"}
                                // assume object values have been checked recursively prior to this
                                return new ApObjectValue(this.context, value);
                            } else {
                                throw new Error(`get: Unimplemented iri value ${JSON.stringify(value)}`);
                            }
                        } else if (resolution.type === 'xsd:dateTime') {
                            if (typeof value === 'string') {
                                return value;
                            } else {
                                throw new Error(`get: Unimplemented date value ${JSON.stringify(value)}`);
                            }
                        } else if (resolution.type === undefined) {
                            if (typeof value === 'string' || typeof value === 'boolean') {
                                return value;
                            } else if (resolution.languageMap && isStringRecord(value)) {
                                // {"target":{"value":"https://www.w3.org/ns/activitystreams#content"},"languageMap":true}
                                // {"en":"<p>The content</p>"}
                                return new LanguageMap(value);
                            } else {
                                throw new Error(`get: Unimplemented untyped value ${JSON.stringify(value)}, resolution: ${JSON.stringify(resolution)}`);
                            }
                        } else {
                            throw new Error(`get: Unimplemented resolution ${JSON.stringify(resolution)}`);
                        }
                    }
                }
            }
        }
        throw new Error(`Property not found: ${property}`);
    }

}

// https://www.w3.org/TR/json-ld11/#dfn-language-map
export class LanguageMap {
    private readonly record: Record<string, unknown>;

    constructor(record: Record<string, unknown>) {
        this.record = record;
        Object.values(record).forEach(v => {
            check('LanguageMap.value', v, typeof v === 'string');
        });
    }

    keys() {
        return Object.keys(this.record);
    }

    get(key: string): string | undefined {
        const rt = this.record[key];
        if (rt === undefined || typeof rt === 'string') return rt;
        throw new Error(`LanguageMap.get: bad value for ${key}: ${JSON.stringify(rt)}`);
    }
}
