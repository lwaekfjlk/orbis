import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';
const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const E = Function(source + '\nreturn {LandscapeRelief,citySurvey,generateWorld,createCivilization,generateCity,CityEnvironment,GW,GH,GN};')();
const H = E.LandscapeRelief, X = 168 / (E.GW - 1), Z = 98 / (E.GH - 1);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const point = (x, y) => y * E.GW + x;
function flat() {
    return {seed: 72137, height: new Float32Array(E.GN).fill(200), lake: new Float32Array(E.GN).fill(-1),
        ice: new Float32Array(E.GN), biome: new Uint8Array(E.GN).fill(7), flow: new Float32Array(E.GN),
        down: new Int32Array(E.GN).fill(-1), riverDown: new Int32Array(E.GN).fill(-1),
        channelThreshold: new Float32Array(E.GN).fill(100), riverThreshold: 100};
}
const town = (id, x, y, support = 20000) => ({id, x, y, settled: true, urbanPop: support, detailSupport: support});
const society = towns => ({provinces: towns, realms: [{alive: true, capital: -1}]});
const fixtureWorld = flat(), fixtureSim = society([town(1, 40, 40), town(2, 60, 50, 80000)]);
const typedState = w => {
    const digest = createHash('sha256');
    for (const k of Object.keys(w).sort()) if (ArrayBuffer.isView(w[k])) { const a = w[k]; digest.update(k).update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
    return digest.digest('hex');
};
let world, sim, originalWorld, originalSociety;
test.before(async () => {
    H.prepare(fixtureWorld, fixtureSim);
    world = await E.generateWorld(defaults);
    sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
    originalWorld = typedState(world); originalSociety = JSON.stringify(sim);
});

test('relief is opt-in and keyed by all town surveys, including an uninhabited world', () => {
    const w = flat(), s = society([town(7, 40, 40)]), bytes = typedState(w), original = JSON.stringify(s);
    assert.equal(H.offset(w, 100.27, 90.43), 0); assert.deepEqual(H.gradient(w, 100.27, 90.43), [0, 0]); assert.equal(H.key(w), 'none');
    assert.equal(H.prepare({name: 'incomplete'}, s), false); assert.equal(H.key({}), 'none');
    assert.equal(H.prepare(w, {provinces: [], realms: []}), true);
    const emptyKey = H.key(w);
    assert.notEqual(emptyKey, 'none'); assert.equal(H.prepare(w, {provinces: [], realms: []}), false); assert.equal(H.key(w), emptyKey);
    assert.notEqual(H.offset(w, 100.27, 90.43), 0, 'uninhabited land should retain display relief');
    assert.equal(H.prepare(w, s), true); const key = H.key(w);
    assert.notEqual(key, 'none'); assert.equal(H.prepare(w, structuredClone(s)), false); assert.equal(H.key(w), key);
    const reordered = society([town(8, 80, 40), s.provinces[0]]); H.prepare(w, reordered); const next = H.key(w);
    assert.notEqual(next, key); assert.equal(H.prepare(w, {...reordered, provinces: reordered.provinces.slice().reverse()}), false);
    assert.equal(H.key(w), next, 'loading order must not define the field');
    const outside = H.offset(w, 100.27, 90.43);
    assert.equal(H.prepare(w, {provinces: [], realms: []}), true); const clearedKey = H.key(w);
    assert.notEqual(clearedKey, 'none'); assert.notEqual(clearedKey, next); assert.equal(H.offset(w, 100.27, 90.43), outside);
    assert.equal(H.prepare(w, {provinces: [], realms: []}), false); assert.equal(H.key(w), clearedKey);
    assert.equal(H.prepare(w, reordered), true); assert.equal(H.offset(w, 100.27, 90.43), outside);
    assert.equal(typedState(w), bytes); assert.equal(JSON.stringify(s), original);
});

test('every unloaded town survey and its shoulder have exactly zero height and gradient', () => {
    for (const p of fixtureSim.provinces) {
        const survey = E.citySurvey(fixtureSim, p), span = Math.min(16 * E.CityEnvironment.cityFootprint, survey.terrainSpan * 1.1), rx = span / 2 + .12, ry = span * survey.depth / survey.width / 2 + .12;
        for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
            const x = p.x - rx + i / 10 * rx * 2, y = p.y - ry + j / 10 * ry * 2;
            assert.equal(H.offset(fixtureWorld, x, y), 0, 'unloaded town parcel changed');
            assert.deepEqual(H.gradient(fixtureWorld, x, y), [0, 0]);
        }
        const x = p.x + rx, y = p.y + .173;
        for (const epsilon of [1e-3, 1e-4, 1e-5]) assert.ok(Math.abs(H.offset(fixtureWorld, x + epsilon, y)) < epsilon * epsilon, 'town mask must fade smoothly from zero');
        assert.ok(Math.abs(H.offset(fixtureWorld, x + .7, y)) > 1e-7, 'surrounding hills should resume outside the protected shoulder');
    }
    const changed = structuredClone(fixtureSim), before = H.key(fixtureWorld); changed.realms[0].capital = 1;
    assert.equal(H.prepare(fixtureWorld, changed), true); assert.notEqual(H.key(fixtureWorld), before, 'a capital survey change must invalidate its field'); H.prepare(fixtureWorld, fixtureSim);
});

