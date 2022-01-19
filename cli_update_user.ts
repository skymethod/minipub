import { sendRpc } from './cli.ts';
import { parseUserOptions } from './cli_create_user.ts';
import { UpdateUserRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function updateUser(args: (string | number)[], options: Record<string, unknown>) {
    const [ uuid ] = args;
    if (typeof uuid !== 'string' || !isValidUuid(uuid)) throw new Error('Provide user uuid as an argument, e.g. minipub update-user <uuid>');
    const { origin, privateKey, username, icon, name } = await parseUserOptions(options);
    if ([username, name, icon].every(v => v === undefined)) throw new Error(`Specify at least one property to update`);

    const req: UpdateUserRequest = {
        kind: 'update-user',
        actorUuid: uuid,
        username,
        name,
        icon,
    };
    await sendRpc(req, origin, privateKey);
}
