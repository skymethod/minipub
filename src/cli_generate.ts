import { exportKeyToPem, generateExportableRsaKeyPair } from './crypto.ts';
import { MINIPUB_VERSION } from './version.ts';

export const generateDescription = 'Generates a new rsa public/private keypair';

export async function generate(_args: (string | number)[], options: Record<string, unknown>) {
    if (options.help) { dumpHelp(); return; }

    const json = !!options.json;

    const key = await generateExportableRsaKeyPair();
    
    const privatePemText = await exportKeyToPem(key.privateKey, 'private');
    const publicPemText = await exportKeyToPem(key.publicKey, 'public');
    console.log(privatePemText);
    console.log(publicPemText);

    if (json) {
        console.log(JSON.stringify({ privatePemText, publicPemText }, undefined, 2));
    }
}

//

function dumpHelp() {
    const lines = [
        `minipub-cli ${MINIPUB_VERSION}`,
        generateDescription,
        '',
        'USAGE:',
        '    minipub generate [OPTIONS]',
        '',
        'OPTIONS:',
        '    --json       Also dump the same keypair as json string constants (useful for pasting into config)',
        '',
        '    --help       Prints help information',
        '    --verbose    Toggle verbose output (when applicable)',
    ];
    for (const line of lines) {
        console.log(line);
    }
}
