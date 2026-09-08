import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {defaults, root} from './engine-loader.mjs';

// Expose trusted local functions, and retain the input coast to each regional
// sculpt. This observes the production path without substituting its arithmetic.
const source = readFileSync(resolve(root, 'src/world/geography.js'), 'utf8');
const E = new Function(source + `
const sculpt = sculptLandforms;
sculptLandforms = w => {
    w.testBeforeLandforms = w.height.slice();
    sculpt(w);
    w.testAfterLandforms = w.height.slice();
};
return {GW, GH, GN, generateWorld, noise, random32, cell, mountainBeltV2, compressionAxisV3, plateCrustV3};`)();
let world, zero, reversed;
test.before(async () => {
    world = await E.generateWorld({...defaults, landformVersion: 3});
    zero = await E.generateWorld({...defaults, landformVersion: 3, uplift: 0});
    reversed = await E.generateWorld({...defaults, landformVersion: 3, motion: Array(defaults.plates).fill(Math.PI)});
});

test('boundary normals follow the local weighted and warped plate ownership field', () => {
    const random = E.random32(world.seed), ox = random() * 200, oy = random() * 200;
    const difference = (x, y, A, B) => {
        const xx = x + E.noise(x * .032 + ox, y * .032 + oy, world.seed + 80) * 4.1;
        const yy = y + E.noise(x * .032 - oy, y * .032 + ox, world.seed + 180) * 4.1;
        const distance = p => ((xx - p.x) ** 2 + (yy - p.y) ** 2) / (p.scale * p.scale);
        return distance(A) - distance(B);
    };
    let inadequateSeedNormals = 0;
    for (const b of world.boundaries) {
        const A = world.plates[b.a], B = world.plates[b.b], epsilon = .0001;
        const dx = difference(b.x + epsilon, b.y, A, B) - difference(b.x - epsilon, b.y, A, B);
        const dy = difference(b.x, b.y + epsilon, A, B) - difference(b.x, b.y - epsilon, A, B);
        const length = Math.hypot(dx, dy);
        assert((b.nx * dx + b.ny * dy) / length > .999999, 'normal is not the local A-to-B gradient');
        const seedLength = Math.hypot(B.x - A.x, B.y - A.y);
        if (((B.x - A.x) * dx + (B.y - A.y) * dy) / seedLength / length < Math.cos(Math.PI / 6)) inadequateSeedNormals++;
        assert(Math.abs(b.closing - ((A.vx - B.vx) * b.nx + (A.vy - B.vy) * b.ny)) < 1e-12);
    }
    assert(inadequateSeedNormals > 30, 'fixture must distinguish the old seed-centre approximation');
});

test('crust samples and subduction fields stay on their actual plate, including curved junctions', () => {
    const w = {plate: new Uint8Array(E.GN).fill(2), crust: new Float32Array(E.GN).fill(-1)};
    const fallback = E.cell(30, 30), near = E.cell(29, 30);
    w.plate[fallback] = 0;w.crust[fallback] = .2;w.plate[near] = 0;w.crust[near] = .6;
    assert.equal(E.plateCrustV3(w, 0, 30, 30, 1, 0, -1, fallback), w.crust[near]);
    w.plate[near] = 2;
    assert.equal(E.plateCrustV3(w, 0, 30, 30, 1, 0, -1, fallback), w.crust[fallback]);

    const arc = new Float32Array(E.GN), trench = new Float32Array(E.GN), unguarded = new Float32Array(E.GN);
    for (const b of world.boundaries) {
        if (b.type !== 2 && b.type !== 3) continue;
        const strength = Math.max(.12, Math.min(1.65, Math.abs(b.closing) / 1.2));
        for (let y = Math.max(0, Math.floor(b.y - 11)); y <= Math.min(E.GH - 1, Math.ceil(b.y + 11)); y++)
            for (let x = Math.max(0, Math.floor(b.x - 11)); x <= Math.min(E.GW - 1, Math.ceil(b.x + 11)); x++) {
                const i = y * E.GW + x, dx = x - b.x, dy = y - b.y;
                const along = -dx * b.ny + dy * b.nx, cross = dx * b.nx + dy * b.ny;
                const side = cross * (b.override === b.a ? -1 : 1), taper = Math.exp(-along * along / 8);
                const volcanic = Math.exp(-((side - 3.8) ** 2) / 8) * taper * strength;
                unguarded[i] = Math.max(unguarded[i], volcanic);
                if (world.plate[i] === b.override) arc[i] = Math.max(arc[i], volcanic);
                if ((world.plate[i] === b.a || world.plate[i] === b.b) && world.plate[i] !== b.override)
                    trench[i] = Math.max(trench[i], Math.exp(-((side + 1.7) ** 2) / 2.5) * taper * strength);
            }
    }
    assert.deepEqual(world.arc, arc);assert.deepEqual(world.trench, trench);
    assert(unguarded.some((a, i) => a > arc[i] + .05), 'fixture must exercise substantial wrong-plate arc deposition');
});

