import { parseRpcOptions, sendRpc } from './cli.ts';
import { UndoLikeRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function undoLike(args: (string | number)[], options: Record<string, unknown>) {
    const [ activityUuid ] = args;

    if (typeof activityUuid !== 'string' || !isValidUuid(activityUuid)) throw new Error('Provide the like activity uuid as the first argument, e.g. minipub undo-like <uuid>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: UndoLikeRequest = {
        kind: 'undo-like',
        activityUuid,
    };
    await sendRpc(req, origin, privateKey);
}
