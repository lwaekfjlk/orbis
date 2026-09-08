import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const browser = {}, E = Function('window', source + '\nreturn {generateWorld,createCivilization,citySurvey,physicalFingerprint,settlementFingerprint,politicalFingerprint,AtlasRenderer,AtlasSpace,CityEnvironment,LandscapeRelief,LandscapeColor,ContinuousCityLayer,RiverDetail,Geometry,GW,GH,GN};')(browser);
const close = (a, b, label, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${label}: ${a} != ${b}`);
const geometryHash = data => createHash('sha256').update(Buffer.from(Float32Array.from(data).buffer)).digest('hex');
function worldHash(w) {
    const h = createHash('sha256');
    for (const k of Object.keys(w).sort()) if (ArrayBuffer.isView(w[k])) h.update(k).update(new Uint8Array(w[k].buffer, w[k].byteOffset, w[k].byteLength));
    return h.digest('hex');
}
function renderer(w, sim, x, y) {
    const meshes = {}, r = Object.assign(Object.create(E.AtlasRenderer.prototype), {
        world: w, sim, relief: 1, zoom: 240, width: 1440, height: 900, selected: -1, azimuth: -.38, elevation: .76,
        target: E.AtlasSpace.point(w, x, y), layer: 'relief', options: {}, meshes,
        palette() { return [.4, .55, .32]; }, upload(name, g) { meshes[name] = {data: g.data}; }, request() {}
    });
    const layer = new E.ContinuousCityLayer(r);
    Object.assign(layer, {world: w, sim, natural: true});
    // This is the production ContinuousMap ground binding used by roads/picking.
    r.continuousLayer = layer; r.ground = (x, y) => layer.ground(x, y);
    return {r, layer, meshes};
}
function flatFixture() {
    const field = n => new Float32Array(E.GN).fill(n), w = {seed: 47, height: field(300), lake: field(-1), ice: field(0), temp: field(15), arid: field(1.5), rain: field(100), biome: new Uint8Array(E.GN).fill(7), flow: field(0), down: new Int32Array(E.GN).fill(-1), riverThreshold: 5};
    const river = 90 * E.GW + 148; w.flow[river] = 12; w.down[river] = river + 1;
    const sim = {provinces: [{id: 0, settled: true, urbanPop: 1000, x: 10, y: 10}], realms: []}, f = renderer(w, sim, 150, 90);
    f.layer.viewBox = () => ({x0: 147, x1: 153, y0: 87, y1: 93});
    f.layer.tessellation = () => 32;
    return {...f, w, sim};
}
const flat = flatFixture(), rows = [];
let world, sim, originalWorld, originalSim, originalFingerprints;
test.before(async () => {
    flat.layer.prepareLandscape(); flat.layer.buildTerrain();
    world = await E.generateWorld(defaults); sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
    browser.world = world; browser.sim = sim;
    originalWorld = worldHash(world); originalSim = JSON.stringify(sim);
    originalFingerprints = [E.physicalFingerprint(world), E.settlementFingerprint(sim), E.politicalFingerprint(sim)];
    for (const id of [291, 299]) {
        const p = sim.provinces[id], f = renderer(world, sim, p.x, p.y);
        f.layer.prepareLandscape();
        const points = [];
        for (let y = -4; y <= 4; y += .5) for (let x = -4; x <= 4; x += .5) points.push([p.x + x + .137, p.y + y + .319]);
        const unloaded = points.map(q => f.layer.ground(...q)), model = f.layer.build(p);
        f.layer.models.set(id, model);
        rows.push({...f, p, model, points, unloaded});
    }
});

test('the real terrain builder combines continuous material patches, relief and derivative normals', () => {
    const data = flat.meshes.terrain.data, colors = new Set(), unique = new Set();
    let offsetRange = [Infinity, -Infinity], checked = 0, tilted = 0;
    for (let i = 0; i < data.length; i += 9) {
        const [x, y] = E.AtlasSpace.grid(data[i], data[i + 2]);
        if (x <= 149 || x >= 151 || y <= 89 || y >= 91) continue;
        const key = x.toFixed(7) + ',' + y.toFixed(7); if (unique.has(key)) continue; unique.add(key);
        colors.add(data.slice(i + 6, i + 9).map(v => v.toFixed(5)).join(','));
        close(data[i + 1], E.AtlasSpace.surface(flat.w, x, y), 'terrain vertex shared surface');
        const offset = data[i + 1] - E.CityEnvironment.atlasSurface(flat.w, x, y);
        offsetRange = [Math.min(offsetRange[0], offset), Math.max(offsetRange[1], offset)];
        // Avoid the known C0 derivative break at original parent-cell edges.
        if (Math.abs(x - Math.round(x)) < .02 || Math.abs(y - Math.round(y)) < .02) continue;
        const e = 1e-5, dx = (E.AtlasSpace.surface(flat.w, x + e, y) - E.AtlasSpace.surface(flat.w, x - e, y)) / (2 * e * E.AtlasSpace.X), dz = (E.AtlasSpace.surface(flat.w, x, y + e) - E.AtlasSpace.surface(flat.w, x, y - e)) / (2 * e * E.AtlasSpace.Z), length = Math.hypot(dx, 1, dz);
        close(data[i + 3], -dx / length, 'relief X normal', 2e-6); close(data[i + 4], 1 / length, 'relief Y normal', 2e-6); close(data[i + 5], -dz / length, 'relief Z normal', 2e-6);
        if (Math.hypot(dx, dz) > .005) tilted++; checked++;
    }
    assert.ok(colors.size > 100, 'a formerly flat green cell needs visible material variation');
    assert.ok(offsetRange[1] - offsetRange[0] > .003, 'the flat fixture must acquire actual small rises and hollows');
    assert.ok(checked > 1000 && tilted > 500, 'shading must tilt with the new geometry');
});

test('roads, selection, river vertices and tree roots all use the same displayed ground', () => {
    const {w, r, layer, meshes} = flat, before = worldHash(w);
    r.roadNetwork = {signature: 'local-fixture', roads: [{cls: 'road', from: 1, to: 2, path: [147, 148, 149, 150, 151, 152].map(x => 91 * E.GW + x)}]};
    r.buildNearRoads(true);
    const roads = meshes.roadsNear.data, lift = (E.AtlasSpace.BUILDING_LIFT + .14) * E.AtlasSpace.TOWN_UNIT;
    assert.ok(roads.length > 0);
    let undulatingRoadVertices = 0;
    for (let i = 0; i < roads.length; i += 9) {
        const q = E.AtlasSpace.grid(roads[i], roads[i + 2]);
        close(roads[i + 1] - layer.ground(...q), lift, 'road clearance');
        if (Math.abs(E.LandscapeRelief.offset(w, ...q)) > .0001) undulatingRoadVertices++;
    }
    assert.ok(undulatingRoadVertices > 30, 'road test must cross the new relief, not only protected flat ground');
    const originalLine = E.Geometry.prototype.line, ring = [];
    E.Geometry.prototype.line = function (a, b, ...rest) { ring.push(a, b); return originalLine.call(this, a, b, ...rest); };
    try { r.select(90 * E.GW + 150); } finally { E.Geometry.prototype.line = originalLine; }
    const ringLift = Math.min(.23, .9 * 2 * r.halfH / r.height);
    assert.ok(ring.length >= 64);
    for (const p of ring) close(p[1] - layer.ground(...E.AtlasSpace.grid(p[0], p[2])), ringLift, 'selection centreline clearance');
    r.selected = -1;
    const plan = E.RiverDetail.plan(layer); E.RiverDetail.build(layer);
    assert.ok(plan.items.length > 0 && plan.far.length === 0);
    const water = meshes.rivers.data;
    for (let i = 0; i < water.length; i += 9) close(water[i + 1] - plan.sample(water[i], water[i + 2]), plan.lift, 'river clearance');
    const originalCone = E.Geometry.prototype.cone, trunks = [];
    E.Geometry.prototype.cone = function (...args) { if (args[6][0] === 121 / 255 && args[6][1] === 100 / 255) trunks.push(args.slice(0, 3)); return originalCone.apply(this, args); };
    try { layer.buildEnvironment(); } finally { E.Geometry.prototype.cone = originalCone; }
    assert.ok(trunks.length > 20);
    for (const p of trunks) close(p[1], layer.ground(...E.AtlasSpace.grid(p[0], p[2])), 'tree root on displayed ground');
    assert.equal(worldHash(w), before, 'display mesh builders must not rewrite the source geography');
});

test('loading or unloading the two actual cities cannot move the same ground point', () => {
    for (const row of rows) {
        const {layer, model, points, unloaded, p} = row;
        assert.deepEqual(points.map(q => layer.ground(...q)), unloaded, p.name + ' loading changed its surrounding relief');
        const key = E.LandscapeRelief.key(world);
        layer.models.delete(p.id); layer.prepareLandscape();
        assert.equal(E.LandscapeRelief.key(world), key);
        assert.deepEqual(points.map(q => layer.ground(...q)), unloaded, p.name + ' unloading changed its surrounding relief');
        layer.models.set(p.id, model);
        for (const b of model.city.buildings) {
            const q = model.frame.at(b.x, b.z);
            close(E.LandscapeRelief.offset(world, ...q), 0, p.name + ' authored building parcel must retain its original ground');
        }
    }
});

test('worker city meshes and sampled ground agree with both actual main-thread cities', () => {
    const responses = [], self = {postMessage(response, buffers) { responses.push({response, buffers}); }};
    const worker = Function('self', 'window', source + '\n' + readFileSync(new URL('../src/continuous/worker-body.js', import.meta.url), 'utf8') + '\nreturn {surface:AtlasSpace.surface};')(self, self);
    const workerWorld = structuredClone(world), workerSim = structuredClone(sim);
    for (const [i, row] of rows.entries()) {
        self.onmessage({data: {id: i + 1, ...(i === 0 ? {world: workerWorld} : {}), sim: workerSim, pid: row.p.id, relief: 1}});
        const {response, buffers} = responses.at(-1); assert.equal(response.error, undefined, response.stack);
        const payload = response.payload;
        assert.deepEqual(payload.heights, row.model.heights, row.p.name + ' worker changed model heights');
        for (const name of row.model.meshNames) {
            assert.ok(payload.meshes[name], name);
            assert.equal(geometryHash(payload.meshes[name].vertices), geometryHash(row.meshes[name].data), name + ' worker mesh differs');
            assert.ok(buffers.includes(payload.meshes[name].vertices.buffer), name + ' was not transferred');
        }
        for (const q of row.points) close(worker.surface(workerWorld, ...q), E.AtlasSpace.surface(world, ...q), row.p.name + ' worker ground differs');
    }
});

test('an actual capital survey change invalidates its model and refreshes landscape-dependent meshes once', () => {
    const changedSim = structuredClone(sim), {r, layer} = renderer(world, changedSim, 150, 90);
    layer.prepareLandscape();
    let capital = null;
    for (const realm of changedSim.realms.filter(r => r.alive)) {
        const p = changedSim.provinces[realm.capital]; if (!p?.settled) continue;
        const before = layer.key(p), previous = realm.capital;
        realm.capital = -1;
        const after = layer.key(p);
        if (before.split('/').slice(-3).join('/') !== after.split('/').slice(-3).join('/')) { capital = {p, before, after}; break; }
        realm.capital = previous;
    }
    assert.ok(capital, 'the default world must provide a capital whose existing survey allowance changes');
    assert.notEqual(capital.before, capital.after, 'a changed survey must not reuse its old city model key');
    const calls = {terrain: 0, environment: 0, rivers: 0, nearRoads: 0};
    r.roadKey = r.nearRoadKey = layer.lastTerrainKey = layer.lastRiverKey = layer.lastEnvironmentKey = 'old-cache';
    r.buildTerrain = () => { assert.equal(layer.lastTerrainKey, null); calls.terrain++; };
    r.buildRivers = () => { assert.equal(layer.lastRiverKey, null); calls.rivers++; };
    r.buildNearRoads = () => { assert.equal(r.nearRoadKey, null); assert.equal(r.roadKey, null); calls.nearRoads++; };
    layer.buildEnvironment = () => { assert.equal(layer.lastEnvironmentKey, 'none'); calls.environment++; };
    try {
        const before = layer.lastLandscapeKey;
        layer.bind(world, changedSim);
        assert.notEqual(layer.lastLandscapeKey, before, 'capital changes update the world protection signature');
        assert.deepEqual(calls, {terrain: 1, environment: 1, rivers: 1, nearRoads: 1});
        layer.bind(world, changedSim);
        assert.deepEqual(calls, {terrain: 1, environment: 1, rivers: 1, nearRoads: 1}, 'an unchanged protection signature must not remesh repeatedly');
    } finally { E.LandscapeRelief.prepare(world, sim); }
});

test('a loaded town that falls below the population threshold retires before its ground is rebuilt', () => {
    for (const row of rows) {
        const changedSim = structuredClone(sim), {r, layer, meshes} = renderer(world, changedSim, row.p.x, row.p.y), p = changedSim.provinces[row.p.id];
        const model = {...row.model, p};
        layer.prepareLandscape(); layer.models.set(p.id, model); layer.focusId = p.id;
        for (const name of model.meshNames) meshes[name] = {data: []};
        meshes['cm:selection'] = {data: []};
        const calls = {terrain: 0, environment: 0, rivers: 0, nearRoads: 0};
        r.buildTerrain = () => {
            assert.equal(layer.models.has(p.id), false, 'the obsolete town must leave before its former protection is released');
            assert.ok(model.meshNames.every(name => !meshes[name]), 'old building/vegetation buffers remain visible');
            calls.terrain++;
        };
        r.buildRivers = () => calls.rivers++; r.buildNearRoads = () => calls.nearRoads++; layer.buildEnvironment = () => calls.environment++;
        p.settled = false; p.urbanPop = 600;
        try {
            layer.bind(world, changedSim);
            assert.equal(layer.models.has(p.id), false); assert.equal(layer.focusId, null); assert.equal(meshes['cm:selection'], undefined);
            assert.ok(Object.values(calls).every(n => n >= 1), 'retirement must refresh terrain, plants, rivers and roads together');
            const before = {...calls}; layer.bind(world, changedSim);
            assert.deepEqual(calls, before, 'retired geometry should not trigger repeated rebuilds');
        } finally { E.LandscapeRelief.prepare(world, sim); }
    }
});

test('a town retiring during the initial streaming yield never starts a city build', async () => {
    const row = rows[0], changedSim = structuredClone(sim), {layer, meshes} = renderer(world, changedSim, row.p.x, row.p.y), p = changedSim.provinces[row.p.id];
    let builds = 0; layer.workerBuild = () => { builds++; return Promise.resolve(row.model); };
    const pending = layer.ensure(p.id);
    p.settled = false; p.urbanPop = 600;
    assert.equal(await pending, null);
    assert.equal(builds, 0); assert.equal(layer.models.size, 0); assert.deepEqual(Object.keys(meshes), []);
    assert.equal(layer.pending.size, 0); assert.equal(layer.loading, false); assert.equal(layer.preparing, null); assert.equal(layer.failed.size, 0);
});

test('a worker response for a town that retired in flight cannot upload or restore its old mesh', async () => {
    const row = rows[1], changedSim = structuredClone(sim), {r, layer, meshes} = renderer(world, changedSim, row.p.x, row.p.y), p = changedSim.provinces[row.p.id];
    const previousWorker = browser.Worker, previousSource = browser.TELLURIC_TOWN_WORKER;
    let request, resolvePosted;
    const posted = new Promise(resolve => { resolvePosted = resolve; });
    browser.Worker = true; browser.TELLURIC_TOWN_WORKER = 'trusted-test-worker';
    layer.workerWorld = world;
    layer.worker = {postMessage(data) { request = data; resolvePosted(); }};
    layer.prepareLandscape(); r.buildTerrain = r.buildRivers = r.buildNearRoads = layer.buildEnvironment = () => {};
    try {
        const pending = layer.ensure(p.id);
        await posted;
        p.settled = false; p.urbanPop = 600; layer.bind(world, changedSim);
        const job = layer.workerJobs.get(request.id); layer.workerJobs.delete(request.id);
        // A valid bounded payload would upload successfully if the live-province
        // check were missing; no additional city generation is needed here.
        job.resolve({city: {n: 2, width: 10, depth: 10, span: 7.8, terrainSpan: 2.34, height: new Float32Array(4), buildings: [], context: {n: 2, width: 20, depth: 20}}, heights: {}, excavations: [], triangles: 1,
            meshes: {[`cm:${p.id}:buildings`]: {vertices: new Float32Array(27), shadow: true, unlit: 0, alpha: 1}}});
        assert.equal(await pending, null);
        assert.equal(layer.models.size, 0); assert.deepEqual(Object.keys(meshes), [], 'stale worker geometry was uploaded');
        assert.equal(layer.pending.size, 0); assert.equal(layer.loading, false); assert.equal(layer.preparing, null); assert.equal(layer.failed.size, 0);
    } finally {
        if (previousWorker === undefined) delete browser.Worker; else browser.Worker = previousWorker;
        if (previousSource === undefined) delete browser.TELLURIC_TOWN_WORKER; else browser.TELLURIC_TOWN_WORKER = previousSource;
        E.LandscapeRelief.prepare(world, sim);
    }
});

test('a newly settled neighbour removes an oversized city survey and rejects its in-flight old mesh', async () => {
    const changedSim = structuredClone(sim), p = changedSim.provinces[371], neighbour = changedSim.provinces[372];
    assert.equal(p.name, 'Inner Foamhaven'); assert.equal(neighbour.name, 'Greenhaven'); assert.equal(neighbour.settled, false);
    const oldSurvey = E.citySurvey(changedSim, p), name = `cm:${p.id}:buildings`, {r, layer, meshes} = renderer(world, changedSim, p.x, p.y);
    layer.prepareLandscape(); layer.models.set(p.id, {p, city: oldSurvey, key: layer.key(p), meshNames: [name]});
    layer.focusId = p.id; meshes[name] = {data: []};
    let rebuilt = 0;
    r.buildTerrain = () => { assert.equal(layer.models.has(p.id), false); assert.equal(meshes[name], undefined); rebuilt++; };
    r.buildRivers = r.buildNearRoads = layer.buildEnvironment = () => {};
    const previousWorker = browser.Worker, previousSource = browser.TELLURIC_TOWN_WORKER;
    try {
        neighbour.settled = true; neighbour.urbanPop = 650;
        const nextSurvey = E.citySurvey(changedSim, p);
        assert.ok(oldSurvey.terrainSpan > nextSurvey.terrainSpan * 1.1, 'this real neighbour exceeds the capital-only protection allowance');
        layer.bind(world, changedSim);
        assert.ok(rebuilt > 0); assert.equal(layer.focusId, p.id, 'an eligible town should retain focus while its smaller model reloads');

        const workerSim = structuredClone(sim), f = renderer(world, workerSim, p.x, p.y);
        f.layer.prepareLandscape(); f.r.buildTerrain = f.r.buildRivers = f.r.buildNearRoads = f.layer.buildEnvironment = () => {};
        let request, resolvePosted;
        const posted = new Promise(resolve => { resolvePosted = resolve; });
        browser.Worker = true; browser.TELLURIC_TOWN_WORKER = 'trusted-test-worker';
        f.layer.workerWorld = world; f.layer.worker = {postMessage(data) { request = data; resolvePosted(); }};
        const pending = f.layer.ensure(p.id); await posted;
        workerSim.provinces[neighbour.id].settled = true; workerSim.provinces[neighbour.id].urbanPop = 650;
        f.layer.bind(world, workerSim);
        const job = f.layer.workerJobs.get(request.id); f.layer.workerJobs.delete(request.id);
        job.resolve({city: {...oldSurvey, n: 2, height: new Float32Array(4), buildings: [], context: {n: 2, width: 20, depth: 20}}, heights: {}, excavations: [], triangles: 1,
            meshes: {[name]: {vertices: new Float32Array(27), shadow: true, unlit: 0, alpha: 1}}});
        assert.equal(await pending, null, 'a still-eligible city must reject geometry from its previous larger survey');
        assert.deepEqual(Object.keys(f.meshes), [], 'an outdated city footprint was uploaded');
        assert.equal(f.layer.models.size, 0); assert.equal(f.layer.failed.size, 0); assert.equal(f.layer.pending.size, 0); assert.equal(f.layer.loading, false);
    } finally {
        if (previousWorker === undefined) delete browser.Worker; else browser.Worker = previousWorker;
        if (previousSource === undefined) delete browser.TELLURIC_TOWN_WORKER; else browser.TELLURIC_TOWN_WORKER = previousSource;
        E.LandscapeRelief.prepare(world, sim);
    }
});

test('landscape display leaves the actual physical world, settlements and political state unchanged', () => {
    assert.equal(worldHash(world), originalWorld); assert.equal(JSON.stringify(sim), originalSim);
    assert.deepEqual([E.physicalFingerprint(world), E.settlementFingerprint(sim), E.politicalFingerprint(sim)], originalFingerprints);
});
