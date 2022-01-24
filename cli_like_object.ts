import { isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { LikeObjectRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function likeObject(args: (string | number)[], options: Record<string, unknown>) {
    const [ actorUuid, objectId ] = args;

    if (typeof actorUuid !== 'string' || !isValidUuid(actorUuid)) throw new Error('Provide user uuid as the first argument, e.g. minipub like-object <uuid> <object-id>');
    if (typeof objectId !== 'string' || !isValidUrl(objectId)) throw new Error('Provide the remote object id (should be an url) as the second argument, e.g. minipub like-object <uuid> <object-id>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: LikeObjectRequest = {
        kind: 'like-object',
        actorUuid,
        objectId,
    };
    await sendRpc(req, origin, privateKey);
}
