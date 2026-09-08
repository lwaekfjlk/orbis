import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {defaults} from './engine-loader.mjs';

const files = ['src/world/geography.js', 'src/city/environment.js', 'src/render/world-renderer.js', 'src/continuous/landscape-patterns.js', 'src/continuous/landscape-color.js'];
const E = Function(files.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n') + '\nreturn {generateWorld,CityEnvironment,LandscapePatterns,LandscapeColor,GW,GH,GN};')();
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const range = a => Math.max(...a) - Math.min(...a);
const luma = c => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
const difference = (a, b) => Math.max(...a.map((n, k) => Math.abs(n - b[k])));
function fixture({biome = 16, temp = -18, arid = 1.3, height = 1900, ice = 90, lake = -1, seed = 471} = {}) {
    const field = v => new Float32Array(E.GN).fill(v);
    return {seed, height: field(height), temp: field(temp), arid: field(arid), ice: field(ice), lake: field(lake), biome: new Uint8Array(E.GN).fill(biome)};
}
// Match the near terrain's inherited cell colour and seasonal snow before
// sampling the continuous material, including when two climates meet.
function baseSampler(w) {
    const colors = new Map(), snow = [233 / 255, 241 / 255, 244 / 255];
    function cell(i) {
        if (!colors.has(i)) {
            let c = E.CityEnvironment.cellColor(w, i);
            const cover = E.CityEnvironment.cellCover(w, i);
            if (w.height[i] > 0 && cover > .05) c = c.map((v, k) => v + (snow[k] - v) * Math.min(1, cover * .8));
            colors.set(i, c);
        }
        return colors.get(i);
    }
    return (x, y) => {
        const ax = Math.min(E.GW - 2, Math.floor(x)), ay = Math.min(E.GH - 2, Math.floor(y)), u = x - ax, v = y - ay;
        const ids = [ay * E.GW + ax, ay * E.GW + ax + 1, (ay + 1) * E.GW + ax, (ay + 1) * E.GW + ax + 1];
        const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v], c = [0, 0, 0];
        for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) c[k] += cell(ids[j])[k] * weights[j];
        return c;
    };
}
function patch(w, {x = 150, y = 50, slope = .4, normal = [0, 1, 0]} = {}) {
    const base = baseSampler(w), samples = [];
    for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) {
        const gx = x + i * .035, gy = y + j * .035, before = base(gx, gy);
        const p = E.LandscapePatterns.sample(w, gx, gy), after = E.LandscapeColor.sample(w, gx, gy, before, {slope, normal});
        assert.ok(after.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
        samples.push({x: gx, y: gy, before, after, p, lum: luma(after)});
    }
    return samples;
}
function groupDifference(samples, property) {
    return mean(samples.filter(s => s.p[property] > .8).map(s => s.lum)) - mean(samples.filter(s => s.p[property] < .2).map(s => s.lum));
}
function fingerprint(w) {
    const h = createHash('sha256');
    for (const key of Object.keys(w).sort()) {
        h.update(key);
        if (ArrayBuffer.isView(w[key])) h.update(new Uint8Array(w[key].buffer, w[key].byteOffset, w[key].byteLength));
        else h.update(String(w[key]));
    }
    return h.digest('hex');
}

test('permanent land ice has blue crevasses aligned with its shared height pattern and clean bright ridges', t => {
    const samples = patch(fixture()), cracks = samples.filter(s => s.p.crevasse > .8), clear = samples.filter(s => s.p.crevasse < .01);
    assert.ok(cracks.length > samples.length * .03 && cracks.length < samples.length * .25, 'crevasses are narrow features, not broad painted patches');
    assert.ok(mean(clear.map(s => s.lum)) - mean(cracks.map(s => s.lum)) > .14, 'ice fissures should be visible within fully covered ice');
    assert.ok(mean(cracks.map(s => s.after[2] - s.after[0])) > mean(clear.map(s => s.after[2] - s.after[0])) + .07, 'cracks expose blue ice');
    assert.ok(mean(cracks.map(s => s.p.height)) < mean(clear.map(s => s.p.height)), 'dark cracks align with depressed ice');
    for (const s of samples) assert.ok(s.after[0] <= s.after[1] && s.after[1] <= s.after[2], 'glacier acquires green vegetation or warm dirt');
    assert.ok(mean(clear.map(s => s.lum)) > .83, 'unbroken ice remains clean and bright');
    assert.ok(range(samples.map(s => s.lum)) > .22);
    t.diagnostic(`glacier: ${range(samples.map(s => s.lum)).toFixed(3)} luminance range, ${(cracks.length / samples.length * 100).toFixed(1)}% deep fissures`);
});

