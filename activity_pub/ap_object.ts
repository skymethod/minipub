// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import { ApContext, ParseCallback } from './ap_context.ts';
import { isStringRecord } from '../check.ts';
import { ApObjectValue, checkProperties, stripUndefinedValues } from './ap_object_value.ts';

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

    static parseObj(obj: any, opts: { callback?: ParseCallback, includeDefaultContext?: boolean } = {}): ApObject {
        const { callback, includeDefaultContext } = opts;
        if (!isStringRecord(obj)) throw new Error(`Bad obj: expected object, found ${JSON.stringify(obj)}`);

        if (includeDefaultContext) {
            const rawContext = obj['@context'];
            if (rawContext === undefined) {
                const newObj: Record<string, unknown> = { '@context': 'https://www.w3.org/ns/activitystreams' };
                for (const [ name, value ] of Object.entries(obj)) {
                    newObj[name] = value;
                }
                obj = newObj;
            }
        }
        const context = ApContext.parse( obj['@context'], callback);

        obj = stripUndefinedValues(obj); // ActivityPub does not support explicitly undefined values

        checkProperties(obj, context);

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
