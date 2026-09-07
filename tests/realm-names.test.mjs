import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, defaults, root } from './engine-loader.mjs';

const E = loadEngine();
function fixture(count = 160) {
    return { seed: 'Mythic-atlas', options: { politySeed: 'Councils' },
        provinces: Array.from({ length: count }, (_, id) => ({ id, name: `Town ${id}`, x: id % 30 * 10, y: Math.floor(id / 30) * 30, landmass: id % 6 })),
        realms: Array.from({ length: count }, (_, id) => ({ id, capital: id, gov: id % 8, alive: true, founded: 400 })) };
}
function assertOrigin(c) {
    assert.equal(c.namedFor, 'mythology');
    const o = c.nameOrigin, b = E.RealmNames.bases.find(b => b.id === o.baseId);
    assert(b, `${c.name} needs a known tradition`);
    assert.equal(o.tradition, b.tradition);
    assert(b.names.some(n => n.name === o.source && n.meaning === o.meaning));
    assert(c.name.includes(o.source), `${c.name} lost its mythic source`);
    assert(c.title.includes(c.name));
    assert(!/\d/.test(c.name), 'collisions must retain a readable name');
    assert(E.RealmNames.describe(c).includes(o.meaning));
}
test('Mythological countries are unique, meaningful and reproducible beyond 128 realms', () => {
    const a = fixture(), b = fixture();
    E.RealmNames.generate(a);
    E.RealmNames.generate(b);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.realms.map(c => c.name.toLowerCase())).size, a.realms.length);
    a.realms.forEach(assertOrigin);
    assert(new Set(a.realms.map(c => c.nameOrigin.baseId)).size >= 8);
    assert(a.realms.some(c => c.nameOrigin.qualifier), 'exercise exhausted base names');
    E.RealmNames.generate(a);
    assert.deepEqual(a, b, 'rerunning the naming pass must be stable');
    const alternative = fixture(); alternative.seed += ' changed';
    E.RealmNames.generate(alternative);
    assert.notDeepEqual(a.realms.map(c => c.name), alternative.realms.map(c => c.name));
});
test('Requested tradition, custom names and historical names survive allocation', () => {
    const s = fixture(3), c = s.realms[2];
    s.realms[0] = { ...s.realms[0], alive: false, name: 'ASGARD' };
    s.realms[1] = { ...s.realms[1], name: '  MIDGARD  ', title: 'My kingdom', namedFor: 'custom' };
    const kept = structuredClone(s.realms.slice(0, 2));
    E.RealmNames.assign(s, c, { baseId: 'norse' });
    assert.equal(c.nameOrigin.baseId, 'norse');
    assert(!['ASGARD', 'MIDGARD'].includes(c.name.toUpperCase()));
    E.RealmNames.generate(s);
    assert.deepEqual(s.realms.slice(0, 2), kept);
    assert.equal(E.RealmNames.describe(s.realms[1]), '');
    assert.equal(E.RealmNames.describe({ name: 'Old save', namedFor: 'plate' }), '');
    assert.equal(E.RealmNames.describe(null), '');
});
test('Founding and secession use mythological names, with stable saves and unchanged founding geography', async () => {
    const w = await E.generateWorld(defaults), s = E.createCivilization(w, { realms: 18, historySeed: 'First-dawn' });
    assert.equal(E.physicalFingerprint(w), '440ae5d0');
    assert.equal(E.settlementFingerprint(s), '6b6c5ea8');
    assert.equal(E.politicalFingerprint(s), 'aaa577eb');
    s.realms.forEach(assertOrigin);
    const saved = JSON.parse(JSON.stringify(s));
    assert.deepEqual(saved.realms, s.realms);
    const withoutNames = sim => JSON.stringify({ ...sim, realms: sim.realms.map(({ name, title, namedFor, nameOrigin, ...other }) => other) });
    const before = withoutNames(s);
    E.nameRealms(s, w);
    assert.equal(withoutNames(s), before, 'naming must not change politics, resources or events');
    assert.equal(E.physicalFingerprint(w), '440ae5d0');
    const edited = s.realms[0];
    assert(E.civilizationAction(s, 'rename', edited.id, -1, 'My chosen realm').ok);
    assert.equal(edited.name, 'My chosen realm');
    assert.equal(edited.namedFor, 'custom');
    assert.equal(edited.nameOrigin, null);
    assert.equal(E.RealmNames.describe(edited), '');
    const count = s.realms.length;
    for (let year = 0; year < 40 && s.realms.length === count; year++) {
        for (const p of s.provinces) { p.unrest = 100; p.occupation = 0; }
        E.stepCivilization(s, w);
    }
    assert(s.realms.length > count, 'the stressed fixture should secede');
    for (const c of s.realms.slice(count)) {
        assertOrigin(c);
        assert(s.events.some(e => e.type === 'secession' && e.text.includes(c.title)));
        assert.equal(s.realms.filter(r => r.name === c.name).length, 1);
    }
});
test('Origin markup escapes imported text and long labels use actual rendered width', () => {
    const src = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const helper = src.slice(src.indexOf('function realmNameOriginHTML('), src.indexOf('function renderInspector('));
    const escapeHTML = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const originHTML = new Function('RealmNames', 'escapeHTML', helper + ';return realmNameOriginHTML;')(E.RealmNames, escapeHTML);
    assert.equal(originHTML({ name: 'Legacy realm' }), '');
    const html = originHTML({ namedFor: 'mythology', nameOrigin: { tradition: '<script>', source: 'A', meaning: 'B' } });
    assert(!html.includes('<script>'));
    assert(html.includes('&lt;script&gt;'));
    const position = src.slice(src.indexOf('function positionLabels()'), src.indexOf('function makeGeoJumps()'));
    const dom = { labels: { classList: { toggle() {} } }, names: { checked: true }, compass: { style: {} } };
    const label = (x, width) => ({ element: { offsetWidth: width, offsetHeight: 40, style: {} }, feature: { name: 'Chicomoztoc', x, y: 200, capital: true } });
    const items = [label(300, 230), label(480, 220)];
    const renderer = { width: 1000, height: 600, azimuth: 0, screen: (x, y) => [x, y] };
    new Function('$', 'renderer', 'world', 'labelItems', position + ';positionLabels();')(id => dom[id], renderer, {}, items);
    assert.equal(items[0].element.style.opacity, '1');
    assert.equal(items[1].element.style.opacity, '0', 'long adjacent names must not overlap');
});
