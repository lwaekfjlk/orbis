import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {defaults, root} from './engine-loader.mjs';

const source = readFileSync(resolve(root, 'src/world/geography.js'), 'utf8');
const report = {sourceSha256: createHash('sha256').update(source).digest('hex'), version: 3,
    units: {temperature: 'Model degrees Celsius; uncalibrated', rain: 'Relative model index',
        vapor: 'Relative model index', waterBudget: 'Sum of model grid column water; not calibrated physical volume'},
    limitations: ['Wind is a prescribed seasonal latitude pattern, not a three-dimensional pressure solution.',
        'Ocean circulation uses a boundary-constrained streamfunction and relative wind-stress curl, not deep salinity dynamics.',
        'Cloud conversion, fallout and re-evaporation operate in uncalibrated model time steps.'],
    sources: [{title: 'Smith and Barstad (2004), A Linear Theory of Orographic Precipitation',
        url: 'https://journals.ametsoc.org/view/journals/atsc/61/12/1520-0469_2004_061_1377_altoop_2.0.co_2.xml'},
    {title: 'NOAA: Can the ocean freeze?', url: 'https://oceanservice.noaa.gov/facts/oceanfreeze.html'}]};
const E = new Function(source.replace('temps.push(temp);',
    '(w.__vapor ||= []).push(q); (w.__cloud ||= []).push(cloud); temps.push(temp);') +
    '\nreturn {GW,GH,GN,generateWorld,ocean,climate,cryosphere,drainage,maritimeSources,windAt,cell};')();
const noop = async () => {};
const mean = (array, cells) => cells.reduce((sum, i) => sum + array[i], 0) / cells.length;
const cells = (x0, x1, y0 = 38, y1 = 49) => {
    const result = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) result.push(y * E.GW + x);
    return result;
};
const vapor = w => Float32Array.from(w.__vapor[0], (value, i) => (value + w.__vapor[1][i]) / 2);
function fixture(raised = false, current = 1) {
    const w = {params: {...defaults, current, landformVersion: 3}, height: new Float32Array(E.GN),
        lat: new Float32Array(E.GN), area: new Float32Array(E.GN), arc: new Float32Array(E.GN), fault: new Float32Array(E.GN)};
    for (let y = 0; y < E.GH; y++) for (let x = 0; x < E.GW; x++) {
        const i = y * E.GW + x;
        w.lat[i] = 86 - y * 172 / (E.GH - 1);
        w.area[i] = Math.cos(w.lat[i] * Math.PI / 180);
        w.height[i] = x >= 90 && x <= 235 && y >= 10 && y <= 169
            ? 300 + (raised ? 4000 * Math.exp(-(((x - 112) / 7) ** 2)) : 0) : -1000;
    }
    return w;
}
async function solve(w) { delete w.__vapor; delete w.__cloud; E.drainage(w); E.ocean(w); await E.climate(w, noop); return w; }
let flat, mountain, noCurrent, world;
test.before(async () => {
    flat = await solve(fixture());
    mountain = await solve(fixture(true));
    noCurrent = await solve(fixture(false, 0));
    world = await E.generateWorld({...defaults, landformVersion: 3});
});

test('cloud transport conserves atmospheric water and retains a real rain shadow', t => {
    const crest = cells(111, 113), windward = cells(99, 111), lee = cells(122, 140);
    const lowQ = vapor(flat), highQ = vapor(mountain);
    const values = {crestTemperature: [mean(flat.temp, crest), mean(mountain.temp, crest)],
        windwardRain: [mean(flat.rain, windward), mean(mountain.rain, windward)],
        leeRain: [mean(flat.rain, lee), mean(mountain.rain, lee)],
        leeVapor: [mean(lowQ, lee), mean(highQ, lee)]};
    t.diagnostic(JSON.stringify(values));
    assert(values.crestTemperature[1] < values.crestTemperature[0] - 15);
    assert(values.windwardRain[1] > values.windwardRain[0] * 1.3);
    assert(values.leeRain[1] < values.leeRain[0] * .8);
    assert(values.leeVapor[1] < values.leeVapor[0] * .8);
    for (const w of [flat, mountain, noCurrent, world]) {
        assert.equal(w.climateWaterBudgets.length, 2);
        for (const budget of w.climateWaterBudgets) {
            assert(budget.evaporatedWater > 0 && budget.precipitatedWater > 0);
            assert(budget.relativeError < 2e-6, JSON.stringify(budget));
        }
        for (const arrays of [w.__vapor, w.__cloud]) for (const array of arrays) {
            assert(array.every(value => Number.isFinite(value) && value >= 0));
        }
    }
    assert.deepEqual(flat.sst, mountain.sst, 'a dry mountain must not change the ocean coast or SST');
    report.controlledMountain = {parameters: flat.params, order: ['flat', '4 km mountain'], ...values};
    report.waterBudgets = {flat: flat.climateWaterBudgets, mountain: mountain.climateWaterBudgets,
        currentDisabled: noCurrent.climateWaterBudgets, generatedWorld: world.climateWaterBudgets};
});

