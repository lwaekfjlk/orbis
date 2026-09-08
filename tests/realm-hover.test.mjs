import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-loader.mjs';

const E = loadEngine();

function fixture(layer = 'realms') {
    // Two realms with separate provinces, plus lake, ocean, ice and unclaimed
    // land. Province ownership is authoritative; realm province lists may lag it.
    const world = {
        height: [100, 300, 200, 900, 100, -200, 600, 450, 1400, 300, 800],
        lake: [-1, -1, -1, -1, 150, -1, -1, -1, -1, -1, -1],
        ice: [0, 0, 0, 0, 0, 0, 0, 0, 180, 0, 0],
        provinceId: [0, 0, 1, 1, 2, 2, 3, -1, 2, 4, 4],
        biome: Array(11).fill(7), temp: Array(11).fill(14), arid: Array(11).fill(.9), seaIce: Array(11).fill(0),
    };
    const people = E.PEOPLES.map((_, i) => i === 0 ? .8 : .2 / (E.PEOPLES.length - 1));
    const faith = E.FAITHS.map((_, i) => i === 1 ? .7 : .3 / (E.FAITHS.length - 1));
    const province = (id, owner, cells) => ({ id, owner, cells, people: [...people], faith: [...faith], dev: 1.3, mana: .6 });
    const sim = {
        provinces: [province(0, 0, [0, 1]), province(1, 1, [2, 3]), province(2, 1, [4, 5, 8]), province(3, -1, [6]), province(4, 0, [9, 10])],
        realms: [
            { id: 0, alive: true, color: '#4488bb', provinces: [0, 4], capital: 0, arcana: 1 },
            { id: 1, alive: true, color: '#d06a44', provinces: [1, 2], capital: 1, arcana: .8 },
        ],
    };
    const calls = { terrain: 0, outlines: 0, requests: 0 };
    const r = Object.create(E.AtlasRenderer.prototype);
    Object.assign(r, { world, sim, layer, relief: 1, hoveredRealm: null, focusRealm: 0, selected: 1,
        target: [2, 0, 3], zoom: 1, options: {}, meshes: {},
        buildTerrain() { calls.terrain++; }, buildRealmHover() { calls.outlines++; }, request() { calls.requests++; },
        clear() {}, buildCivilization() {}, buildSymbols() {}, buildLines() {}, buildIce() {}, buildLegends() {},
    });
    return { r, world, sim, calls };
}
const colors = r => r.world.height.map((_, i) => r.palette(i));
function physicalColors(r) {
    const previous = r.layer;
    r.layer = 'relief';
    const result = colors(r);
    r.layer = previous;
    return result;
}

test('Realm hover previews its whole dry territory and leaving restores the selected realm', () => {
    for (const layer of ['realms', 'diplomacy']) {
        const { r, sim } = fixture(layer), before = colors(r), terrain = physicalColors(r);
        const selection = { realm: r.focusRealm, cell: r.selected, target: [...r.target], zoom: r.zoom };
        const society = JSON.stringify(sim);
        assert.notDeepEqual(before[0], terrain[0], 'the selected realm starts with its usual faint wash');
        r.setHoveredRealm(1);
        assert.equal(r.hoveredRealm, 1);
        for (const i of [2, 3, 8]) assert.notDeepEqual(r.palette(i), terrain[i], `${layer}: every hovered province cell, including glaciers, should light up`);
        for (const i of [0, 1, 9, 10]) assert.deepEqual(r.palette(i), terrain[i], `${layer}: hover temporarily replaces the selected wash`);
        for (const i of [4, 5, 6, 7]) assert.deepEqual(r.palette(i), before[i], `${layer}: water and unclaimed land must remain unchanged`);
        assert.deepEqual({ realm: r.focusRealm, cell: r.selected, target: r.target, zoom: r.zoom }, selection);
        assert.equal(JSON.stringify(sim), society, 'hovering must not edit simulation or ownership');
        r.setHoveredRealm(null);
        assert.equal(r.hoveredRealm, null);
        assert.deepEqual(colors(r), before, 'leaving exactly restores the original country selection');
    }
});

test('Hover follows current province ownership, including land absent from cached realm holdings', () => {
    const { r, sim } = fixture(), terrain = physicalColors(r);
    r.setHoveredRealm(1);
    assert.deepEqual(r.palette(9), terrain[9]);
    // Simulate a transfer while deliberately keeping each realm's aggregate list
    // unchanged, as can happen between the simulation and its aggregation pass.
    sim.provinces[4].owner = 1;
    for (const i of [9, 10]) assert.notDeepEqual(r.palette(i), terrain[i], `new territory ${i} should belong to the hovered realm`);
    sim.provinces[1].owner = 0;
    for (const i of [2, 3]) assert.deepEqual(r.palette(i), terrain[i], `lost territory ${i} must stop highlighting`);
    r.setHoveredRealm(null);
    for (const i of [2, 3]) assert.notDeepEqual(r.palette(i), terrain[i], 'leaving restores the selected realm with its current holdings');
    for (const i of [9, 10]) assert.deepEqual(r.palette(i), terrain[i]);
});

test('Hover overlays measurement colours and restores each layer exactly on leaving', () => {
    for (const layer of ['faiths', 'peoples', 'wealth', 'magic']) {
        const { r } = fixture(layer), before = colors(r);
        r.setHoveredRealm(1);
        for (const i of [2, 3, 8]) assert.notDeepEqual(r.palette(i), before[i], `${layer}: hovered land must be visibly identified`);
        for (const i of [0, 1, 4, 5, 6, 7, 9, 10]) assert.deepEqual(r.palette(i), before[i], `${layer}: unrelated measurements must not change`);
        r.setHoveredRealm(null);
        assert.deepEqual(colors(r), before, `${layer}: leaving restores all original measurements`);
    }
});

