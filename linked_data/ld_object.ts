export class LdObject {

    private readonly record: Record<string, unknown>;

    private constructor(record: Record<string, unknown>) {
        this.record = record;
    }

    static parseJson(json: string): LdObject {
        return JSON.parse(json);
    }

    // deno-lint-ignore no-explicit-any
    static parseObj(obj: any): LdObject {
        if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) throw new Error(`Bad obj: expected object, found: ${JSON.stringify(obj)}`);
        return new LdObject(obj);
    }

    // deno-lint-ignore no-explicit-any
    toObj(): any {
        return this.record;
    }

    toJson(space?: string | number): string {
        return JSON.stringify(this.toObj(), undefined, space);
    }

}
