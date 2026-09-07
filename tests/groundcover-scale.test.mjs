import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const E = Function(source + '\nreturn {AtlasRenderer,AtlasSpace,CityEnvironment,ContinuousCityLayer,Geometry,plantForm,GN};')();
const unit = E.AtlasSpace.TOWN_UNIT, close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-10, `${label}: ${a} != ${b}`);

function fixture(biome) {
    const field = n => new Float64Array(E.GN).fill(n);
    const world = {seed: 47, height: field(100), lake: field(-1), ice: field(0), temp: field(15), arid: field(1), rain: field(100), biome: new Uint8Array(E.GN).fill(biome)};
    const meshes = {}, r = Object.assign(Object.create(E.AtlasRenderer.prototype), {
        world, relief: 1, zoom: 60, width: 1440, height: 900, selected: -1,
        azimuth: -.38, elevation: .76, target: E.AtlasSpace.point(world, 150, 90),
        upload(name, g) { meshes[name] = g; }
    });
    const layer = new E.ContinuousCityLayer(r);
    Object.assign(layer, {world, natural: true});
    // Hold the surveyed plot fixed while the real camera updates pixel density.
    // Flat dry-steppe / marsh fields isolate vegetation from terrain relief.
    layer.viewBox = () => ({x0: 149, x1: 151, y0: 89, y1: 91});
    return {world, r, layer, meshes, ground: E.AtlasSpace.surface(world, 150, 90)};
}
function bounds(data, start = 0, end = data.length) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i += 9) for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], data[i + j]); max[j] = Math.max(max[j], data[i + j]);
    }
    return {min, max, size: max.map((v, i) => v - min[i])};
}
function render(f) {
    const calls = [], original = E.Geometry.prototype.cone;
    E.Geometry.prototype.cone = function (...args) {
        const start = this.data.length;
        original.apply(this, args);
        calls.push({g: this, args, start, end: this.data.length});
    };
    try { f.layer.buildEnvironment(); } finally { E.Geometry.prototype.cone = original; }
    return calls;
}
function ordinaryTreeHeight() {
    const g = new E.Geometry();
    E.plantForm(g, [0, 0, 0], 'broadleaf', E.CityEnvironment.treeHeight('broadleaf', 0) * unit, [.2, .4, .1], () => .5);
    return bounds(g.data).size[1];
}

test('rendered steppe grass grows below ordinary town trees and uses the shared town unit', () => {
    const f = fixture(5), calls = render(f), grass = calls.filter(c => c.g === f.meshes['cm:env:flora'] && c.args[4] === 0);
    assert.ok(grass.length > 20, 'inspect a populated grass mesh from the actual environment builder');
    const treeHeight = ordinaryTreeHeight();
    for (const c of grass) {
        const b = bounds(c.g.data, c.start, c.end);
        close(b.min[1], f.ground, 'grass root meets the terrain');
        assert.ok(b.size[1] >= .91 * unit - 1e-10 && b.size[1] <= 1.56 * unit + 1e-10, 'grass height stays in local art units');
        assert.ok(b.size[0] >= .385 * unit - 1e-10 && b.size[0] <= .66 * unit + 1e-10, 'grass width scales with its height');
        assert.ok(b.size[1] < treeHeight, 'grass must not overtop an ordinary tree');
    }
});

test('marsh reed clumps keep town-scale heights, stems and spacing', () => {
    const f = fixture(18), calls = render(f), reeds = calls.filter(c => c.g === f.meshes['cm:env:reeds']);
    assert.ok(reeds.length > 30 && reeds.length % 3 === 0, 'the real marsh builder emits complete three-stem clumps');
    const treeHeight = ordinaryTreeHeight();
    for (let i = 0; i < reeds.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            const c = reeds[i + k], b = bounds(c.g.data, c.start, c.end);
            close(b.min[1], f.ground, 'reed root meets the terrain');
            close(b.size[1], (k === 1 ? 1.6 : 1.2) * unit, 'reed stem height');
            close(b.size[0], .28 * unit, 'reed stem width');
            assert.ok(b.size[1] < treeHeight, 'reeds must not overtop an ordinary tree');
        }
        const clump = bounds(reeds[i].g.data, reeds[i].start, reeds[i + 2].end);
        close(clump.size[0], 1.08 * unit, 'reed clump width');
        close(clump.size[2], .63 * unit, 'reed clump depth');
    }
});

test('zooming and resizing preserve each planted grass tuft and reed stem in world coordinates', () => {
    for (const biome of [5, 18]) {
        const f = fixture(biome);
        render(f);
        const initial = Object.fromEntries(['cm:env:flora', 'cm:env:reeds'].map(name => [name, f.meshes[name].data.slice()]));
        assert.ok(initial[biome === 5 ? 'cm:env:flora' : 'cm:env:reeds'].length > 0);
        for (const zoom of [60, 240, 620]) for (const [width, height] of [[640, 960], [1440, 900], [2880, 1800]]) {
            Object.assign(f.r, {zoom, width, height});
            render(f);
            close(f.layer.step(), .13, 'near views share the same surveyed planting lattice');
            for (const [name, data] of Object.entries(initial)) assert.deepEqual(f.meshes[name].data, data, `${name} changes physical size at zoom ${zoom}, ${width} × ${height}`);
        }
    }
});
