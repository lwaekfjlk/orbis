import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadEngine, defaults } from './engine-loader.mjs';

const E = loadEngine();
const fixtures = [
    ['Aereth-47', '26177abc53c66e2a02f8409cabc279bfd555e5e4818040b25db067aef1abea07'],
    ['Landforms-Mesa-2', 'bbe807b325dbbc9613597fc063abf5fd5ff5e74f3c7bb7e6fd7c3b9cc2cc6b57'],
    ['Landforms-Folds-3', 'c87955e3fc2cdc5c8076915b2365e510faaa8c362169804875ad784a6fa1a6bd']
];
// Every legacy raster, including both seasonal climates, was captured from the
// unchanged generator. Landform versioning must not silently rewrite old worlds.
const rasterDigest = w => {
    const hash = createHash('sha256');
    for (const key of Object.keys(w).sort()) {
        const arrays = ArrayBuffer.isView(w[key]) ? [w[key]] : Array.isArray(w[key]) && w[key].every(ArrayBuffer.isView) ? w[key] : [];
        for (let k = 0; k < arrays.length; k++) {
            const a = arrays[k];
            hash.update(`${key}/${k}/${a.constructor.name}`);
            hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
        }
    }
    return hash.digest('hex');
};
const worlds = [];
test.before(async () => {
    for (const [seed, digest] of fixtures) {
        const old = await E.generateWorld({ ...defaults, seed, landformVersion: 0 });
        const next = await E.generateWorld({ ...defaults, seed, landformVersion: 1 });
        worlds.push({ seed, digest, old, next });
    }
});

test('missing and zero landform versions preserve every legacy physical raster byte', async () => {
    for (const { seed, digest, old } of worlds) {
        assert.equal(rasterDigest(old), digest, seed);
        assert.equal(old.landform, undefined);
        assert.equal(old.landformRegions, undefined);
    }
    const missing = await E.generateWorld(defaults);
    assert.equal(rasterDigest(missing), rasterDigest(worlds[0].old));
    assert.deepEqual(missing.features, worlds[0].old.features);
});

test('regional sculpting changes substantial bedrock while preserving oceans and protected basins', () => {
    for (const { seed, old, next: w } of worlds) {
        let dry = 0, changed = 0, realGeometry = 0, tagged = 0, climateChanged = 0;
        for (let i = 0; i < E.GN; i++) {
            assert.equal(w.height[i] > 0, old.height[i] > 0, `${seed}: coast ${i}`);
            if (old.height[i] > 0) dry++;
            if (w.height[i] !== old.height[i]) changed++;
            if (old.basinPrior[i] || old.fjord[i] || old.height[i] <= 0)
                assert.equal(w.height[i], old.height[i], `${seed}: protected surface ${i}`);
            if (w.landform[i]) {
                tagged++;
                if (Math.abs(w.height[i] - old.height[i]) > 80) realGeometry++;
            }
            if (Math.abs(w.temp[i] - old.temp[i]) > .3 || Math.abs(w.rain[i] - old.rain[i]) > .05) climateChanged++;
        }
        assert(changed > dry * .07 && changed < dry * .35, `${seed}: regional changes should remain regional`);
        assert(realGeometry > tagged * .7, `${seed}: geological regions must not just be colour masks`);
        assert(climateChanged > 500, `${seed}: climate must be recomputed above the new bedrock`);
        assert(w.audit.finite && w.audit.topology);
        assert.equal(w.audit.downhillErrors, 0);
        assert.equal(w.audit.unsupportedVents, 0);
        assert.equal(w.hydrologyStats.riverCycleCells, 0);
        assert(w.hydrologyStats.budgetResidual < 1e-8);
    }
});

