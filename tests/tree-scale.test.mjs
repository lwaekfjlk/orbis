import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
let capture = null;
const browser = {};
function bounds(data, start = 0) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < data.length; i += 9) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], data[i + k]); hi[k] = Math.max(hi[k], data[i + k]); }
    return {lo, hi, height: hi[1] - lo[1], crown: Math.max(hi[0] - lo[0], hi[2] - lo[2])};
}
// Observe the real geometry emitted at all three production call sites. The
// wrapper neither replaces plantForm nor consumes an additional random value.
const E = Function('observe', 'window', source + `
const originalPlantForm = plantForm;
plantForm = function(g, p, form, unit, color, jitter, coarse) {
    const start = g.data.length;
    originalPlantForm(g, p, form, unit, color, jitter, coarse);
    observe(g.data, start, p, form, unit, !!coarse);
};
return {Geometry, plantForm, CityEnvironment, AtlasSpace, AtlasRenderer,
    ContinuousCityLayer, generateWorld, createCivilization,
    physicalFingerprint, settlementFingerprint, politicalFingerprint};
`)((data, start, p, form, unit, coarse) => {
    if (capture && data.length > start) capture.push({origin: p.slice(), form, unit, coarse, triangles: (data.length - start) / 27, ...bounds(data, start)});
}, browser);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-10, `${message}: ${a} != ${b}`);
const color = [.2, .5, .3];
function shape(form, unit = 1, coarse = false) {
    const g = new E.Geometry(); E.plantForm(g, [0, 0, 0], form, unit, color, () => .5, coarse);
    return {...bounds(g.data), triangles: g.data.length / 27};
}
const baseline = [
    {id: 299, name: 'Avalfergalhaven'},
    {id: 127, name: 'Nidaveiknes'}
];
// Compare the height refactor with its original inline formula under the SAME
// street plan. Legitimate civic layout changes must not require new magic hashes.
const heightCall='CityEnvironment.treeHeight(kind,rng())';
assert.equal(source.split(heightCall).length,2,'locate the production tree-height draw');
const inlineSource=source.replace(heightCall,"(2 + rng() * 2.1) * (kind === 'cushion' ? .30 : kind === 'scrub' ? .55 : kind === 'rainforest' ? 1.35 : kind === 'acacia' || kind === 'palm' ? 1.12 : 1)");
const inlineCity=Function('window',inlineSource+'\nreturn generateCity;')(browser);
let world, sim, originalState;
const rows = [];
function state() {
    const typed = createHash('sha256');
    for (const key of Object.keys(world).sort()) if (ArrayBuffer.isView(world[key])) {
        const a = world[key]; typed.update(key).update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    }
    return [typed.digest('hex'), E.physicalFingerprint(world), E.settlementFingerprint(sim), E.politicalFingerprint(sim), JSON.stringify(sim)];
}
function rendererAt(p) {
    const uploads = {}, r = Object.assign(Object.create(E.AtlasRenderer.prototype), {
        world, relief: 1, layer: 'relief', zoom: 60, width: 1440, height: 900,
        azimuth: -.38, elevation: .76, target: E.AtlasSpace.point(world, p.x, p.y), selected: -1,
        options: {trees: true}, meshes: {}, upload(name, g) { uploads[name] = {triangles: g.data.length / 27}; }
    });
    const layer = new E.ContinuousCityLayer(r); Object.assign(layer, {world, sim, natural: true});
    return {r, layer, uploads};
}
test.before(async () => {
    world = await E.generateWorld(defaults);
    sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
    Object.assign(browser, {world, sim});
    originalState = state();
    // Build two towns only: a tropical broad canopy and a cooler conifer belt.
    for (const expected of baseline) {
        const p = sim.provinces[expected.id]; assert.equal(p.name, expected.name);
        const fixture = rendererAt(p); capture = [];
        const model = fixture.layer.build(p), calls = capture; capture = null;
        const town = calls.slice(0, model.city.trees.length), outskirts = calls.slice(model.city.trees.length);
        rows.push({...fixture, expected, p, model, town, outskirts});
    }
});

test('town units agree with actual survey frames and preserve authored tropical and conifer tree ranges', () => {
    close(E.AtlasSpace.TOWN_UNIT, .00853842638633554, 'one authored town unit');
    for (const {model, town} of rows) {
        close(model.frame.scale, E.AtlasSpace.TOWN_UNIT, model.p.name + ' frame scale');
        assert.ok(town.length > 250);
        for (let i = 0; i < town.length; i++) {
            const t = model.city.trees[i], mesh = town[i];
            assert.equal(mesh.form, t.kind); assert.equal(mesh.unit, t.h); assert.equal(mesh.coarse, false);
            assert.deepEqual(mesh.origin, [t.x, t.y, t.z]);
            assert.ok(t.h >= E.CityEnvironment.treeHeight(t.kind, 0));
            assert.ok(t.h <= E.CityEnvironment.treeHeight(t.kind, 1));
        }
    }
    assert.ok(rows[0].town.some(t => t.form === 'rainforest'));
    assert.ok(rows[1].town.some(t => t.form === 'conifer'));
});

