import { isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { Bytes } from './deps.ts';
import { extname } from './deps_cli.ts';
import { getMediaTypeForExt } from './media_types.ts';
import { CreateUserRequest, Icon } from './rpc_model.ts';

export async function createUser(_args: (string | number)[], options: Record<string, unknown>) {
    const { origin, privateKey, username, name, url, icon } = await parseUserOptions(options);
    if (typeof username !== 'string') throw new Error('Provide username, e.g. --username alice');

    const req: CreateUserRequest = {
        kind: 'create-user',
        username,
        name,
        url,
        icon,
    };
    await sendRpc(req, origin, privateKey);
}

export async function parseUserOptions(options: Record<string, unknown>): Promise<{ origin: string; privateKey: CryptoKey, username?: string; name?: string; url?: string, icon?: Icon; iconSize?: number; }> {
    const { username, name, url, icon, 'icon-size': iconSize } = options;
    if (username !== undefined && typeof username !== 'string') throw new Error(`'username' should be a string, e.g. --username alice`);
    if (name !== undefined && typeof name !== 'string') throw new Error(`'name' should be a string, e.g. --name "Alice Doe"`);
    if (url !== undefined && (typeof url !== 'string' || !isValidUrl(url))) throw new Error(`'url' should be a url, e.g. --url "https://example/users/alice"`);
    if (icon !== undefined && typeof icon !== 'string') throw new Error(`'icon' should be a file path, e.g. --icon /path/to/alice.jpg`);
    if (iconSize !== undefined && typeof iconSize !== 'number') throw new Error(`'icon-size' should be a number, e.g. --icon-size 150`);

    const { origin, privateKey } = await parseRpcOptions(options);

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
    return { origin, privateKey, username, name, url, icon: icon_, iconSize };
}