test('seasonal air receives the upwind sea temperature instead of a fixed nearest coast', async () => {
    // Both coasts are equally distant. At this latitude the prescribed seasonal
    // circulation reverses, so mirror only the sea temperatures in the controls.
    const worlds = [];
    for (const westCold of [true, false]) {
        const w = fixture(); w.lat.fill(30); w.height.fill(-1000);
        for (let y = 0; y < E.GH; y++) for (let x = 120; x <= 140; x++) w.height[y * E.GW + x] = 300;
        E.drainage(w);
        w.sst = new Float32Array(E.GN); w.seaAnomaly = new Float32Array(E.GN);
        for (let i = 0; i < E.GN; i++) {
            const cold = (i % E.GW < 120) === westCold;
            w.sst[i] = cold ? 8 : 26; w.seaAnomaly[i] = cold ? -8 : 10;
        }
        await E.climate(w, noop); worlds.push(w);
    }
    const [coldWest, coldEast] = worlds, i = 90 * E.GW + 130;
    assert(coldWest.maritimeSource[0][i] % E.GW < 120);
    assert(coldWest.maritimeSource[1][i] % E.GW > 140);
    assert(coldWest.seasonTemp[0][i] < coldEast.seasonTemp[0][i] - .5,
        'westerly air ignored the colder western sea');
    assert(coldWest.seasonTemp[1][i] > coldEast.seasonTemp[1][i] + .5,
        'easterly air still used the nearest western sea');
    assert.deepEqual(coldWest.height, coldEast.height);
    report.seasonalCoast = {latitude: 30, seaTemperatures: [8, 26],
        order: ['cold west / warm east', 'warm west / cold east'],
        westerlyTemperature: [coldWest.seasonTemp[0][i], coldEast.seasonTemp[0][i]],
        easterlyTemperature: [coldWest.seasonTemp[1][i], coldEast.seasonTemp[1][i]],
        upwindSourceX: coldWest.maritimeSource.map(array => array[i] % E.GW)};
});

test('ocean currents change coastal climate without changing land, and freezing cold becomes ice', async t => {
    assert.deepEqual(flat.height, noCurrent.height);
    assert(noCurrent.ou.every(value => value === 0) && noCurrent.ov.every(value => value === 0));
    const coast = [], interior = [], ocean = [];
    for (let i = 0; i < E.GN; i++) {
        if (flat.height[i] <= 0) ocean.push(i);
        else if (flat.dist[i] <= 4) coast.push(i);
        else if (flat.dist[i] >= 25) interior.push(i);
    }
    const delta = Float32Array.from(flat.temp, (value, i) => Math.abs(value - noCurrent.temp[i]));
    const metrics = {coastalTemperatureChange: mean(delta, coast), interiorTemperatureChange: mean(delta, interior)};
    t.diagnostic(JSON.stringify(metrics));
    assert(metrics.coastalTemperatureChange > .05);
    assert(metrics.interiorTemperatureChange < metrics.coastalTemperatureChange * .35);
    for (const i of ocean) assert(flat.sst[i] >= -1.80001 && Number.isFinite(flat.sst[i]));
    const freezingCells = ocean.filter(i => flat.oceanIcePotential[i] > .5);
    assert(freezingCells.length > 100);
    await E.cryosphere(flat, noop);
    for (const i of freezingCells) assert(flat.seaIce[i] >= flat.oceanIcePotential[i]);
    assert(flat.oceanForcing.some(value => value > 0) && flat.oceanForcing.some(value => value < 0));
    report.oceanTransport = {...metrics, oceanMinimumTemperature: Math.min(...ocean.map(i => flat.sst[i])),
        freezingCells: freezingCells.length, terrainUnchanged: true};
});

