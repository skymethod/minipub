import { readPrivateKey, sendRpc } from './cli.ts';
import { Bytes } from './deps.ts';
import { extname } from './deps_cli.ts';
import { getMediaTypeForExt } from './media_types.ts';
import { Icon, UpdateUserRequest } from './rpc_model.ts';
import { isValidUuid } from './uuid.ts';

export async function updateUser(args: (string | number)[], options: Record<string, unknown>) {
    const [ uuid ] = args;
    if (typeof uuid !== 'string' || !isValidUuid(uuid)) throw new Error('Provide user uuid as an argument, e.g. minipub update-user <uuid>');
    const { origin, username, icon, iconSize, name } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (username !== undefined && typeof username !== 'string') throw new Error('Username should be a string, e.g. --username alice');
    if (name !== undefined && typeof name !== 'string') throw new Error('Name should be a string, e.g. --name "Alice Doe"');
    if (icon !== undefined && typeof icon !== 'string') throw new Error('Icon should be file path, e.g. --icon /path/to/alice.jpg');
    if (iconSize !== undefined && typeof iconSize !== 'number') throw new Error('Icon size should be number, e.g. --icon-size 150');
    if ([username, name, icon].every(v => v === undefined)) throw new Error(`Specify at least one property to update`);

    const privateKey = await readPrivateKey(options);

    const computeIcon = async () => {
        if (icon && iconSize) {
            const bytes = await Deno.readFile(icon);
            const ext = extname(icon).substring(1);
            const mediaType = getMediaTypeForExt(ext);
            if (!mediaType) throw new Error(`Unknown to computed media type for ${ext}`);
            const rt: Icon = {
                bytesBase64: new Bytes(bytes).base64(),
                size: iconSize,
                mediaType,
            }
            return rt;
        }
    }
    const icon_ = await computeIcon();

    const req: UpdateUserRequest = {
        kind: 'update-user',
        uuid,
        username,
        name,
        icon: icon_,
    };
    await sendRpc(req, origin, privateKey);
}
