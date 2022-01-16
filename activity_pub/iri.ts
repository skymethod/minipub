import { check, isValidUrl } from '../check.ts';

export class Iri {
    private readonly value: string;

    constructor(iri: string) {
        check('iri', iri, isValidUrl); // limit to valid http(s) urls until we find otherwise
        this.value = iri;
    }

    toString() {
        return this.value;
    }

}
