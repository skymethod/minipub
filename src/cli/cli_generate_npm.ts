import { fromFileUrl, resolve, basename, join } from './deps_cli.ts';

export async function generateNpm(_args: (string | number)[], _options: Record<string, unknown>) {
    await generateEsmMainJs();
    await generateCjsMainJs();
    await generateMainTypes();
}

//

async function generateEsbuildBundle({ format, target }: { format: 'esm' | 'cjs', target: string }) {
    const res = await fetch(`https://esb.deno.dev/format=${format},target=${target}/https://raw.githubusercontent.com/skymethod/minipub/master/src/threadcap/threadcap.ts`);
    if (res.status !== 200) throw new Error();
    return await res.text();
}

async function generateEsmMainJs() {
    const contents = await generateEsbuildBundle({ format: 'esm', target: 'es2019' }); // remove optional chaining for esm too, to support folks using modules, but still on older environments
    await saveContentsIfChanged('../../../npm/threadcap/esm/main.js', contents);
}

async function generateCjsMainJs() {
    const contents = await generateEsbuildBundle({ format: 'cjs', target: 'es2019' }); // remove optional chaining
    await saveContentsIfChanged('../../../npm/threadcap/cjs/main.js', contents);
}

async function generateMainTypes() {
    let outDir: string | undefined;
    try {
        outDir = await Deno.makeTempDir({ prefix: 'minipub-generate-npm-main-types'});

        const threadcapDir = resolveRelativeFile('../../threadcap');
        const p = Deno.run({ cmd: [ '/usr/local/bin/tsc', '--emitDeclarationOnly', '--declaration', '--outDir', outDir, 'threadcap.ts' ], cwd: threadcapDir, stderr: 'piped', stdout: 'piped' });
        const [ _status, _stdout, _stderr ] = await Promise.all([ p.status(), p.output(), p.stderrOutput() ]);
        const contents = await Deno.readTextFile(join(outDir, 'threadcap.d.ts'));
        await saveContentsIfChanged('../../../npm/threadcap/main.d.ts', contents);
    } finally {
        if (outDir) {
            await Deno.remove(outDir, { recursive: true });
        }
    }
}

function resolveRelativeFile(relativePath: string): string {
    return resolve(fromFileUrl(import.meta.url), relativePath);
}

async function saveContentsIfChanged(relativePath: string, contents: string) {
    const outFile = resolveRelativeFile(relativePath);
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
