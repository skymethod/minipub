export class BiMap<K, V> {
    private readonly forward: Map<K,V>;
    private readonly reverse: Map<V,K>;

    constructor(entries: readonly (readonly [K, V])[]) {
        this.forward = new Map(entries);
        this.reverse = new Map(entries.map(v => [ v[1], v[0] ]));
    }

    get(key: K): V | undefined {
        return this.forward.get(key);
    }

    reverseGet(val: V): K | undefined {
        return this.reverse.get(val);
    }
    
}
