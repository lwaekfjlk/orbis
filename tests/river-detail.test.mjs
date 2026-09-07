import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const E = Function(source + '\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,politicalFingerprint,AtlasSpace,AtlasRenderer,ContinuousCityLayer,RiverDetail,GW};')();
let world, sim, originalState;
const models = new Map();
function state() {
    const hash = createHash('sha256');
    for (const key of Object.keys(world).sort()) {
        const value = world[key];
        if (ArrayBuffer.isView(value)) hash.update(key).update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    return [E.physicalFingerprint(world), E.settlementFingerprint(sim), E.politicalFingerprint(sim), hash.digest('hex'), JSON.stringify(sim)];
}
function layerAt(model, {zoom = 60, width = 1440, height = 900, loaded = models} = {}) {
    const meshes = {}, r = Object.assign(Object.create(E.AtlasRenderer.prototype), {
        world, relief: 1, zoom, width, height, azimuth: -.38, elevation: .76,
        target: E.AtlasSpace.point(world, model.p.x, model.p.y), selected: -1,
        upload(name, g) { meshes[name] = g; }
    });
    const layer = new E.ContinuousCityLayer(r);
    Object.assign(layer, {world, sim, natural: true, models: new Map(loaded), testMeshes: meshes});
    return layer;
}
function cell(model, point) {
    const p = model.frame.vertex(point.x, model.frame.localGround(point.x, point.z), point.z), grid = E.AtlasSpace.grid(p[0], p[2]);
    return Math.round(grid[1]) * E.GW + Math.round(grid[0]);
}
const nearIds = plan => new Set(plan.items.map(s => s.id));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`);

test.before(async () => {
    world = await E.generateWorld(defaults);
    sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
    originalState = state();
    // Survey only the two reported river cities, without building every town.
    for (const [id, name] of [[291, 'Gullgrove'], [299, 'Harthurst']]) {
        const p = sim.provinces[id];
        assert.equal(p.name, name);
        const city = E.generateCity(world, sim, id), frame = E.AtlasSpace.cityFrame(world, p, city, 1);
        models.set(id, {p, city, frame, key: String(id)});
    }
});

test('actual city streams reuse their parent river source and retain the small Gullgrove tributary', () => {
    const first = models.get(291), atlas = new Map(E.RiverDetail.sources(layerAt(first, {loaded: []})).map(s => [s.id, s]));
    const layer = layerAt(first), sources = E.RiverDetail.sources(layer), byId = new Map(sources.map(s => [s.id, s]));
    assert.equal(byId.size, sources.length, 'one surface per parent source cell');
    assert.equal(sources.length, atlas.size + 1, 'retain the surveyed tributary below the atlas threshold');
    for (const [id, duplicateCount, supplementCount] of [[291, 5, 1], [299, 4, 0]]) {
        const model = models.get(id), ids = model.city.rivers.map(s => cell(model, s.a));
        assert.equal(ids.length, duplicateCount + supplementCount);
        assert.equal(ids.filter(i => atlas.has(i)).length, duplicateCount);
        assert.equal(ids.filter(i => !atlas.has(i)).length, supplementCount);
        for (const stream of model.city.rivers) {
            const id = cell(model, stream.a), s = byId.get(id);
            assert.ok(s, model.p.name + ' lost a stream');
            const surveyedHalfWidth = stream.width * model.frame.scale;
            close(s.width, surveyedHalfWidth, model.p.name + ' loaded native half width');
            if (atlas.has(id)) {
                assert.equal(s.town, false);
                assert.equal(s.to, (world.riverDown || world.down)[id], 'global drainage remains authoritative');
                assert.equal(s.width, atlas.get(id).width, 'the city overlay must not widen a duplicated river');
                close(atlas.get(id).width, surveyedHalfWidth, model.p.name + ' unloaded native half width');
                assert.ok(atlas.get(id).mapWidth > atlas.get(id).width, 'the exaggerated atlas symbol width stays separate from the surveyed channel');
            } else {
                assert.equal(s.town, true);
                assert.equal(s.to, cell(model, stream.b));
                close(s.width, stream.width * model.frame.scale, 'supplemental half width');
            }
            const [gx, gy] = E.AtlasSpace.grid(...s.a);
            close(gx, id % E.GW, 'inherited source X'); close(gy, Math.floor(id / E.GW), 'inherited source Y');
        }
    }
    layer.models.set('overlapping-survey', first);
    assert.deepEqual(E.RiverDetail.sources(layer), sources, 'overlapping loaded towns must not duplicate tributaries');
    layer.r.world = {...world};
    assert.deepEqual(E.RiverDetail.sources(layer), [...atlas.values()], 'stale town surveys must not leak into a replacement world');
});

test('zoom and viewport dimensions increase both dimensions of the visible river grid', () => {
    for (const model of models.values()) {
        const layer = layerAt(model, {zoom: 60}), sources = E.RiverDetail.sources(layer), coarse = E.RiverDetail.plan(layer, sources);
        layer.r.zoom = 240;
        const closeView = E.RiverDetail.plan(layer, sources);
        layer.r.width *= 2; layer.r.height *= 2;
        const highResolution = E.RiverDetail.plan(layer, sources);
        for (const [a, b] of [[coarse, closeView], [closeView, highResolution]]) {
            assert.ok(b.pixel < a.pixel);
            assert.ok(b.across > a.across, model.p.name + ' must subdivide across the banks');
            const prior = new Map(a.items.map(s => [s.id, s]));
            assert.ok(b.items.length > 0);
            for (const s of b.items) if (prior.has(s.id)) {
                assert.ok(s.steps > prior.get(s.id).steps, model.p.name + ' must subdivide along the channel');
                assert.ok(s.steps > 1 && s.across > 1);
            }
        }
        assert.deepEqual(nearIds(closeView), nearIds(highResolution), 'same-aspect resize changes detail, not world coverage');
        assert.ok(closeView.items.every(s => nearIds(coarse).has(s.id)), 'zoom keeps the inherited river sources');
        assert.ok(highResolution.lift < closeView.lift, 'near water offset follows CSS pixel size');
    }
});

test('the detailed neighbourhood stays within its triangle budget at deep zoom and large viewports', t => {
    const measurements = [];
    for (const model of models.values()) for (const zoom of [16, 60, 240, 620]) for (const [width, height] of [[1440, 900], [2880, 1800]]) {
        const layer = layerAt(model, {zoom, width, height}), sources = E.RiverDetail.sources(layer), p = E.RiverDetail.plan(layer, sources);
        assert.equal(p.items.length + p.far.length, sources.length, 'near/far partition retains every channel');
        assert.equal(new Set([...p.items, ...p.far].map(s => s.id)).size, sources.length);
        assert.ok(p.items.length > 0 && p.far.length > 0);
        assert.ok(p.triangles > 0 && p.triangles <= E.RiverDetail.MAX_TRIANGLES);
        assert.ok(p.triangles <= 180000);
        assert.equal(p.triangles, p.items.reduce((n, s) => n + s.steps * s.across * 2, 0));
        assert.ok(p.items.every(s => s.steps > 1 && s.across > 1));
        measurements.push({city: model.p.name, zoom, width, triangles: p.triangles, across: p.across});
    }
    t.diagnostic('Largest detailed river budget in the two-city zoom/resize matrix: ' + Math.max(...measurements.map(m => m.triangles)) + ' / 180000 triangles');
});

test('uploaded close-view water samples the ground at every vertex with a small pixel-scaled offset', () => {
    for (const model of models.values()) {
        const layer = layerAt(model), p = E.RiverDetail.plan(layer), box = layer.viewBox(), stats = E.RiverDetail.build(layer), data = layer.testMeshes.rivers.data;
        assert.equal(stats.detailTriangles, p.triangles);
        assert.equal(stats.triangles, data.length / 27);
        assert.equal(stats.lift, p.lift);
        assert.ok(p.lift > 0 && p.lift < .004 && p.lift < .095 / 20);
        let visible = 0;
        for (let i = 0; i < data.length; i += 9) {
            const [gx, gy] = E.AtlasSpace.grid(data[i], data[i + 2]);
            if (gx < box.x0 || gx > box.x1 || gy < box.y0 || gy > box.y1) continue;
            visible++;
            close(data[i + 1] - p.sample(data[i], data[i + 2]), p.lift, model.p.name + ' near water ground offset');
        }
        assert.ok(visible > 1000, 'inspect actual uploaded visible geometry, not only planner statistics');
        assert.equal(layer.lastRiverKey, E.RiverDetail.key(layer));
    }
});

test('town exports retain detailed local rivers independently of the live camera and viewport', () => {
    for (const model of models.values()) {
        const layer = layerAt(model), mesh = E.RiverDetail.townMesh(layer, model), data = mesh.vertices;
        assert.ok(data instanceof Float32Array && data.length % 27 === 0);
        assert.ok(data.length / 27 > model.city.rivers.length * 18, 'export must retain the two-dimensional fine ribbon');
        const lo = model.frame.at(-model.city.width * .65, -model.city.depth * .65), hi = model.frame.at(model.city.width * .65, model.city.depth * .65);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < data.length; i += 9) {
            const [x, y] = E.AtlasSpace.grid(data[i], data[i + 2]);
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        // Keep complete neighbouring links so their joins survive a town export.
        assert.ok(minX >= lo[0] - 1.5 && maxX <= hi[0] + 1.5);
        assert.ok(minY >= lo[1] - 1.5 && maxY <= hi[1] + 1.5);
        assert.ok(maxX - minX < 10 && maxY - minY < 10, model.p.name + ' export includes distant world rivers');
        assert.deepEqual(E.RiverDetail.townMesh(layer, model).vertices, data, 'repeat exports are deterministic');
        const cameraState = () => structuredClone(Object.fromEntries(Object.entries(layer.r).filter(([key, value]) => key !== 'world' && typeof value !== 'function')));
        for (const zoom of [1, 60, 620]) for (const [width, height] of [[640, 960], [1440, 900], [2880, 1800]]) {
            Object.assign(layer.r, {zoom, width, height, selected: -1});
            layer.r.updateCamera();
            layer.r.selected = model.p.i;
            const before = cameraState();
            assert.deepEqual(E.RiverDetail.townMesh(layer, model).vertices, data, `${model.p.name} export changed at zoom ${zoom}, ${width} × ${height}`);
            assert.deepEqual(cameraState(), before, 'export must not change live camera parameters or its derived matrices');
            assert.deepEqual(Object.keys(layer.testMeshes), [], 'export must not upload a new live selection marker');
        }
    }
});

test('river planning, rendering and export leave physical drainage, settlements and politics unchanged', () => {
    assert.deepEqual(state(), originalState);
});
