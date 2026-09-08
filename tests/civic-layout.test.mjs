import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, defaults, root } from './engine-loader.mjs';

const E = loadEngine();
const { FortressPlan } = Function(readFileSync(resolve(root, 'src/towns/fortifications.js'), 'utf8') + '\nreturn {FortressPlan};')();

function fixture() {
    const n = 153, c = { n, width: 152, depth: 152, urbanRadius: 62,
        market: { x: 0, z: 0 }, buildings: [], townProfile: { id: 'river' },
        water: new Uint8Array(n * n), road: new Uint8Array(n * n),
        height: new Float32Array(n * n), slope: new Float32Array(n * n),
        atlasSlope: new Float32Array(n * n),
        environment: { ice: new Uint8Array(n * n), snow: new Float32Array(n * n) } };
    c.xy = k => ({ x: k % n - 76, z: Math.floor(k / n) - 76 });
    c.index = (x, z) => Math.round(Math.max(0, Math.min(152, z + 76))) * n + Math.round(Math.max(0, Math.min(152, x + 76)));
    return c;
}

test('a higher outlying citadel site cannot displace an equally supported town-core site', () => {
    const c = fixture(), core = c.index(22, 0), rim = c.index(48, 0);
    c.height[rim] = 10;
    const site = FortressPlan.reserve(c, [{ k: rim }, { k: core }], { detailSupport: 2000 }, .85,
        { scale: 1, bounds: () => ({ low: 0, top: 0 }) });
    assert(site); assert.equal(site.k, core); assert.equal(site.w, 26);
    assert.equal(site.neighborhoodSides, 4);
    assert.equal(c.citadelReserve[c.index(0, 0)], 0, 'the market must remain accessible');
});

const edgeDistance = (a, b) => Math.hypot(Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2), Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2));
function laneHitsBlock(a, b, halfWidth, block) {
    // Intersect the complete segment with the footprint enlarged by the paving
    // half-width, so a clear centerline alone cannot pass this check.
    let enter = 0, leave = 1;
    for (const [axis, size] of [['x', 'w'], ['z', 'd']]) {
        const low = block[axis] - block[size] / 2 - halfWidth;
        const high = block[axis] + block[size] / 2 + halfWidth;
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-12) {
            if (a[axis] < low || a[axis] > high) return false;
        } else {
            const t0 = (low - a[axis]) / delta, t1 = (high - a[axis]) / delta;
            enter = Math.max(enter, Math.min(t0, t1));
            leave = Math.min(leave, Math.max(t0, t1));
            if (enter > leave) return false;
        }
    }
    return true;
}
function neighborhood(c, b) {
    const homes = c.buildings.filter(h => !h.landmark && h.type === 'home');
    const center = { x: homes.reduce((sum, h) => sum + h.x, 0) / homes.length, z: homes.reduce((sum, h) => sum + h.z, 0) / homes.length };
    const distances = homes.map(h => Math.hypot(h.x - center.x, h.z - center.z)).sort((a, b) => a - b);
    const nearby = homes.filter(h => edgeDistance(h, b) <= c.width * .14);
    const angles = nearby.map(h => Math.atan2(h.z - b.z, h.x - b.x)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0)) - a);
    return { homes, nearby, gap: Math.max(...gaps), offset: Math.hypot(b.x - center.x, b.z - center.z) / distances[Math.floor(distances.length * .8)] };
}

let cities;
test.before(async () => {
    const w = await E.generateWorld(defaults), s = E.createCivilization(w, { realms: 18, historySeed: 'First-dawn' });
    const towns = s.provinces.filter(p => p.city).sort((a, b) => b.urbanPop - a.urbanPop).slice(0, 12);
    cities = towns.map(p => E.generateCity(w, s, p.id));
});

test('every large-town council remains inside a substantial residential neighborhood', () => {
    for (const c of cities) {
        const councils = c.buildings.filter(b => b.type === 'civic');
        assert.equal(councils.length, 1, c.name + ' lost its council to make the layout look central');
        for (const b of councils) {
            const n = neighborhood(c, b);
            assert(n.nearby.length >= Math.max(16, Math.round(n.homes.length * .06)), c.name + ' has too few neighboring homes');
            assert(n.gap <= Math.PI * 5 / 6, c.name + ' leaves an empty residential side around its council');
            assert(n.offset < 1, c.name + ' has pushed its council outside the residential core');
        }
        assert(c.buildings.some(b => b.type === 'temple'), c.name + ' lost its sanctuary');
        const audit = E.auditCity(c);
        for (const key of ['iceBuildings', 'wetBuildings', 'roadBuildings', 'overlaps', 'nonfinite', 'seaRoads']) assert.equal(audit[key], 0, c.name + ': ' + key);
    }
});

test('reserved civic blocks retain their dimensions and safe street approaches', () => {
    assert(laneHitsBlock({ x: -2, z: .6 }, { x: 2, z: .6 }, .12, { x: 0, z: 0, w: 1, d: 1 }), 'paving beside a clear centerline still needs clearance');
    for (const c of cities) for (const site of c.civicSites || []) {
        const b = c.buildings.find(b => b.type === site.type && Math.hypot(b.x - site.x, b.z - site.z) < 1e-6);
        assert(b, c.name + ' lost its reserved ' + site.type);
        assert.equal(b.w, site.w); assert.equal(b.d, site.d);
        assert(b.streetSocket != null, c.name + ' has an inaccessible ' + site.type);
        for (const r of c.roads) {
            if (r.role === 'courtyard-access') {
                // These lanes follow subcell coordinates. Their rounded nodes
                // identify road connectivity, not the rendered paving location.
                assert.equal(r.halfWidth, .12);
                assert(r.points.length >= 2);
                for (let k = 1; k < r.points.length; k++)
                    assert(!laneHitsBlock(r.points[k - 1], r.points[k], r.halfWidth, b), c.name + ' routed courtyard paving through a civic block');
            } else for (const i of r.nodes) {
                const q = c.xy(i);
                assert(!(Math.abs(q.x - b.x) < b.w / 2 && Math.abs(q.z - b.z) < b.d / 2), c.name + ' routed a street through a civic block');
            }
        }
    }
});