test('four geological families form coherent regions with exposed, correctly indexed viewpoints', () => {
    for (const { seed, next: w } of worlds) {
        assert.deepEqual([...new Set(w.landformRegions.map(r => r.type))].sort(), [1, 2, 3, 4]);
        for (let i = 0; i < E.GN; i++) {
            assert(w.landformStrength[i] >= 0 && w.landformStrength[i] <= 1);
            if (!w.landform[i]) {
                assert.equal(w.landformRegion[i], -1);
                continue;
            }
            assert.equal(w.landformRegions[w.landformRegion[i]].type, w.landform[i]);
        }
        for (const r of w.landformRegions) {
            const cells = new Set();
            for (let i = 0; i < E.GN; i++) if (w.landformRegion[i] === r.id) cells.add(i);
            assert.equal(cells.size, r.area);
            assert(cells.size >= 100, `${seed}/${r.kind}: isolated patch`);
            assert(cells.has(r.i));
            assert(w.lake[r.i] < 0 && w.ice[r.i] < 80, `${seed}/${r.kind}: viewpoint hidden by water or ice`);
            const seen = new Set([r.i]), todo = [r.i];
            while (todo.length) {
                const i = todo.pop(), x = i % E.GW;
                for (const j of [i - 1, i + 1, i - E.GW, i + E.GW])
                    if (Math.abs(j % E.GW - x) <= 1 && cells.has(j) && !seen.has(j)) {
                        seen.add(j);
                        todo.push(j);
                    }
            }
            assert.equal(seen.size, cells.size, `${seed}/${r.kind}: fragmented region`);
            assert(r.statistics.relief > 700);
            assert(w.features.some(f => f.id === `landform-${r.id}` && f.i === r.i && f.region === r.id));
        }
    }
});

const surface = (w, x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const h = (xx, yy) => w.height[yy * E.GW + xx];
    return (h(ix, iy) * (1 - tx) + h(ix + 1, iy) * tx) * (1 - ty) + (h(ix, iy + 1) * (1 - tx) + h(ix + 1, iy + 1) * tx) * ty;
};

test('plateau roofs, river canyons, parallel ridges and calderas have distinct measured geometry', () => {
    for (const { seed, next: w } of worlds) {
        let canyonRivers = 0;
        for (const r of w.landformRegions) {
            if (r.type === 1) {
                let roofs = 0, incisions = 0;
                for (let i = 0; i < E.GN; i++) {
                    if (w.landformRegion[i] !== r.id || w.landformStrength[i] < .85) continue;
                    const neighbors = [i - 1, i + 1, i - E.GW, i + E.GW].map(j => w.height[j]);
                    if (Math.max(...neighbors) - Math.min(...neighbors) < 100 && Math.abs(w.height[i] - r.level) < 220) roofs++;
                    if (Math.max(...neighbors) - w.height[i] > 400) incisions++;
                    if (w.lake[i] < 0 && w.flow[i] > w.channelThreshold[i] && Math.max(...neighbors) - w.height[i] > 200) canyonRivers++;
                }
                assert(roofs > 20, `${seed}/${r.name}: no broad subdued roof`);
                assert(incisions > 5, `${seed}/${r.name}: no incised walls`);
            }
            if (r.type === 2) {
                const floor = w.height[r.center.i], rim = [];
                for (let k = 0; k < 32; k++) {
                    const a = k / 32 * Math.PI * 2, x = Math.round(r.center.x + Math.cos(a) * r.calderaRadius), y = Math.round(r.center.y + Math.sin(a) * r.calderaRadius), i = y * E.GW + x;
                    assert.equal(w.landformRegion[i], r.id, `${seed}/${r.name}: broken caldera geometry`);
                    rim.push(w.height[i]);
                }
                assert(rim.reduce((s, v) => s + v, 0) / rim.length > floor + 650, `${seed}/${r.name}: no collapsed summit`);
            }
            if (r.type === 3) {
                let foldedSections = 0;
                for (const along of [-.38, 0, .38]) {
                    const heights = [];
                    for (let across = -r.ry * .72; across <= r.ry * .72; across += .25) {
                        const x = r.center.x + along * r.rx * Math.cos(r.axis) - across * Math.sin(r.axis);
                        const y = r.center.y + along * r.rx * Math.sin(r.axis) + across * Math.cos(r.axis);
                        heights.push(surface(w, x, y));
                    }
                    let crests = 0;
                    for (let k = 7; k < heights.length - 7; k++)
                        if (heights[k] > heights[k - 1] && heights[k] >= heights[k + 1] && heights[k] - Math.min(...heights.slice(k - 7, k + 8)) > 450) crests++;
                    if (crests >= 3) foldedSections++;
                }
                assert(foldedSections >= 2, `${seed}/${r.name}: several crests must continue along the belt`);
            }
        }
        assert(canyonRivers > 0, `${seed}: the new canyons should carry real computed drainage`);
    }
});

