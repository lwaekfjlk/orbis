import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, defaults } from './engine-loader.mjs';

const E = loadEngine();
let worldPromise;
const world = () => worldPromise ??= E.generateWorld(defaults);
function fixture() {
    return { params: { seed: 'color-cache' }, biome: new Uint8Array([7]), height: new Float64Array([1400]),
        lake: new Float64Array([-1]), ice: new Float64Array([0]), temp: new Float64Array([14]), arid: new Float64Array([1.1]) };
}

test('cached parent colors observe every mutable physical input', () => {
    for (const [field, value] of [['biome', 4], ['height', 2600], ['lake', 200], ['ice', 50], ['temp', -8], ['arid', .15]]) {
        const w = fixture(), before = E.CityEnvironment.cellColor(w, 0);
        w[field][0] = value;
        const changed = E.CityEnvironment.cellColor(w, 0), fresh = E.CityEnvironment.cellColor(structuredClone(w), 0);
        assert.deepEqual(changed, fresh, field + ' left a stale cached color');
        assert.notDeepEqual(changed, before, field + ' no longer affects the ground color');
        assert.deepEqual(E.CityEnvironment.cellColor(w, 0), changed, field + ' changed on the next cache hit');
    }
});

test('world identity, seed reuse and caller mutations cannot contaminate cached colors', () => {
    const first = fixture(), second = fixture();
    second.params.seed = first.params.seed; second.temp[0] = -15;
    const expected = E.CityEnvironment.cellColor(structuredClone(first), 0), color = E.CityEnvironment.cellColor(first, 0);
    color.fill(0);
    assert.deepEqual(E.CityEnvironment.cellColor(first, 0), expected, 'the first caller modified the cached array');
    const warm = E.CityEnvironment.cellColor(first, 0); warm.fill(1);
    assert.deepEqual(E.CityEnvironment.cellColor(first, 0), expected, 'a cache hit exposed its stored array');
    assert.notDeepEqual(E.CityEnvironment.cellColor(second, 0), expected, 'two worlds with one seed share colors');
    assert.deepEqual(E.CityEnvironment.cellColor(second, 0), E.CityEnvironment.cellColor(structuredClone(second), 0));
});

test('cold and warm parent-color caches produce identical complete city data', async () => {
    const w = await world(), sim = E.createCivilization(w, { realms: 18, historySeed: 'First-dawn' });
    const p = sim.provinces.filter(p => p.city).sort((a, b) => b.urbanPop - a.urbanPop)[0];
    const cold = E.generateCity(w, sim, p.id), coldJSON = JSON.stringify(cold);
    const warm = E.generateCity(w, sim, p.id);
    assert.equal(JSON.stringify(warm), coldJSON, 'a warm cache changed city geometry or any sampled environment field');
    const replacement = structuredClone(w), regenerated = E.generateCity(replacement, sim, p.id);
    assert.equal(JSON.stringify(regenerated), coldJSON, 'a replacement world reused a stale environment cache');
});


test('site-only samples exactly match full samples at coast, ice and lattice boundaries', async () => {
    const w = await world(), keys = ['surface', 'waterKind', 'water', 'wetness', 'ice', 'snow'];
    const points = [[-1, -1], [E.GW, E.GH], [0, 0], [E.GW - 1, E.GH - 1]];
    let shores = 0, iceEdges = 0;
    for (let i = 0; i < E.GW * E.GH - E.GW - 1; i++) {
        const shore = (w.height[i] <= 0 || w.lake[i] > 0) !== (w.height[i + 1] <= 0 || w.lake[i + 1] > 0);
        const ice = (w.ice[i] > 25) !== (w.ice[i + 1] > 25);
        if (i % 173 !== 0 && !(shore && shores < 80) && !(ice && iceEdges < 80)) continue;
        if (shore) shores++; if (ice) iceEdges++;
        const x = i % E.GW, y = Math.floor(i / E.GW);
        for (const [u, v] of [[0, 0], [.499999, .5], [.5, .5], [.500001, .5], [.13, .79], [1, 1]]) points.push([x + u, y + v]);
    }
    assert(shores > 10 && iceEdges > 10, 'the sample set needs actual coast and ice transitions');
    for (const [x, y] of points) {
        const full = E.CityEnvironment.sample(w, x, y), site = E.CityEnvironment.sampleSite(w, x, y);
        assert.deepEqual(site, Object.fromEntries(keys.map(k => [k, full[k]])), `site data differs at ${x},${y}`);
    }
});
