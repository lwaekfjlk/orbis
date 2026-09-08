import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {defaults, root} from './engine-loader.mjs';

// Compile only trusted local code, exposing the existing solvers. Retain each
// season's final vapor for diagnosis without changing any solver arithmetic.
const source = readFileSync(resolve(root, 'src/world/geography.js'), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {sourceSha256: digest(source),
    units: {temperature: 'Model degrees Celsius; uncalibrated', rain: 'Relative model index', vapor: 'Relative model index'},
    limitations: ['Wind is prescribed from latitude and season; it does not explicitly turn around mountains.',
        'Ocean circulation is a two-dimensional approximation without dynamic salinity, pressure or deep-ocean layers.']};
assert.equal(source.split('temps.push(temp);').length, 2, 'climate diagnostic hook must identify one seasonal result');
const E = new Function(source.replace('temps.push(temp);',
    '(w.__testVapor ||= []).push(q); temps.push(temp);') +
    '\nreturn {GW,GH,GN,generateWorld,drainage,ocean,climate,cryosphere,windAt,cell};')();

const noop = async () => {};
const mean = (values, cells) => cells.reduce((sum, i) => sum + values[i], 0) / cells.length;
const vapor = w => Float32Array.from(w.__testVapor[0], (q, i) => (q + w.__testVapor[1][i]) / 2);
const difference = (a, b) => Float32Array.from(a, (v, i) => Math.abs(v - b[i]));
const band = (x0, x1, y0 = 38, y1 = 49) => {
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(y * E.GW + x);
    return cells;
};
const snapshot = w => ({height: w.height.slice(), lat: w.lat.slice(), params: structuredClone(w.params)});
const unchanged = (w, before) => {
    assert.deepEqual(w.height, before.height, 'climate must not rewrite the bedrock');
    assert.deepEqual(w.lat, before.lat, 'latitude changed during the intervention');
    assert.deepEqual(w.params, before.params, 'solver changed generation parameters');
};

// A north/south mountain barrier in the northern westerlies. Both worlds have
// exactly the same coast, latitude, land area and forcing; only dry height differs.
function continentalFixture(raised, current = 1) {
    const w = {params: {...defaults, current}, height: new Float32Array(E.GN),
        lat: new Float32Array(E.GN), area: new Float32Array(E.GN),
        arc: new Float32Array(E.GN), fault: new Float32Array(E.GN)};
    for (let y = 0; y < E.GH; y++) for (let x = 0; x < E.GW; x++) {
        const i = y * E.GW + x;
        w.lat[i] = 86 - y * 172 / (E.GH - 1);
        w.area[i] = Math.cos(w.lat[i] * Math.PI / 180);
        w.height[i] = x >= 90 && x <= 235 && y >= 10 && y <= 169
            ? 300 + (raised ? 4000 * Math.exp(-(((x - 112) / 7) ** 2)) : 0) : -1000;
    }
    return w;
}

async function solve(w) {
    delete w.__testVapor;
    E.drainage(w);
    E.ocean(w);
    await E.climate(w, noop);
    return w;
}

let flat, mountain, stillOcean;
test.before(async () => {
    flat = await solve(continentalFixture(false));
    mountain = await solve(continentalFixture(true));
    stillOcean = await solve(continentalFixture(false, 0));
});

test('raising the same dry barrier cools its crest, rains on the windward slope and depletes leeward vapor', async t => {
    assert.deepEqual(flat.params, mountain.params);
    assert.deepEqual(flat.lat, mountain.lat);
    assert.deepEqual(flat.dist, mountain.dist);
    assert.deepEqual(flat.nearest, mountain.nearest);
    assert.deepEqual(flat.sst, mountain.sst, 'uplift above an unchanged coast must not change ocean forcing');
    for (let i = 0; i < E.GN; i++) assert.equal(flat.height[i] > 0, mountain.height[i] > 0);
    const windward = band(99, 111), crest = band(111, 113), leeward = band(122, 140);
    for (const i of windward) for (const season of [-1, 1]) assert(E.windAt(flat.lat[i], season)[0] > .5);
    const lowQ = vapor(flat), highQ = vapor(mountain);
    const metrics = {
        crestTemperature: [mean(flat.temp, crest), mean(mountain.temp, crest)],
        windwardRain: [mean(flat.rain, windward), mean(mountain.rain, windward)],
        leewardRain: [mean(flat.rain, leeward), mean(mountain.rain, leeward)],
        leewardVapor: [mean(lowQ, leeward), mean(highQ, leeward)]
    };
    t.diagnostic(JSON.stringify({order: ['flat', 'mountain'], ...metrics}));
    assert(metrics.crestTemperature[1] < metrics.crestTemperature[0] - 15);
    assert(metrics.windwardRain[1] > metrics.windwardRain[0] * 1.5);
    assert(metrics.leewardRain[1] < metrics.leewardRain[0] * .7);
    assert(metrics.leewardVapor[1] < metrics.leewardVapor[0] * .7,
        'a rain-shadow label alone does not prove water vapor was removed');

    const flatBefore = snapshot(flat), mountainBefore = snapshot(mountain);
    await E.cryosphere(flat, noop);
    await E.cryosphere(mountain, noop);
    unchanged(flat, flatBefore); unchanged(mountain, mountainBefore);
    assert(mean(mountain.iceAccum, windward) > mean(flat.iceAccum, windward));
    assert(mean(mountain.iceAblation, crest) < mean(flat.iceAblation, crest));
    assert(mean(mountain.ice, crest) > mean(flat.ice, crest) + 10,
        'cold highland precipitation must feed stored snow/ice');
    report.controlledMountain = {parameters: flat.params,
        intervention: 'Add a 4,000 m dry mountain ridge; keep coast, latitude and all forcing unchanged',
        order: ['flat', 'mountain'], ...metrics,
        crestIce: [mean(flat.ice, crest), mean(mountain.ice, crest)],
        windwardSnowAccumulation: [mean(flat.iceAccum, windward), mean(mountain.iceAccum, windward)]};
});

test('turning ocean transport on changes sea and coastal climate while keeping the terrain identical', t => {
    assert.deepEqual(flat.height, stillOcean.height);
    assert.deepEqual(flat.lat, stillOcean.lat);
    assert.deepEqual(flat.dist, stillOcean.dist);
    assert.deepEqual({...flat.params, current: 0}, stillOcean.params);
    assert(stillOcean.ou.every(v => v === 0) && stillOcean.ov.every(v => v === 0));
    assert(flat.ou.some(v => Math.abs(v) > .01) && flat.ov.some(v => Math.abs(v) > .01));
    const sea = [], coast = [], inland = [];
    for (let i = 0; i < E.GN; i++) {
        if (flat.height[i] <= 0) sea.push(i);
        else if (flat.dist[i] <= 4) coast.push(i);
        else if (flat.dist[i] >= 25) inland.push(i);
    }
    const deltaT = difference(flat.temp, stillOcean.temp), deltaRain = difference(flat.rain, stillOcean.rain);
    const metrics = {seaTemperatureChange: mean(difference(flat.sst, stillOcean.sst), sea),
        coastalTemperatureChange: mean(deltaT, coast), coastalRainChange: mean(deltaRain, coast),
        inlandTemperatureChange: mean(deltaT, inland)};
    t.diagnostic(JSON.stringify(metrics));
    assert(metrics.seaTemperatureChange > .1);
    assert(metrics.coastalTemperatureChange > .1);
    assert(metrics.coastalRainChange > .005);
    assert(metrics.inlandTemperatureChange < metrics.coastalTemperatureChange * .2,
        'the maritime temperature effect should weaken inland');
    report.oceanTransport = {parameters: flat.params,
        intervention: 'Change current from 0 to 1 on byte-identical terrain',
        measurements: 'Mean absolute change on identical cells', ...metrics};
});

test('actual version 2 mountain ranges alter climate when compared with the same land flattened to foothills', async t => {
    const high = await E.generateWorld({...defaults, landformVersion: 2});
    const ranges = high.landformRegions.filter(r => r.kind === 'folded-ranges');
    assert(ranges.length > 0 && ranges.every(r => r.mountainStructure?.summits > 1),
        'the fixture must exercise the actual version 2 mountain generator');
    const generatedTemperature = high.temp.slice(), generatedRain = high.rain.slice();
    const low = structuredClone(high), lowering = new Float32Array(E.GN);
    // Lower only existing dry mountain cells. Every ocean cell, other landform,
    // latitude and climate parameter remains exactly the same in both worlds.
    for (let i = 0; i < E.GN; i++) if (high.landform[i] === 3 && high.height[i] > 500) {
        low.height[i] = 500;
        lowering[i] = high.height[i] - low.height[i];
    }
    const highBefore = snapshot(high), lowBefore = snapshot(low);
    await solve(high); await solve(low);
    unchanged(high, highBefore); unchanged(low, lowBefore);
    assert.deepEqual(high.temp, generatedTemperature, 'the real generator used climate from before mountain sculpting');
    assert.deepEqual(high.rain, generatedRain, 'the real generator did not recompute rainfall above its final terrain');
    assert.deepEqual(high.params, low.params);
    assert.deepEqual(high.lat, low.lat);
    assert.deepEqual(high.dist, low.dist);
    assert.deepEqual(high.nearest, low.nearest);
    assert.deepEqual(high.sst, low.sst);
    for (let i = 0; i < E.GN; i++) {
        assert.equal(high.height[i] > 0, low.height[i] > 0);
        if (high.landform[i] !== 3) assert.equal(high.height[i], low.height[i]);
    }
    const highQ = vapor(high), lowQ = vapor(low), rangeMetrics = [];
    for (const range of ranges) {
        const crest = [], windward = [], leeward = [];
        for (let i = 0; i < E.GN; i++) {
            const x = i % E.GW, y = i / E.GW | 0, wind = E.windAt(high.lat[i], 0), length = Math.hypot(...wind);
            // Choose samples from terrain and prevailing wind, before inspecting
            // their rainfall. No shadow/cause classification is used as evidence.
            if (high.landformRegion[i] === range.id && lowering[i] > 1000) {
                crest.push(i);
                const dx = (lowering[E.cell(x + 1, y)] - lowering[E.cell(x - 1, y)]) / 2;
                const dy = (lowering[E.cell(x, y + 1)] - lowering[E.cell(x, y - 1)]) / 2;
                if (wind[0] * dx + wind[1] * dy > 60) windward.push(i);
            }
            if (high.height[i] > 0 && high.height[i] < 1500 && lowering[i] === 0) {
                for (let step = 2; step <= 18; step++) {
                    const j = E.cell(Math.round(x - wind[0] / length * step), Math.round(y - wind[1] / length * step));
                    if (high.landformRegion[j] === range.id && lowering[j] > 1000) { leeward.push(i); break; }
                }
            }
        }
        assert(crest.length > 100 && windward.length > 30 && leeward.length > 30,
            `${range.kind}: insufficient physical samples for the intervention`);
        const metrics = {range: range.id, order: ['foothills', 'mountains'],
            crestTemperature: [mean(low.temp, crest), mean(high.temp, crest)],
            windwardRain: [mean(low.rain, windward), mean(high.rain, windward)],
            leewardRain: [mean(low.rain, leeward), mean(high.rain, leeward)],
            leewardVapor: [mean(lowQ, leeward), mean(highQ, leeward)]};
        t.diagnostic(JSON.stringify(metrics));
        assert(metrics.crestTemperature[1] < metrics.crestTemperature[0] - 5);
        assert(metrics.windwardRain[1] > metrics.windwardRain[0] * 1.2);
        assert(metrics.leewardRain[1] < metrics.leewardRain[0] * .99);
        assert(metrics.leewardVapor[1] < metrics.leewardVapor[0] * .99);
        for (const i of leeward) assert.equal(high.temp[i], low.temp[i],
            'downstream moisture changed without changing local elevation or temperature');
        rangeMetrics.push({...metrics, name: range.name,
            samples: {crest: crest.length, windward: windward.length, leeward: leeward.length}});
    }
    report.generatedMountains = {parameters: high.params,
        terrainHeightSha256: digest(Buffer.from(high.height.buffer, high.height.byteOffset, high.height.byteLength)),
        intervention: 'Compare the real version 2 ranges with only their dry cells above 500 m lowered to 500 m',
        unchangedCoastAndOcean: true, generationClimateMatchesFinalTerrain: true, ranges: rangeMetrics};
});

// Opt in when refreshing evidence; ordinary test runs do not churn stored reports.
test.after(() => {
    if (!process.env.CLIMATE_CAUSALITY_OUTPUT || !report.controlledMountain || !report.oceanTransport || !report.generatedMountains) return;
    const output = resolve(process.env.CLIMATE_CAUSALITY_OUTPUT);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
});