test('the new geological histories replay deterministically', async () => {
    const again = await E.generateWorld({ ...defaults, landformVersion: 1 });
    assert.equal(E.physicalFingerprint(again), 'cc113c81', 'the published version-1 terrain changed');
    assert.equal(rasterDigest(again), rasterDigest(worlds[0].next));
    assert.deepEqual(again.landformRegions, worlds[0].next.landformRegions);
});

test('neighbouring fold chains have staggered summits on the actual continuous surface', () => {
    const w = worlds[0].next;
    let differentUplift = 0;
    for (const r of w.landformRegions.filter(r => r.type === 3)) {
        const tracks = [-1, 0, 1].map(ridge => {
            const samples = [];
            for (let u = -r.rx * .4; u <= r.rx * .4; u += .5) {
                let height = -Infinity;
                for (let v = ridge * r.ridgeSpacing - 2.1; v <= ridge * r.ridgeSpacing + 2.1; v += .1) {
                    const x = r.center.x + u * Math.cos(r.axis) - v * Math.sin(r.axis);
                    const y = r.center.y + u * Math.sin(r.axis) + v * Math.cos(r.axis);
                    height = Math.max(height, surface(w, x, y));
                }
                samples.push({ u, height });
            }
            // Average short raster ripples before locating the mountain's main
            // summit; coincident grid triangles must not count as varied peaks.
            const smooth = samples.map((p, j) => {
                const near = samples.slice(Math.max(0, j - 2), j + 3);
                return { u: p.u, height: near.reduce((sum, q) => sum + q.height, 0) / near.length };
            });
            return { peak: smooth.reduce((a, b) => b.height > a.height ? b : a),
                mean: samples.reduce((sum, p) => sum + p.height, 0) / samples.length };
        });
        const summitPositions = tracks.map(t => t.peak.u), means = tracks.map(t => t.mean);
        assert(Math.max(...summitPositions) - Math.min(...summitPositions) > 4, `${r.name}: neighbouring summit rows are in phase`);
        if (Math.max(...means) - Math.min(...means) > 200) differentUplift++;
    }
    assert(differentUplift > 0, 'all fold chains repeat the same uplift');
});

test('extreme seas and ice retain finite region records without advertising submerged viewpoints', async () => {
    for (const params of [{ sea: 100 }, { temperature: -30, glaciation: 2.5 }]) {
        const w = await E.generateWorld({ ...defaults, ...params, landformVersion: 1 });
        for (const [id, r] of w.landformRegions.entries()) {
            assert.equal(r.id, id);
            assert(r.area > 0);
            assert(Object.values(r.statistics).every(Number.isFinite));
            const feature = w.features.find(f => f.id === `landform-${r.id}`);
            if (r.viewpoint) {
                assert(feature);
                assert.equal(w.landformRegion[feature.i], id);
                assert(w.lake[feature.i] < 0 && w.ice[feature.i] < 80);
            } else {
                assert.equal(feature, undefined, 'a buried geological region is not a visible landscape destination');
                assert.equal(r.statistics.exposedCells, 0);
            }
        }
        for (let i = 0; i < E.GN; i++)
            if (w.landformRegion[i] >= 0)
                assert.equal(w.landformRegions[w.landformRegion[i]]?.type, w.landform[i]);
    }
});
