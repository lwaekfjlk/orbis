// Optional documentation renderer; the application has no Playwright dependency.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'previews/readme/grids');
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const galleries = process.argv.slice(2);
assert(galleries.every(id => manifest.grids.some(grid => grid.id === id)), 'Unknown gallery ID');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'telluric-readme-layout-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], {stdio: 'ignore', detached: true});
child.unref();
let browser;
try {
    let port;
    for (let k = 0; k < 100 && !port; k++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({viewport: {width: 1600, height: 1100}, deviceScaleFactor: 1});
    await context.setOffline(true);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(pathToFileURL(join(output, 'index.html')).href, {waitUntil: 'load'});
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    const report = {grids: [], errors};
    for (const grid of manifest.grids) {
        const element = page.locator('#' + grid.id);
        for (let i = 0; i < grid.panels.length; i++) {
            const panel = grid.panels[i], figure = element.locator('figure').nth(i);
            const source = await readFile(join(output, panel.source));
            assert.equal(createHash('sha256').update(source).digest('hex'), panel.sourceSha256);
            assert.equal(await figure.locator('img').getAttribute('src'), panel.source);
            assert.equal(await figure.locator('strong').textContent(), panel.title);
            assert.equal(await figure.locator('small').textContent(), panel.subtitle);
        }
        assert.equal(await element.locator('figure').count(), 4);
        const panels = await element.locator('figure').evaluateAll((figures, [width, height]) => figures.map(figure => {
            const image = figure.querySelector('img'), rect = figure.getBoundingClientRect();
            return {x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                loaded: image.complete && image.naturalWidth === width && image.naturalHeight === height};
        }), grid.panelDimensions);
        assert(panels.every(panel => panel.loaded));
        assert.equal(panels[0].y, panels[1].y); assert.equal(panels[2].y, panels[3].y);
        assert.equal(panels[0].x, panels[2].x); assert.equal(panels[1].x, panels[3].x);
        assert(panels[1].x > panels[0].x && panels[2].y > panels[0].y);
        if (!galleries.length || galleries.includes(grid.id)) await element.screenshot({path: join(output, grid.output)});
        const png = await readFile(join(output, grid.output));
        report.grids.push({id: grid.id, file: grid.output, panels: 4, rows: 2, columns: 2,
            sourceCommit: grid.sourceCommit, bundleSha256: grid.bundleSha256,
            width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: createHash('sha256').update(png).digest('hex')});
    }
    assert.deepEqual(errors, []);
    await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally {
    if (browser) await browser.close();
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
}
