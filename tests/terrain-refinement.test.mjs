import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scripts } from '../scripts/manifest.mjs';
import { root } from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
const E = Function('let busy = false;\n' + source + '\nreturn {ContinuousCityLayer,AtlasRenderer,AtlasSpace,RiverDetail,setBusy(value){busy=value;}};')();

function cameraFixture(t, zoom = 20) {
    // Keep production debounce callbacks while advancing their clock explicitly.
    // This remains deterministic when the full geometry suite saturates the CPU.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    E.setBusy(false);
    const world = { name: 'first world' }, sim = { provinces: [], realms: [] };
    const calls = { roads: [], terrain: [], environment: [], stream: [], atlasRoads: 0, lines: 0, rivers: [], requests: 0 };
    const r = Object.create(E.AtlasRenderer.prototype);
    Object.assign(r, { world, sim, width: 1000, height: 700, zoom, target: [0, 0, 0],
        azimuth: .018, elevation: 1.19, relief: 1, layer: 'relief', meshes: {}, options: {},
        request() { calls.requests++; }, buildNearRoads() { calls.roads.push(this.zoom); },
        buildRoads() { calls.atlasRoads++; }, buildLines() { calls.lines++; this.buildRivers(); },
        buildRivers() { calls.rivers.push(this.zoom); layer.lastRiverKey=E.RiverDetail.key(layer); } });
    const layer = new E.ContinuousCityLayer(r);
    Object.assign(layer, { world, sim, natural: zoom >= E.AtlasSpace.TOWN_ZOOM });
    const snapshot = () => ({ world: layer.world, zoom: r.zoom, target: r.target.slice(), width: r.width, height: r.height });
    r.buildTerrain = () => { calls.terrain.push(snapshot()); layer.lastTerrainKey = layer.terrainKey(); };
    layer.buildEnvironment = () => { calls.environment.push(snapshot()); layer.lastEnvironmentKey = layer.environmentKey(); };
    layer.stream = () => { calls.stream.push(snapshot()); };
    layer.lastTerrainKey = layer.terrainKey();
    layer.lastEnvironmentKey = layer.environmentKey();
    layer.lastRiverKey=E.RiverDetail.key(layer);
    t.after(() => { layer.reset(null, null); clearTimeout(layer.timer); E.setBusy(false); });
    return { r, layer, calls, clock: t.mock.timers };
}

test('zooming within an already open town updates roads and settles a finer terrain mesh', t => {
    const { r, layer, calls, clock } = cameraFixture(t);
    const before = layer.lastTerrainKey;
    r.zoom = 200;
    assert.notEqual(layer.terrainKey(), before, 'the camera now needs different terrain detail');
    layer.cameraChanged();
    assert.equal(calls.roads.length, 1, 'near roads follow the close camera immediately');
    assert.equal(calls.terrain.length, 0, 'a wheel event must not synchronously remesh the terrain');
    clock.tick(300);
    assert.equal(calls.terrain.length, 1, 'close town views must schedule terrain as well as roads');
    assert.equal(calls.terrain[0].zoom, 200);
    assert.equal(layer.lastTerrainKey, layer.terrainKey());
});

test('panning an open town moves its terrain refinement with the camera', t => {
    const { r, layer, calls, clock } = cameraFixture(t, 200);
    const before = layer.lastTerrainKey;
    r.target[0] += E.AtlasSpace.X * 8;
    r.target[2] -= E.AtlasSpace.Z * 4;
    assert.notEqual(layer.terrainKey(), before);
    layer.cameraChanged();
    clock.tick(300);
    assert.equal(calls.roads.length, 1);
    assert.equal(calls.terrain.length, 1, 'the refined patch cannot remain at the old pan position');
    assert.deepEqual(calls.terrain[0].target, r.target);
});

test('viewport resizing refreshes close terrain even when camera pose and zoom are unchanged', t => {
    const { r, layer, calls, clock } = cameraFixture(t);
    const before = layer.lastTerrainKey, pose = [r.zoom, ...r.target, r.azimuth, r.elevation];
    r.width = 2800; r.height = 1800;
    assert.notEqual(layer.terrainKey(), before, 'more screen pixels need a finer sampling rate');
    layer.cameraChanged();
    clock.tick(300);
    assert.deepEqual([r.zoom, ...r.target, r.azimuth, r.elevation], pose);
    assert.equal(calls.roads.length, 1);
    assert.equal(calls.terrain.length, 1);
    assert.equal(calls.terrain[0].width, 2800);
    assert.equal(calls.terrain[0].height, 1800);
});

