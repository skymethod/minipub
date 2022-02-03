// deno-lint-ignore-file no-explicit-any
import { fromFileUrl, resolve, basename } from './deps_cli.ts';

export async function generateNpm(_args: (string | number)[], _options: Record<string, unknown>) {
    await generateMainJs();
    await generateMainTypes();
}

//

async function generateMainJs() {
    // requires --unstable
    const result = await (Deno as any).emit('./threadcap/threadcap.ts', { 
        bundle: 'module', 
        compilerOptions: { 
            // declaration: true, // doesn't work with bundle: module
            emitDeclarationOnly: true,
        },
    });
    const contents = result.files['deno:///bundle.js'];
    await saveContentsIfChanged('../npm/threadcap/main.js', contents);
}

async function generateMainTypes() {
    // requires --unstable
    const result = await (Deno as any).emit('./threadcap/threadcap.ts', { 
        // bundle: 'classic', 
        compilerOptions: { 
            declaration: true, // doesn't work with bundle: module
            emitDeclarationOnly: true,
            removeComments: false,

        },
    });
    const contents = result.files['file:///Users/js/data/repos-llc/minipub/threadcap/threadcap.ts.d.ts']
        .replaceAll(/\/\/\/ <amd-module name=".*?" \/>\s+/g, '');
    await saveContentsIfChanged('../npm/threadcap/main.d.ts', contents);
}

async function saveContentsIfChanged(relativePath: string, contents: string) {
    const outFile = resolve(fromFileUrl(import.meta.url), relativePath);
    const filename = basename(outFile);
    const existing = await tryReadTextFile(outFile);
    if (existing !== contents) {
        console.log(`${filename} changed, saving ${outFile}...`);
        await Deno.writeTextFile(outFile, contents);
        console.log('...saved');
    } else {
        console.log(`${filename} unchanged`);
    }
}

async function tryReadTextFile(path: string): Promise<string | undefined> {
    try {
        return await Deno.readTextFile(path);
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return undefined;
        }
        throw e;
    }
}