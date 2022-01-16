import { isStringRecord } from '../check.ts';
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

    get(property: string): Iri | string | boolean | ApObjectValue {
        const expanded = this.context.resolve(property).target;
        for (const [ name, value ] of Object.entries(this.record)) {
            if (name !== '@context') {
                const resolution = this.context.resolve(name);
                if (resolution) {
                    if (resolution.target.toString() === expanded.toString()) {
                        if (resolution.type === '@id') {
                            if (typeof value === 'string') {
                                return this.context.resolveIri(value);
                            } else if (isStringRecord(value)) {
                                // inline object
                                // {"sharedInbox":"https://example.social/inbox"}
                                checkProperties(value, this.context);
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
                            } else {
                                throw new Error(`get: Unimplemented untyped value ${JSON.stringify(value)}`);
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

export function checkProperties(obj: Record<string, unknown>, context: ApContext) {
    for (const name of Object.keys(obj)) {
        if (name === '@context') {
            // assume handled separately
        } else if (name.startsWith('@')) {
            throw new Error(`Unimplemented property ${name}`);
        } else {
            context.resolve(name);
        }
    }
}