test('Hover changes rebuild terrain once; repeats and invalid realms do not leave stale highlights', () => {
    const { r, sim, calls } = fixture();
    r.setHoveredRealm(1);
    assert.equal(calls.terrain, 1);
    assert.equal(calls.outlines, 1);
    assert.equal(calls.requests, 1);
    r.setHoveredRealm(1);
    assert.equal(calls.terrain, 1, 'repeated pointer events do not remesh the world');
    assert.equal(calls.outlines, 1, 'repeated pointer events do not rebuild the outline');
    assert.equal(calls.requests, 1);
    sim.realms[1].alive = false;
    r.setHoveredRealm(1);
    assert.equal(r.hoveredRealm, null, 'a realm that died must not retain its hover');
    assert.equal(calls.terrain, 2);
    assert.equal(calls.requests, 2);
    r.setHoveredRealm(999);
    r.setHoveredRealm(null);
    assert.equal(r.hoveredRealm, null);
    assert.equal(calls.terrain, 2, 'invalid realms and already-cleared hover are no-ops');
    assert.equal(calls.requests, 2);
});

test('Replacing the world, civilization or map layer clears transient hover', () => {
    for (const change of ['world', 'civilization', 'layer']) {
        const { r, calls } = fixture();
        r.setHoveredRealm(1);
        const terrainBuilds = calls.terrain;
        if (change === 'world') r.setWorld(fixture().world);
        if (change === 'civilization') r.setCivilization(fixture().sim);
        if (change === 'layer') r.setLayer('faiths');
        assert.equal(r.hoveredRealm, null, `${change} must discard a hover tied to old labels`);
        assert(calls.terrain > terrainBuilds, `${change} must render the cleared state`);
        assert.equal(r.focusRealm, 0, 'transient hover cleanup must preserve country selection');
    }
});

test('The hover outline follows external land and lake shores without internal province seams', () => {
    const { r } = fixture();
    const index = (x, y) => y * E.GW + x;
    r.world = { height: new Float32Array(E.GN).fill(-10), lake: new Float32Array(E.GN).fill(-1),
        provinceId: new Int32Array(E.GN).fill(1) };
    r.sim = { realms: [{ id: 0, alive: true }, { id: 1, alive: true }],
        provinces: [{ owner: 1 }, { owner: 1 }, { owner: 0 }] };
    // An eight-cell ring split into adjacent provinces surrounds a lake. A
    // foreign dry cell borders the east shore; all other surroundings are sea.
    for (let y = 10; y <= 12; y++) for (let x = 10; x <= 12; x++) {
        r.world.height[index(x, y)] = 100;
        r.world.provinceId[index(x, y)] = x === 10 ? 0 : 1;
    }
    r.world.lake[index(11, 11)] = 150;
    r.world.height[index(13, 11)] = 100;
    r.world.provinceId[index(13, 11)] = 2;
    r.buildRealmHover = E.AtlasRenderer.prototype.buildRealmHover;
    r.coord = (x, y, h) => [x, h, y];
    r.ground = () => 2;
    r.dirtyShadow = false;
    r.selectionKey = 'existing point selection';
    let uploaded;
    r.upload = (name, geometry, shadow, unlit) => {
        uploaded = { name, geometry, shadow, unlit };
        r.dirtyShadow = true; // Match the real uploader's invalidation side effect.
    };
    const selection = { realm: r.focusRealm, cell: r.selected, key: r.selectionKey, target: [...r.target] };
    r.setHoveredRealm(1);
    assert.equal(uploaded.name, 'realmHover');
    assert.equal(uploaded.shadow, false, 'a hover outline must not cast a terrain shadow');
    assert.equal(r.dirtyShadow, false, 'the preview does not invalidate the existing shadow map');
    const data = uploaded.geometry.data;
    assert(data.every(Number.isFinite));
    // Each edge has a casing and a light stroke, each a pair of triangles.
    assert.equal(data.length / 27, 16 * 4, 'only twelve exterior and four lake-shore edges should be drawn');
    const centres = new Set();
    for (let offset = 0; offset < data.length; offset += 54) {
        const x = [], z = [];
        for (let v = offset; v < offset + 54; v += 9) { x.push(data[v]); z.push(data[v + 2]); }
        centres.add(`${(Math.min(...x) + Math.max(...x)) / 2},${(Math.min(...z) + Math.max(...z)) / 2}`);
    }
    const expected = new Set(['11,10.5', '11,11.5', '10.5,11', '11.5,11']);
    for (const value of [10, 11, 12]) {
        expected.add(`${value},9.5`); expected.add(`${value},12.5`);
        expected.add(`9.5,${value}`); expected.add(`12.5,${value}`);
    }
    assert.deepEqual(centres, expected, 'the mesh outlines the union of provinces, including the lake hole');
    for (const layer of ['realms', 'diplomacy', 'faiths', 'peoples', 'wealth', 'magic']) {
        r.layer = layer;
        assert.equal(r.visible('realmHover'), true, layer);
    }
    r.layer = 'relief';
    assert.equal(r.visible('realmHover'), false, 'nonpolitical maps do not show the outline');
    r.layer = 'realms';
    r.setHoveredRealm(null);
    assert.equal(r.visible('realmHover'), false, 'leaving hides even the already-uploaded mesh');
    assert.deepEqual({ realm: r.focusRealm, cell: r.selected, key: r.selectionKey, target: r.target }, selection);
});
