import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, root } from './engine-loader.mjs';

const E = loadEngine();
const softwareSource = ['src/world/geography.js', 'src/render/world-renderer.js', 'src/render/depth-rasterizer.js']
    .map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
const S = new Function('document', softwareSource + '\nreturn {SoftwareAtlasRenderer, installDepthRasterizer};')({
    createElement: () => ({getContext: () => ({})})
});

// Exercise the real upload methods with byte-addressable GPU storage. VAO
// bindings are recorded too: keeping a buffer is useful only if drawing still
// reads the current allocation through the original vertex layout.
function fakeGL() {
    let bound = null, vao = null;
    const calls = [];
    return {
        calls, ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, FLOAT: 5126,
        createBuffer() { const buffer = {}; calls.push(['createBuffer', buffer]); return buffer; },
        createVertexArray() { const value = {attributes: []}; calls.push(['createVertexArray', value]); return value; },
        deleteBuffer(buffer) { calls.push(['deleteBuffer', buffer]); },
        deleteVertexArray(value) { calls.push(['deleteVertexArray', value]); },
        bindBuffer(target, buffer) { assert.equal(target, this.ARRAY_BUFFER); bound = buffer; calls.push(['bindBuffer', buffer]); },
        bindVertexArray(value) { vao = value; calls.push(['bindVertexArray', value]); },
        bufferData(target, data, usage) {
            assert.equal(target, this.ARRAY_BUFFER); assert(bound);
            bound.bytes = typeof data === 'number' ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
            calls.push(['bufferData', data, usage]);
        },
        bufferSubData(target, offset, data) {
            assert.equal(target, this.ARRAY_BUFFER); assert(bound);
            bound.bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
            calls.push(['bufferSubData', offset, data]);
        },
        enableVertexAttribArray(index) { assert(vao); calls.push(['enableVertexAttribArray', index]); },
        vertexAttribPointer(index, size, type, normalized, stride, offset) {
            assert(vao); vao.attributes[index] = {buffer: bound, size, type, normalized, stride, offset};
            calls.push(['vertexAttribPointer', index]);
        }
    };
}
function renderer() { return Object.assign(Object.create(E.AtlasRenderer.prototype), {gl: fakeGL(), meshes: {}, dirtyShadow: false}); }
const calls = (r, name) => r.gl.calls.filter(call => call[0] === name);
function triangle(count = 1, offset = 0) {
    const g = new E.Geometry();
    for (let i = 0; i < count; i++) g.tri([offset + i, 0, 0], [offset + i + 1, 0, 0], [offset + i, 0, 1], [.2, .4, .6]);
    return new Float32Array(g.data);
}
function currentBytes(mesh) {
    assert.deepEqual(mesh.buffer.bytes.subarray(0, mesh.vertices.byteLength), new Uint8Array(mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength));
    assert.equal(mesh.count, mesh.vertices.length / 9);
}

test('dynamic uploads retain GPU bindings, grow only as needed, and export only current vertices', () => {
    const r = renderer(), first = triangle(2);
    r.upload('folk', {data: first}, false, .1, .8, true);
    const {buffer, vao} = r.meshes.folk;
    assert.equal(r.meshes.folk.vertices, first);
    assert.equal(calls(r, 'bufferData')[0][2], r.gl.DYNAMIC_DRAW);
    for (const [index, attr] of vao.attributes.entries()) {
        assert.deepEqual(attr, {buffer, size: 3, type: r.gl.FLOAT, normalized: false, stride: 36, offset: index * 12});
    }
    const grown = triangle(3, 10);
    r.upload('folk', {data: grown}, false, .2, .7, true);
    assert.equal(r.meshes.folk.buffer, buffer); assert.equal(r.meshes.folk.vao, vao);
    assert(buffer.bytes.length >= grown.byteLength && buffer.bytes.length <= grown.byteLength * 2);
    currentBytes(r.meshes.folk);
    // A transferred subarray must not include bytes outside its current view.
    const backing = triangle(4, 30), current = backing.subarray(27, 54), capacity = buffer.bytes.length;
    r.upload('folk', {data: current}, false, .3, .6, true);
    assert.equal(buffer.bytes.length, capacity); currentBytes(r.meshes.folk);
    assert.equal(r.meshes.folk.vertices, current);
    assert.equal(r.meshes.folk.unlit, .3); assert.equal(r.meshes.folk.alpha, .6);
    assert.equal(calls(r, 'createBuffer').length, 1); assert.equal(calls(r, 'createVertexArray').length, 1);
    assert.equal(calls(r, 'bufferData').length, 2); assert.equal(calls(r, 'bufferSubData').length, 3);
    assert.equal(calls(r, 'vertexAttribPointer').length, 3); assert.equal(calls(r, 'deleteBuffer').length, 0);
    assert.deepEqual(E.exportGeometryGLB(r.meshes), E.exportGeometryGLB({folk: {vertices: current}}));
});

test('empty dynamic bands do no GPU work and returning figures reuse the dormant allocation', () => {
    const r = renderer(), empty = {data: []};
    r.upload('folk', empty, false, .1, 1, true);
    r.upload('folk', empty, false, .1, 1, true);
    assert.equal(r.gl.calls.length, 0); assert.equal(r.meshes.folk.count, 0);
    assert.equal(r.meshes.folk.vertices.length, 0);
    r.upload('folk', {data: triangle()}, false, .1, 1, true);
    const {buffer, vao} = r.meshes.folk, beforeEmpty = r.gl.calls.length;
    r.upload('folk', empty, false, .1, 1, true);
    r.upload('folk', empty, false, .1, 1, true);
    assert.equal(r.gl.calls.length, beforeEmpty); assert.equal(r.meshes.folk.count, 0);
    assert.deepEqual(E.exportGeometryGLB(r.meshes), E.exportGeometryGLB({}));
    r.upload('folk', {data: triangle(1, 5)}, false, .1, 1, true);
    assert.equal(r.meshes.folk.buffer, buffer); assert.equal(r.meshes.folk.vao, vao);
    assert.equal(calls(r, 'bufferData').length, 1); currentBytes(r.meshes.folk);
    r.clear(); assert.equal(calls(r, 'deleteBuffer').length, 1); assert.equal(calls(r, 'deleteVertexArray').length, 1);
});

