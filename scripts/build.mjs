import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { scripts, styles } from './manifest.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Duplicate trusted engine modules into a Blob worker for off-main-thread meshes.
const workerFiles=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js'));
const workerSource='self.window=self;\n'+(await Promise.all(workerFiles.map(f=>readFile(resolve(root,f),'utf8')))).join('\n')+'\n'+await readFile(resolve(root,'src/continuous/worker-body.js'),'utf8');
await writeFile(resolve(root,'src/continuous/generated-worker.js'),'window.TELLURIC_TOWN_WORKER='+JSON.stringify(workerSource)+';\n');
let shell = await readFile(resolve(root, 'index.html'), 'utf8');
// Update the explicit ordered list so a module addition cannot silently vanish.
const tags = scripts.map(s => `<script src="${s}"></script>`).join('\n');
shell = shell.replace(/<!-- APP-SCRIPTS -->[\s\S]*?<!-- END-APP-SCRIPTS -->/, `<!-- APP-SCRIPTS -->\n${tags}\n<!-- END-APP-SCRIPTS -->`);
if (!shell.includes('<!-- END-APP-SCRIPTS -->'))
    shell = shell.replace('<!-- APP-SCRIPTS -->', `<!-- APP-SCRIPTS -->\n${tags}\n<!-- END-APP-SCRIPTS -->`);
await writeFile(resolve(root, 'index.html'), shell);
let html = shell;
// Replacer FUNCTIONS, not replacement strings. In a string replacement $&, $`, $' and $$
// are substitution sequences, so any source file containing one would splice a copy of the
// surrounding document into the bundle. A name template as ordinary as "Crown of $" is
// enough to trigger it, and the failure surfaces as an unrelated build assertion.
for (const css of styles) {
    const text = await readFile(resolve(root, css), 'utf8');
    html = html.replace(new RegExp(`<link\\b[^>]*\\bhref=["\']${css.replaceAll(".", "\\.")}["\'][^>]*>`, "i"), () => `<style>\n${text}\n</style>`);
}
for (const js of scripts) {
    const text = await readFile(resolve(root, js), 'utf8');
    html = html.replace(`<script src="${js}"></script>`, () => `<script>\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`);
}
if (/<script[^>]+src=|<link[^>]+(?:rel=["']stylesheet|href=["']styles\/)/i.test(html)) throw Error('Build left external scripts or styles in the offline bundle.');
if (html.indexOf('id="omChrome"') > html.indexOf('<script>')) throw Error('Map shell must precede script execution.');
await mkdir(resolve(root, 'dist'), { recursive: true });


await writeFile(resolve(root, 'dist/telluric-onemap.html'), html);
console.log('Built dist/telluric-onemap.html (single-map interface).');
