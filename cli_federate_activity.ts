import { parseRpcOptions, sendRpc } from './cli.ts';
import { FederateActivityRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function federateActivity(args: (string | number)[], options: Record<string, unknown>) {
    const [ activityUuid ] = args;
    const dryRun = !!options['dry-run'];

    if (typeof activityUuid !== 'string' || !isValidUuid(activityUuid)) throw new Error('Provide activity uuid as an argument, e.g. minipub federate-activity <uuid>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: FederateActivityRequest = {
        kind: 'federate-activity',
        activityUuid,
        dryRun,
    };
    await sendRpc(req, origin, privateKey);
}
