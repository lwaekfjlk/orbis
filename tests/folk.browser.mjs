// Run after build and preview-folk. Use an existing Chromium/Playwright install
// through CHROMIUM_PATH / PLAYWRIGHT_MODULE, or the default Playwright browser.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), out = resolve(root, 'previews/folk');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'telluric-folk-browser-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), ['--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', detached: true });
child.unref();
let browser;
try {
    let port;
    for (let k = 0; k < 150 && !port; k++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'reduce' });
    const errors = [], requests = [], checks = [];
    const observe = page => { page.on('pageerror', e => errors.push(String(e))); page.on('request', r => requests.push(r.url())); };
    const gallery = await context.newPage(); observe(gallery);
    await gallery.setContent(await readFile(resolve(out, 'index.html'), 'utf8'), { waitUntil: 'load' });
    await gallery.waitForFunction('window.__folkPreview && scenes.every(s=>!s.r.pending)');
    assert.equal(await gallery.evaluate('window.__folkPreview.playing'), false);
    await gallery.locator('#play').click();
    await gallery.waitForFunction('window.__folkPreview.phase > .6');
    await gallery.locator('#play').click();
    await gallery.evaluate(() => window.setFolkPreviewPhase(.85));
    await gallery.waitForFunction('scenes.every(s=>!s.r.pending)');
    await gallery.screenshot({ path: resolve(out, 'seven-peoples.png') });
    await gallery.locator('#palette').selectOption('clay');
    await gallery.locator('#angle').fill('90');
    await gallery.locator('#angle').dispatchEvent('input');
    await gallery.waitForFunction('scenes.every(s=>!s.r.pending)');
    await gallery.screenshot({ path: resolve(out, 'silhouettes.png') });
    checks.push({ stage: 'gallery', ...await gallery.evaluate('window.__folkPreview') });
    console.log('PASS seven people models, walking preview and monochrome silhouettes');

    const page = await context.newPage(); observe(page);
    const stable = () => page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading', null, { timeout: 240000 });
    await page.setContent(await readFile(resolve(root, 'dist/telluric-onemap.html'), 'utf8'), { waitUntil: 'load', timeout: 180000 });
    await stable();
    const fingerprint = () => page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim)})');
    const before = await fingerprint();
    const town = await page.evaluate(() => (sim.provinces.find(p => p.name === 'Scorchspire') || sim.provinces.filter(p => p.settled).sort((a, b) => b.urbanPop - a.urbanPop)[0]).id);
    await page.evaluate(id => ContinuousMap.focusTown(id, 230), town);
    await stable();
    const crowd = await page.evaluate(() => {
        renderer.buildFolk(12); renderer.request();
        return { ...renderer.folkStats, software: !!renderer.software };
    });
    assert(crowd.residents > 0, 'the loaded town needs residents');
    assert(crowd.fullFigures > 0, 'approaching a town must reveal anatomical detail');
    assert(crowd.fullFigures <= 48);
    await stable();
    await page.screenshot({ path: resolve(out, 'town-walkers.png') });
    console.log('PASS full-detail people in an actual town', crowd);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => renderer.request());
    await page.waitForFunction('ContinuousMap.walking', null, { timeout: 120000 });
    const clock = await page.evaluate('ContinuousMap.clock');
    await page.waitForFunction(t => ContinuousMap.clock > t + .5, clock, { timeout: 120000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction('!ContinuousMap.walking', null, { timeout: 120000 });
    await stable();
    // Approach a real street resident without inserting a display-only crowd.
    await page.evaluate(() => {
        const m = ContinuousMap.layer.models.get(ContinuousMap.layer.focusId);
        const candidates = m.folk.filter(a => a.kind === 'walker').map(a => {
            const q = Folk.positionAt(a, ContinuousMap.clock), v = m.frame.vertex(q.x, q.y, q.z, null);
            const p = project4(renderer.mvp, [v[0], v[1] + 1.5 * m.frame.scale, v[2]]);
            const x = (p[0] / p[3] * .5 + .5) * renderer.width, y = (.5 - p[1] / p[3] * .5) * renderer.height;
            return { q, v, x, y, distance: Math.hypot(x - renderer.width / 2, y - renderer.height / 2) };
        }).filter(p => p.x > 100 && p.x < renderer.width - 100 && p.y > 120 && p.y < renderer.height - 160)
            .sort((a, b) => a.distance - b.distance);
        const chosen = candidates.find(p => !ContinuousMap.layer.pick(p.x, p.y)) || candidates[0];
        if (chosen) {
            renderer.target = [chosen.v[0], chosen.v[1] + .6 * m.frame.scale, chosen.v[2]];
            renderer.zoom = Math.min(600, AtlasSpace.MAX_ZOOM); renderer.elevation = .8;
            renderer.request();
        }
    });
    await stable();
    await page.screenshot({ path: resolve(out, 'street-walkers.png') });
    assert.deepEqual(await fingerprint(), before, 'rendering and walking must not change the world');
    await page.evaluate(() => { renderer.options.folk = false; renderer.buildFolk(20); renderer.request(); });
    assert.equal(await page.evaluate('renderer.meshes.folk.count + renderer.meshes.caravans.count'), 0);
    await page.evaluate(() => { renderer.options.folk = true; renderer.buildFolk(20); renderer.request(); });
    assert(await page.evaluate('renderer.meshes.folk.count') > 0);
    checks.push({ stage: 'town', town, crowd, simulationUnchanged: true, animationClockAdvances: true, toggleWorks: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter(url => /^https?:/.test(url)), []);
    await writeFile(resolve(out, 'browser-checks.json'), JSON.stringify({ checks, errors, externalRequests: [] }, null, 2) + '\n');
    console.log('PASS live animation, reduced motion, visibility toggle and unchanged simulation');
} finally {
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, { recursive: true, force: true });
}
