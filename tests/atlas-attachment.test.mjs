import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scripts } from '../scripts/manifest.mjs';
import { root, fantasyDefaults } from './engine-loader.mjs';

const frames = [];
const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js'))
    .map(f => readFileSync(`${root}/${f}`, 'utf8')).join('\n');
const E = Function('requestAnimationFrame', source + ';return {generateWorld,createCivilization,AtlasRenderer,SoftwareAtlasRenderer,ContinuousCityLayer,AtlasSpace,Geometry};')(callback => frames.push(callback));
// Captured from efbb1fa before changing any renderer source: real default-world
// geometry, with production GPU uploads and production software shading.
const previous = JSON.parse(readFileSync(new URL('./fixtures/atlas-attachment-before.json', import.meta.url)));
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const hash = value => createHash('sha256').update(ArrayBuffer.isView(value) ? bytes(value) : JSON.stringify(value)).digest('hex');
let world, sim;
before(async () => {
    world = await E.generateWorld(fantasyDefaults);
    sim = E.createCivilization(world, { realms: 18, historySeed: 'First-dawn' });
});
function renderer(software = false) {
    const r = Object.create((software ? E.SoftwareAtlasRenderer : E.AtlasRenderer).prototype);
    const uploads = [];
    let bound = null;
    Object.assign(r, {
        software, sim, meshes: {}, relief: 1, layer: 'realms', width: 1440, height: 900,
        zoom: 1, azimuth: .018, elevation: 1.19, target: [0, 0, 0],
        options: { trees: true, rivers: true, roads: true, folk: true, settlements: true, frontiers: true, legends: true },
        focusRealm: 0, request() {},
        gl: {
            ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, FLOAT: 5126,
            createBuffer: () => ({}), createVertexArray: () => ({}), bindVertexArray() {},
            bindBuffer(target, buffer) { assert.equal(target, this.ARRAY_BUFFER); bound = buffer; },
            bufferData(target, data, usage) {
                assert.equal(target, this.ARRAY_BUFFER); assert(bound);
                bound.bytes = typeof data === 'number' ? Buffer.alloc(data) : Buffer.from(bytes(data));
                uploads.push(typeof data === 'number' ? ['allocate', data, usage] : ['data', data.byteLength, usage, hash(bound.bytes)]);
            },
            bufferSubData(target, offset, data) {
                assert.equal(target, this.ARRAY_BUFFER); assert(bound?.bytes);
                const payload = bytes(data);
                assert(offset >= 0 && offset + payload.length <= bound.bytes.length, 'dynamic writes fit the allocated GPU capacity');
                payload.copy(bound.bytes, offset);
                uploads.push(['subdata', offset, payload.length, hash(payload)]);
            },
            enableVertexAttribArray() {}, vertexAttribPointer() {},
            deleteBuffer() {}, deleteVertexArray() {}
        }
    });
    const layer = new E.ContinuousCityLayer(r);
    r.continuousLayer = layer; r.continuousModels = layer.models;
    r.ground = (x, y) => layer.ground(x, y);
    r.buildTerrain = () => layer.buildTerrain();
    r.buildTerrainAsync = yieldFn => layer.buildTerrainAsync(yieldFn);
    layer.bind(world, sim);
    return { r, layer, uploads };
}
function gpuBytesEqual(r) {
    if (r.software) return;
    for (const [name, mesh] of Object.entries(r.meshes)) {
        const uploaded = mesh.buffer?.bytes || Buffer.alloc(0);
        assert(uploaded.length >= mesh.vertices.byteLength, `${name}: GPU capacity covers the current mesh`);
        assert.deepEqual(uploaded.subarray(0, mesh.vertices.byteLength), bytes(mesh.vertices), `${name}: GPU storage contains the current vertex bytes`);
    }
}
function meshesEqual(a, b) {
    assert.deepEqual(Object.keys(a.meshes), Object.keys(b.meshes), 'mesh upload order');
    for (const name of Object.keys(a.meshes)) {
        const x = a.meshes[name], y = b.meshes[name];
        assert.equal(x.count, y.count, name);
        assert.deepEqual(bytes(x.vertices), bytes(y.vertices), `${name} Float32 bytes`);
        if (x.styles) assert.deepEqual(x.styles, y.styles, `${name} software lighting`);
    }
    gpuBytesEqual(a); gpuBytesEqual(b);
}
function frontierScale(r) {
    const groups = new Map(), data = r.meshes.frontierPosts.vertices, unit = E.AtlasSpace.TOWN_UNIT;
    for (let i = 0; i < data.length; i += 9) {
        const [x, y] = E.AtlasSpace.grid(data[i], data[i + 2]), key = `${Math.round(x)},${Math.round(y)}`;
        if (!groups.has(key)) groups.set(key, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
        const b = groups.get(key);
        for (let j = 0; j < 3; j++) { b.min[j] = Math.min(b.min[j], data[i + j]); b.max[j] = Math.max(b.max[j], data[i + j]); }
    }
    assert(groups.size > 0, 'the real world has supported frontier towers');
    for (const [crossing, b] of groups) {
        const size = b.max.map((n, j) => n - b.min[j]), tolerance = 1e-5; // Uploaded Float32 positions.
        for (const axis of [0, 2]) assert(Math.abs(size[axis] - 4.08 * unit) < tolerance, `${crossing}: physical tower footprint`);
        assert(size[1] >= 5.82 * unit - tolerance && size[1] <= 7.82 * unit + tolerance,
            `${crossing}: town-scale tower with at most two units of terrain support`);
    }
}
for (const software of [false, true]) {
    test(`${software ? 'software' : 'GPU'} staged attachment keeps every visible mesh byte and restores nearby traffic`, async () => {
        const baseline = previous[software ? 'software' : 'gpu'];
        const sync = renderer(software), async = renderer(software);
        sync.r.setWorld(world); sync.r.buildCivilization();
        let yields = 0;
        const phases = new Set();
        const yieldFn = async () => { yields++; phases.add(Object.keys(async.r.meshes).join(',')); };
        await async.r.setWorldAsync(world, yieldFn);
        await async.r.buildCivilizationAsync(yieldFn);
        assert(yields > 50, 'initial attachment must yield within terrain and civilization work');
        assert(phases.size >= 15, 'individual overlay uploads must give the browser a chance to respond');
        meshesEqual(sync.r, async.r);
        assert.deepEqual(sync.uploads, async.uploads, 'actual WebGL allocations, writes and payload order');
        frontierScale(async.r);
        for (const [name, expected] of Object.entries(baseline.overview)) {
            if (name === 'caravans') continue; // Previously allocated but invisible at zoom 1.
            // Frontier posts intentionally became physical buildings with dry, supported
            // sites. Their new bytes still match sync attachment above; all other
            // visible meshes retain the original pre-optimization baseline below.
            if (name === 'frontierPosts') continue;
            const mesh = async.r.meshes[name];
            assert.equal(mesh.count, expected.count, `${name}: unchanged pre-optimization count`);
            assert.equal(hash(mesh.vertices), expected.vertices, `${name}: unchanged pre-optimization bytes`);
            if (expected.styles) assert.equal(hash(mesh.styles), expected.styles, `${name}: unchanged pre-optimization lighting`);
        }
        assert(baseline.overview.caravans.count > 0);
        assert.equal(async.r.meshes.caravans.count, 0);
        assert.equal(async.r.visible('caravans'), false);
        assert.equal(async.r.folkStats.travelling, 0);
        if (software) {
            assert.deepEqual(bytes(sync.r.shadowField), bytes(async.r.shadowField));
            assert.equal(hash(async.r.shadowField), baseline.shadow, 'software override still prepares its original shadows');
        }
        const p = sim.provinces.filter(p => p.settled).sort((a, b) => b.urbanPop - a.urbanPop)[0];
        for (const r of [sync.r, async.r]) {
            r.zoom = 20; r.target = E.AtlasSpace.point(world, p.x, p.y); r.buildFolk(0);
            assert.equal(r.meshes.caravans.count, baseline.regional.count);
            assert.equal(hash(r.meshes.caravans.vertices), baseline.regional.caravans, 'entering the town band restores original traffic');
            gpuBytesEqual(r);
            assert.equal(r.visible('caravans'), true);
            r.layer = 'diplomacy'; r.buildFolk(0);
            assert.equal(r.visible('caravans'), true);
            assert.equal(hash(r.meshes.caravans.vertices), baseline.regional.caravans);
            r.layer = 'height'; assert.equal(r.visible('caravans'), false);
            r.layer = 'realms'; r.zoom = 1; r.buildFolk(0);
            assert.equal(r.meshes.caravans.count, 0, 'returning home clears the old town figures');
            r.zoom = 20; r.buildFolk(0);
            assert.equal(hash(r.meshes.caravans.vertices), baseline.regional.caravans, 're-entry is deterministic');
            r.options.folk = false; r.buildFolk(0);
            assert.equal(r.meshes.caravans.count, 0);
            r.options.folk = true; r.buildFolk(0);
            assert.equal(hash(r.meshes.caravans.vertices), baseline.regional.caravans);
            gpuBytesEqual(r);
        }
        // Reattaching the same seed clears meshes but must not let the roads cache
        // skip their replacement, even if an earlier asynchronous attempt stopped.
        const oldRoads = hash(async.r.meshes.roads.vertices);
        async.r.zoom = 1;
        await async.r.setWorldAsync(world, yieldFn);
        await async.r.buildCivilizationAsync(yieldFn);
        assert.equal(hash(async.r.meshes.roads.vertices), oldRoads);
        gpuBytesEqual(async.r);
    });
}

test('coarse terrain never evaluates a detailed position that it discards', () => {
    const { r, layer } = renderer(); r.world = world;
    let samples = 0;
    const point = E.AtlasSpace.point;
    E.AtlasSpace.point = (...args) => { samples++; return point(...args); };
    try { layer.buildTerrain(); } finally { E.AtlasSpace.point = point; }
    assert.equal(samples, 0);
    assert.equal(hash(r.meshes.terrain.vertices), previous.gpu.overview.terrain.vertices);
});

test('suspended attachment does not paint partial frames and final request resumes drawing', () => {
    const r = Object.create(E.AtlasRenderer.prototype); let renders = 0;
    Object.assign(r, { pending: false, suspendDrawing: true, render() { renders++; } });
    r.request(); r.request();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(renders, 0); assert.equal(r.pending, false);
    r.suspendDrawing = false; r.request(); frames.shift()();
    assert.equal(renders, 1);
});

test('asynchronous stage failures reject and a new attachment can recover', async () => {
    const r = Object.create(E.AtlasRenderer.prototype), events = [];
    Object.assign(r, {
        clear() { events.push('clear'); }, prepareTerritory() {}, request() {},
        buildTerrain() { events.push('terrain'); }, buildSymbols() { throw new Error('test upload failure'); },
        buildLines() { events.push('lines'); }, buildIce() { events.push('ice'); }, buildLegends() { events.push('legends'); }
    });
    await assert.rejects(r.setWorldAsync(world, async () => {}), /test upload failure/);
    assert.deepEqual(events, ['clear', 'terrain']);
    r.buildSymbols = () => events.push('symbols');
    await r.setWorldAsync(world, async () => {});
    assert.deepEqual(events.slice(2), ['clear', 'terrain', 'symbols', 'lines', 'ice', 'legends']);
});
