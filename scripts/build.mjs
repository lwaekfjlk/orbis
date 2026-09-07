import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, sep } from 'node:path';
import { scripts, styles } from './manifest.mjs';
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
// Development CSS keeps its relative URLs; only the offline copy embeds fonts.
async function inlineFontURLs(text, cssFile) {
    const urls = /url\(\s*(?:(["'])(.*?)\1|([^"'()]+))\s*\)/gi;
    const replacements = await Promise.all([...text.matchAll(urls)].map(async match => {
        const url = (match[2] ?? match[3]).trim();
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return match[0];
        const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
        if (!/\.ttf$/i.test(pathname)) return match[0];
        const candidate = pathname.startsWith('/') ? resolve(root, '.' + pathname) : resolve(dirname(cssFile), pathname);
        if (!candidate.startsWith(root + sep)) throw Error(`Font URL leaves project root: ${url}`);
        const fontFile = await realpath(candidate);
        if (!fontFile.startsWith(root + sep)) throw Error(`Font URL leaves project root: ${url}`);
        return `url("data:font/ttf;base64,${(await readFile(fontFile)).toString('base64')}")`;
    }));
    let index = 0;
    return text.replace(urls, () => replacements[index++]);
}
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
// Keep the full copyright and OFL notices with the standalone font binaries.
const fontLicenses = await Promise.all(['CinzelDecorative-OFL.txt', 'IMFellEnglish-OFL.txt'].map(async file => {
    const license = await readFile(resolve(root, 'assets/fonts', file), 'utf8');
    if (license.includes('-->')) throw Error(`Font license cannot be embedded as an HTML comment: ${file}`);
    return `<!--\nBUNDLED FONT LICENSE: ${file}\n${license}\n-->`;
}));
if (!/<\/head>/i.test(html)) throw Error('Missing document head for bundled font licenses.');
html = html.replace(/<\/head>/i, () => fontLicenses.join('\n') + '\n</head>');
// Replacer FUNCTIONS, not replacement strings. In a string replacement $&, $`, $' and $$
// are substitution sequences, so any source file containing one would splice a copy of the
// surrounding document into the bundle. A name template as ordinary as "Crown of $" is
// enough to trigger it, and the failure surfaces as an unrelated build assertion.
for (const css of styles) {
    const cssFile = resolve(root, css);
    const text = await inlineFontURLs(await readFile(cssFile, 'utf8'), cssFile);
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