test('static uploads keep their exact payload and safely replace or become dynamic meshes', () => {
    const r = renderer(), data = triangle();
    r.upload('mesh', {data}); const first = r.meshes.mesh;
    r.upload('mesh', {data});
    assert.notEqual(r.meshes.mesh.buffer, first.buffer); assert.notEqual(r.meshes.mesh.vao, first.vao);
    assert(calls(r, 'bufferData').every(call => call[1] === data && call[2] === r.gl.STATIC_DRAW));
    assert.equal(calls(r, 'bufferSubData').length, 0); currentBytes(r.meshes.mesh);
    r.upload('mesh', {data}, false, 0, 1, true); currentBytes(r.meshes.mesh);
    assert.equal(calls(r, 'deleteBuffer').length, 2);
    r.upload('mesh', {data}); currentBytes(r.meshes.mesh);
    assert.equal(calls(r, 'deleteBuffer').length, 3);
    assert.equal(r.meshes.mesh.dynamic, undefined);
});

for (const [kind, make] of [
    ['WebGL static', () => renderer()],
    ['WebGL dynamic', () => { const r = renderer(); r.upload = (name, geometry, shadow) => E.AtlasRenderer.prototype.upload.call(r, name, geometry, shadow, 0, 1, true); return r; }],
    ['software painter', () => Object.assign(Object.create(S.SoftwareAtlasRenderer.prototype), {meshes: {}, dirtyShadow: false})],
    ['software depth', () => S.installDepthRasterizer({software: true, meshes: {}, dirtyShadow: false})]
]) test(`${kind} invalidates shadows only when a new or previous mesh casts them`, () => {
    const r = make(), geometry = {data: triangle()};
    r.upload('mesh', geometry, false); assert.equal(r.dirtyShadow, false);
    r.dirtyShadow = true; r.upload('mesh', geometry, false); assert.equal(r.dirtyShadow, true);
    r.dirtyShadow = false; r.upload('mesh', geometry, true); assert.equal(r.dirtyShadow, true);
    r.dirtyShadow = false; r.upload('mesh', {data: []}, false); assert.equal(r.dirtyShadow, true);
    assert.equal(r.meshes.mesh.count, 0); assert.equal(r.meshes.mesh.vertices.length, 0);
    r.dirtyShadow = false; r.upload('mesh', geometry, false); assert.equal(r.dirtyShadow, false);
    assert.deepEqual(r.meshes.mesh.vertices, geometry.data);
    if (kind === 'software painter') {
        const before = r.meshes.mesh.styles.slice();
        r.upload('mesh', geometry, false, 0, 1, true);
        assert.deepEqual(r.meshes.mesh.styles, before); assert.equal(before.length, 1);
    }
});

test('actual animated folk and caravan geometry and clocks match static uploads through zoom bands', () => {
    function travellerRenderer(dynamic) {
        const r = renderer();
        Object.assign(r, {world: {}, sim: {}, options: {folk: true}, width: 1280, height: 800, zoom: 20,
            elevation: 1.19, azimuth: .018, target: [0, 0, 0], selected: -1, ground: () => 0,
            roadNetwork: {signature: 'fixed'}, folkTravellerKey: 'fixed',
            folkTravellers: [{id: 'boat', scope: 'sea', kind: 'boat', speed: .1, phase: .1, tone: .5,
                road: {path: [89 * E.GW + 148, 90 * E.GW + 150]}}]});
        if (!dynamic) r.upload = (name, geometry, shadow, unlit, alpha) => E.AtlasRenderer.prototype.upload.call(r, name, geometry, shadow, unlit, alpha);
        return r;
    }
    const fast = travellerRenderer(true), reference = travellerRenderer(false);
    let previous = null;
    for (const [zoom, clock] of [[20, 0], [20, 1], [80, 1], [80, 2], [1, 2], [20, 3]]) {
        fast.zoom = reference.zoom = zoom;
        fast.buildFolk(clock); reference.buildFolk(clock);
        assert.deepEqual(fast.folkStats, reference.folkStats); assert.equal(fast.folkClock, clock);
        assert.equal(fast.dirtyShadow, false);
        for (const name of ['folk', 'caravans']) {
            assert.deepEqual(fast.meshes[name].vertices, reference.meshes[name].vertices);
            assert.equal(fast.meshes[name].count, reference.meshes[name].count);
            if (fast.meshes[name].count) currentBytes(fast.meshes[name]);
        }
        assert.deepEqual(E.exportGeometryGLB(fast.meshes), E.exportGeometryGLB(reference.meshes));
        if (zoom > 1) assert.equal(fast.folkStats.travelling, 1);
        if (zoom === 20 && clock === 0) previous = fast.meshes.caravans.vertices;
        if (zoom === 20 && clock === 1) assert.notDeepEqual(fast.meshes.caravans.vertices, previous, 'the clock still moves the boat');
    }
    assert.equal(calls(fast, 'createBuffer').length, 2); assert.equal(calls(fast, 'createVertexArray').length, 2);
    assert.equal(calls(fast, 'bufferData').length, 2); assert.equal(calls(fast, 'deleteBuffer').length, 0);
    assert(calls(reference, 'createBuffer').length > calls(fast, 'createBuffer').length);
});
