import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scripts } from '../scripts/manifest.mjs';
import { root, defaults } from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js'))
    .map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
const E = Function(source + '\nreturn {generateWorld,createCivilization,AtlasRenderer,ContinuousCityLayer};')();
let world, sim, realmIds;
test.before(async () => {
    world = await E.generateWorld(defaults);
    sim = E.createCivilization(world, { realms: 18, historySeed: 'First-dawn' });
    realmIds = sim.realms.filter(c => c.alive).slice(0, 3).map(c => c.id);
    assert.equal(realmIds.length, 3, 'the fixture needs a selection and two hover targets');
});

function fixture(focusRealm = realmIds[0]) {
    const calls = { builds: 0, terrainUploads: 0, bufferUpdates: 0 }, r = Object.create(E.AtlasRenderer.prototype);
    let bound;
    const gl = {
        ARRAY_BUFFER: 34962,
        bindBuffer(target, buffer) { assert.equal(target, this.ARRAY_BUFFER); bound = buffer; },
        bufferSubData(target, offset, values) {
            assert.equal(target, this.ARRAY_BUFFER);
            assert.equal(bound, r.meshes.terrain.buffer, 'recolouring must address the existing terrain buffer');
            new Uint8Array(bound.gpu.buffer).set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength), offset);
            calls.bufferUpdates++;
        },
    };
    Object.assign(r, { world, sim, gl, layer: 'realms', relief: 1, zoom: 1, width: 1440, height: 900,
        azimuth: .018, elevation: 1.19, target: [0, 0, 0], focusRealm, hoveredRealm: null,
        selected: sim.provinces[sim.realms[focusRealm].capital].i, meshes: {}, options: {}, request() {},
        upload(name, geometry, shadow = true, unlit = 0, alpha = 1) {
            const vertices = new Float32Array(geometry.data);
            this.meshes[name] = { vertices, count: vertices.length / 9, buffer: { gpu: vertices.slice() }, shadow, unlit, alpha };
            if (name === 'terrain') calls.terrainUploads++;
            this.dirtyShadow = true;
        },
    });
    const layer = new E.ContinuousCityLayer(r);
    Object.assign(layer, { world, sim });
    r.continuousLayer = layer;
    r.ground = (x, y) => layer.ground(x, y);
    const build = layer.buildTerrain;
    layer.buildTerrain = function () { calls.builds++; return build.call(this); };
    r.buildTerrain = () => layer.buildTerrain();
    r.buildTerrain();
    r.dirtyShadow = false;
    return { r, layer, calls };
}

const bytes = values => Buffer.from(values.buffer, values.byteOffset, values.byteLength);
const equalBits = (a, b) => bytes(a).equals(bytes(b));
function assertGeometryUnchanged(actual, before) {
    assert.equal(actual.length, before.length);
    const a = new Uint32Array(actual.buffer, actual.byteOffset, actual.length);
    const b = new Uint32Array(before.buffer, before.byteOffset, before.length);
    for (let i = 0; i < a.length; i += 9)
        for (let channel = 0; channel < 6; channel++)
            if (a[i + channel] !== b[i + channel]) assert.fail(`hover changed position/normal at vertex ${i / 9}, channel ${channel}`);
}
function assertGPUCurrent(r) {
    assert(equalBits(r.meshes.terrain.vertices, r.meshes.terrain.buffer.gpu), 'GPU and CPU terrain buffers must agree');
}

test('Hover enter, switch and leave update the existing terrain buffer without remeshing or shadow work', () => {
    const { r, layer, calls } = fixture(), mesh = r.meshes.terrain, vertices = mesh.vertices, before = vertices.slice();
    // New-world startup binds the city layer after the renderer has uploaded
    // that world's terrain. Binding must preserve its already valid baseline.
    layer.reset(world, sim);
    const selection = { realm: r.focusRealm, cell: r.selected, target: [...r.target] };
    const initialBuilds = calls.builds, initialUploads = calls.terrainUploads;
    let previous = before;
    for (const id of [realmIds[1], realmIds[2], null]) {
        const updates = calls.bufferUpdates;
        r.setHoveredRealm(id);
        assert.equal(r.meshes.terrain, mesh, 'hover must reuse the terrain mesh');
        assert.equal(mesh.vertices, vertices, 'hover must reuse its Float32Array');
        assert.equal(calls.builds, initialBuilds, 'pointer changes must not rebuild terrain geometry');
        assert.equal(calls.terrainUploads, initialUploads, 'pointer changes must not allocate replacement terrain buffers');
        assert(calls.bufferUpdates > updates, 'the changed colours must reach the GPU');
        assertGeometryUnchanged(vertices, before);
        assert(!equalBits(vertices, previous), 'each hovered realm must have its own visible colour preview');
        assert.equal(r.dirtyShadow, false);
        assertGPUCurrent(r);
        previous = vertices.slice();
    }
    assert(equalBits(vertices, before), 'leaving must restore every original Float32 bit, without cumulative blending');
    assert.deepEqual({ realm: r.focusRealm, cell: r.selected, target: r.target }, selection);
});

test('Changing the selected realm may rebuild once and establishes the correct new hover baseline', () => {
    const { r, calls } = fixture(), old = r.meshes.terrain.vertices.slice();
    r.setHoveredRealm(realmIds[1]);
    const beforeChange = calls.builds;
    r.focusRealm = realmIds[1];
    r.setHoveredRealm(null);
    assert.equal(calls.builds, beforeChange + 1, 'selection changes require one new baseline, not a stale restore');
    const selected = r.meshes.terrain.vertices.slice();
    const reference = fixture(realmIds[1]);
    assert(equalBits(selected, reference.r.meshes.terrain.vertices), 'the new baseline must match a fresh render of the selected country');
    assert(!equalBits(selected, old), 'the selected country really changed');
    const mesh = r.meshes.terrain, builds = calls.builds;
    r.dirtyShadow = false;
    r.setHoveredRealm(realmIds[2]);
    r.setHoveredRealm(null);
    assert.equal(r.meshes.terrain, mesh);
    assert.equal(calls.builds, builds, 'later hovering reuses the new baseline');
    assert(equalBits(mesh.vertices, selected));
    assert.equal(r.focusRealm, realmIds[1]);
    assert.equal(r.dirtyShadow, false);
    assertGPUCurrent(r);
});

test('A normal terrain rebuild during hover keeps the preview and still restores unhighlighted colours', () => {
    const { r, calls } = fixture(), baseline = r.meshes.terrain.vertices.slice();
    r.setHoveredRealm(realmIds[1]);
    const preview = r.meshes.terrain.vertices.slice(), oldMesh = r.meshes.terrain, builds = calls.builds;
    r.buildTerrain();
    assert.equal(calls.builds, builds + 1);
    assert.notEqual(r.meshes.terrain, oldMesh, 'this explicitly requested rebuild creates a new mesh');
    assert.equal(r.hoveredRealm, realmIds[1]);
    assert(equalBits(r.meshes.terrain.vertices, preview), 'a normal rebuild preserves the active hover preview');
    assertGeometryUnchanged(r.meshes.terrain.vertices, baseline);
    const rebuilt = r.meshes.terrain;
    r.dirtyShadow = false;
    r.setHoveredRealm(null);
    assert.equal(calls.builds, builds + 1, 'leaving must restore the rebuilt baseline without another remesh');
    assert.equal(r.meshes.terrain, rebuilt);
    assert(equalBits(rebuilt.vertices, baseline), 'the active preview must never be baked into the new baseline');
    assert.equal(r.dirtyShadow, false);
    assertGPUCurrent(r);
});
