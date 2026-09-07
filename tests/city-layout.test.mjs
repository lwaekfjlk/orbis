import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, defaults, root } from './engine-loader.mjs';

const E = loadEngine();
const { citySegmentBox, cityDrySegment } = Function(readFileSync(resolve(root, 'src/city/generator.js'), 'utf8') + '\nreturn {citySegmentBox,cityDrySegment};')();
let world, sim, cities;
test.before(async () => {
    world = await E.generateWorld(defaults);
    sim = E.createCivilization(world, { realms: 18, historySeed: 'First-dawn' });
    const towns = sim.provinces.filter(p => p.settled && p.urbanPop >= 650).sort((a, b) => b.urbanPop - a.urbanPop).slice(0, 8);
    cities = towns.map(p => ({ p, city: E.generateCity(world, sim, p.id) }));
});

test('ordinary houses keep usable parcels after frontage fitting', () => {
    for (const { city } of cities) {
        assert(city.buildings.length > 50, city.name + ' lost its neighborhoods');
        const ordinary = city.buildings.filter(b => !b.landmark);
        for (const b of ordinary) {
            assert(Math.min(b.w, b.d) >= 1.1, `${city.name} ${b.id} is squeezed into a sliver`);
            assert(Math.max(b.w / b.d, b.d / b.w) <= 4.4 + 1e-9, `${city.name} ${b.id} exceeded the parcel aspect limit`);
        }
        const audit = E.auditCity(city);
        for (const key of ['wetBuildings', 'roadBuildings', 'overlaps', 'nonfinite', 'seaRoads']) assert.equal(audit[key], 0, city.name + ': ' + key);
    }
});

test('access paths have clear ground for their entire length', () => {
    for (const { city } of cities) {
        assert.equal(city.connectors.length, city.buildings.length);
        for (const path of city.connectors) {
            // Dense independent sampling catches the short corner crossings which
            // the former fixed eleven samples skipped between test positions.
            const steps = Math.max(1, Math.ceil(path.dist / .015));
            const neighbors = city.buildings.filter(b => b.id !== path.blockId &&
                b.x + b.w / 2 > Math.min(path.a.x, path.b.x) && b.x - b.w / 2 < Math.max(path.a.x, path.b.x) &&
                b.z + b.d / 2 > Math.min(path.a.z, path.b.z) && b.z - b.d / 2 < Math.max(path.a.z, path.b.z));
            for (let j = 0; j <= steps; j++) {
                const t = j / steps, x = path.a.x + (path.b.x - path.a.x) * t, z = path.a.z + (path.b.z - path.a.z) * t;
                assert(!city.water[city.index(x, z)], `${city.name} ${path.blockId} enters water`);
                for (const b of neighbors) assert(!(Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2), `${city.name} ${path.blockId} cuts through ${b.id}`);
            }
        }
    }
});

test('access clearance catches thin obstructions and diagonal water corners', () => {
    const a = { x: 0, z: 0 }, b = { x: 10, z: 10 };
    assert(citySegmentBox(a, b, .31, .30, .32, .33), 'a short crossing still hits the footprint');
    assert(!citySegmentBox(a, b, .31, .34, .32, .35), 'an adjacent footprint leaves the path clear');
    const city = { n: 5, width: 4, depth: 4, water: new Uint8Array(25) };
    assert(cityDrySegment(city, { x: -1, z: -1 }, { x: 1, z: 1 }));
    city.water[1 * 5 + 2] = 1;
    assert(!cityDrySegment(city, { x: -1, z: -1 }, { x: 1, z: 1 }), 'a diagonal access path cannot cut a wet corner');
    assert(!cityDrySegment(city, { x: 1, z: 1 }, { x: -1, z: -1 }), 'clearance is independent of travel direction');
});

test('the local survey and river coordinates match the displayed atlas footprint', () => {
    for (const { p, city } of cities) {
        const frame = E.AtlasSpace.cityFrame(world, p, city);
        assert.equal(frame.cells, city.terrainSpan);
        for (let i = 0; i < city.n * city.n; i += 79) {
            const q = city.xy(i), [gx, gy] = frame.at(q.x, q.z), expected = E.CityEnvironment.sample(world, gx, gy);
            assert(Math.abs(city.environment.bed[i] - expected.bed) < .001, city.name + ' surveys different ground than it displays');
            assert.equal(city.environment.parentIndex[i], expected.parentIndex);
        }
        for (const river of city.rivers) for (const q of [river.a, river.b]) {
            const [gx, gy] = frame.at(q.x, q.z);
            assert(Math.abs(gx - Math.round(gx)) < 1e-9 && Math.abs(gy - Math.round(gy)) < 1e-9, city.name + ' shifted its parent river');
        }
    }
});

test('every street and building socket reaches the market along actual road edges', () => {
    for (const { city } of cities) {
        const edges = new Map();
        for (const road of city.roads) for (let k = 1; k < road.nodes.length; k++) {
            const a = road.nodes[k - 1], b = road.nodes[k];
            if (!edges.has(a)) edges.set(a, new Set());
            if (!edges.has(b)) edges.set(b, new Set());
            edges.get(a).add(b); edges.get(b).add(a);
        }
        const queue = [city.marketIndex], seen = new Set(queue);
        for (const a of queue) for (const b of edges.get(a) || []) if (!seen.has(b)) { seen.add(b); queue.push(b); }
        for (const node of edges.keys()) assert(seen.has(node), city.name + ' has a disconnected street');
        for (const b of city.buildings) assert(seen.has(b.streetSocket), city.name + ' has an isolated building');
    }
});
