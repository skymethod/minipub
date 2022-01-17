import { readPrivateKey, sendRpc } from './cli.ts';
import { Bytes } from './deps.ts';
import { extname } from './deps_cli.ts';
import { getMediaTypeForExt } from './media_types.ts';
import { CreateUserRequest, Icon } from './rpc_model.ts';

export async function createUser(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, username, icon, iconSize } = options;
    if (typeof origin !== 'string') throw new Error('Provide origin to server, e.g. --origin https://mb.whatever.com');
    if (typeof username !== 'string') throw new Error('Provide username, e.g. --username alice');
    if (icon !== undefined && typeof icon !== 'string') throw new Error('Icon should be file path, e.g. --icon /path/to/alice.jpg');
    if (iconSize !== undefined && typeof iconSize !== 'number') throw new Error('Icon size should be number, e.g. --icon-size 150');

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

    const req: CreateUserRequest = {
        kind: 'create-user',
        username,
        icon: icon_,
    };
    await sendRpc(req, origin, privateKey);
}
