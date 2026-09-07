import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = ['src/render/world-renderer.js', 'src/render/river-renderer.js'].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const {Geometry, RiverMesh} = Function(source + '\nreturn {Geometry,RiverMesh};')();
const color = [.2, .4, .6], close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function build(options = {}) {
    const g = new Geometry(), stats = RiverMesh.ribbon(g, {a: [0, 0], b: [2, 0], width: .4, steps: 8, across: 4, sample: () => 0, color, ...options});
    return {g, stats};
}
function vertices(g) { const result = []; for (let i = 0; i < g.data.length; i += 9) result.push(g.data.slice(i, i + 9)); return result; }
function unique(g) { return [...new Map(vertices(g).map(v => [v[0] + ',' + v[2], v])).values()]; }
function triangles(g) { const result = []; for (let i = 0; i < g.data.length; i += 27) result.push([0, 9, 18].map(j => g.data.slice(i + j, i + j + 3))); return result; }
function maxEdge(g) { return Math.max(...triangles(g).flatMap(t => t.map((p, i) => Math.hypot(p[0] - t[(i + 1) % 3][0], p[2] - t[(i + 1) % 3][2])))); }
function centroidError(g, sample, lift) { return Math.max(...triangles(g).map(t => { const p = [0, 1, 2].map(i => (t[0][i] + t[1][i] + t[2][i]) / 3); return Math.abs(p[1] - sample(p[0], p[2]) - lift); })); }

test('river ribbons subdivide along and across the channel and sample each bank height', () => {
    const sample = (x, z) => x * x * .03 + z * z * .8, lift = .0017;
    const {g, stats} = build({sample, lift});
    assert.equal(stats.triangles, 8 * 4 * 2); assert.equal(stats.vertices, g.data.length / 9);
    assert.equal(unique(g).length, 9 * 5); assert.equal(stats.samples, unique(g).length);
    for (const p of vertices(g)) { close(p[1], sample(p[0], p[2]) + lift); assert.deepEqual(p.slice(6), color); }
    const middle = unique(g).filter(p => p[0] === 1);
    assert.equal(middle.length, 5); assert.ok(middle[0][1] > middle.find(p => p[2] === 0)[1], 'bank vertices must not reuse centreline height');
});

test('a larger two-dimensional budget reduces both the longest facet and surface interpolation error', () => {
    const sample = (x, z) => x * x * .04 + z * z * .7, lift = .002;
    const coarse = build({sample, lift, steps: 4, across: 1}).g, fine = build({sample, lift, steps: 32, across: 16}).g;
    assert.ok(maxEdge(fine) < maxEdge(coarse) / 8);
    assert.ok(centroidError(fine, sample, lift) < centroidError(coarse, sample, lift) / 100);
});

test('detail changes preserve the original centreline, endpoints and half width', () => {
    const a = [-2.7, 1.3], b = [1.6, 3.8], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), width = .17;
    for (const [steps, across] of [[4, 2], [32, 16]]) {
        const {g} = build({a, b, width, steps, across}), all = unique(g);
        for (const p of all) { const along = ((p[0] - a[0]) * dx + (p[2] - a[1]) * dz) / length;
            const cross = ((p[2] - a[1]) * dx - (p[0] - a[0]) * dz) / length;
            assert.ok(along >= -1e-10 && along <= length + 1e-10); assert.ok(Math.abs(cross) <= width + 1e-10);
        }
        for (let i = 0; i <= steps; i++) {
            const x = i === steps ? b[0] : a[0] + dx * i / steps, z = i === steps ? b[1] : a[1] + dz * i / steps;
            assert.ok(all.some(p => Math.hypot(p[0] - x, p[2] - z) < 1e-10), 'even transverse subdivisions retain a centreline sample');
        }
        close(Math.max(...all.map(p => Math.abs(((p[2] - a[1]) * dx - (p[0] - a[0]) * dz) / length))), width);
    }
});

test('normals follow the terrain derivative smoothly and every triangle faces upward', () => {
    const sample = (x, z) => x * x * .2 + z * z * .7 + z * .3;
    for (const crossA of [undefined, [0, -.4]]) {
        const {g} = build({sample, crossA, crossB: crossA});
        for (const p of vertices(g)) { const n = [-.4 * p[0], 1, -(1.4 * p[2] + .3)], length = Math.hypot(...n);
            close(Math.hypot(...p.slice(3, 6)), 1); for (let i = 0; i < 3; i++) close(p[i + 3], n[i] / length, 1e-9);
        }
        for (const [a, b, c] of triangles(g)) assert.ok((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0);
    }
});

test('angled segments share exact miter vertices and normals despite different longitudinal budgets', () => {
    const join = [.137, -30.729], cross = [-.073, .109], across = 8, sample = (x, z) => Math.sin(x * 4) * .2 + Math.cos(z * 3) * .07;
    const before = build({a: [-39.628, -32.159], b: join, crossB: cross, steps: 13, across, sample}).g;
    const after = build({a: join, b: [.139, -27.1], crossA: cross, steps: 29, across, sample}).g;
    const av = unique(before), bv = unique(after);
    for (let j = 0; j <= across; j++) {
        const u = j / across * 2 - 1, x = join[0] + cross[0] * u, z = join[1] + cross[1] * u;
        const a = av.find(p => p[0] === x && p[2] === z), b = bv.find(p => p[0] === x && p[2] === z);
        assert.ok(a && b, 'every shared cross-section sample is emitted exactly'); assert.deepEqual(a, b);
    }
});

test('cross-sections interpolate continuously without altering the channel centreline', () => {
    const crossA = [-.1, .2], crossB = [-.3, .5], a = [1, 2], b = [3, 4], steps = 8, across = 4;
    const {g} = build({a, b, crossA, crossB, steps, across});
    const all = unique(g);
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= across; j++) {
        const t = i / steps, u = j / across * 2 - 1, p = [0, 1].map(k => a[k] + (b[k] - a[k]) * t + (crossA[k] + (crossB[k] - crossA[k]) * t) * u);
        assert.ok(all.some(v => Math.hypot(v[0] - p[0], v[2] - p[1]) < 1e-12));
    }
});

test('mesh generation is deterministic, leaves inputs intact and skips zero-size segments', () => {
    const options = {a: Object.freeze([.7, -.9]), b: Object.freeze([.8, -.5]), crossA: Object.freeze([-.04, .01]), crossB: Object.freeze([-.03, .02]), color: Object.freeze(color.slice())};
    assert.deepEqual(build(options).g.data, build(options).g.data);
    for (const invalid of [{a: [0, 0], b: [0, 0]}, {width: 0}, {width: -1}, {a: [NaN, 0]}]) {
        const {g, stats} = build(invalid); assert.equal(g.data.length, 0); assert.equal(stats.triangles, 0);
    }
});