test('revoking capital status cannot expose the former city footprint while its replacement streams', () => {
    const w = flat(), p = town(3, 80, 50, 90000), s = society([p]); s.realms[0].capital = p.id;
    const old = E.citySurvey(s, p); H.prepare(w, s); const previous = H.key(w);
    s.realms[0].capital = -1;
    assert.ok(E.citySurvey(s, p).terrainSpan < old.terrainSpan, 'fixture must actually shrink the survey');
    assert.equal(H.prepare(w, s), true); assert.notEqual(H.key(w), previous);
    const rx = old.terrainSpan / 2, ry = old.terrainSpan * old.depth / old.width / 2;
    for (const x of [-rx, 0, rx]) for (const y of [-ry, 0, ry]) {
        assert.equal(H.offset(w, p.x + x, p.y + y), 0, 'old capital edge was lifted before its model was replaced');
        assert.deepEqual(H.gradient(w, p.x + x, p.y + y), [0, 0]);
    }
});

test('sea, lake, sea ice patches and raw and corrected river corridors keep their inherited heights', () => {
    const w = flat(), s = society([town(1, 40, 40)]);
    w.height[point(100, 70)] = -100; w.lake[point(120, 70)] = 250; w.ice[point(140, 70)] = 3; w.biome[point(140, 70)] = 17;
    const branch = point(80, 100), narrowThreshold = point(110, 100);
    w.flow[branch] = 61; w.down[branch] = branch + 1; w.riverDown[branch] = branch + E.GW;
    w.flow[narrowThreshold] = 45; w.channelThreshold[narrowThreshold] = 40; w.riverDown[narrowThreshold] = narrowThreshold + 1;
    H.prepare(w, s);
    for (const x of [100, 120, 140]) for (const dx of [-1.1, -.8, -.2, .2, .8, 1.1]) for (const dy of [-1.1, -.7, .1, .7, 1.1]) {
        assert.equal(H.offset(w, x + dx, 70 + dy), 0, 'coast or ice patch shifted'); assert.deepEqual(H.gradient(w, x + dx, 70 + dy), [0, 0]);
    }
    for (const [ax, ay, bx, by] of [[80, 100, 81, 100], [80, 100, 80, 101], [110, 100, 111, 100]]) {
        const dx = bx - ax, dy = by - ay;
        for (let j = 0; j <= 10; j++) for (const bank of [-.119, 0, .119]) {
            const x = ax + dx * j / 10 - dy * bank, y = ay + dy * j / 10 + dx * bank;
            assert.equal(H.offset(w, x, y), 0, 'a river interior or bank changed'); assert.deepEqual(H.gradient(w, x, y), [0, 0]);
        }
    }
});

test('parent grid heights stay exact while residual hills are continuous across cell boundaries', () => {
    for (let y = 0; y < E.GH; y++) for (let x = 0; x < E.GW; x++) assert.equal(H.offset(fixtureWorld, x, y), 0);
    let nonzero = 0;
    for (let k = 0; k < 40; k++) {
        const x = 90 + k, y = 80.273 + k * .071;
        close(H.offset(fixtureWorld, x - 1e-7, y), H.offset(fixtureWorld, x + 1e-7, y), 2e-8);
        close(H.offset(fixtureWorld, y, x - 1e-7), H.offset(fixtureWorld, y, x + 1e-7), 2e-8);
        if (H.offset(fixtureWorld, x + .36, y) !== 0) nonzero++;
    }
    assert.equal(nonzero, 40, 'detail must change interior geometry, not just its shading');
    for (const y of [.27, 30.43, 80.19]) close(H.offset(fixtureWorld, 1e-7, y), 0, 1e-10);
});

