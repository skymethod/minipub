import { ColoFromTrace, DurableObjectState } from './deps.ts';

export class StorageDO {

    private readonly state: DurableObjectState;
    
    private colo!: string;

    constructor(state: DurableObjectState) {
        this.state = state;
        
        this.state.blockConcurrencyWhile(async () => {
            this.colo = await new ColoFromTrace().get();
        });
    }

    fetch(request: Request): Promise<Response> {
        console.log(request.url);
        const { colo } = this;
        const durableObjectName = request.headers.get('do-name');
        console.log('logprops:', { colo, durableObjectClass: 'StorageDO', durableObjectId: this.state.id.toString(), durableObjectName });

        throw new Error('Not implemented');
    }
    
}
