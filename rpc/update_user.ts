import { UpdateUserRequest, UpdateUserResponse } from '../rpc_model.ts';
import { BackendStorage } from '../storage.ts';
import { checkActor } from '../domain_model.ts';
import { ApObject } from '../activity_pub/ap_object.ts';

export async function computeUpdateUser(req: UpdateUserRequest, storage: BackendStorage): Promise<UpdateUserResponse> {
    const { uuid, name } = req;

    let modified = false;

    // in a single transaction:
    await storage.transaction(async txn => {

        const actor = await txn.get('actor', uuid);
        if (actor === undefined) throw new Error(`computeUpdateUser: Actor ${uuid} not found`);
        if (!checkActor(actor)) throw new Error(`computeUpdateUser: Actor ${uuid} data is not valid`);

        const apo = ApObject.parseObj(actor.activityPub);
        if (typeof name === 'string') {
            apo.set('name', name);
        } else if (name === null) {
            apo.delete('name');
        }
        if (apo.modified) {
            apo.set('updated', new Date().toISOString());
            actor.activityPub = apo.toObj();
            await txn.put('actor', uuid, actor);
            modified = true;
        }

    });
    return { kind: 'update-user', uuid, modified };
}
