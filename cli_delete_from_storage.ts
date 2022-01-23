import { parseRpcOptions, sendRpc } from './cli.ts';
import { DeleteFromStorageRequest } from './rpc_model.ts';

export async function deleteFromStorage(args: (string | number)[], options: Record<string, unknown>) {
    const [ domain, key ] = args;

    if (typeof domain !== 'string') throw new Error('Provide domain as the first argument, e.g. minipub delete-from-storage <domain> <key>');
    if (typeof key !== 'string') throw new Error('Provide key as the second argument, e.g. minipub delete-from-storage <domain> <key>');
    
    const { origin, privateKey } = await parseRpcOptions(options);

    const req: DeleteFromStorageRequest = {
        kind: 'delete-from-storage',
        domain,
        key,
    };
    await sendRpc(req, origin, privateKey);
}
