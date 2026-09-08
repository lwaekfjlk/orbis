import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-loader.mjs';

const E = loadEngine();
const cloth = [.45, .38, .29], skin = [.76, .59, .43];
const accents = E.Folk.LOOKS.map(look => look.accent);
const limits = { full: 240, simple: 70 };
function figure(accent, { detail = 'full', origin = [0, 0, 0], height = 1, girth = .3, angle = 0, phase = .8, legs = true } = {}) {
    const g = new E.Geometry();
    g.figure(...origin, height, girth, angle, cloth, skin, accent, phase, legs, detail);
    return g.data;
}
function positions(data, include = () => true) {
    const points = [];
    for (let i = 0; i < data.length; i += 9) {
        const p = data.slice(i, i + 3);
        if (include(p)) points.push(p);
    }
    return points;
}
function shape(data, include) {
    // Remove colours, face normals, duplicate face vertices and ordering. This
    // compares the physical mesh even when two peoples use the same palette.
    return [...new Set(positions(data, include).map(p => p.map(v => v.toFixed(7)).join(',')))].sort().join('|');
}

test('Every fantasy people has distinct geometry in both detailed and distant figures', () => {
    assert.equal(accents.length, 7);
    for (const detail of Object.keys(limits)) {
        const shapes = accents.map(accent => shape(figure(accent, { detail })));
        assert.equal(new Set(shapes).size, accents.length,
            `${detail} silhouettes must remain distinct with identical height, girth and colours`);
    }
});

test('Both detail levels remain finite, deterministic and within the crowd triangle limits', () => {
    for (const accent of accents) {
        const sizes = {};
        for (const [detail, limit] of Object.entries(limits)) {
            for (const phase of [0, .8, Math.PI / 2, Math.PI, 5.3]) {
                const options = { detail, phase }, data = figure(accent, options);
                assert(data.every(Number.isFinite), `${accent}/${detail}: finite vertices, normals and colours`);
                assert.equal(data.length % 27, 0);
                const triangles = data.length / 27;
                assert(triangles > 0 && triangles <= limit, `${accent}/${detail} costs ${triangles} triangles; limit ${limit}`);
                assert.deepEqual(data, figure(accent, options), 'figure generation must not draw from a random stream');
                sizes[detail] = triangles;
            }
        }
        assert(sizes.simple < sizes.full, `${accent}: distant figures must reduce actual geometry`);
    }
});

test('Walking changes both legs and both arms while keeping the feet above their ground plane', () => {
    for (const accent of accents) for (const detail of Object.keys(limits)) {
        const first = figure(accent, { detail, phase: 0 }), later = figure(accent, { detail, phase: Math.PI / 2 });
        for (const side of [-1, 1]) {
            const leg = ([, y, z]) => y > .04 && y < .43 && z * side > .025;
            const arm = ([, y, z]) => y > .42 && y < .83 && z * side > .135;
            for (const [part, include] of [['leg', leg], ['arm', arm]]) {
                const a = shape(first, include), b = shape(later, include);
                assert(a.length && b.length, `${accent}/${detail}: a ${side < 0 ? 'left' : 'right'} ${part} must be modelled`);
                assert.notEqual(a, b, `${accent}/${detail}: the ${side < 0 ? 'left' : 'right'} ${part} must move with the gait`);
            }
        }
        for (const phase of [0, .4, Math.PI / 2, Math.PI, Math.PI * 1.5, 5.8]) {
            const ground = 3.75, data = figure(accent, { detail, phase, origin: [-17, ground, 29] });
            const heights = positions(data).map(p => p[1] - ground);
            assert(Math.min(...heights) >= -1e-9, `${accent}/${detail}: a moving foot must not enter the terrain`);
            assert(Math.min(...heights) < .04, `${accent}/${detail}: a stance foot must stay close to the terrain`);
        }
    }
});

test('Figures preserve their anatomy and normals under translation, heading and uniform scale', () => {
    const origin = [-41.5, 3.75, 17.25], angle = .73, scale = 2.4, c = Math.cos(angle), s = Math.sin(angle);
    for (const accent of accents) for (const detail of Object.keys(limits)) {
        const before = figure(accent, { detail }), after = figure(accent, { detail, origin, angle, height: scale, girth: .3 * scale });
        assert.equal(after.length, before.length, `${accent}/${detail}: transforms cannot change topology`);
        for (let i = 0; i < before.length; i += 9) {
            const expected = [origin[0] + scale * (c * before[i] - s * before[i + 2]), origin[1] + scale * before[i + 1],
                origin[2] + scale * (s * before[i] + c * before[i + 2]),
                c * before[i + 3] - s * before[i + 5], before[i + 4], s * before[i + 3] + c * before[i + 5]];
            for (let channel = 0; channel < 6; channel++)
                assert(Math.abs(after[i + channel] - expected[channel]) < 1e-8,
                    `${accent}/${detail}: transformed vertex ${i / 9}, channel ${channel} must follow the figure`);
            for (let channel = 6; channel < 9; channel++) assert.equal(after[i + channel], before[i + channel]);
        }
    }
});

test('Omitting the new detail argument keeps existing callers on the full model', () => {
    for (const accent of accents) {
        const legacy = new E.Geometry();
        legacy.figure(0, 0, 0, 1, .3, 0, cloth, skin, accent, .8, true);
        assert.deepEqual(legacy.data, figure(accent));
    }
});

test('The real traveller renderer advances the gait, rather than only translating a rigid figure', () => {
    const x = Math.floor(E.GW / 2), y = Math.floor(E.GH / 2), path = [y * E.GW + x, y * E.GW + x + 1];
    const agent = { scope: 'road', kind: 'walker', road: { path }, people: 0, look: E.Folk.look(0), tone: .5,
        phase: 0, speed: .01, escort: 0 };
    const r = Object.create(E.AtlasRenderer.prototype);
    Object.assign(r, { world: {}, sim: {}, options: {}, meshes: {}, width: 1000, height: 700,
        zoom: E.AtlasRenderer.FOLK_ZOOM * 2, halfW: .17, halfH: .12, target: [0, 0, 0], dirtyShadow: false,
        roadNetwork: { signature: 'one straight road' }, folkTravellerKey: 'one straight road', folkTravellers: [agent],
        updateCamera() {}, ground: () => 2,
        coord(gx, gy, h) { return [(gx - (E.GW - 1) / 2) * E.AtlasSpace.X, h, (gy - (E.GH - 1) / 2) * E.AtlasSpace.Z]; },
        upload(name, g) { this.meshes[name] = { vertices: g.data.slice() }; this.dirtyShadow = true; },
    });
    const bodyHeight = E.AtlasRenderer.FOLK_SCALE.near * agent.look.height;
    function localPose(t) {
        r.buildFolk(t);
        assert.equal(r.folkStats.fullFigures, 1, 'one nearby traveller should use its detailed model');
        assert.equal(r.folkStats.travelling, 1);
        assert.equal(r.dirtyShadow, false);
        const q = E.Folk.travellerAt(agent, t), origin = r.coord(q.x, q.y, 2 + .006);
        return positions(r.meshes.folk.vertices).map(p => p.map((value, axis) => (value - origin[axis]) / bodyHeight));
    }
    const before = localPose(0);
    let movement = 0;
    for (const t of [.3, .6, 1]) {
        const after = localPose(t);
        assert.equal(after.length, before.length);
        for (let i = 0; i < after.length; i++) movement = Math.max(movement, Math.hypot(...after[i].map((value, axis) => value - before[i][axis])));
    }
    assert(movement > .04, `after removing road travel, the gait moved only ${movement.toFixed(3)} body heights in one second`);
});
