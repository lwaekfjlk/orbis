// Real new-default regression. Keep the legacy model's fixed-city unit fixtures
// separate: this test starts the shipped app, then restores a versionless save.
// PLAYWRIGHT_MODULE / CHROMIUM_PATH select an existing browser installation.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.FANTASY_OUTPUT || join(root, 'previews/fantasy-landforms'));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'telluric-fantasy-browser-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'
], {stdio: 'ignore', detached: true});
child.unref();
let browser;
const report = {viewport: [1480, 980], renderer: 'Chromium with SwiftShader', regions: [], diagnosticRegions: []};

try {
    await mkdir(join(out, 'after'), {recursive: true});
    await mkdir(join(out, 'before'), {recursive: true});
    let port;
    for (let i = 0; i < 100 && !port; i++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({viewport: {width: 1480, height: 980}, reducedMotion: 'reduce'});
    await context.setOffline(true);
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const stable = () => page.waitForFunction(
        'window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',
        null, {timeout: 240000});
    const settled = async () => {
        await stable();
        await page.waitForTimeout(350);
        await page.waitForFunction('ContinuousMap.layer.lastTerrainKey===ContinuousMap.layer.terrainKey()', null, {timeout: 240000});
        await stable();
    };
    const fingerprints = () => page.evaluate(() => ({
        physical: physicalFingerprint(world), settlements: settlementFingerprint(sim), politics: politicalFingerprint(sim)
    }));
    const assertReady = async () => {
        assert.equal(await page.evaluate('window.__error||window.__continuousError||null'), null);
        assert(await page.evaluate('renderer.world===world&&renderer.sim===sim&&ContinuousMap.layer.world===world'));
    };
    const labels = () => page.evaluate(() => ({
        realms: sim.realms.filter(c => c.alive).length,
        labels: labelItems.filter(v => v.feature.realm != null).map(({element, feature}) => ({
            id: feature.realm, visible: element.style.opacity === '1', text: element.getAttribute('aria-label') || feature.name
        }))
    }));
    const checkLabels = state => {
        assert.equal(state.labels.filter(l => l.visible).length, state.realms, 'a country lost its name or clickable marker');
        assert(state.labels.every(l => l.text), 'a country marker has no readable name');
    };
    // Exercise the application's real layer controls. These extra images expose
    // landform geometry without cartographic tree/settlement/border symbols; the
    // ordinary world and four region screenshots retain the normal presentation.
    const diagnosticControls = ['trees', 'frontiers', 'settlements', 'roads', 'folk', 'names', 'legends'];
    const setControls = values => page.evaluate(values => {
        for (const [id, checked] of Object.entries(values)) {
            const input = document.getElementById(id);
            if (input.checked !== checked) { input.checked = checked; input.dispatchEvent(new Event('change', {bubbles: true})); }
        }
    }, values);
    const startDiagnostic = async () => {
        const previous = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).checked])), diagnosticControls);
        await setControls(Object.fromEntries(diagnosticControls.map(id => [id, false])));
        return previous;
    };

    const testedHtml = await readFile(process.env.FANTASY_HTML || join(root, 'dist/telluric-onemap.html'));
    report.bundleSha256 = createHash('sha256').update(testedHtml).digest('hex');
    await page.setContent(testedHtml.toString('utf8'), {waitUntil: 'load', timeout: 240000});
    await page.evaluate(() => document.fonts.ready);
    await settled(); await assertReady();
    assert.equal(await page.evaluate('world.params.landformVersion'), 3, 'the shipped app did not use the new default');
    report.fantasy = await fingerprints();
    assert.notEqual(report.fantasy.physical, '440ae5d0', 'the new default silently fell back to the legacy terrain');
    const metadata = await page.evaluate(() => {
        window.__fantasyCanvas = renderer.canvas;
        return {
            fields: ['landform', 'landformStrength', 'landformRegion'].map(key => ({key, typed: ArrayBuffer.isView(world[key]), length: world[key]?.length})),
            cells: GN,
            regions: (world.landformRegions || []).map(r => ({id: r.id, type: r.type, kind: r.kind, name: r.name, i: r.i, x: r.x, y: r.y, center: r.center, rx: r.rx, ry: r.ry, area: r.area, detail: r.detail}))
        };
    });
    assert(metadata.fields.every(f => f.typed && f.length === metadata.cells), 'new landform fields are missing or incomplete');
    const kinds = ['red-plateau', 'volcanic', 'folded-ranges', 'karst'];
    const regions = kinds.map(kind => metadata.regions.filter(r => r.kind === kind).sort((a, b) => b.area - a.area)[0]);
    assert(regions.every(Boolean), 'the default world lacks one of its four landform families');
    assert(regions.every(r => [r.x, r.y, r.rx, r.ry, r.area].every(Number.isFinite) && r.area > 0));
    report.desktop = await labels(); checkLabels(report.desktop);
    await page.screenshot({path: join(out, 'after/world.png')});
    await page.setViewportSize({width: 430, height: 900});
    await page.waitForFunction('renderer.width===430'); await settled();
    report.mobile = await labels(); checkLabels(report.mobile);
    await page.screenshot({path: join(out, 'after/mobile.png')});
    await page.setViewportSize({width: 1480, height: 980});
    await page.waitForFunction('renderer.width===1480'); await settled();
    console.log('PASS new default, four landform families and country labels');

    // Use real region metadata, never legacy province numbers or renamed cities.
    // Record the complete camera so the legacy comparison is genuinely aligned.
    for (const region of regions) {
        const camera = await page.evaluate(r => {
            setLayer('relief'); OneMap.clearSelection(); OneMap.closeDrawer();
            ContinuousMap.cancel(); ContinuousMap.layer.focusId = null;
            renderer.target = AtlasSpace.point(world, r.x, r.y, renderer.relief);
            renderer.zoom = Math.max(6, Math.min(36, 180 / Math.max(r.rx, r.ry, 5)));
            renderer.azimuth = -.42; renderer.elevation = .88; renderer.request();
            return {target: renderer.target.slice(), zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation};
        }, region);
        await settled(); await assertReady();
        const ground = await page.evaluate(() => {
            const hit = AtlasSpace.pickGround(renderer, renderer.width / 2, renderer.height / 2);
            if (!hit) return null;
            const key = Math.round(hit.y) * GW + Math.round(hit.x);
            return {x: hit.x, y: hit.y, point: hit.point, surface: renderer.ground(hit.x, hit.y),
                type: world.landform[key], strength: world.landformStrength[key],
                refinement: ContinuousMap.layer.terrainDetail, triangles: ContinuousMap.layer.terrainTriangles};
        });
        assert(ground && [...ground.point, ground.surface].every(Number.isFinite), region.kind + ' cannot be picked');
        assert(Math.abs(ground.point[1] - ground.surface) < 1e-5, region.kind + ' picking uses a different surface');
        assert.equal(ground.type, region.type, region.kind + ' camera does not show its actual landform');
        assert(ground.strength > 0, region.kind + ' metadata points outside its physical landform');
        assert(ground.triangles > 0 && ground.triangles < 400000);
        await page.screenshot({path: join(out, 'after', region.kind + '.png')});
        report.regions.push({...region, camera, ground});
        console.log('PASS landform', region.kind, JSON.stringify({refinement: ground.refinement, triangles: ground.triangles}));
    }
    assert.deepEqual(await fingerprints(), report.fantasy, 'viewing the new terrain changed the world');

    // Include every generated region, so a clear second plateau or a coastal
    // mountain belt cannot disappear behind the largest-region selection above.
    // A wider camera aimed at the generation center shows the complete form,
    // while the ordinary views above inspect its verified exposed anchor.
    const originalControls = await startDiagnostic();
    for (const region of metadata.regions) {
        const camera = await page.evaluate(r => {
            const center = r.center || r;
            setLayer('relief'); OneMap.clearSelection(); OneMap.closeDrawer();
            ContinuousMap.cancel(); ContinuousMap.layer.focusId = null;
            renderer.target = AtlasSpace.point(world, center.x, center.y, renderer.relief);
            renderer.zoom = Math.max(3, Math.min(24, 105 / Math.max(r.rx, r.ry, 5)));
            renderer.azimuth = -.42; renderer.elevation = .88; renderer.request();
            return {target: renderer.target.slice(), zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation};
        }, region);
        await settled(); await assertReady();
        const filename = `diagnostic-${region.id}-${region.kind}.png`;
        await page.screenshot({path: join(out, 'after', filename)});
        report.diagnosticRegions.push({id: region.id, kind: region.kind, name: region.name, camera, filename, disabledControls: diagnosticControls});
    }
    await setControls(originalControls); await settled();
    assert.deepEqual(await fingerprints(), report.fantasy, 'diagnostic layer controls changed the world');

    await page.evaluate(() => ContinuousMap.home()); await settled();
    const town = await page.evaluate(() => sim.provinces.filter(p => p.city && !p.highCitadel).sort((a, b) => b.urbanPop - a.urbanPop).map(p => ({id: p.id, name: p.name}))[0]);
    assert(town, 'the new default has no ordinary city to explore');
    await page.locator('#omSearchToggle').click(); await page.locator('#omSearch').fill(town.name);
    await page.locator('[data-search-enter]').first().click();
    await page.waitForFunction(id => ContinuousMap.layer.models.has(id), town.id, {timeout: 240000});
    await settled(); await assertReady();
    report.city = await page.evaluate(id => {
        const m = ContinuousMap.layer.models.get(id), local = generateCity(world, sim, id);
        return {id, name: m.p.name, buildings: m.city.buildings.length, audit: auditCity(m.city),
            worker: !!ContinuousMap.layer.worker, sameCanvas: renderer.canvas === window.__fantasyCanvas,
            fingerprint: m.city.fingerprint, localFingerprint: local.fingerprint,
            buffersIntact: world.height.length === GN && ['landform', 'landformStrength', 'landformRegion'].every(key => world[key].length === GN)};
    }, town.id);
    assert(report.city.worker && report.city.sameCanvas && report.city.buffersIntact);
    assert(report.city.buildings > 18);
    assert.equal(report.city.fingerprint, report.city.localFingerprint, 'worker city differs from the same new terrain on the main thread');
    for (const key of ['iceBuildings', 'wetBuildings', 'roadBuildings', 'overlaps', 'nonfinite', 'seaRoads']) assert.equal(report.city.audit[key], 0, key);
    await page.screenshot({path: join(out, 'after/city.png')});
    assert.deepEqual(await fingerprints(), report.fantasy);
    console.log('PASS real search, worker city and intact parent buffers');

    // Capture progressed history with the application's save schema. Image/model
    // exports are not simulation saves; this payload retains the terrain version.
    await page.locator('#step1').click(); await settled();
    await page.evaluate(() => {
        const saved = makeSave();
        window.__fantasySave = JSON.stringify(saved);
        window.__fantasyHistory = JSON.stringify(saved.simulation);
    });
    assert.equal(await page.evaluate('JSON.parse(__fantasySave).parameters.landformVersion'), 3);
    assert.equal(await page.evaluate('sim.year'), 401);

    // This legacy world is made by the actual current generator's version-0 path.
    // Its hash is the previously locked physical baseline, not a new snapshot.
    await page.evaluate(() => buildWorld({...GEN_DEFAULTS, landformVersion: 0}));
    await settled(); await assertReady();
    report.legacy = await fingerprints();
    assert.equal(report.legacy.physical, '440ae5d0');
    assert.equal(await page.evaluate('world.params.landformVersion'), 0);
    await page.screenshot({path: join(out, 'before/world.png')});
    for (const region of report.regions) {
        await page.evaluate(camera => {
            setLayer('relief'); ContinuousMap.cancel(); ContinuousMap.layer.focusId = null;
            Object.assign(renderer, camera, {target: camera.target.slice()}); renderer.request();
        }, region.camera);
        await settled(); await assertReady();
        const camera = await page.evaluate(() => ({target: renderer.target.slice(), zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation}));
        assert.deepEqual(camera, region.camera, 'before/after cameras differ');
        await page.screenshot({path: join(out, 'before', region.kind + '.png')});
    }
    const legacyControls = await startDiagnostic();
    for (const region of report.diagnosticRegions) {
        await page.evaluate(camera => {
            setLayer('relief'); ContinuousMap.cancel(); ContinuousMap.layer.focusId = null;
            Object.assign(renderer, camera, {target: camera.target.slice()}); renderer.request();
        }, region.camera);
        await settled(); await assertReady();
        const camera = await page.evaluate(() => ({target: renderer.target.slice(), zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation}));
        assert.deepEqual(camera, region.camera, 'diagnostic before/after cameras differ');
        await page.screenshot({path: join(out, 'before', region.filename)});
    }
    await setControls(legacyControls); await settled();
    await page.locator('#step1').click(); await settled();
    await page.evaluate(() => {
        const saved = JSON.parse(JSON.stringify(makeSave())); delete saved.parameters.landformVersion;
        window.__legacySave = JSON.stringify(saved); window.__legacyHistory = JSON.stringify(saved.simulation);
    });
    await page.evaluate(() => loadSimulation(new File([__fantasySave], 'fantasy.json', {type: 'application/json'})));
    await settled(); await assertReady();
    assert.equal(await page.evaluate('world.params.landformVersion'), 3);
    assert.equal((await fingerprints()).physical, report.fantasy.physical);
    assert(await page.evaluate('JSON.stringify(sim)===__fantasyHistory'), 'new-format restore changed saved history');
    await page.evaluate(() => loadSimulation(new File([__legacySave], 'legacy.json', {type: 'application/json'})));
    await settled(); await assertReady();
    assert.equal(await page.evaluate('world.params.landformVersion'), 0, 'a versionless save inherited the new default');
    assert.equal((await fingerprints()).physical, '440ae5d0');
    assert(await page.evaluate('JSON.stringify(sim)===__legacyHistory'), 'legacy restore changed its saved history');
    assert(await page.evaluate('ContinuousMap.layer.models.size===0&&renderer.canvas===__fantasyCanvas'), 'restore retained stale city meshes or replaced the canvas');
    report.saves = {newVersion: 2, versionlessRestoredAs: 0, savedHistoryPreserved: true};
    console.log('PASS new and versionless legacy saves, exact history and terrain restoration');

    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    report.errors = errors; report.externalRequests = requests;
    await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS fantasy landforms', out);
} finally {
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, {recursive: true, force: true});
}
