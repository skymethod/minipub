import { ColoFromTrace, DurableObjectState } from './deps.ts';
import { DurableObjectBackendStorage } from './durable_object_backend_storage.ts';
import { computeActivity, matchActivity } from './endpoints/activity_endpoint.ts';
import { computeActor, matchActor } from './endpoints/actor_endpoint.ts';
import { computeBlob, matchBlob } from './endpoints/blob_endpoint.ts';
import { computeObject, matchObject } from './endpoints/object_endpoint.ts';
import { Responses } from './endpoints/responses.ts';
import { computeRpc, matchRpc } from './endpoints/rpc_endpoint.ts';
import { computeWebfinger, matchWebfinger } from './endpoints/webfinger_endpoint.ts';
import { makeMinipubFetcher } from './fetcher.ts';

export class BackendDO {

    private readonly state: DurableObjectState;

    private colo!: string;

    constructor(state: DurableObjectState) {
        this.state = state;
        
        this.state.blockConcurrencyWhile(async () => {
            this.colo = await new ColoFromTrace().get();
        });
    }

    async fetch(request: Request): Promise<Response> {
        const { method, url, headers } = request;
        const { pathname, origin, searchParams } = new URL(url);
        const { colo, state } = this;
        const durableObjectName = headers.get('do-name');
        console.log('logprops:', { colo, durableObjectClass: 'BackendDO', durableObjectId: state.id.toString(), durableObjectName });

        try {
            const fetcher = makeMinipubFetcher({ origin });

            const storage = new DurableObjectBackendStorage(state.storage);
            if (matchRpc(method, pathname)) return await computeRpc(request, origin, storage, fetcher); // assumes auth happened earlier
            const actor = matchActor(method, pathname); if (actor) return await computeActor(actor.actorUuid, storage);
            const object = matchObject(method, pathname); if (object) return await computeObject(object.actorUuid, object.objectUuid, storage);
            const activity = matchActivity(method, pathname); if (activity) return await computeActivity(activity.actorUuid, activity.activityUuid, storage);
            const blob = matchBlob(method, pathname); if (blob) return await computeBlob(blob.actorUuid, blob.blobUuid, blob.ext, storage);
            const webfinger = matchWebfinger(method, pathname, searchParams); if (webfinger) return await computeWebfinger(webfinger.username, webfinger.domain, origin, storage);
            throw new Error('Not implemented');
        } catch (e) {
            console.error('Error in BackendDO', `${e.stack || e}`);
            return Responses.internalServerError(e);
        }
    }
    
}