test('full and coarse tree meshes share physical height and crown envelopes in every vegetation form', () => {
    for (const form of ['cushion', 'scrub', 'acacia', 'palm', 'mangrove', 'laurel', 'hardleaf', 'rainforest', 'conifer', 'pine', 'broadleaf']) {
        for (const variation of [0, .5, 1]) {
            const local = E.CityEnvironment.treeHeight(form, variation), full = shape(form, local), atlas = shape(form, local * E.AtlasSpace.TOWN_UNIT), coarse = shape(form, local * E.AtlasSpace.TOWN_UNIT, true);
            assert.ok(full.triangles > 0 && coarse.triangles > 0);
            close(atlas.height, full.height * E.AtlasSpace.TOWN_UNIT, form + ' exact height scaling');
            close(atlas.crown, full.crown * E.AtlasSpace.TOWN_UNIT, form + ' exact crown scaling');
            // Simplification may change the silhouette, but must not turn small
            // alpine cushions into tall cones or surrounding trees into giants.
            assert.ok(coarse.height >= atlas.height * .65 && coarse.height <= atlas.height * 1.5, form + ' coarse height changed specimen size');
            assert.ok(coarse.crown >= atlas.crown * .6 && coarse.crown <= atlas.crown * 1.5, form + ' coarse crown changed specimen size');
        }
    }
    assert.equal(E.CityEnvironment.treeHeight('none', .5), 0);
    for (const coarse of [false, true]) {
        assert.equal(shape('none', 3, coarse).triangles, 0, 'treeless terrain must not fall through to a broadleaf');
        for (const unit of [0, -1]) assert.equal(shape('conifer', unit, coarse).triangles, 0, 'nonpositive specimen height must not emit geometry');
    }
});

function assertWorldSpecimen(tree, scale, label) {
    const lo = E.CityEnvironment.treeHeight(tree.form, 0) * scale, hi = E.CityEnvironment.treeHeight(tree.form, 1) * scale;
    assert.ok(tree.unit >= lo - 1e-12 && tree.unit <= hi + 1e-12, label + ': ' + tree.form + ' uses map-symbol height');
    const reference = shape(tree.form, 1, tree.coarse);
    close(tree.height, reference.height * tree.unit, label + ': emitted height');
    // Rotation affects a low-sided crown's axis-aligned bounds, not its scale.
    assert.ok(tree.crown >= reference.crown * tree.unit * .75 && tree.crown <= reference.crown * tree.unit * 1.25, label + ': emitted crown');
}
test('actual loaded-town surroundings emit full trees at the same scale as the city collector', () => {
    for (const {p, model, outskirts, uploads} of rows) {
        assert.ok(outskirts.length > 100, p.name + ' must exercise the actual peripheral planting loop');
        assert.equal(uploads[`cm:${p.id}:vegetation`].triangles, outskirts.reduce((sum, t) => sum + t.triangles, 0));
        for (const tree of outskirts) {
            assert.equal(tree.coarse, false); assertWorldSpecimen(tree, model.frame.scale, p.name);
        }
    }
});

test('actual unloaded landscape scatter uses the same tree scale through zoom and resize', () => {
    for (const {p, model} of rows) {
        const {r, layer, uploads} = rendererAt(p);
        // Hold one surveyed plot still so all camera configurations observe the
        // same specimens; the production step may otherwise choose other trees.
        layer.viewBox = () => ({x0: p.x - 2, x1: p.x + 2, y0: p.y - 2, y1: p.y + 2});
        layer.step = () => .25;
        let original;
        for (const zoom of [16, 60, 240, 620]) for (const [width, height] of [[1440, 900], [2880, 1800]]) {
            Object.assign(r, {zoom, width, height}); capture = [];
            layer.buildEnvironment(); const trees = capture; capture = null;
            assert.ok(trees.length > 20, p.name + ' plot must contain real scatter geometry');
            assert.ok(uploads['cm:env:flora'].triangles >= trees.reduce((sum, t) => sum + t.triangles, 0));
            for (const tree of trees) { assert.equal(tree.coarse, true); assertWorldSpecimen(tree, model.frame.scale, p.name); }
            if (original) assert.deepEqual(trees, original, p.name + ' world dimensions changed with the camera'); else original = trees;
        }
    }
});

test('extracting tree height preserves the original random draws and the following city layout', () => {
    for (const {model: {city}, expected} of rows) {
        const original=inlineCity(world,sim,expected.id),layout=c=>({buildings:c.buildings,roads:c.roads,farms:c.farms,districts:c.districts,piers:c.piers});
        assert.equal(city.fingerprint, original.fingerprint, expected.name + ' layout fingerprint');
        assert.equal(hash(city.trees), hash(original.trees), expected.name + ' changed tree RNG order or positions');
        assert.equal(hash(layout(city)), hash(layout(original)), expected.name + ' changed the post-tree random sequence');
    }
});

test('tree meshes and their camera changes leave the physical world and civilization unchanged', () => {
    assert.deepEqual(state(), originalState);
});
