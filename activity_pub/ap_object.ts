// deno-lint-ignore-file no-explicit-any
import { Iri } from './iri.ts';
import { ApContext } from './ap_context.ts';
import { isStringRecord } from '../check.ts';

// https://www.w3.org/TR/activitypub/#obj

export class ApObject {

    readonly type: Iri;

    private readonly context: ApContext;
    private readonly record: Record<string, unknown>;

    private constructor(type: Iri, context: ApContext, record: Record<string, unknown>) {
        this.type = type;
        this.context = context;
        this.record = record;
    }

    static parseJson(json: string): ApObject {
        return JSON.parse(json);
    }

    static parseObj(obj: any): ApObject {
        if (!isStringRecord(obj)) throw new Error(`Bad obj: expected object, found ${JSON.stringify(obj)}`);
        if (typeof obj.type !== 'string') throw new Error(`ActivityPub objects must have a 'type' property`);
        const context = ApContext.parse(obj['@context']);
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
