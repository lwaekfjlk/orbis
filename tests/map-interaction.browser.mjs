// Deterministic offline interaction benchmark. --before uses the preserved bundle.
// CPU timings include nested calls; selfMs excludes instrumented child methods.
// SwiftShader frame gaps and GL submission waits are not hardware-GPU FPS claims.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.ORBIS_INTERACTION_OUTPUT || join(tmpdir(), 'orbis-interaction-perf');
const stage = process.argv.includes('--before') ? 'before' : 'after';
const labelsOnly = process.argv.includes('--labels-only');
const labelRounds = Number(process.argv.find(arg => arg.startsWith('--label-rounds='))?.slice('--label-rounds='.length) ?? 4);
assert(!(labelsOnly && stage === 'before'), '--labels-only compares the preserved baseline with the current build');
if (labelsOnly) assert(Number.isInteger(labelRounds) && labelRounds >= 1 && labelRounds <= 20, '--label-rounds must be an integer from 1 to 20');
const reportName = labelsOnly ? 'label-ab-report.json' : `${stage}-report.json`;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'orbis-interaction-chrome-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore', detached: true });
child.unref();
let browser;
const report = { stage, environment: 'Offline headless Chrome, SwiftShader, 1280×900, DPR 1', phases: [], errors: [], consoleErrors: [] };
try {
    let port;
    for (let attempt = 0; attempt < 150 && !port; attempt++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) report.errors.push('External request: ' + request.url()); });
    const stable = () => page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading', null, { timeout: 240000 });
    let html = await readFile(stage === 'before' ? join(out, 'before.html') : join(root, 'dist/orbis-onemap.html'), 'utf8');
    // This function is captured during renderer construction. Instrument its entry
    // before startup so onChange and direct callers are both measured accurately.
    assert(html.includes('function positionLabels() {'), 'label entry point changed');
    if (!labelsOnly) html = html.replace('function positionLabels() {', 'function positionLabels(){return window.__perfCall?window.__perfCall("ui.positionLabels",profiledPositionLabels,this,arguments):profiledPositionLabels.apply(this,arguments)}\nfunction profiledPositionLabels() {');
    console.log(`Interaction benchmark: loading ${stage}`);
    await page.setContent(html, { waitUntil: 'load', timeout: 180000 });
    await stable(); await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (labelsOnly) {
        const baselinePath = join(out, 'before.html'), baseline = await readFile(baselinePath, 'utf8');
        const extract = bundle => {
            const start = bundle.indexOf('function positionLabels() {'), end = bundle.indexOf('\nfunction makeGeoJumps()', start);
            assert(start >= 0 && end > start, 'expected exact positionLabels / makeGeoJumps function boundaries');
            const fn = bundle.slice(start, end).trim(); assert(fn.endsWith('}'), 'baseline must contain the complete function'); return fn;
        };
        const source = extract(baseline), candidateSource = extract(html), hash = s => createHash('sha256').update(s).digest('hex');
        report.mode = 'labels-only';
        report.inputs = { baseline: { path: baselinePath, bundleSHA256: hash(baseline), functionSHA256: hash(source) },
            candidate: { path: join(root, 'dist/orbis-onemap.html'), bundleSHA256: hash(html), functionSHA256: hash(candidateSource) } };
        const result = await page.evaluate(({ source, candidateSource, rounds }) => {
            const oldFn = (0, eval)('(' + source + ')'), newFn = (0, eval)('(' + candidateSource + ')');
            ContinuousMap.cancel(); renderer.suspendDrawing = true; renderer.request = () => {};
            renderer.updateCamera(); const cameras = []; let previousY = 0;
            for (let step = 1; step <= 24; step++) {
                const y = Math.sin(step / 24 * Math.PI) * 45; renderer.pan(7, y - previousY); previousY = y; renderer.updateCamera();
                cameras.push({ target: renderer.target.slice(), zoom: renderer.zoom, azimuth: renderer.azimuth, elevation: renderer.elevation });
            }
            const snapshot = () => JSON.stringify({ labels: labelItems.map(v => { const b = v.element.getBoundingClientRect();
                return { html: v.element.outerHTML, box: [b.x, b.y, b.width, b.height] }; }),
                pins: document.getElementById('worldLandmarkPins')?.outerHTML, compass: document.getElementById('compass')?.getAttribute('style') });
            const times = { before: [], after: [] }, mismatches = []; let comparisons = 0;
            // One full warmup, then measured rounds with alternating per-pose order.
            // Snapshot reads are outside each timed call and identical on both sides.
            for (let round = -1; round < rounds; round++) for (let frame = 0; frame < cameras.length; frame++) {
                Object.assign(renderer, cameras[frame]); renderer.updateCamera();
                const order = (round + frame) % 2 === 0 ? ['before', 'after'] : ['after', 'before'], snapshots = {};
                for (const name of order) { const start = performance.now(); (name === 'before' ? oldFn : newFn)();
                    const elapsed = performance.now() - start; snapshots[name] = snapshot(); if (round >= 0) times[name].push(elapsed); }
                if (round >= 0) { comparisons++; if (snapshots.before !== snapshots.after) mismatches.push({ round, frame }); }
            }
            const stats = values => { const sorted = [...values].sort((a, b) => a - b), totalMs = values.reduce((a, b) => a + b, 0);
                return { count: values.length, totalMs, meanMs: totalMs / values.length, medianMs: sorted[Math.floor(sorted.length / 2)],
                    p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: Math.max(...values) }; };
            return { seed: world.params.seed, year: sim.year, viewport: { width: renderer.width, height: renderer.height },
                labelCount: labelItems.length, cameras, rounds, comparisons, mismatches, before: stats(times.before), after: stats(times.after), rawMs: times };
        }, { source, candidateSource, rounds: labelRounds });
        Object.assign(report, result); assert.deepEqual(result.mismatches, [], 'every complete label DOM snapshot must match');
        assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); report.passed = true;
        console.log('PASS same-process label A/B', JSON.stringify({ comparisons: result.comparisons, before: result.before, after: result.after }));
    } else {
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const browserMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    report.fixture = await page.evaluate(() => {
        const towns = sim.provinces.filter(p => p.settled && !p.highCitadel).sort((a, b) => b.urbanPop - a.urbanPop);
        const p = towns[0], gl = renderer.gl, debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return { seed: world.params.seed, year: sim.year, townId: p.id, townName: p.name, population: p.urbanPop,
            gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'software',
            fingerprint: { physical: physicalFingerprint(world), settlements: settlementFingerprint(sim), politics: politicalFingerprint(sim) } };
    });
    await page.evaluate(() => {
        const perf = window.__interactionPerf = { active: null, stack: [], samples: [], longTasks: [] };
        const record = (name, ms, self = ms) => {
            if (!perf.active) return;
            const m = perf.active.methods[name] ||= { count: 0, totalMs: 0, selfMs: 0, maxMs: 0, whilePointerHeld: 0 };
            m.count++; m.totalMs += ms; m.selfMs += self; m.maxMs = Math.max(m.maxMs, ms);
            if (renderer.interacting) m.whilePointerHeld++;
        };
        window.__perfCall = (name, fn, self, args) => {
            if (!perf.active) return fn.apply(self, args);
            const frame = { time: performance.now(), children: 0 }; perf.stack.push(frame);
            try { return fn.apply(self, args); }
            finally { const ms = performance.now() - frame.time; perf.stack.pop(); if (perf.stack.length) perf.stack.at(-1).children += ms; record(name, ms, ms - frame.children); }
        };
        const wrap = (obj, name, prefix) => {
            const fn = obj?.[name]; if (typeof fn !== 'function') return;
            obj[name] = function (...args) { return window.__perfCall(prefix + name, fn, this, args); };
        };
        for (const name of ['render', 'updateCamera', 'onChange', 'buildTerrain', 'buildRivers', 'buildRoads', 'buildNearRoads', 'buildLines', 'buildFolk', 'upload']) wrap(renderer, name, 'renderer.');
        for (const name of ['cameraChanged', 'onChange', 'buildTerrain', 'buildEnvironment', 'prepareLandscape', 'terrainKey', 'environmentKey', 'recolorTerrain', 'ensure', 'stream', 'townView']) wrap(ContinuousMap.layer, name, 'layer.');
        for (const name of ['cameraChanged', 'stream']) wrap(ContinuousMap.ruinLayer, name, 'ruins.');
        const gl = renderer.gl;
        if (gl) {
            let shadow = false, start = 0;
            const bind = gl.bindFramebuffer.bind(gl), draw = gl.drawArrays.bind(gl);
            gl.bindFramebuffer = (target, fbo) => {
                if (fbo === renderer.fbo && !shadow) { shadow = true; start = performance.now(); }
                else if (!fbo && shadow) { record('gl.shadowPassSubmission', performance.now() - start); shadow = false; }
                return bind(target, fbo);
            };
            gl.drawArrays = (...args) => {
                const t = performance.now(); const result = draw(...args);
                if (perf.active) { record(shadow ? 'gl.drawShadow' : 'gl.drawMain', performance.now() - t); perf.active.trianglesSubmitted += args[2] / 3; }
                return result;
            };
        }
        new PerformanceObserver(list => { for (const e of list.getEntries()) perf.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: false });
        let last = 0;
        function raf(now) { if (perf.active && last) perf.active.gaps.push(now - last); last = now; requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
        perf.start = name => { perf.active = { name, start: performance.now(), methods: {}, gaps: [], trianglesSubmitted: 0 }; };
        perf.end = () => {
            const p = perf.active; perf.active = null; p.durationMs = performance.now() - p.start;
            p.longTasks = perf.longTasks.filter(t => t.start >= p.start); p.longTaskTotalMs = p.longTasks.reduce((s, t) => s + t.duration, 0);
            p.gaps.sort((a, b) => a - b); const q = x => p.gaps[Math.min(p.gaps.length - 1, Math.floor(p.gaps.length * x))] || 0;
            p.raf = { frames: p.gaps.length, medianMs: q(.5), p95Ms: q(.95), maxMs: q(1), over50ms: p.gaps.filter(g => g > 50).length };
            delete p.gaps; delete p.start; return p;
        };
    });
    const phase = async (name, action, settle = 850) => {
        const first = await browserMetrics(); await page.evaluate(name => window.__interactionPerf.start(name), name);
        const cameraBefore = await page.evaluate('({zoom:renderer.zoom,target:renderer.target.slice(),azimuth:renderer.azimuth,elevation:renderer.elevation})');
        await action(); if (settle) await page.waitForTimeout(settle);
        const result = await page.evaluate(() => window.__interactionPerf.end()), last = await browserMetrics();
        result.cameraBefore = cameraBefore;
        result.cameraAfter = await page.evaluate('({zoom:renderer.zoom,target:renderer.target.slice(),azimuth:renderer.azimuth,elevation:renderer.elevation})');
        if (name.endsWith('-drag') || name.endsWith('-pan')) assert.notDeepEqual(result.cameraAfter.target, cameraBefore.target, `${name} must actually pan the map`);
        if (name.endsWith('-rotate')) assert.notEqual(result.cameraAfter.azimuth, cameraBefore.azimuth, `${name} must actually rotate the map`);
        result.browser = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(k => [k, last[k] - first[k]]));
        result.methods = Object.fromEntries(Object.entries(result.methods).sort((a, b) => b[1].selfMs - a[1].selfMs));
        report.phases.push(result); await writeFile(join(out, `${stage}-report.json`), JSON.stringify(report, null, 2) + '\n');
        console.log('PHASE', JSON.stringify({ name, durationMs: result.durationMs, raf: result.raf, longTasks: result.longTasks.length, longTaskTotalMs: result.longTaskTotalMs, browser: result.browser, hottest: Object.entries(result.methods).slice(0, 9) }));
    };
    const drag = async (rotate = false) => {
        // Start on exposed canvas, rather than accidentally dragging a realm label.
        const point = await page.evaluate(() => {
            for (const y of [360, 420, 480, 540, 300]) for (const x of [570, 480, 660, 390, 750])
                if (document.elementFromPoint(x, y) === document.getElementById('map')) return { x, y };
            return null;
        });
        assert(point, 'the gesture needs an exposed map canvas point');
        await page.mouse.move(point.x, point.y); if (rotate) await page.keyboard.down('Shift'); await page.mouse.down();
        assert.equal(await page.evaluate('renderer.interacting'), true, 'pointer capture must belong to the map');
        for (let step = 1; step <= 24; step++) { await page.mouse.move(point.x + step * 7, point.y + Math.sin(step / 24 * Math.PI) * 45); await page.waitForTimeout(16); }
        await page.mouse.up(); if (rotate) await page.keyboard.up('Shift');
    };
    await phase('world-drag', () => drag());
    await phase('world-zoom', async () => { await page.mouse.move(640, 390); for (let step = 0; step < 18; step++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(24); } });
    // The real Visit entry point includes its worker wait, animation and final terrain.
    await phase('visit-city', async () => { await page.evaluate(id => ContinuousMap.focusTown(id), report.fixture.townId); }, 1500);
    await phase('city-pan', () => drag());
    await phase('city-rotate', () => drag(true));
    await phase('city-idle', () => page.waitForTimeout(2400), 0);
    // Observe real, populated meshes after the timed work; gl.getError may wait
    // on the driver, so it must not contaminate an interaction timing phase.
    report.scene = await page.evaluate(id => {
        const model = ContinuousMap.layer.models.get(id);
        return { buildings: model?.city.buildings.length || 0, residents: renderer.folkStats?.residents || 0,
            folkVertices: renderer.meshes.folk?.count || 0, walking: ContinuousMap.walking,
            webglError: renderer.gl?.getError() ?? 0 };
    }, report.fixture.townId);
    assert(report.scene.buildings > 0 && report.scene.folkVertices > 0, 'Visit and animation retain the populated town');
    assert.equal(report.scene.webglError, 0, 'dynamic drawing must not leave a WebGL error');
    await page.screenshot({ path: join(out, `${stage}-city.png`) });
    const final = await page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim)})');
    assert.deepEqual(final, report.fixture.fingerprint, 'interaction changes no world data');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); report.passed = true;
    console.log('PASS interaction benchmark', stage);
    }
} finally {
    await writeFile(join(out, reportName), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, { recursive: true, force: true });
}
