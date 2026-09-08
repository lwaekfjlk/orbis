import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const E = Function(source + '\nreturn {LandscapeRelief,LandscapePatterns,CityEnvironment,citySurvey,GW,GH,GN,MAP_X,MAP_Z};')();
const H = E.LandscapeRelief, P = E.LandscapePatterns, X = E.MAP_X / (E.GW - 1), Z = E.MAP_Z / (E.GH - 1);
const sim = {provinces: [{id: 3, x: 40, y: 40, settled: true, urbanPop: 20000, detailSupport: 20000}], realms: [{alive: true, capital: -1}]};
const families = {
    glacier: {biome: 16, height: 1800, ice: 120, temp: -14, arid: 1.2},
    snow: {biome: 1, height: 2300, ice: 0, temp: -9, arid: 1.2},
    alpine: {biome: 12, height: 2800, ice: 0, temp: 2, arid: .8},
    rock: {biome: 13, height: 1400, ice: 0, temp: 17, arid: .1},
    sand: {biome: 4, height: 200, ice: 0, temp: 31, arid: .08},
    grass: {biome: 7, height: 200, ice: 0, temp: 14, arid: 1.2}
};
function fixture(family, change = () => {}) {
    const p = families[family], field = v => new Float32Array(E.GN).fill(v);
    const w = {seed: 72137, height: field(p.height), lake: field(-1), ice: field(p.ice), biome: new Uint8Array(E.GN).fill(p.biome),
        temp: field(p.temp), arid: field(p.arid), rain: field(1000), seasonTemp: [field(p.temp - 4), field(p.temp + 4)],
        flow: field(0), down: new Int32Array(E.GN).fill(-1), riverDown: new Int32Array(E.GN).fill(-1),
        channelThreshold: field(100), riverThreshold: 100};
    change(w); H.prepare(w, sim); return w;
}
const worlds = new Map();
const world = family => { if (!worlds.has(family)) worlds.set(family, fixture(family)); return worlds.get(family); };
const index = (x, y) => y * E.GW + x;
const close = (a, b, tolerance = 3e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const digest = w => {
    const h = createHash('sha256');
    for (const [key, value] of Object.entries(w)) if (ArrayBuffer.isView(value)) h.update(key).update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return h.digest('hex');
};

test('land ice, persistent snow, alpine rock and sand each have real, distinct interior relief', t => {
    const signatures = new Set();
    for (const family of Object.keys(families)) {
        const w = world(family), values = []; let maximum = 0, slope = 0, nonzero = 0;
        for (let y = 80.137; y < 86; y += .173) for (let x = 100.211; x < 106; x += .181) {
            const h = H.offset(w, x, y), g = H.gradient(w, x, y);
            values.push(h); maximum = Math.max(maximum, Math.abs(h)); slope = Math.max(slope, Math.hypot(g[0] / X, g[1] / Z)); if (h) nonzero++;
        }
        assert.ok(nonzero > 1000, family + ' still has a flat display surface');
        assert.ok(maximum > .002 && maximum < .06, family + ' should have visible, bounded detail');
        assert.ok(slope < .5, family + ' creates an excessive detail scarp: ' + slope);
        signatures.add(createHash('sha256').update(new Float64Array(values)).digest('hex'));
        t.diagnostic(JSON.stringify({family, maximum, maximumExtraGrade: slope}));
    }
    assert.equal(signatures.size, Object.keys(families).length, 'different terrains reused the same generic hill field');
});

test('land glacier detail respects towns, coasts, lakes, sea ice and every protected river channel', () => {
    const w = fixture('glacier', w => {
        w.height[index(100, 70)] = -100;
        w.lake[index(120, 70)] = 1950;
        w.biome[index(140, 70)] = 17;
        const a = index(80, 100), b = index(110, 100);
        w.flow[a] = 61; w.down[a] = a + 1; w.riverDown[a] = a + E.GW;
        w.flow[b] = 45; w.channelThreshold[b] = 40; w.riverDown[b] = b + 1;
    });
    for (const cx of [100, 120, 140]) for (const dx of [-1.1, -.3, .3, 1.1]) for (const dy of [-1.1, -.3, .3, 1.1]) {
        assert.equal(H.offset(w, cx + dx, 70 + dy), 0); assert.deepEqual(H.gradient(w, cx + dx, 70 + dy), [0, 0]);
    }
    for (const [ax, ay, dx, dy] of [[80, 100, 1, 0], [80, 100, 0, 1], [110, 100, 1, 0]]) {
        for (let step = 0; step <= 10; step++) for (const bank of [-.119, 0, .119]) {
            const x = ax + dx * step / 10 - dy * bank, y = ay + dy * step / 10 + dx * bank;
            assert.equal(H.offset(w, x, y), 0); assert.deepEqual(H.gradient(w, x, y), [0, 0]);
        }
    }
    const survey = E.citySurvey(sim, sim.provinces[0]), span = Math.min(16 * E.CityEnvironment.cityFootprint, survey.terrainSpan * 1.1);
    for (let a = -1; a <= 1; a += .2) for (let b = -1; b <= 1; b += .2) {
        const x = 40 + a * (span / 2 + .12), y = 40 + b * (span * survey.depth / survey.width / 2 + .12);
        assert.equal(H.offset(w, x, y), 0); assert.deepEqual(H.gradient(w, x, y), [0, 0]);
    }
    assert.ok(Math.abs(H.offset(w, 102.7, 70.37)) > 1e-7, 'land ice beyond the shore shoulder never resumes');
});

test('steep alpine slopes retain measurable scree relief instead of suppressing it', () => {
    const w = fixture('alpine', w => {
        for (let y = 0; y < E.GH; y++) for (let x = 0; x < E.GW; x++) w.height[index(x, y)] = 2200 + (x % 2) * 1400;
    });
    let checked = 0;
    for (let x = 100.17; x < 105; x += .23) {
        const y = 80.37, a = Math.floor(x), b = Math.floor(y), u = x - a, v = y - b;
        const A = P.sample(w, a, b).height, B = P.sample(w, a + 1, b).height, C = P.sample(w, a, b + 1).height, D = P.sample(w, a + 1, b + 1).height;
        const parent = (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
        const residual = P.sample(w, x, y).height - parent;
        if (Math.abs(residual) < .001) continue;
        assert.ok(E.CityEnvironment.atlasGrade(w, x, y) > 2, 'fixture must exercise a steep mountain face');
        assert.ok(Math.abs(H.offset(w, x, y) / residual) > .3, 'mountain detail was attenuated below visibility');
        checked++;
    }
    assert.ok(checked > 10);
});

test('special terrain gradients remain analytic across biome blends and town shoulder fades', () => {
    const w = fixture('glacier', w => {
        for (let y = 0; y < E.GH; y++) for (let x = 110; x < E.GW; x++) {
            const i = index(x, y); w.biome[i] = 13; w.ice[i] = 0; w.temp[i] = 17; w.arid[i] = .1;
            w.seasonTemp[0][i] = 12; w.seasonTemp[1][i] = 21;
        }
    });
    const s = E.citySurvey(sim, sim.provinces[0]), edge = 40 + Math.min(16 * E.CityEnvironment.cityFootprint, s.terrainSpan * 1.1) / 2 + .12;
    for (const [x, y] of [[108.73, 90.37], [109.23, 90.37], [109.73, 90.37], [110.23, 90.37], [edge + .13, 40.273], [edge + .31, 40.273]]) {
        for (const scale of [.6, 1, 1.4]) {
            const e = 1e-6, g = H.gradient(w, x, y, scale);
            close(g[0], (H.offset(w, x + e, y, scale) - H.offset(w, x - e, y, scale)) / (2 * e));
            close(g[1], (H.offset(w, x, y + e, scale) - H.offset(w, x, y - e, scale)) / (2 * e));
        }
    }
    for (let x = 108; x <= 112; x++) for (let y = 80; y < 90; y++) {
        assert.equal(H.offset(w, x, y), 0);
        close(H.offset(w, x - 1e-7, y + .37), H.offset(w, x + 1e-7, y + .37), 1e-7);
        close(H.offset(w, x + .37, y - 1e-7), H.offset(w, x + .37, y + 1e-7), 1e-7);
    }
});

test('biome detail is independent of caches, sampling order and worker world cloning', () => {
    const original = world('glacier'), copy = structuredClone(original), before = digest(copy), society = JSON.stringify(sim);
    H.prepare(copy, structuredClone(sim));
    const points = [[100.37, 80.27], [101.71, 81.83], [109.63, 86.59]];
    for (const [x, y] of points.slice().reverse()) {
        assert.equal(H.offset(copy, x, y), H.offset(original, x, y));
        assert.deepEqual(H.gradient(copy, x, y), H.gradient(original, x, y));
    }
    assert.equal(digest(copy), before); assert.equal(JSON.stringify(sim), society);
});

test('uninhabited worlds retain glacier and alpine detail without modifying source geography', () => {
    const empty = {provinces: [], realms: []};
    for (const family of ['glacier', 'alpine']) {
        const populated = world(family), w = structuredClone(populated), before = digest(w);
        assert.equal(H.prepare(w, empty), true); const key = H.key(w);
        assert.notEqual(key, 'none'); assert.equal(H.prepare(w, structuredClone(empty)), false); assert.equal(H.key(w), key);
        for (const [x, y] of [[100.37, 80.27], [101.71, 81.83], [109.63, 86.59]]) {
            assert.notEqual(H.offset(w, x, y), 0, family + ' detail depends on a town existing');
            assert.equal(H.offset(w, x, y), H.offset(populated, x, y));
            assert.deepEqual(H.gradient(w, x, y), H.gradient(populated, x, y));
        }
        assert.equal(H.offset(populated, 40.37, 40.27), 0, 'inhabited fixture must protect its town');
        assert.notEqual(H.offset(w, 40.37, 40.27), 0, 'empty world retained an obsolete town guard');
        assert.equal(digest(w), before);
    }
    assert.deepEqual(empty, {provinces: [], realms: []});
});
