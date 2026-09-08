import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {defaults} from './engine-loader.mjs';

const files = ['src/world/geography.js', 'src/city/environment.js', 'src/render/world-renderer.js', 'src/continuous/landscape-color.js'];
const E = Function(files.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n') + '\nreturn {generateWorld,CityEnvironment,LandscapeColor,GW,GH,GN};')();
const chroma = c => Math.max(...c) - Math.min(...c), mean = values => values.reduce((n, v) => n + v, 0) / values.length;
const delta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const range = values => Math.max(...values) - Math.min(...values);
let world;
test.before(async () => { world = await E.generateWorld(defaults); });

function fixture({biome = 11, temp = 26, arid = 2.3, height = 300, lake = -1, ice = 0, seed = 471} = {}) {
    const field = n => new Float32Array(E.GN).fill(n);
    return {seed, height: field(height), lake: field(lake), ice: field(ice), temp: field(temp), arid: field(arid), biome: new Uint8Array(E.GN).fill(biome)};
}
function baseSampler(w) {
    const colors = new Map(), color = i => { if (!colors.has(i)) colors.set(i, E.CityEnvironment.cellColor(w, i)); return colors.get(i); };
    return (x, y) => {
        const ax = Math.min(E.GW - 2, Math.floor(x)), ay = Math.min(E.GH - 2, Math.floor(y)), u = x - ax, v = y - ay;
        const ids = [ay * E.GW + ax, ay * E.GW + ax + 1, (ay + 1) * E.GW + ax, (ay + 1) * E.GW + ax + 1];
        const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v], result = [0, 0, 0];
        for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) result[k] += color(ids[j])[k] * weights[j];
        return result;
    };
}
function patch(w, x = 150, y = 90, options = {}) {
    const base = baseSampler(w), result = [];
    for (let j = -25; j <= 25; j++) for (let i = -25; i <= 25; i++) {
        const gx = x + i * .04, gy = y + j * .04, before = base(gx, gy), after = E.LandscapeColor.sample(w, gx, gy, before, options);
        assert.ok(after.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
        result.push({before, after});
    }
    return result;
}
function digest(w) {
    const hash = createHash('sha256');
    for (const key of Object.keys(w).sort()) {
        const value = w[key];
        if (ArrayBuffer.isView(value)) hash.update(key).update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    return hash.digest('hex');
}

test('actual tropical city surroundings gain restrained soil and vegetation patches within the inherited climate', t => {
    for (const [name, x, y] of [['Gullgrove', 267, 79], ['Harthurst', 73, 89]]) {
        const samples = patch(world, x, y), beforeChroma = mean(samples.map(s => chroma(s.before))), afterChroma = mean(samples.map(s => chroma(s.after)));
        const soil = samples.filter(s => s.after[0] > s.after[1] && s.after[1] > s.after[2]).length / samples.length;
        assert.ok(afterChroma < beforeChroma * .96, name + ' remains a uniformly saturated green field');
        assert.ok(soil > .01 && soil < .5, name + ' needs scattered exposed soil without repainting the whole climate');
        assert.ok(range(samples.map(s => s.after[0] - s.before[0])) > .08, name + ' lacks visible local material variation');
        assert.ok(mean(samples.map(s => s.after[1])) > mean(samples.map(s => s.after[2])) + .05, 'the moist green landscape remains recognizable');
        t.diagnostic(`${name}: mean chroma ${beforeChroma.toFixed(3)} → ${afterChroma.toFixed(3)}, soil patches ${(soil * 100).toFixed(1)}%`);
    }
});

test('steep faces expose more neutral stone than the adjacent low-gradient forest floor', () => {
    const w = fixture(), low = patch(w, 150, 90, {slope: .02}), steep = patch(w, 150, 90, {slope: 1.2});
    assert.ok(mean(steep.map(s => chroma(s.after))) < mean(low.map(s => chroma(s.after))) * .8, 'a rock face retains the forest-floor saturation');
    assert.ok(range(steep.map(s => s.after[0])) > .04, 'rock colour retains continuous mineral/weathering variation');
    assert.ok(mean(steep.map(s => s.after[2])) > mean(low.map(s => s.after[2])) + .03, 'stone should have a neutral mineral tone rather than brown soil');
});

test('water, permanent snow, cold terrain and desert retain their own palette identities', () => {
    for (const config of [{height: -10, biome: 0}, {lake: 500, biome: 15}, {biome: 16, temp: -18, ice: 90}]) {
        const samples = patch(fixture(config));
        for (const s of samples) assert.deepEqual(s.after, s.before, 'water and permanent snow must not receive invented soil');
    }
    const desert = patch(fixture({biome: 4, temp: 29, arid: .1}));
    for (const s of desert) {
        assert.ok(s.after[0] > s.after[1] && s.after[1] > s.after[2], 'sand acquires forest green');
        assert.ok(Math.abs(s.after[0] / s.after[1] - s.before[0] / s.before[1]) < 1e-10, 'desert detail should modulate its inherited sand hue');
        assert.ok(Math.abs(s.after[2] / s.after[1] - s.before[2] / s.before[1]) < 1e-10);
    }
    const cold = patch(fixture({biome: 8, temp: -5, arid: .8})), warm = patch(fixture());
    assert.ok(mean(cold.map(s => delta(s.after, s.before))) < mean(warm.map(s => delta(s.after, s.before))) * .4, 'cold/snow cover should suppress the warm exposed-soil treatment');
});

test('material and climate interpolation remain continuous across parent cells and fine patch boundaries', () => {
    const w = fixture();
    for (let y = 0; y < E.GH; y++) for (let x = 150; x < E.GW; x++) {
        const i = y * E.GW + x;
        w.biome[i] = 13; w.temp[i] = 3; w.arid[i] = .35; w.height[i] = 1600;
    }
    const base = baseSampler(w), epsilon = 1e-6;
    for (const x of [148, 149, 150, 151, 152, 150.127, 150.571]) for (const y of [89, 89.317, 90, 90.733, 91]) for (const direction of [[1, 0], [0, 1]]) {
        const point = sign => [x + direction[0] * epsilon * sign, y + direction[1] * epsilon * sign];
        const a = point(-1), b = point(1), ca = E.LandscapeColor.sample(w, ...a, base(...a)), cb = E.LandscapeColor.sample(w, ...b, base(...b));
        assert.ok(delta(ca, cb) < 1e-4, `material seam at ${x}, ${y}`);
    }
});

test('sample results are deterministic, seed-dependent and do not write world or input colours', () => {
    const w = fixture(), other = {...w, seed: w.seed + 1}, base = Object.freeze(E.CityEnvironment.cellColor(w, 90 * E.GW + 150)), before = digest(w), keys = Object.keys(w);
    Object.freeze(w);
    let changed = 0;
    for (let i = 0; i < 100; i++) {
        const x = 149 + i * .031, y = 89 + i * .017, a = E.LandscapeColor.sample(w, x, y, base), b = E.LandscapeColor.sample(w, x, y, base);
        assert.deepEqual(a, b);
        if (delta(a, E.LandscapeColor.sample(other, x, y, base)) > .005) changed++;
    }
    assert.ok(changed > 50, 'seed changes should alter local patch placement');
    assert.equal(digest(w), before); assert.deepEqual(Object.keys(w), keys);
});
