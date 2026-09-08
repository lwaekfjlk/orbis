// Browser measurement of the same large cities before/after a layout change.
// No browser dependency ships with the app. DENSE_HTML can load a frozen build.
// DENSE_VERIFY_UI=1 adds untimed interaction checks after every city measurement.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.DENSE_OUTPUT || join(root, 'previews/dense-cities'));
const html = await readFile(process.env.DENSE_HTML || join(root, 'dist/orbis-onemap.html'), 'utf8');
const ids = (process.env.DENSE_IDS || '216,264,499,267').split(',').map(Number);
const baseline = process.env.DENSE_BASELINE ? JSON.parse(await readFile(process.env.DENSE_BASELINE, 'utf8')) : null;
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(out, {recursive: true});
const profile = await mkdtemp(join(tmpdir(), 'orbis-density-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    ...(process.env.DENSE_SOFTWARE === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
    'about:blank'
], {stdio: 'ignore', detached: true});
child.unref();
let browser;
const report = {bundleSha256: createHash('sha256').update(html).digest('hex'), viewport: {width: 1200, height: 1020}, cities: [], errors: [], external: []};
try {
    let port;
    for (let k = 0; k < 100 && !port; k++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({viewport: report.viewport, reducedMotion: 'reduce'});
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.external.push(request.url()); });
    const stable = async () => {
        await page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading&&!ContinuousMap.ruinLayer.loading', null, {timeout: 180000});
        await page.waitForTimeout(350);
        await page.waitForFunction('!renderer.pending&&ContinuousMap.layer.lastTerrainKey===ContinuousMap.layer.terrainKey()', null, {timeout: 180000});
    };
    const start = performance.now();
    await page.setContent(html, {waitUntil: 'load', timeout: 180000});
    await stable();
    report.readyMs = performance.now() - start;
    report.before = await page.evaluate(() => [physicalFingerprint(world), settlementFingerprint(sim), politicalFingerprint(sim)]);
    report.graphics = await page.evaluate(() => {
        const gl = renderer.gl, extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return {software: !!renderer.software, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null};
    });
    await page.evaluate(() => {
        window.__denseProbe = {};
        for (const [object, names] of [[renderer, ['render', 'buildFolk', 'buildNearRoads', 'buildTerrain', 'buildRivers']], [ContinuousMap.layer, ['onChange']]]) {
            for (const name of names) {
                const original = object[name]; if (!original) continue;
                object[name] = function (...args) {
                    const start = performance.now();
                    try { return original.apply(this, args); }
                    finally { const p = __denseProbe[name] ||= {count: 0, ms: 0}; p.count++; p.ms += performance.now() - start; }
                };
            }
        }
    });
    for (const id of ids) {
        const city = await page.evaluate(async id => {
            const start = performance.now(), m = await ContinuousMap.focusTown(id);
            if (!m) throw Error('Missing city ' + id);
            const houses = m.city.buildings.filter(b => !b.landmark);
            return {id, name: m.p.name, enterMs: performance.now() - start, population: m.p.urbanPop,
                buildings: m.city.buildings.length, ordinary: houses.length,
                homes: houses.filter(b => b.type === 'home').length,
                parcelArea: houses.reduce((sum, b) => sum + b.w * b.d, 0),
                fingerprint: m.city.fingerprint, triangles: m.triangles, worker: !!ContinuousMap.layer.worker};
        }, id);
        await stable();
        city.meshes = await page.evaluate(id => {
            const m = ContinuousMap.layer.models.get(id);
            return Object.fromEntries(m.meshNames.map(name => [name.split(':').at(-1), renderer.meshes[name]?.count / 3 || 0]));
        }, id);
        city.camera = await page.evaluate(id => {
            const m = ContinuousMap.layer.models.get(id), view = ContinuousMap.layer.townView(m, .74);
            ContinuousMap.cancel(); renderer.target = view.target; renderer.zoom = view.zoom * 1.05;
            renderer.azimuth = view.azimuth; renderer.elevation = view.elevation; renderer.request();
            return {target: [...renderer.target], zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation};
        }, id);
        await stable();
        city.motion = [];
        for (const details of [false, true]) {
            if (details) await page.evaluate(id => ContinuousMap.details(ContinuousMap.layer.models.get(id)), id);
            await stable();
            city.motion.push(await page.evaluate(async details => {
                const times = [], base = renderer.azimuth, target = [...renderer.target];
                window.__denseProbe = {}; renderer.interacting = true;
                let previous = performance.now();
                for (let k = 0; k < 90; k++) {
                    renderer.azimuth = base + Math.sin(k / 90 * Math.PI * 2) * .22;
                    renderer.target[0] = target[0] + Math.sin(k / 90 * Math.PI * 2) * .08;
                    renderer.request();
                    await new Promise(requestAnimationFrame);
                    const now = performance.now(); times.push(now - previous); previous = now;
                }
                renderer.interacting = false; renderer.azimuth = base; renderer.target = target; renderer.request();
                const sorted = times.slice(5).sort((a, b) => a - b), stats = __denseProbe;
                return {details, frames: 90, p50Ms: sorted[Math.floor(sorted.length * .5)],
                    p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1), stats};
            }, details));
        }
        await page.evaluate(() => OneMap.closeDrawer());
        await stable();
        const style = await page.addStyleTag({content: '#omChrome,#stage > :not(#map){visibility:hidden!important}'});
        await page.screenshot({path: join(out, `city-${id}.png`)});
        await style.evaluate(element => element.remove());
        assert(city.worker && city.ordinary > 100);
        if (baseline) {
            const previous = baseline.cities.find(row => row.id === id);
            assert(previous, 'Baseline is missing city ' + id);
            assert(city.ordinary >= previous.ordinary * 2, 'Residential parcels must at least double in city ' + id);
            for (const motion of city.motion) {
                assert((motion.stats.buildFolk?.count || 0) <= 1, 'Panning must not rebuild stationary crowds each frame');
                assert((motion.stats.buildNearRoads?.count || 0) <= motion.frames, 'Panning must not duplicate road work');
            }
        }
        report.cities.push(city);
        await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
        console.log('CITY', JSON.stringify(city));
    }
    report.after = await page.evaluate(() => [physicalFingerprint(world), settlementFingerprint(sim), politicalFingerprint(sim)]);
    assert.deepEqual(report.after, report.before);
    // Keep the original-world invariance assertion above the intentional world
    // replacement below. None of this phase contributes to the timed city loops.
    if (process.env.DENSE_VERIFY_UI === '1') {
        report.ui = {passed: false};
        try {
            report.ui.originalWorld = await page.evaluate(() => {
                window.__denseUICanvas = renderer.canvas;
                return {seed: world.params.seed, landformVersion: world.params.landformVersion};
            });
            const hit = await page.evaluate(() => {
                renderer.updateCamera();
                const rect = renderer.canvas.getBoundingClientRect();
                for (const m of ContinuousMap.layer.models.values()) for (const b of m.city.buildings) {
                    if (b.landmark) continue;
                    const a = m.frame.anchors.get(b.id), q = project4(renderer.mvp, [a.x, a.y + (m.heights[b.id] || b.h) * a.scale * .7, a.z]);
                    const x = (q[0] / q[3] * .5 + .5) * renderer.width, y = (.5 - q[1] / q[3] * .5) * renderer.height;
                    if (x < 100 || x > renderer.width - 100 || y < 180 || y > renderer.height - 260) continue;
                    if (document.elementFromPoint(rect.left + x, rect.top + y) !== renderer.canvas) continue;
                    const picked = ContinuousMap.layer.pick(x, y);
                    if (picked && !picked.building.landmark) return {x: rect.left + x, y: rect.top + y,
                        pid: picked.model.p.id, bid: picked.building.id, name: picked.building.name, zoom: renderer.zoom};
                }
                return null;
            });
            assert(hit, 'A real visible small-house mesh must be pickable');
            await page.mouse.click(hit.x, hit.y);
            assert((await page.locator('#omSelectionBody h3').textContent()).includes(hit.name), 'Canvas picking selects the hit building');
            await page.locator('#cmFocusBuilding').click();
            await stable();
            report.ui.building = await page.evaluate(hit => {
                const m = ContinuousMap.layer.models.get(hit.pid), a = m.frame.anchors.get(hit.bid);
                return {...hit, closerZoom: renderer.zoom, focusedTown: ContinuousMap.layer.focusId,
                    centred: Math.hypot(renderer.target[0] - a.x, renderer.target[2] - a.z) < 1e-7,
                    fingerprint: m.city.fingerprint, sameCanvas: renderer.canvas === window.__denseUICanvas};
            }, hit);
            assert(report.ui.building.closerZoom >= hit.zoom && report.ui.building.centred, 'Closer reaches the selected small house');
            assert.equal(report.ui.building.focusedTown, hit.pid); assert(report.ui.building.sameCanvas);
            await page.screenshot({path: join(out, 'ui-building.png')});

            const orbit = await page.evaluate(() => {
                const r = renderer.canvas.getBoundingClientRect();
                for (const [u, v] of [[.72, .44], [.6, .4], [.45, .45]]) {
                    const x = r.left + r.width * u, y = r.top + r.height * v;
                    if (document.elementFromPoint(x, y) === renderer.canvas) return {x, y, azimuth: renderer.azimuth, elevation: renderer.elevation};
                }
                return null;
            });
            assert(orbit, 'The city canvas remains accessible for orbiting');
            await page.keyboard.down('Shift');
            try {
                await page.mouse.move(orbit.x, orbit.y); await page.mouse.down();
                await page.mouse.move(orbit.x + 120, orbit.y + 30, {steps: 8}); await page.mouse.up();
            } finally { await page.keyboard.up('Shift'); }
            await stable();
            report.ui.orbit = await page.evaluate(pid => ({azimuth: renderer.azimuth, elevation: renderer.elevation,
                fingerprint: ContinuousMap.layer.models.get(pid)?.city.fingerprint, sameCanvas: renderer.canvas === window.__denseUICanvas}), hit.pid);
            assert(Math.abs(report.ui.orbit.azimuth - orbit.azimuth) > .1, 'Shift-drag changes the actual camera bearing');
            assert.equal(report.ui.orbit.fingerprint, report.ui.building.fingerprint); assert(report.ui.orbit.sameCanvas);

            await page.setViewportSize({width: 430, height: 900});
            await page.waitForFunction('renderer.width===430&&renderer.height===900'); await stable();
            report.ui.mobile = await page.evaluate(pid => {
                const m = ContinuousMap.layer.models.get(pid);
                return {width: renderer.width, height: renderer.height, sameCanvas: renderer.canvas === window.__denseUICanvas,
                    buildings: m?.city.buildings.length || 0, visibleMeshes: m?.meshNames.filter(name => renderer.visible(name) && renderer.meshes[name]?.count > 0).length || 0,
                    overflow: document.documentElement.scrollWidth - innerWidth};
            }, hit.pid);
            assert.equal(report.ui.mobile.width, 430); assert(report.ui.mobile.sameCanvas);
            assert(report.ui.mobile.buildings > 100 && report.ui.mobile.visibleMeshes > 0, 'Mobile retains the actual city model');
            assert(report.ui.mobile.overflow <= 1, 'The mobile UI fits its viewport');
            await page.screenshot({path: join(out, 'ui-mobile.png')});

            await page.setViewportSize(report.viewport);
            await page.waitForFunction(({width, height}) => renderer.width === width && renderer.height === height, report.viewport); await stable();
            const seed = 'Dense-cities-ui-2026';
            await page.locator('#forgeButton').click(); await page.locator('#seed').fill(seed); await page.locator('#generate').click();
            await page.waitForFunction(seed => window.__ready && !busy && world.params.seed === seed, seed, {timeout: 180000}); await stable();
            report.ui.regenerated = await page.evaluate(() => ({seed: world.params.seed, landformVersion: world.params.landformVersion,
                fingerprints: [physicalFingerprint(world), settlementFingerprint(sim), politicalFingerprint(sim)],
                modelsBeforeEntry: ContinuousMap.layer.models.size, sameCanvas: renderer.canvas === window.__denseUICanvas,
                boundToNewWorld: ContinuousMap.layer.world === world && renderer.world === world}));
            assert.equal(report.ui.regenerated.seed, seed); assert.equal(report.ui.regenerated.modelsBeforeEntry, 0);
            assert.equal(report.ui.regenerated.landformVersion, report.ui.originalWorld.landformVersion);
            assert.notDeepEqual(report.ui.regenerated.fingerprints, report.before, 'Recreate produces a new world');
            assert(report.ui.regenerated.sameCanvas && report.ui.regenerated.boundToNewWorld);
            const next = await page.evaluate(() => {
                const p = sim.provinces.filter(p => p.settled && p.urbanPop >= 650 && !p.highCitadel).sort((a, b) => b.urbanPop - a.urbanPop)[0];
                return p && {id: p.id, name: p.name};
            });
            assert(next, 'The regenerated world has a town to enter');
            await page.locator('#omSearchToggle').click(); await page.locator('#omSearch').fill(next.name);
            await page.getByRole('button', {name: 'Approach ' + next.name, exact: true}).click();
            await page.waitForFunction(id => ContinuousMap.layer.models.has(id), next.id, {timeout: 180000}); await stable();
            report.ui.regenerated.entered = await page.evaluate(id => {
                const m = ContinuousMap.layer.models.get(id);
                return {id, name: m.p.name, buildings: m.city.buildings.length, worker: !!ContinuousMap.layer.worker,
                    sameCanvas: renderer.canvas === window.__denseUICanvas, error: window.__continuousError || null};
            }, next.id);
            assert(report.ui.regenerated.entered.buildings > 0 && report.ui.regenerated.entered.worker && report.ui.regenerated.entered.sameCanvas);
            assert.equal(report.ui.regenerated.entered.error, null);
            assert.deepEqual(await page.evaluate(() => [physicalFingerprint(world), settlementFingerprint(sim), politicalFingerprint(sim)]), report.ui.regenerated.fingerprints);
            await page.screenshot({path: join(out, 'ui-regenerated.png')});
            report.ui.offline = await page.evaluate(() => !navigator.onLine);
            report.ui.external = [...report.external]; report.ui.errors = [...report.errors];
            assert(report.ui.offline); assert.deepEqual(report.ui.external, []); assert.deepEqual(report.ui.errors, []);
            report.ui.passed = true;
        } finally { await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    report.passed = true;
    await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS dense city browser', JSON.stringify(report.graphics));
} finally {
    if (browser) await browser.close();
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
}
