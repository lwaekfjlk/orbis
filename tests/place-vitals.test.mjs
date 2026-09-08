import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/civilization/place-vitals.js', import.meta.url), 'utf8');
const simulation = readFileSync(new URL('../src/civilization/simulation.js', import.meta.url), 'utf8');
const { PEOPLES, FAITHS } = new Function(simulation.slice(0, simulation.indexOf('const GOVERNMENTS')) + '\nreturn { PEOPLES, FAITHS };')();
const Vitals = new Function('PEOPLES', 'FAITHS', source + '\nreturn PlaceVitals;')(PEOPLES, FAITHS);
const value = (card, key) => card.metrics.find(m => m.key === key)?.value;
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
function fixture() {
    return { provinces: [
        { id: 0, owner: 0, pop: 100, urbanPop: 40, settled: true, people: [.6, .2], faith: [1, 0] },
        { id: 1, owner: 0, pop: 300, urbanPop: 130, city: true, people: [0, 1], faith: [0, .25] },
        { id: 2, owner: 1, pop: 200, urbanPop: 0, people: [1, 0], faith: [1, 0] }
    ], realms: [{ id: 0, population: 99999, provinces: [2], faith: 1, foodRatio: 2.75, stability: 72 }] };
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

test('City cards distinguish urban residents from the district population behind their mixtures', () => {
    const sim = fixture(), card = Vitals.city(sim, sim.provinces[0]);
    assert.equal(card.kind, 'city');
    assert.equal(value(card, 'townPopulation'), 40);
    assert.equal(value(card, 'districtPopulation'), 100);
    assert.equal(card.metrics[0].label, 'Town residents');
    assert.equal(card.metrics[1].label, 'District residents');
    assert.equal(card.peoples.total, 100);
    near(card.peoples.known, 80); near(card.peoples.unknown, 20);
    assert.deepEqual(card.peoples.shares.map(({ id, count, share }) => ({ id, count, share })), [
        { id: 0, count: 60, share: .6 }, { id: 1, count: 20, share: .2 }
    ]);
    assert.equal(card.peoples.shares[0].name, PEOPLES[0].name);
    assert.equal(card.peoples.shares[0].color, PEOPLES[0].color);
    assert.equal(card.faiths.shares[0].name, FAITHS[0].name);
    assert.equal(card.faiths.shares[0].color, FAITHS[0].color);
    assert.deepEqual(card.indicators, [], 'the district does not have an independent food supply indicator');
});

test('Realm cards use current ownership and population weights instead of cached realm totals or state faith', () => {
    const sim = fixture(), card = Vitals.realm(sim, sim.realms[0]);
    assert.equal(card.kind, 'realm');
    assert.equal(value(card, 'population'), 400);
    assert.equal(value(card, 'towns'), 2);
    assert.equal(value(card, 'districts'), 2);
    near(card.peoples.known, 380); near(card.peoples.unknown, 20);
    const human = card.peoples.shares.find(s => s.id === 0), sylvan = card.peoples.shares.find(s => s.id === 1);
    near(human.count, 60); near(human.share, .15); near(sylvan.count, 320); near(sylvan.share, .8);
    near(card.faiths.known, 175); near(card.faiths.unknown, 225);
    near(card.faiths.shares.find(s => s.id === 0).share, .25);
    near(card.faiths.shares.find(s => s.id === 1).share, .1875);
    sim.provinces[0].owner = 1;
    sim.provinces[1].pop = 500;
    sim.provinces[2].owner = 0;
    const next = Vitals.realm(sim, sim.realms[0]);
    assert.equal(value(next, 'population'), 700);
    assert.equal(value(next, 'towns'), 1);
    assert.equal(value(next, 'districts'), 2);
    near(next.peoples.shares.find(s => s.id === 0).count, 200);
    near(next.peoples.shares.find(s => s.id === 1).count, 500);
});

test('Missing and partial mixtures retain unknown residents rather than expanding known shares', () => {
    const p = { pop: 200, urbanPop: 50, people: [.1, .3] }, card = Vitals.city({}, p);
    near(card.peoples.known, 80); near(card.peoples.unknown, 120);
    near(card.peoples.shares.reduce((s, v) => s + v.share, 0), .4);
    assert.deepEqual(card.faiths, { total: 200, known: 0, shares: [], unknown: 200 });
    const unknownId = Array(PEOPLES.length + 1).fill(0);
    unknownId[0] = .2; unknownId[PEOPLES.length] = .5;
    const imported = Vitals.city({}, { pop: 100, people: unknownId });
    near(imported.peoples.known, 20); near(imported.peoples.unknown, 80);
});

test('Invalid weights are ignored and only overfull mixtures are normalized downward', () => {
    const p = { pop: 100, urbanPop: -20, people: [.8, .8, -1, NaN], faith: [Infinity, .3, '0.7'] };
    const card = Vitals.city({}, p);
    assert.equal(value(card, 'townPopulation'), null);
    near(card.peoples.known, 100); near(card.peoples.unknown, 0);
    assert.deepEqual(card.peoples.shares.map(s => s.share), [.5, .5]);
    near(card.faiths.known, 30); near(card.faiths.unknown, 70);
    const extra = Array(PEOPLES.length + 1).fill(0); extra[0] = 1; extra[PEOPLES.length] = 1;
    const outside = Vitals.city({}, { pop: 100, people: extra });
    near(outside.peoples.known, 50); near(outside.peoples.unknown, 50);
    const huge = Vitals.city({}, { pop: 100, people: [1e308, 1e308] });
    assert.deepEqual(huge.peoples.shares.map(s => s.share), [.5, .5]);
    const normalized = Vitals.city({}, { pop: 100, people: [1 / 3, 1 / 3, 1 / 3] });
    assert.equal(normalized.peoples.unknown, 0, 'floating-point dust must not add an Unknown legend entry');
});

test('Missing population stays unknown, while an empty realm or recorded zero population stays zero', () => {
    for (const pop of [undefined, NaN, Infinity, -1, '100']) {
        const card = Vitals.city({}, { pop, people: [1] });
        assert.equal(value(card, 'districtPopulation'), null);
        assert.equal(card.peoples.total, null); assert.equal(card.peoples.unknown, null);
        assert.deepEqual(card.peoples.shares, []);
        assert.equal(card.coverage.missingDistricts, 1);
    }
    const sim = fixture(); delete sim.provinces[1].pop;
    const partial = Vitals.realm(sim, sim.realms[0]);
    assert.equal(value(partial, 'population'), null);
    assert.equal(partial.peoples.total, null);
    near(partial.peoples.known, 80);
    assert.deepEqual(partial.peoples.shares, []);
    assert.deepEqual(partial.coverage, { districts: 2, recordedDistricts: 1, missingDistricts: 1, recordedPopulation: 100 });
    const empty = Vitals.realm({ provinces: [] }, { id: 9 });
    assert.equal(value(empty, 'population'), 0);
    assert.deepEqual(empty.peoples, { total: 0, known: 0, shares: [], unknown: 0 });
    const zero = Vitals.city({}, { pop: 0, urbanPop: 0, people: [1], faith: [.5, .5] });
    assert.equal(value(zero, 'townPopulation'), 0);
    assert.deepEqual(zero.faiths, { total: 0, known: 0, shares: [], unknown: 0 });
});

test('Food values retain surpluses beyond the visual scale and missing indicators stay unrecorded', () => {
    const sim = fixture(), card = Vitals.realm(sim, sim.realms[0]);
    assert.deepEqual(card.indicators, [
        { key: 'foodRatio', label: 'Food supply', value: 275, target: 100, max: 200, unit: '%' },
        { key: 'stability', label: 'Stability', value: 72, target: null, max: 100, unit: '%' }
    ]);
    for (const bad of [undefined, NaN, Infinity, -1]) {
        const missing = Vitals.realm({ provinces: [] }, { id: 0, foodRatio: bad, stability: bad });
        assert(missing.indicators.every(i => i.value === null));
    }
    assert.equal(Vitals.realm({ provinces: [] }, { id: 0, stability: 120 }).indicators[1].value, 100);
});

test('Vitals are deterministic, consume no randomness, and leave both records and definitions untouched', () => {
    const sim = fixture(), before = structuredClone(sim);
    freeze(sim); freeze(PEOPLES); freeze(FAITHS);
    const random = Math.random;
    try {
        Math.random = () => { throw Error('Vitals must not consume RNG'); };
        assert.deepEqual(Vitals.city(sim, sim.provinces[0]), Vitals.city(sim, sim.provinces[0]));
        assert.deepEqual(Vitals.realm(sim, sim.realms[0]), Vitals.realm(sim, sim.realms[0]));
        const card = Vitals.city(sim, sim.provinces[0]); card.peoples.shares[0].name = 'Changed result';
        assert.equal(Vitals.city(sim, sim.provinces[0]).peoples.shares[0].name, PEOPLES[0].name);
    } finally { Math.random = random; }
    assert.deepEqual(sim, before);
    assert(Object.isFrozen(Vitals));
});

test('Absent or non-record inputs return null, and sparse valid realm records are safe', () => {
    for (const invalid of [null, undefined, 3, 'town', []]) {
        assert.equal(Vitals.city({}, invalid), null);
        assert.equal(Vitals.realm({}, invalid), null);
    }
    assert.equal(Vitals.realm({}, {}), null);
    assert.equal(Vitals.realm({}, { id: -1 }), null);
    assert.equal(Vitals.realm({}, { id: 0 }), null, 'missing territory data is not an empty realm');
    assert.equal(value(Vitals.realm({ provinces: [] }, { id: 0 }), 'districts'), 0);
    assert.equal(value(Vitals.realm({ provinces: [null, { owner: 0, pop: 5 }] }, { id: 0 }), 'population'), 5);
});