test('mountain blocks respond to compression and uplift without an absolute high-altitude floor', () => {
    const sample = (uplift, compression) => {
        const w = {params: {...defaults, landformVersion: 3, uplift}, seed: world.seed,
            base: new Float32Array(E.GN).fill(700), compressionSupport: new Float32Array(E.GN).fill(compression)};
        const r = {center: {x: 150, y: 90, i: E.cell(150, 90)}, rx: 28, ry: 11, axis: .6, level: 1500};
        const original = new Float32Array(E.GN).fill(700), surface = E.mountainBeltV2(w, r, original, new Float32Array(E.GN));
        const heights = [];
        for (let u = -20; u <= 20; u++) for (let v = -7; v <= 7; v++) {
            const x = 150 + u * Math.cos(r.axis) - v * Math.sin(r.axis), y = 90 + u * Math.sin(r.axis) + v * Math.cos(r.axis);
            heights.push(surface(E.cell(x, y), x, y, u, v));
        }
        return {r, heights};
    };
    const full = sample(1.2, 1), half = sample(.6, 1), weak = sample(1.2, .25), off = sample(0, 1), absent = sample(1.2, 0);
    assert(Math.max(...full.heights) > 3500, 'supported crust must still produce high mountains');
    assert(new Set(full.heights.map(h => Math.round(h / 100))).size > 20, 'mountains have become a flat roof');
    for (let k = 0; k < full.heights.length; k++) {
        assert.equal(off.heights[k], 700);assert.equal(absent.heights[k], 700);
        assert(Math.abs((full.heights[k] - 700) / 2 - (half.heights[k] - 700)) < 1e-9);
        assert(Math.abs(half.heights[k] - weak.heights[k]) < 1e-9);
    }
    assert.equal(full.r.mountainStructure.summits, half.r.mountainStructure.summits);
    assert(full.r.mountainStructure.branches > 0, 'tectonic coupling must retain the branching ridge network');
    const boundaries = [{x: 150, y: 90, type: 1, closing: 1, nx: 1, ny: 0},
        ...Array.from({length: 10}, () => ({x: 150, y: 90, type: 5, closing: .1, nx: 0, ny: 1}))];
    assert.equal(E.compressionAxisV3({boundaries}, 150, 90, 0), Math.PI / 2, 'nearer transform faults must not steer a collision belt');
});

test('regional sculpting preserves its incoming coast and zero uplift cannot restore kilometre-high plateaus', () => {
    for (const w of [world, zero, reversed]) {
        for (let i = 0; i < E.GN; i++) {
            assert.equal(w.testAfterLandforms[i] > 0, w.testBeforeLandforms[i] > 0);
            if (w.testBeforeLandforms[i] <= 0 || w.fjord[i] || w.basinPrior[i])
                assert.equal(w.testAfterLandforms[i], w.testBeforeLandforms[i]);
        }
        assert(w.audit.finite && w.audit.topology);assert.equal(w.audit.downhillErrors, 0);
        assert.equal(w.riverCycleCells, 0);assert(w.waterBudgetError < 1e-8);
    }
    assert.equal(zero.plateaus.length, 0);
    assert(zero.height.filter(h => h > 3500).length < 10, 'absolute plateau or peak priors ignore the zero-uplift setting');
    let checked = 0;
    for (let i = 0; i < E.GN; i++) if ((zero.landform[i] === 1 || zero.landform[i] === 3) && zero.landformStrength[i] === 1) {
        assert.equal(zero.testAfterLandforms[i], zero.testBeforeLandforms[i]);checked++;
    }
    assert(checked > 200, 'zero-uplift intervention must include real mesa and mountain footprints');
    assert.deepEqual(new Set(world.landformRegions.map(r => r.type)), new Set([1, 2, 3, 4]));
    for (const r of world.landformRegions.filter(r => r.type === 3)) {
        assert(r.statistics.maxHeight > 3500 && r.statistics.relief > 1800);
        assert(r.mountainStructure.maxSummit - r.mountainStructure.minSummit > 1200);
        assert.equal(world.landformRegion[r.i], r.id);assert(world.lake[r.i] < 0 && world.ice[r.i] < 80);
    }
});

test('reversing plate velocities changes tectonic relief while keeping continental and plate priors fixed', () => {
    assert.deepEqual(world.base, reversed.base);assert.deepEqual(world.crust, reversed.crust);assert.deepEqual(world.plate, reversed.plate);
    assert.equal(world.boundaries.length, reversed.boundaries.length);
    for (let k = 0; k < world.boundaries.length; k++) {
        const a = world.boundaries[k], b = reversed.boundaries[k];
        for (const key of ['x', 'y', 'a', 'b', 'nx', 'ny']) assert.equal(a[key], b[key]);
        assert(Math.abs(a.closing + b.closing) < 1e-12);
        assert(Math.abs(a.shear - b.shear) < 1e-12);
        if (a.type === 1 && a.closing > .2) assert.equal(b.type, 4);
    }
    assert(world.collision.some((c, i) => c > reversed.collision[i] + .5));
    assert(world.height.filter((h, i) => Math.abs(h - reversed.height[i]) > 1000).length > 1000);
});

