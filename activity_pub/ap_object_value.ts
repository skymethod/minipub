import { check, isStringRecord, isValidIso8601, isValidLang } from '../check.ts';
import { ApContext, Resolution, UnresolvedIriError } from './ap_context.ts';
import { Iri } from './iri.ts';

// common behavior for both top-level AP objects and subobjects (object property values);
export class ApObjectValue {
    protected readonly context: ApContext;
    protected readonly record: Record<string, unknown>;

    private _modified = false;

    protected constructor(context: ApContext, record: Record<string, unknown>) {
        this.context = context;
        this.record = record;
    }

    get modified() {
        return this._modified;
    }

    getString(property: string): string {
        const value = this.get(property);
        if (typeof value === 'string') return value;
        throw new Error(`Bad ${property}: expected string, found ${value}`);
    }

    getIriString(property: string): string {
        const value = this.get(property);
        if (value instanceof Iri) return value.toString();
        throw new Error(`Bad ${property}: expected Iri, found ${value}`);
    }

    optIriString(property: string): string | undefined {
        const value = this.opt(property);
        if (value === undefined) return undefined;
        if (value instanceof Iri) return value.toString();
        throw new Error(`Bad ${property}: expected Iri, found ${value}`);
    }

    get(property: string): Iri | readonly Iri[] | string | boolean | ApObjectValue | LanguageMap {
        const value = this.opt(property);
        if (value === undefined) throw new Error(`Property not found: ${property}`);
        return value;
    }

    opt(property: string): Iri | readonly Iri[] | string | boolean | ApObjectValue | LanguageMap | undefined {
        const prop = findProperty(property, this.context, this.record);
        if (!prop) return undefined;

        const { resolution, value } = prop;

        if (resolution.type === '@id') {
            if (typeof value === 'string') {
                return this.context.resolveIri(value);
            } else if (isStringRecord(value)) {
                // inline object
                // {"sharedInbox":"https://example.social/inbox"}
                // assume object values have been checked recursively prior to this
                return new ApObjectValue(this.context, value);
            } else if (Array.isArray(value)) {
                // ["https://another.social/users/bob"]
                return value.map(v => this.context.resolveIri(v));
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

    delete(property: string): boolean {
        const prop = findProperty(property, this.context, this.record);
        if (!prop) return false;

        delete this.record[prop.name];
        this._modified = true;
        return true;
    }

    set(property: string, value: string | Record<string, unknown>): boolean {
        check('property', property, !property.includes(':'));

        const prop = findProperty(property, this.context, this.record);
        if (prop && this.get(property) === value) return false;

        const resolution = this.context.resolve(property);
        if (resolution.type === undefined) {
            if (typeof value === 'string') {
                this.record[property] = value;
                this._modified = true;
                return true;
            } else {
                throw new Error(`set: Unimplemented value ${JSON.stringify(value)}`);
            }
        } else if (resolution.type === 'xsd:dateTime') {
            check('xsd:dateTime value', value, typeof value === 'string' && isValidIso8601(value));
            this.record[property] = value;
            this._modified = true;
            return true;
        } else if (resolution.type === '@id' && isStringRecord(value)) {
            value = stripUndefinedValues(value);
            checkProperties(value, this.context);
            this.record[property] = value;
            this._modified = true;
            return true;
        } else {
            throw new Error(`set: Unimplemented resolution ${JSON.stringify(resolution)}`);
        }
    }

}

//

export function stripUndefinedValues(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).filter(v => v[1] !== undefined).map(v => [ v[0], isStringRecord(v[1]) ? stripUndefinedValues(v[1]) : v[1]])); 
}

export function checkProperties(obj: Record<string, unknown>, context: ApContext) {
    for (const [name, value] of Object.entries(obj)) {
        if (value === undefined) throw new Error(`ActivityPub does not allow explicitly undefined values`);
        if (name === '@context') {
            // assume handled separately
        } else if (name.startsWith('@')) {
            throw new Error(`checkProperties: Unimplemented property ${name}`);
        } else {
            let res; try { res = context.resolve(name); } catch (e) {
                if (e instanceof UnresolvedIriError) {
                    context.parseCallback.onUnresolvedProperty(name, value, context);
                    continue;
                } else {
                    throw e;
                }
            }
            if (isStringRecord(value)) {
                if (res.languageMap) {
                    for (const [ lang, langValue ] of Object.entries(value)) {
                        check('lang', lang, isValidLang);
                        if (isStringRecord(langValue)) {
                            checkProperties(langValue, context);
                        }
                    }
                } else {
                    checkProperties(value, context);
                }
            }
        }
    }
}

//

function findProperty(property: string, context: ApContext, record: Record<string, unknown>): { resolution: Resolution, name: string, value: unknown } | undefined {
    const propertyResolution = context.resolve(property);
    const expanded = propertyResolution.target;
    for (const [ name, value ] of Object.entries(record)) {
        if (name !== '@context') {
            const resolution = context.resolve(name);
            if (resolution && resolution.languageMap === propertyResolution.languageMap) {
                if (resolution.target.toString() === expanded.toString()) {
                    return { resolution, name, value };
                }
            }
        }
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
