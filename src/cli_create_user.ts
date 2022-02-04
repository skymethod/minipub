import { isValidUrl } from './check.ts';
import { parseRpcOptions, sendRpc } from './cli.ts';
import { Bytes } from './deps.ts';
import { extname } from './deps_cli.ts';
import { getMediaTypeForExt } from './media_types.ts';
import { CreateUserRequest, Icon } from './rpc_model.ts';
import { MINIPUB_VERSION } from './version.ts';

export const createUserDescription = 'Creates a new user (Actor) on the server';

export async function createUser(_args: (string | number)[], options: Record<string, unknown>) {
    if (options.help || Object.keys(options).filter(v => v !== '_').length === 0) { dumpHelp(); return; }

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

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        createUserDescription,
        '',
        'USAGE:',
        '    minipub create-user [OPTIONS]',
        '',
        'OPTIONS:',
        `    --origin       (required) Origin of the minipub server (e.g. https://comments.example.com)`,
        `    --pem          (required) Path to the admin's private key pem file (e.g. /path/to/admin.private.pem)`,
        `    --username     (required) Unique username for the user`,
        `    --name         Display name of the user`,
        `    --url          Url of the user profile`,
        `    --icon         Local path to square profile icon, either a .png or .jpg file`,
        `    --icon-size    Width of the square profile icon, in pixels`,
        '',
        '    --help         Prints help information',
        '    --verbose      Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