test('permanent snow retains wind texture and more snow on the pole-facing mountain slope', () => {
    const w = fixture({biome: 1, ice: 0, height: 2200, temp: -14}), flat = patch(w, {slope: .05});
    assert.ok(range(flat.map(s => s.lum)) > .045, 'full snow must not bypass wind detail');
    assert.ok(groupDifference(flat, 'wind') > .025, 'wind-scoured and drifted snow are distinguishable');
    for (const s of flat) assert.ok(s.after[2] > s.after[0] && s.lum > .77, 'unbroken snow retains its cold bright palette');
    for (const y of [50, 130]) {
        const facingPole = y < E.GH / 2 ? -1 : 1;
        const pole = patch(w, {y, slope: 1, normal: [0, Math.SQRT1_2, facingPole * Math.SQRT1_2]});
        const sun = patch(w, {y, slope: 1, normal: [0, Math.SQRT1_2, -facingPole * Math.SQRT1_2]});
        assert.ok(mean(pole.map(s => s.lum)) > mean(sun.map(s => s.lum)) + .018, 'pole-facing slopes retain snow in both hemispheres');
    }
    const warm = fixture({biome: 11, ice: 0, height: 300, temp: 26, arid: 2.3});
    const north = patch(warm, {normal: [0, .8, -.6]}), south = patch(warm, {normal: [0, .8, .6]});
    for (let i = 0; i < north.length; i++) assert.deepEqual(north[i].after, south[i].after, 'slope aspect must not invent snow in warm climates');
});

test('high mountain rock and cold barren ground show strata and gravel without acquiring tropical soil', t => {
    const mountain = patch(fixture({biome: 13, height: 3200, temp: 8, arid: .3, ice: 0}), {slope: 1.1});
    assert.ok(groupDifference(mountain, 'strata') > .035, 'mountain strata should align with the shared bands');
    assert.ok(range(mountain.map(s => s.lum)) > .11, 'rock layers and gravel remain visible at close range');
    assert.ok(mean(mountain.map(s => Math.max(...s.after) - Math.min(...s.after))) < .065, 'mountain should remain mineral grey');
    const cold = patch(fixture({biome: 3, height: 750, temp: 1, arid: .12, ice: 0}), {slope: .3});
    assert.ok(range(cold.map(s => s.lum)) > .035, 'cold barren ground needs gravel detail');
    assert.ok(mean(cold.map(s => Math.max(...s.after) - Math.min(...s.after))) < .13, 'cold barren ground should not acquire vivid warm soil');
    t.diagnostic(`rock: ${range(mountain.map(s => s.lum)).toFixed(3)} luminance range, ${groupDifference(mountain, 'strata').toFixed(3)} strata contrast`);
});

test('sand and salt-basin bands retain their inherited hue and follow the shared dunes', () => {
    for (const biome of [4, 14]) {
        const samples = patch(fixture({biome, height: 250, temp: 29, arid: .1, ice: 0}), {slope: .1});
        assert.ok(groupDifference(samples, 'dune') > .055, 'sand ridges should read as continuous bands');
        for (const s of samples) {
            assert.ok(s.after[0] > s.after[1] && s.after[1] > s.after[2], 'sand or salt acquires vegetation');
            assert.ok(Math.abs(s.after[0] / s.after[1] - s.before[0] / s.before[1]) < 1e-10);
            assert.ok(Math.abs(s.after[2] / s.after[1] - s.before[2] / s.before[1]) < 1e-10);
        }
    }
});