test('the coupled final mountain surface keeps unequal cross-sections without a comb wavelength', () => {
    // The same independent raster diagnostics used for v2: transverse spectral
    // power and slope-direction concentration, not the producer's ridge graph.
    const clamp = value => Math.max(0, Math.min(1, value));
    const cases = world.landformRegions.filter(r => r.type === 3).map(r => ({r}));
    cases.push({r: {id: 'cosmetically staggered comb', rx: 26, ry: 11}, comb: true});
    for (const {r, comb} of cases) {
        const height = (u, v) => {
            if (comb) {
                let h = 0;
                for (let k = -3; k <= 3; k++) {
                    const center = k * 4.7 + Math.sin(u * .07 + k * 1.31) * .45;
                    const profile = Math.max(0, 1 - Math.abs(v - center) / 1.6);
                    h = Math.max(h, profile ** 1.5 * (1650 + Math.sin(k * 2.3) * 420) * (.8 + .2 * Math.cos(u / (3.1 + k * .12) + k * 2.2)));
                }
                return 1500 + h;
            }
            const x = r.center.x + u * Math.cos(r.axis) - v * Math.sin(r.axis);
            const y = r.center.y + u * Math.sin(r.axis) + v * Math.cos(r.axis);
            const a = Math.floor(x), b = Math.floor(y), s = x - a, t = y - b;
            const h = (dx, dy) => world.height[(b + dy) * E.GW + a + dx];
            return (h(0, 0) * (1 - s) + h(1, 0) * s) * (1 - t) + (h(0, 1) * (1 - s) + h(1, 1) * s) * t;
        };
        const periods = [], counts = [], tops = [], centers = [], widths = [];let gx = 0, gy = 0, weight = 0;
        for (const along of [-.55, -.4, -.25, -.1, .05, .2, .35, .5]) {
            const hs = [];for (let v = -r.ry * .72; v <= r.ry * .72; v += .25) hs.push(height(along * r.rx, v));
            const peaks = [];
            // A 3.5-cell prominence window admits broad massifs, not only the
            // sharp 1.5-cell peaks characteristic of the former fixed ridges.
            for (let k = 2; k < hs.length - 2; k++) if (hs[k] > hs[k - 1] && hs[k] >= hs[k + 1] && hs[k] - Math.min(...hs.slice(Math.max(0, k - 14), k + 15)) > 250) {
                if (!peaks.length || (k - peaks.at(-1)) * .25 >= 2) peaks.push(k);
                else if (hs[k] > hs[peaks.at(-1)]) peaks[peaks.length - 1] = k;
            }
            counts.push(peaks.length);
            const top = Math.max(...hs), floor = Math.min(...hs);
            tops.push(top);centers.push(hs.indexOf(top) * .25);widths.push(hs.filter(h => h > (top + floor) / 2).length * .25);
            const mean = hs.reduce((a, b) => a + b, 0) / hs.length, power = [];
            for (let f = 1; f <= 12; f++) {
                let a = 0, b = 0;
                for (let k = 0; k < hs.length; k++) {
                    const z = (hs[k] - mean) * (.5 - .5 * Math.cos(2 * Math.PI * k / (hs.length - 1))), angle = 2 * Math.PI * f * k / hs.length;
                    a += z * Math.cos(angle);b += z * Math.sin(angle);
                }
                power.push(a * a + b * b);
            }
            const total = power.reduce((a, b) => a + b, 0);let periodic = 0;
            for (let k = 0; k < power.length; k++) {
                const wavelength = hs.length * .25 / (k + 1);
                if (wavelength >= 3 && wavelength <= 7) periodic = Math.max(periodic, power[k] / Math.max(1, total));
            }
            periods.push(periodic);
        }
        for (let u = -r.rx * .6; u <= r.rx * .6; u += .5) for (let v = -r.ry * .65; v <= r.ry * .65; v += .5) {
            const dx = (height(u + .3, v) - height(u - .3, v)) / .6, dy = (height(u, v + .3) - height(u, v - .3)) / .6, m = Math.hypot(dx, dy);
            if (m < 100) continue;
            gx += (dx * dx - dy * dy) / m;gy += 2 * dx * dy / m;weight += m;
        }
        const periodic = periods.reduce((a, b) => a + b, 0) / periods.length, directional = clamp(Math.hypot(gx, gy) / Math.max(1, weight));
        if (comb) {
            assert(periodic >= .32 && directional >= .72, 'independent peak heights and phases must not disguise a regular comb');
            continue;
        }
        assert(periodic < .32, r.id + ' repeats a fixed transverse wavelength: ' + periodic);
        assert(directional < .72, r.id + ' is a row of narrow parallel walls: ' + directional);
        const span = values => Math.max(...values) - Math.min(...values);
        assert(new Set(counts).size > 1 || span(tops) > 350 || span(centers) > 2 || span(widths) > 2,
            r.id + ' repeats its peak count, location, height and cross-section width along the entire range');
    }
});