test('annual wind diagnostics represent both seasons and dry regions remain dry', t => {
    let land = 0, desert = 0, forest = 0, highDry = 0;
    const forests = new Set([7, 8, 9, 10, 11, 21, 22]);
    for (let i = 0; i < E.GN; i++) {
        assert.equal(world.windU[i], Math.fround((world.seasonWindU[0][i] + world.seasonWindU[1][i]) * .5));
        assert.equal(world.windV[i], Math.fround((world.seasonWindV[0][i] + world.seasonWindV[1][i]) * .5));
        assert(Number.isFinite(world.shadow[i]) && world.shadow[i] >= 0 && world.shadow[i] <= 1);
        if (world.height[i] <= 0) continue;
        land += world.area[i];
        if ([3, 4, 13].includes(world.biome[i])) desert += world.area[i];
        if (forests.has(world.biome[i])) forest += world.area[i];
        if (world.height[i] > 1500 && world.arid[i] < .28) highDry++;
    }
    t.diagnostic(JSON.stringify({desertArea: desert / land, forestArea: forest / land, dryHighlandCells: highDry}));
    assert(desert / land > .10 && desert / land < .45, 'clouds must not erase deserts or dry out most land');
    assert(forest / land > .12 && forest / land < .45);
    assert(highDry > 100, 'high dry regions should survive moisture transport');
    report.generatedWorld = {parameters: world.params, desertAreaFraction: desert / land,
        forestAreaFraction: forest / land, dryHighlandCells: highDry};
});

test('the real generated ranges cause windward rain and leeward drying under the coupled climate', async t => {
    const high = structuredClone(world), low = structuredClone(world), lowering = new Float32Array(E.GN);
    for (let i = 0; i < E.GN; i++) if (high.landform[i] === 3 && high.height[i] > 500) {
        low.height[i] = 500; lowering[i] = high.height[i] - low.height[i];
    }
    await solve(high); await solve(low);
    assert.deepEqual(high.temp, world.temp, 'generation retained temperatures from before final mountain shaping');
    assert.deepEqual(high.rain, world.rain, 'generation retained rainfall from before final mountain shaping');
    assert.deepEqual(high.sst, low.sst);
    assert.deepEqual(high.dist, low.dist);
    assert.deepEqual(high.params, low.params);
    const highQ = vapor(high), lowQ = vapor(low), comparisons = [];
    for (const range of high.landformRegions.filter(r => r.kind === 'folded-ranges')) {
        const crest = [], windward = [], lee = [];
        for (let i = 0; i < E.GN; i++) {
            const x = i % E.GW, y = i / E.GW | 0, u = high.windU[i], v = high.windV[i], length = Math.hypot(u, v);
            if (length < .15) continue;
            if (high.landformRegion[i] === range.id && lowering[i] > 1000) {
                crest.push(i);
                const dx = (lowering[E.cell(x + 1, y)] - lowering[E.cell(x - 1, y)]) / 2;
                const dy = (lowering[E.cell(x, y + 1)] - lowering[E.cell(x, y - 1)]) / 2;
                if (u * dx + v * dy > 60) windward.push(i);
            }
            if (high.height[i] > 0 && high.height[i] < 1500 && lowering[i] === 0) {
                for (let step = 2; step <= 18; step++) {
                    const j = E.cell(Math.round(x - u / length * step), Math.round(y - v / length * step));
                    if (high.landformRegion[j] === range.id && lowering[j] > 1000) { lee.push(i); break; }
                }
            }
        }
        assert(crest.length > 60 && windward.length > 30 && lee.length > 30);
        const values = {range: range.id, name: range.name, order: ['500 m foothills', 'generated mountains'],
            samples: {crest: crest.length, windward: windward.length, lee: lee.length},
            crestTemperature: [mean(low.temp, crest), mean(high.temp, crest)],
            windwardRain: [mean(low.rain, windward), mean(high.rain, windward)],
            leeRain: [mean(low.rain, lee), mean(high.rain, lee)],
            leeVapor: [mean(lowQ, lee), mean(highQ, lee)]};
        t.diagnostic(JSON.stringify(values));
        assert(values.crestTemperature[1] < values.crestTemperature[0] - 5);
        assert(values.windwardRain[1] > values.windwardRain[0] * 1.2);
        assert(values.leeRain[1] < values.leeRain[0] * .9);
        assert(values.leeVapor[1] < values.leeVapor[0] * .9);
        comparisons.push(values);
    }
    assert(comparisons.length > 0);
    report.generatedMountainInterventions = comparisons;
});

// Opt-in evidence refresh, so routine test runs never modify stored reports.
test.after(() => {
    if (!process.env.CLIMATE_V3_OUTPUT || !report.generatedWorld || !report.seasonalCoast || !report.oceanTransport || !report.generatedMountainInterventions) return;
    const output = resolve(process.env.CLIMATE_V3_OUTPUT);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
});
