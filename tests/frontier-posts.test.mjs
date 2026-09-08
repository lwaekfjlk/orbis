import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-loader.mjs';

const E = loadEngine(), unit = E.AtlasSpace.TOWN_UNIT;
const cell = (x, y = 90) => y * E.GW + x;
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`);
const vertices = mesh => Array.from({ length: mesh.data.length / 9 }, (_, i) => mesh.data.slice(i * 9, i * 9 + 3));
function bounds(points) {
    const min = [0, 1, 2].map(j => Math.min(...points.map(p => p[j])));
    const max = [0, 1, 2].map(j => Math.max(...points.map(p => p[j])));
    return { min, max, size: max.map((n, j) => n - min[j]) };
}
function fixture(single = false) {
    const world = { height: new Float64Array(E.GN).fill(200), lake: new Int32Array(E.GN).fill(-1) };
    const sim = { provinces: [0, 0, 1, 1, 2, -1].map((owner, id) => ({ id, owner, pop: 1000, urbanPop: 700 })),
        realms: [0, 1, 2].map(id => ({ id, alive: true })), administrationGraph: Array.from({ length: 6 }, () => []), routes: [] };
    const connect = (a, b, cost, at) => {
        sim.administrationGraph[a].push({ to: b, cost, crossing: [at, at + 1] });
        sim.administrationGraph[b].push({ to: a, cost, crossing: [at + 1, at] });
    };
    const sites = { expensive: cell(140), preferred: cell(150), second: cell(160), third: cell(170), ignored: cell(180) };
    connect(1, 3, 2, sites.preferred);
    if (!single) {
        connect(0, 2, 8, sites.expensive); connect(3, 4, 3, sites.second); connect(1, 4, 4, sites.third);
        connect(0, 1, 1, sites.ignored); connect(4, 5, 1, sites.ignored);
    }
    const meshes = {}, r = Object.assign(Object.create(E.AtlasRenderer.prototype), {
        world, sim, meshes, relief: 1, zoom: 6, options: {}, layer: 'relief', ground: () => 2,
        upload(name, geometry) { meshes[name] = geometry; }, request() {},
    });
    return { world, sim, r, meshes, sites };
}
function pointsAt(f, at) {
    const center = f.r.coord(at % E.GW, Math.floor(at / E.GW), 0);
    return vertices(f.meshes.frontierPosts).filter(p => Math.hypot(p[0] - center[0], p[2] - center[2]) < .3);
}

test('one town-scale watchtower occupies the cheapest crossing for each neighboring realm pair', () => {
    const f = fixture(); f.r.buildFrontierPosts();
    assert.equal(f.r.frontierPosts, 3);
    assert.equal(pointsAt(f, f.sites.expensive).length, 0, 'an expensive crossing does not create a duplicate post');
    assert.equal(pointsAt(f, f.sites.ignored).length, 0, 'internal and unclaimed boundaries do not get posts');
    for (const at of [f.sites.preferred, f.sites.second, f.sites.third]) {
        const points = pointsAt(f, at); assert.ok(points.length > 0);
        const b = bounds(points);
        close(b.size[0], 4.08 * unit, 'watchtower footprint uses authored town units');
        close(b.size[2], 4.08 * unit, 'watchtower footprint stays square');
        close(b.size[1], 5.82 * unit, 'flat-ground watchtower height uses authored town units');
    }
});

test('zoom, city streaming and population do not change a frontier tower’s physical geometry', () => {
    const f = fixture(); f.r.buildFrontierPosts(); const initial = f.meshes.frontierPosts.data.slice();
    for (const zoom of [15.999, 16, 60, 620]) for (const loaded of [false, true]) {
        f.r.zoom = zoom;
        f.r.continuousModels = new Map(loaded ? [[1, { p: f.sim.provinces[1], frame: { scale: unit * 30 }, city: { population: 1000000 } }]] : []);
        f.r.continuousLayer = loaded ? { models: f.r.continuousModels } : null;
        f.sim.provinces[1].pop *= 3; f.sim.provinces[1].urbanPop *= 2;
        f.r.buildFrontierPosts();
        assert.deepEqual(f.meshes.frontierPosts.data, initial, `a watchtower changed size or position at zoom ${zoom}, streamed=${loaded}`);
    }
});

test('physical posts retain roads-toggle and map-layer semantics at every camera range', () => {
    const { r } = fixture();
    const layers = ['relief', 'settlements', 'realms', 'faiths', 'peoples', 'wealth', 'magic'];
    for (const zoom of [15.999, 16, 60, 620]) for (const layer of [...layers, 'diplomacy', 'temperature', 'rainfall', 'plates']) {
        Object.assign(r, { zoom, layer });
        r.options.roads = true; assert.equal(r.visible('frontierPosts'), layers.includes(layer), `${layer}, zoom ${zoom}`);
        r.options.roads = false; assert.equal(r.visible('frontierPosts'), false, 'the roads switch also hides frontier architecture');
    }
});

test('dry live crossings are ranked before ocean, lake and extinct-realm crossings', () => {
    const f = fixture();
    f.world.height[f.sites.preferred] = 0; f.r.buildFrontierPosts();
    assert.equal(f.r.frontierPosts, 3, 'a dry alternate crossing remains available');
    assert.equal(pointsAt(f, f.sites.preferred).length, 0);
    assert.ok(pointsAt(f, f.sites.expensive).length > 0);
    f.world.lake[f.sites.expensive + 1] = 7; f.r.buildFrontierPosts();
    assert.equal(f.r.frontierPosts, 2, 'both ends of a crossing must be dry');
    f.world.lake[f.sites.second] = 3; f.r.buildFrontierPosts();
    assert.equal(f.r.frontierPosts, 1, 'positive-elevation lake cells are still water');
    f.sim.realms[2].alive = false; f.r.buildFrontierPosts();
    assert.equal(f.r.frontierPosts, 0);
    assert.equal(f.meshes.frontierPosts.data.length, 0, 'no stale geometry remains after the last legal border disappears');
});

test('a sloping site gets a small supported footing while a cliff gets no oversized plinth', () => {
    const f = fixture(true), x = f.sites.preferred % E.GW;
    f.r.ground = (gx, gy) => 2 + (gx - x) * E.AtlasSpace.X * .2 + (gy - 90) * E.AtlasSpace.Z * .1;
    f.r.buildFrontierPosts(); assert.equal(f.r.frontierPosts, 1);
    const points = vertices(f.meshes.frontierPosts), b = bounds(points);
    for (const px of [b.min[0], b.max[0]]) for (const pz of [b.min[2], b.max[2]]) {
        const column = points.filter(p => Math.abs(p[0] - px) < 1e-9 && Math.abs(p[2] - pz) < 1e-9);
        assert.ok(column.length > 0, 'each outer footing corner is represented');
        const low = Math.min(...column.map(p => p[1])), top = Math.max(...column.map(p => p[1]));
        const ground = f.r.ground(...E.AtlasSpace.grid(px, pz));
        assert.ok(low <= ground + 1e-9 && top >= ground - 1e-9, 'the footing reaches the local terrain instead of floating or burying the tower');
        assert.ok(top - low <= 2 * unit + 1e-9, 'terrain support remains smaller than the tower');
    }
    f.r.ground = gx => 2 + (gx - x) * E.AtlasSpace.X * 10;
    f.r.buildFrontierPosts(); assert.equal(f.r.frontierPosts, 0, 'a steep cliff is unsuitable for this small watchtower');
    assert.equal(f.meshes.frontierPosts.data.length, 0);
});

test('cached roads still refresh posts after conquest, extinction and a changed ground surface', () => {
    const f = fixture(true), previous = E.RoadNetwork.ensure;
    f.r.continuousLayer = { natural: false, lastLandscapeKey: 'coarse' };
    f.r.buildNearRoads = () => {}; // This fixture has no roads or streamed town meshes.
    E.RoadNetwork.ensure = () => ({ signature: 'same-roads', roads: [], ports: [], stats: {} });
    try {
        f.r.buildRoads(); assert.equal(f.r.frontierPosts, 1); const roads = f.meshes.roads;
        f.sim.provinces[3].owner = 0; f.r.buildRoads();
        assert.equal(f.meshes.roads, roads, 'the underlying route network still uses its cache');
        assert.equal(f.r.frontierPosts, 0); assert.equal(f.meshes.frontierPosts.data.length, 0);
        f.sim.provinces[3].owner = 1; f.r.buildRoads(); assert.equal(f.r.frontierPosts, 1);
        f.sim.realms[1].alive = false; f.r.buildRoads();
        assert.equal(f.r.frontierPosts, 0); assert.equal(f.meshes.frontierPosts.data.length, 0);
        f.sim.realms[1].alive = true; f.r.zoom = 16; f.r.ground = () => 3;
        f.r.continuousLayer.natural = true; f.r.buildRoads();
        close(bounds(vertices(f.meshes.frontierPosts)).min[1], 3, 'the detailed surface replaces the coarse footing height');
        f.r.ground = () => 4; f.r.continuousLayer.lastLandscapeKey = 'refined'; f.r.buildRoads();
        close(bounds(vertices(f.meshes.frontierPosts)).min[1], 4, 'a newly refined landscape updates the footing');
        assert.equal(f.meshes.roads, roads, 'frontier changes do not unnecessarily remesh unchanged roads');
    } finally { E.RoadNetwork.ensure = previous; }
});