test('rapid camera events coalesce to the final view and unchanged views do not remesh', t => {
    const { r, layer, calls, clock } = cameraFixture(t);
    r.zoom = 60; layer.cameraChanged();
    clock.tick(100);
    r.zoom = 120; r.target[0] += E.AtlasSpace.X * 8; layer.cameraChanged();
    clock.tick(100);
    assert.equal(calls.terrain.length, 0, 'the first event must not leave an earlier terrain callback armed');
    r.zoom = 240; layer.cameraChanged();
    clock.tick(300);
    assert.equal(calls.terrain.length, 1, 'one gesture gets one settled terrain rebuild');
    assert.equal(calls.terrain[0].zoom, 240);
    assert.deepEqual(calls.terrain[0].target, r.target);
    const environmentBuilds = calls.environment.length;
    layer.cameraChanged(); clock.tick(300);
    assert.equal(calls.terrain.length, 1, 'an unchanged refinement key does not enqueue more terrain work');
    assert.equal(calls.environment.length, environmentBuilds);
});

test('replacing the world cancels every deferred camera callback before a new world is bound', t => {
    const { r, layer, calls, clock } = cameraFixture(t);
    r.zoom = 200; layer.cameraChanged();
    clock.tick(100);
    const nextWorld = { name: 'replacement world' }, nextSim = { provinces: [], realms: [] };
    r.world = nextWorld; r.sim = nextSim;
    layer.bind(nextWorld, nextSim);
    clock.tick(300);
    assert.equal(calls.terrain.length, 0, 'old camera events must not rebuild replacement terrain');
    assert.equal(calls.environment.length, 0, 'old scatter callbacks must not run in the replacement world');
    assert.equal(calls.stream.length, 0, 'old town-stream callbacks must also be cancelled');
    layer.cameraChanged();
    assert.equal(calls.terrain.length, 1, 'the replacement world remains responsive to its own camera event');
    assert.equal(calls.terrain[0].world, nextWorld);
    assert.equal(calls.atlasRoads, 1, 'roads are reseated when the terrain switches from map to detail');
    assert.equal(calls.lines, 1, 'river overlays follow the same terrain transition');
    clock.tick(300);
    assert.equal(calls.terrain.length, 1, 'the old callback cannot cause a duplicate rebuild');
    assert.equal(calls.stream.length, 1);
    assert.equal(calls.stream[0].world, nextWorld);
});

test('a world becoming busy during debounce suppresses mesh work until the camera can resume', t => {
    const { r, layer, calls, clock } = cameraFixture(t);
    r.zoom = 200; layer.cameraChanged();
    E.setBusy(true); clock.tick(300);
    assert.equal(calls.terrain.length, 0);
    assert.equal(calls.environment.length, 0);
    E.setBusy(false); layer.cameraChanged(); clock.tick(300);
    assert.equal(calls.terrain.length, 1, 'a suppressed camera update can be retried after world generation');
});


test('river detail follows settled zoom, pan and resize without redrawing unrelated overlays', t => {
    const {r,layer,calls,clock}=cameraFixture(t,20);
    r.zoom=200;layer.cameraChanged();clock.tick(100);
    r.zoom=320;layer.cameraChanged();clock.tick(300);
    assert.deepEqual(calls.rivers,[320],'one gesture gets one river rebuild at its final scale');
    assert.equal(calls.lines,0,'a river refinement does not rebuild winds and plate arrows');
    layer.cameraChanged();clock.tick(300);assert.equal(calls.rivers.length,1,'unchanged camera reuses water geometry');
    r.target[0]+=E.AtlasSpace.X*5;layer.cameraChanged();clock.tick(300);assert.equal(calls.rivers.length,2);
    r.width*=2;r.height*=2;layer.cameraChanged();clock.tick(300);assert.equal(calls.rivers.length,3);
});
test('a world reset cancels pending river refinement and the river toggle stays available near cities', t => {
    const {r,layer,calls,clock}=cameraFixture(t,60);
    r.zoom=300;layer.cameraChanged();clock.tick(100);
    const replacement={name:'new world'};r.world=replacement;layer.bind(replacement,{provinces:[],realms:[]});clock.tick(300);
    assert.equal(calls.rivers.length,0,'a stale river callback cannot run after reset');
    r.options.rivers=false;assert.equal(layer.visible('rivers'),false);r.options.rivers=true;assert.equal(layer.visible('rivers'),true);
});
