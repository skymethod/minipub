// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import { ApContext, UnresolvedIriError } from './ap_context.ts';
import { check, isStringRecord, isValidLang } from '../check.ts';
import { ApObjectValue } from './ap_object_value.ts';

// https://www.w3.org/TR/activitypub/#obj

// top-level activity-pub object, usually parsed from a JSON document with media type: application/activity+json
export class ApObject extends ApObjectValue {

    readonly type: Iri;

    private constructor(type: Iri, context: ApContext, record: Record<string, unknown>) {
        super(context, record);
        this.type = type;
    }

    static parseJson(json: string): ApObject {
        return JSON.parse(json);
    }

    static parseObj(obj: any, callback: ParseCallback = DEFAULT_PARSE_CALLBACK): ApObject {
        if (!isStringRecord(obj)) throw new Error(`Bad obj: expected object, found ${JSON.stringify(obj)}`);

        const context = ApContext.parse(obj['@context']);

        checkProperties(obj, context, callback);

        if (typeof obj.type !== 'string') throw new Error(`ActivityPub objects must have a 'type' property`);
        
        const type = context.resolveIri(obj.type);
        return new ApObject(type, context, obj);
    }

    toObj(): any {
        return this.record;
    }

    toJson(space?: string | number): string {
        return JSON.stringify(this.toObj(), undefined, space);
    }
    
}

export interface ParseCallback {
    onUnresolvedProperty(name: string, value: any, context: ApContext): void;
}

//

const DEFAULT_PARSE_CALLBACK: ParseCallback = {
    onUnresolvedProperty: (name, value) => { throw new Error(`Unresolved property: "${name}": ${JSON.stringify(value)}`); }
}

function checkProperties(obj: Record<string, unknown>, context: ApContext, callback: ParseCallback) {
    for (const [name, value] of Object.entries(obj)) {
        if (name === '@context') {
            // assume handled separately
        } else if (name.startsWith('@')) {
            throw new Error(`checkProperties: Unimplemented property ${name}`);
        } else {
            let res; try { res = context.resolve(name); } catch (e) {
                if (e instanceof UnresolvedIriError) {
                    callback.onUnresolvedProperty(name, value, context);
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
                            checkProperties(langValue, context, callback);
                        }
                    }
                } else {
                    checkProperties(value, context, callback);
                }
            }
        }
    }
}