test('glacier, snow, rock and water transitions remain continuous across parent-cell boundaries', () => {
    const w = fixture();
    const configurations = [
        {biome: 16, ice: 90, temp: -18, height: 1900, arid: 1.3},
        {biome: 1, ice: 0, temp: -10, height: 1850, arid: 1.1},
        {biome: 13, ice: 0, temp: 8, height: 1800, arid: .3},
        {biome: 0, ice: 0, temp: 3, height: -10, arid: .8},
    ];
    for (let y = 0; y < E.GH; y++) for (let x = 0; x < E.GW; x++) {
        const config = configurations[Math.min(3, Math.max(0, x - 149))], i = y * E.GW + x;
        for (const [key, value] of Object.entries(config)) w[key][i] = value;
    }
    const base = baseSampler(w), epsilon = 1e-6;
    for (const x of [148, 149, 149.331, 150, 150.787, 151, 152, 153]) for (const y of [49, 49.4, 50, 50.731]) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const a = [x - dx * epsilon, y - dy * epsilon], b = [x + dx * epsilon, y + dy * epsilon];
        const ca = E.LandscapeColor.sample(w, ...a, base(...a)), cb = E.LandscapeColor.sample(w, ...b, base(...b));
        assert.ok(difference(ca, cb) < 1e-4, `material seam at ${x}, ${y}`);
    }
});

test('all material modes are deterministic, seed dependent and leave world and caller colours untouched', () => {
    for (const config of [{}, {biome: 1, ice: 0}, {biome: 13, height: 3200, temp: 8, ice: 0}, {biome: 4, height: 250, temp: 28, ice: 0, arid: .1}]) {
        const w = fixture(config), other = {...w, seed: w.seed + 1}, before = fingerprint(w), base = Object.freeze(baseSampler(w)(150, 50));
        Object.freeze(w);
        let changed = 0;
        for (let i = 0; i < 150; i++) {
            const x = 149 + i * .033, y = 49 + i * .027;
            const a = E.LandscapeColor.sample(w, x, y, base), b = E.LandscapeColor.sample(w, x, y, base);
            assert.deepEqual(a, b);
            if (difference(a, E.LandscapeColor.sample(other, x, y, base)) > .003) changed++;
        }
        assert.ok(changed > 75, 'material detail changes with seed');
        assert.equal(fingerprint(w), before);
    }
});

test('real default ice, snow, alpine and desert cells each gain nearby material detail', async t => {
    const w = await E.generateWorld(defaults), categories = [
        ['glacier', i => w.biome[i] === 16 && w.ice[i] > 45],
        ['seasonal snow', i => w.height[i] > 0 && w.lake[i] <= 0 && w.ice[i] <= 1 && E.CityEnvironment.cellCover(w, i) > .7],
        ['alpine', i => w.height[i] > 2200 && w.ice[i] <= 1 && w.biome[i] !== 1],
        ['sand', i => w.biome[i] === 4],
    ];
    for (const [name, eligible] of categories) {
        let selected = -1;
        for (let y = 2; y < E.GH - 2 && selected < 0; y++) for (let x = 2; x < E.GW - 2; x++) {
            const i = y * E.GW + x;
            if (eligible(i) && eligible(i + 1) && eligible(i + E.GW) && eligible(i + E.GW + 1)) { selected = i; break; }
        }
        assert.ok(selected >= 0, `default world has an interior ${name} patch`);
        const x = selected % E.GW, y = Math.floor(selected / E.GW), base = baseSampler(w), samples = [];
        for (let j = 0; j <= 25; j++) for (let i = 0; i <= 25; i++) {
            const gx = x + i / 25, gy = y + j / 25, before = base(gx, gy), after = E.LandscapeColor.sample(w, gx, gy, before, {slope: name === 'alpine' ? .8 : .2});
            samples.push({before, after});
        }
        assert.ok(range(samples.map(s => luma(s.after) - luma(s.before))) > .025, `${name} lacks local material contrast`);
        t.diagnostic(`${name} at ${x},${y}: material luminance delta range ${range(samples.map(s => luma(s.after) - luma(s.before))).toFixed(3)}`);
    }
});
