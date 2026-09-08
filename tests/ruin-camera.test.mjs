import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/continuous/ruin-layer.js', import.meta.url), 'utf8');
const E = Function('AtlasSpace', `let busy=false;${source};return {ContinuousRuinLayer,setBusy(value){busy=value;}};`)
    ({ TOWN_ZOOM: 16, DETAIL_ZOOM: 60, grid: (x, z) => [x, z] });
function fixture(t, count = 1) {
    t.mock.timers.enable({ apis: ['setTimeout'] }); E.setBusy(false);
    const world = {}, calls = { streams: 0, builds: [] };
    const r = { world, target: [0, 0, 0], zoom: 80, width: 1200, height: 800, relief: 1,
        meshes: {}, screen: () => [200, 200], request() {}, upload() {} };
    const cityLayer = { timer: 123, prepareLandscape() {} };
    const layer = new E.ContinuousRuinLayer(r, cityLayer);
    const sites = Array.from({ length: count }, (_, id) => ({ id: `ruin-${id}`, x: id, y: 0, dragonRuins: {}, recipe: {} }));
    layer.bind(world, {}, sites);
    // Keep real camera scheduling, visibility filtering, loading and model cache;
    // replace only the expensive authored geometry assembly.
    layer.build = (site, lod, key) => {
        calls.builds.push(site.id); return { id: site.id, lod, key, parts: [], meshNames: [] };
    };
    const stream = layer.stream;
    layer.stream = function () { calls.streams++; return stream.call(this); };
    const advance = async ms => {
        t.mock.timers.tick(ms);
        for (let i = 0; i < 8; i++) { await Promise.resolve(); t.mock.timers.tick(0); }
    };
    t.after(() => { layer.reset(); E.setBusy(false); });
    return { world, r, layer, sites, calls, cityLayer, advance };
}

for (const held of ['interacting', 'cameraAnimating']) test(`ruin streaming waits for ${held} to end and then runs once`, async t => {
    const f = fixture(t); f.r[held] = true; f.layer.cameraChanged(); await f.advance(600);
    assert.equal(f.calls.streams, 0); assert.deepEqual(f.calls.builds, []);
    assert.equal(f.cityLayer.timer, 123, 'ruins do not overwrite the town streaming timer');
    f.r[held] = false; await f.advance(350);
    assert.equal(f.calls.streams, 1); assert.deepEqual(f.calls.builds, ['ruin-0']);
    await f.advance(1000); assert.equal(f.calls.streams, 1, 'settled views do not leave a recurring stream timer');
});

test('reset cancels the postponed ruin stream and the replacement world can stream normally', async t => {
    const f = fixture(t); f.r.interacting = true; f.layer.cameraChanged(); await f.advance(200);
    f.layer.cameraChanged(); await f.advance(100);
    const replacement = {}; f.r.world = replacement; f.layer.bind(replacement, {}, f.sites);
    f.r.interacting = false; await f.advance(500); assert.equal(f.calls.streams, 0);
    f.layer.cameraChanged(); await f.advance(200);
    assert.equal(f.calls.streams, 1); assert.deepEqual(f.calls.builds, ['ruin-0']);
});

test('pending ruin timers honor busy state, current world and leaving town zoom', async t => {
    const f = fixture(t);
    for (const invalidate of [() => E.setBusy(true), () => { f.r.world = {}; }, () => { f.r.zoom = 1; }]) {
        f.r.world = f.world; f.r.zoom = 80; E.setBusy(false);
        f.layer.cameraChanged(); invalidate(); await f.advance(500);
        assert.equal(f.calls.streams, 0); assert.deepEqual(f.calls.builds, []);
    }
});

test('a new gesture between awaited ruins postpones the remaining assemblies', async t => {
    const f = fixture(t, 2), build = f.layer.build;
    f.layer.build = (...args) => {
        const model = build(...args); if (model.id === 'ruin-0') f.r.interacting = true; return model;
    };
    f.layer.cameraChanged(); await f.advance(200);
    assert.deepEqual(f.calls.builds, ['ruin-0']);
    await f.advance(600); assert.deepEqual(f.calls.builds, ['ruin-0']);
    f.r.interacting = false; await f.advance(350);
    assert.deepEqual(f.calls.builds, ['ruin-0', 'ruin-1']);
    assert.equal(f.calls.streams, 2, 'the completed first ruin is reused after release');
});

test('explicit Visit ensure remains immediate during an active camera flight', async t => {
    const f = fixture(t); f.r.cameraAnimating = true; f.r.interacting = true;
    const pending = f.layer.ensure('ruin-0'); await f.advance(0);
    assert.equal((await pending)?.id, 'ruin-0');
    assert.deepEqual(f.calls.builds, ['ruin-0']); assert.equal(f.calls.streams, 0);
});