test('analytic display gradients match height differences including the protection fade', () => {
    const survey = E.citySurvey(fixtureSim, fixtureSim.provinces[0]), edge = 40 + Math.min(16 * E.CityEnvironment.cityFootprint, survey.terrainSpan * 1.1) / 2 + .12;
    const points = [[edge + .11, 40.273], [edge + .23, 40.273], [edge + .35, 40.273], [100.27, 90.43], [101.13, 91.37]];
    for (const [x, y] of points) for (const relief of [.6, 1, 1.4]) {
        const epsilon = 1e-6, g = H.gradient(fixtureWorld, x, y, relief);
        close(g[0], (H.offset(fixtureWorld, x + epsilon, y, relief) - H.offset(fixtureWorld, x - epsilon, y, relief)) / (2 * epsilon), 2e-8);
        close(g[1], (H.offset(fixtureWorld, x, y + epsilon, relief) - H.offset(fixtureWorld, x, y - epsilon, relief)) / (2 * epsilon), 2e-8);
        close(H.offset(fixtureWorld, x, y, relief), H.offset(fixtureWorld, x, y) * relief);
    }
});

test('actual-world biome relief remains bounded and repeated nearby samples stay within a practical mesh budget', t => {
    H.prepare(world, sim); let maximum = 0, slope = 0, nonzero = 0;
    const started = performance.now();
    for (let y = 1.137; y < E.GH - 1; y += .37) for (let x = 1.211; x < E.GW - 1; x += .37) {
        const h = H.offset(world, x, y), g = H.gradient(world, x, y);
        maximum = Math.max(maximum, Math.abs(h)); slope = Math.max(slope, Math.hypot(g[0] / X, g[1] / Z)); if (h) nonzero++;
        assert.ok(Math.abs(h) < .06, 'bounded biome residual must not create a new large hill');
    }
    const elapsed = performance.now() - started;
    assert.ok(nonzero > 50000); assert.ok(maximum > .005 && maximum < .06); assert.ok(slope < .5, 'fine relief adds a sharp scarp');
    assert.ok(elapsed < 5000, 'height/gradient sampling cannot scan or regenerate every town per vertex');
    t.diagnostic(JSON.stringify({nonzero, maximum, maximumExtraGrade: slope, sampleMilliseconds: Math.round(elapsed)}));
});

test('survey extraction preserves two actual cities and leaves physical and simulated inputs untouched', () => {
    const expected = [
        [299, 'Avalfergalhaven', '91698ba6', '39cab6fdc152715e0f470857371b5447223971580120844e4725827040285c26'],
        [127, 'Nidaveiknes', '9867d55e', 'b20e4d6f74a1b60801e7df77d2b97dce41afb410d43576e1de72c8f5ce1a1451']
    ];
    // Dense-city baselines were independently identical before and after relief
    // preparation. No cache or git checkout is required for this regression.
    for (const [id, name, fingerprint, checksum] of expected) {
        const p = sim.provinces[id], c = E.generateCity(world, sim, id), survey = E.citySurvey(sim, p);
        assert.equal(c.name, name); assert.equal(c.fingerprint, fingerprint);
        for (const key of ['width', 'depth', 'span', 'terrainSpan']) assert.equal(c[key], survey[key]);
        assert.equal(hash({buildings: c.buildings, roads: c.roads, trees: c.trees, farms: c.farms, districts: c.districts, piers: c.piers, height: c.height, water: c.water}), checksum, name + ' layout or tree RNG changed');
        for (let j = 0; j < c.n; j += 10) for (let i = 0; i < c.n; i += 10) {
            const x = p.x + (i / (c.n - 1) - .5) * c.terrainSpan, y = p.y + (j / (c.n - 1) - .5) * c.terrainSpan * c.depth / c.width;
            assert.equal(H.offset(world, x, y), 0, name + ' survey contains new hills');
        }
    }
    assert.equal(typedState(world), originalWorld); assert.equal(JSON.stringify(sim), originalSociety);
});
