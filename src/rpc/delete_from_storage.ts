import { DeleteFromStorageRequest, DeleteFromStorageResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';

export async function computeDeleteFromStorage(req: DeleteFromStorageRequest, storage: BackendStorage): Promise<DeleteFromStorageResponse> {
    const { domain, key } = req;
   
    const existed = await storage.transaction(async txn => await txn.delete(domain, key));
    return { kind: 'delete-from-storage', existed };
}
