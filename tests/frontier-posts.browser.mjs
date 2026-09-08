// Run after build. Optional --before reads ORBIS_FRONTIER_OUTPUT/before.html
// to preserve an earlier build and the exact camera for a visual comparison.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.ORBIS_FRONTIER_OUTPUT || join(tmpdir(), 'orbis-frontier-browser');
const before = process.argv.includes('--before'), stage = before ? 'before' : 'after';
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'orbis-frontier-chrome-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore', detached: true });
child.unref();
let browser;
const report = { stage, checks: [], screenshots: [], errors: [], consoleErrors: [], externalRequests: [] };
const close = (a, b, message) => assert(Math.abs(a - b) < 1e-5, `${message}: ${a} != ${b}`);
try {
    let port;
    for (let attempt = 0; attempt < 150 && !port; attempt++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    const stable = () => page.waitForFunction(
        'window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',
        null, { timeout: 240000 });
    console.log(`Frontier posts: loading ${stage} offline world`);
    await page.setContent(await readFile(before ? join(out, 'before.html') : join(root, 'dist/orbis-onemap.html'), 'utf8'), { waitUntil: 'load', timeout: 180000 });
    await stable();
    await page.evaluate(() => document.fonts.ready);
    const fingerprint = () => page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim)})');
    const originalWorld = await fingerprint();

    let selection;
    try { selection = JSON.parse(await readFile(join(out, 'selection.json'), 'utf8')); } catch {}
    if (!selection) {
        selection = await page.evaluate(() => {
            // Pick an actual lowest-cost diplomatic crossing, with a dry, shallow
            // footprint that can carry a physical post in both builds.
            const best = new Map(), unit = AtlasSpace.TOWN_UNIT;
            const dry = i => world.height[i] > 0 && !(world.lake?.[i] > 0);
            for (let a = 0; a < sim.provinces.length; a++) for (const e of sim.administrationGraph[a] || []) {
                const oa = sim.provinces[a].owner, ob = sim.provinces[e.to].owner;
                if (e.to < a || oa < 0 || ob < 0 || oa === ob || !sim.realms[oa]?.alive || !sim.realms[ob]?.alive) continue;
                const key = [oa, ob].sort((a, b) => a - b).join(':');
                if (!best.has(key) || e.cost < best.get(key).cost) best.set(key, { pair: key, at: e.crossing[0], crossing: e.crossing, cost: e.cost });
            }
            const candidates = [];
            for (const post of best.values()) {
                if (!post.crossing.every(dry)) continue;
                const x = post.at % GW, y = Math.floor(post.at / GW), heights = [], half = unit * 2.04;
                for (const dx of [-half, 0, half]) for (const dz of [-half, 0, half]) {
                    const gx = x + dx / AtlasSpace.X, gy = y + dz / AtlasSpace.Z;
                    if (!dry(Math.round(gy) * GW + Math.round(gx))) continue;
                    heights.push(renderer.ground(gx, gy));
                }
                if (heights.length !== 9 || Math.min(...heights) < 0 || Math.max(...heights) - Math.min(...heights) > unit) continue;
                const point = renderer.coord(x, y, renderer.ground(x, y));
                if ([...best.values()].some(other => other.at !== post.at && Math.hypot((other.at % GW - x) * AtlasSpace.X, (Math.floor(other.at / GW) - y) * AtlasSpace.Z) < .5)) continue;
                const towns = sim.provinces.filter(p => p.settled && p.urbanPop >= 1000)
                    .map(p => ({ p, distance: Math.hypot((p.x - x) * AtlasSpace.X, (p.y - y) * AtlasSpace.Z) }))
                    .sort((a, b) => a.distance - b.distance);
                if (towns.length) candidates.push({ ...post, x, y, point, townId: towns[0].p.id, townName: towns[0].p.name, distance: towns[0].distance, footing: Math.max(...heights) - Math.min(...heights) });
            }
            candidates.sort((a, b) => a.distance - b.distance);
            const chosen = candidates[0];
            if (!chosen) return null;
            const town = sim.provinces[chosen.townId], tp = renderer.coord(town.x, town.y, renderer.ground(town.x, town.y));
            const target = chosen.point.map((v, i) => (v + tp[i]) / 2); target[1] += .13;
            const azimuth = Math.atan2(-(tp[2] - chosen.point[2]), tp[0] - chosen.point[0]);
            return { ...chosen, seed: world.params.seed, unit, townPoint: tp,
                camera: { target, zoom: Math.min(150, 100 / Math.max(.75, chosen.distance)), elevation: .92, azimuth },
                closeCamera: { target: [chosen.point[0], chosen.point[1] + .16, chosen.point[2]], zoom: 190, elevation: .8, azimuth: .55 } };
        });
        assert(selection, 'default world needs an isolated supported frontier post near a town');
        await writeFile(join(out, 'selection.json'), JSON.stringify(selection, null, 2) + '\n');
    }
    report.selection = selection;
    assert.equal(await page.evaluate('world.params.seed'), selection.seed, 'comparison must use the same world');
    console.log('Frontier posts: selected', JSON.stringify(selection));

    const camera = async value => {
        await page.evaluate(value => { ContinuousMap.cancel(); Object.assign(renderer, value); renderer.request(); }, value);
        await stable();
    };
    const measure = () => page.evaluate(({ x, y, townId }) => {
        const center = renderer.coord(x, y, 0), mesh = renderer.meshes.frontierPosts;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let vertices = 0;
        let wallLow = Infinity, wallHigh = -Infinity;
        for (let i = 0; i < (mesh?.vertices.length || 0); i += 9) {
            const v = mesh.vertices;
            if (Math.abs(v[i] - center[0]) > .19 || Math.abs(v[i + 2] - center[2]) > .19) continue;
            for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], v[i + axis]); max[axis] = Math.max(max[axis], v[i + axis]); }
            // The pale stone walls are distinct from the dark terrain footing.
            // Ratios retain the material identity on shaded faces.
            if (Math.abs(v[i + 6] / v[i + 7] - 168 / 158) < 1e-4 && Math.abs(v[i + 6] / v[i + 8] - 168 / 140) < 1e-4) {
                wallLow = Math.min(wallLow, v[i + 1]); wallHigh = Math.max(wallHigh, v[i + 1]);
            }
            vertices++;
        }
        const model = ContinuousMap.layer.models.get(townId);
        const houses = model?.city.buildings.filter(b => !b.landmark && b.h > 0).map(b => (model.heights?.[b.id] || b.h) * model.frame.scale).sort((a, b) => a - b) || [];
        const corners = min.every(Number.isFinite) ? [[min[0], min[1], min[2]], [max[0], max[1], max[2]]].map(p => {
            const q = project4(renderer.mvp, p); return [(q[0] / q[3] * .5 + .5) * renderer.width, (.5 - q[1] / q[3] * .5) * renderer.height];
        }) : [];
        return { zoom: renderer.zoom, layer: renderer.layer, visible: renderer.visible('frontierPosts'), vertices, min, max,
            width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2], unit: AtlasSpace.TOWN_UNIT,
            wallHeight: wallHigh - wallLow, roofToWallBase: max[1] - wallLow,
            townLoaded: !!model, townBuildings: model?.city.buildings.length || 0, medianHouseHeight: houses[Math.floor(houses.length / 2)], corners };
    }, selection);
    const capture = async name => {
        const path = join(out, `${stage}-${name}.png`); await page.screenshot({ path }); report.screenshots.push(path);
    };
    await page.evaluate(id => ContinuousMap.focusTown(id, 80), selection.townId);
    await stable();
    await camera(selection.camera);
    const initial = await measure(); report.initial = initial;
    assert(initial.vertices > 0, 'the selected supported crossing must have an actual post');
    assert(initial.townLoaded && initial.townBuildings > 0, 'same-view capture needs the actual streamed town');
    await capture('town-and-post');
    await camera(selection.closeCamera); await capture('close');
    if (before) {
        assert(initial.width > .3 && initial.height > .45, 'baseline must contain the old giant map symbol');
    } else {
        const physical = (data, label) => {
            assert(data.visible, `${label}: post remains visible`);
            assert(data.vertices > 0, `${label}: actual post geometry exists`);
            assert(data.width / data.unit >= 3.9 && data.width / data.unit <= 4.3, `${label}: post uses a town-scale footprint`);
            assert(data.height / data.unit >= 5.7 && data.height / data.unit <= 7.9, `${label}: post height includes only a small footing`);
            close(data.wallHeight, 3.6 * data.unit, `${label}: physical stone wall height`);
            close(data.roofToWallBase, 5.34 * data.unit, `${label}: roof and wall retain their proportions`);
            close(data.width, initial.width, `${label}: width is independent of camera/streaming`);
            close(data.wallHeight, initial.wallHeight, `${label}: body height is independent of camera/streaming`);
        };
        physical(initial, 'initial town approach');
        for (const zoom of [15.99, 16, 59.99, 60, 240, 600]) {
            await camera({ ...selection.closeCamera, target: [selection.point[0], selection.point[1] + .045, selection.point[2]], zoom });
            const data = await measure(); physical(data, `zoom ${zoom}`); report.checks.push(data);
            if (zoom === 600) await capture('physical-close');
        }
        await camera({ ...selection.camera, target: [selection.camera.target[0] + 12, selection.camera.target[1], selection.camera.target[2] + 8] });
        await camera(selection.camera); physical(await measure(), 'pan and return');
        await page.locator('#omHome').click(); await stable();
        physical(await measure(), 'Home');
        await page.evaluate(id => ContinuousMap.focusTown(id, 80), selection.townId); await stable();
        await camera(selection.camera); physical(await measure(), 'town revisit');
        close((await measure()).height, initial.height, 'the same detailed camera restores the same terrain footing');
        await capture('revisit');
        for (const layer of ['relief', 'realms', 'faiths', 'peoples', 'wealth', 'magic', 'settlements']) {
            assert.equal(await page.evaluate(layer => { renderer.layer = layer; return renderer.visible('frontierPosts'); }, layer), true, `${layer}: civil works are visible`);
        }
        assert.equal(await page.evaluate(() => { renderer.layer = 'diplomacy'; return renderer.visible('frontierPosts'); }), false, 'diplomacy keeps its existing uncluttered overlay');
        assert.equal(await page.evaluate(() => { renderer.layer = 'relief'; renderer.options.roads = false; renderer.request(); return renderer.visible('frontierPosts'); }), false, 'roads toggle hides posts');
        await stable();
        assert.equal(await page.evaluate(() => { renderer.options.roads = true; renderer.request(); return renderer.visible('frontierPosts'); }), true, 'roads toggle restores posts');
        await stable(); physical(await measure(), 'roads restored');
        try {
            const old = JSON.parse(await readFile(join(out, 'before-report.json'), 'utf8'));
            report.comparison = { widthReduction: old.initial.width / initial.width, heightReduction: old.initial.height / initial.height };
            assert(report.comparison.widthReduction > 8, 'same-camera baseline demonstrates that the oversized symbol was removed');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert.deepEqual(await fingerprint(), originalWorld, 'camera navigation and rendering preserve simulation data');
    report.simulationUnchanged = true;
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.externalRequests, []);
    report.passed = true;
    console.log(`PASS ${stage} frontier posts`, JSON.stringify({ initial, comparison: report.comparison, screenshots: report.screenshots }));
} finally {
    await writeFile(join(out, `${stage}-report.json`), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, { recursive: true, force: true });
}
