import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, fantasyDefaults, root } from './engine-loader.mjs';

const E = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(count = 18) {
    const sim = { seed: 73129, year: 400, options: { politySeed: 'Linked names' },
        events: [{ year: 390, text: 'The preserved old chronicle.' }],
        provinces: [], realms: [] };
    for (let id = 0; id < 2; id++) {
        sim.realms.push({ id, capital: id * count, alive: true, founded: 400, gov: 1,
            faith: 0, originPeople: id, provinces: [], treasury: 47 });
        for (let k = 0; k < count; k++) {
            const pid = sim.provinces.length;
            sim.realms[id].provinces.push(pid);
            sim.provinces.push({ id: pid, i: 1000 + pid * 17, owner: id, name: `Old district ${pid}`,
                x: 25 + pid * 2, y: 40 + id * 30, landmass: id, culturalHome: id,
                people: E.PEOPLES.map((_, j) => Number(j === id)),
                faith: E.FAITHS.map((_, j) => Number(j === 0)),
                city: true, settled: true, pop: 28000, urbanPop: 14000,
                nameRoll: [.27, .64], altitude: 150, temp: 16, aridity: .35,
                harbor: 0, coast: 0, lake: 0, siteLake: 0, river: 0,
                forest: .2, wet: .1, ore: .2, mana: .2 });
        }
    }
    E.RealmNames.assign(sim, sim.realms[0], { baseId: 'arthurian' });
    E.RealmNames.assign(sim, sim.realms[1], { baseId: 'norse' });
    return sim;
}
function assertLinked(sim, p) {
    const origin = p.nameOrigin, culture = sim.realms[p.owner].namingCulture;
    assert(origin, `${p.name} needs a recorded naming tradition`);
    assert.equal(origin.baseId, culture.baseId);
    assert.equal(origin.tradition, culture.tradition);
    assert.equal(origin.realmId, p.owner);
    assert.equal(origin.generatedName, p.name);
    assert.equal(origin.fictional, true);
    assert(origin.source && origin.root && origin.pattern);
    if (p.settled) assert(p.name.includes(culture.root), 'settled places carry their country’s recognizable root');
    assert(E.PlaceNames.describe(p).length > 0);
    assert(!/\d/.test(p.name), 'a crowded tradition should still produce readable names');
}
const namingState = sim => plain({ realms: sim.realms.map(c => [c.name, c.namingCulture]),
    provinces: sim.provinces.map(p => [p.name, p.namedFor, p.nameOrigin]) });

test('A country gives many towns a shared tradition and distinct saint dedications', () => {
    const sim = fixture(); E.PlaceNames.generate(sim);
    for (const realm of sim.realms) {
        const towns = sim.provinces.filter(p => p.owner === realm.id);
        towns.forEach(p => assertLinked(sim, p));
        const saints = towns.filter(p => /^Saint /.test(p.name));
        assert(saints.length > towns.length / 2, 'Dawn naming must form a visible family across multiple towns');
        assert(new Set(saints.map(p => p.nameOrigin.patron)).size >= 3, 'different towns honor different fictional people');
        assert(sim.provinces[realm.capital].name.includes(realm.namingCulture.root), 'the capital retains a recognizable link to the country');
        assert(E.PlaceNames.describeRealm(sim, realm).length > 0);
    }
    assert.equal(new Set(sim.provinces.map(p => p.name.toLowerCase())).size, sim.provinces.length);
});

test('Place provenance escapes imported text before it enters the inspector', () => {
    const ui = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const helper = ui.slice(ui.indexOf('function placeNameOriginHTML('), ui.indexOf('function renderInspector('));
    const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const originHTML = Function('PlaceNames', 'escapeHTML', helper + ';return placeNameOriginHTML;')(
        { describe: p => p?.text || '' }, escapeHTML);
    assert.equal(originHTML(null), '');
    const markup = originHTML({ text: '<img src=x onerror=alert(1)>' });
    assert(!markup.includes('<img'));
    assert(markup.includes('&lt;img'));
});

test('Dispersed urban population does not make a district use the town naming pattern', () => {
    const sim = fixture();
    for (const [id, population, flags, isTown] of [
        [2, 400, {}, false],
        [3, 650, {}, true],
        [4, 1000, { settled: false, city: false }, false],
        [5, 200, { settled: true, city: false }, true],
    ]) {
        const p = sim.provinces[id];
        delete p.settled; delete p.city;
        Object.assign(p, flags, { urbanPop: population });
        E.PlaceNames.assign(sim, p);
        assert.equal(p.nameOrigin.pattern !== 'landscape', isTown,
            'explicit settlement flags take precedence; missing flags use the actual 650-resident threshold');
    }
});

test('Dry-country naming follows low rainfall relative to demand, not humid conditions', () => {
    const baseline = fixture();
    baseline.realms[0].faith = 3; // Exercise terrain wording rather than a saint dedication.
    const dry = plain(baseline), humid = plain(baseline);
    dry.provinces[3].aridity = .1;
    humid.provinces[3].aridity = 2;
    // Every other geographical, cultural and seed input is identical.
    for (const sim of [dry, humid]) E.PlaceNames.assign(sim, sim.provinces[3]);
    const a = dry.provinces[3], b = humid.provinces[3];
    assert.equal(a.nameOrigin.terrain, 'arid');
    assert.notEqual(b.nameOrigin.terrain, 'arid');
    assert.match(E.PlaceNames.describe(a), /dry country/);
    assert.doesNotMatch(E.PlaceNames.describe(b), /dry country/);
    assertLinked(dry, a); assertLinked(humid, b);
});

test('A country introduction cites a few current towns from its own naming family', () => {
    const sim = fixture(); E.PlaceNames.generate(sim);
    const realm = sim.realms[0], towns = sim.provinces;
    towns[1].owner = 1;
    towns[2].namedFor = 'custom';
    Object.assign(towns[3], { settled: false, city: false, urbanPop: 0 });
    towns[4].nameOrigin.realmId = 1;
    const text = E.PlaceNames.describeRealm(sim, realm);
    for (const id of [0, 5, 6]) assert(text.includes(towns[id].name), 'cite the capital and actual same-family towns');
    for (const id of [1, 2, 3, 4, 7]) assert(!text.includes(towns[id].name),
        'keep the examples short and exclude lost, custom, dispersed or differently founded places');
});

test('Crowded place namebases stay unique, deterministic and within their country tradition', () => {
    const a = fixture(180), b = fixture(180);
    E.PlaceNames.generate(a); E.PlaceNames.generate(b);
    assert.deepEqual(namingState(a), namingState(b));
    assert.equal(new Set(a.provinces.map(p => p.name.toLowerCase())).size, a.provinces.length);
    a.provinces.forEach(p => assertLinked(a, p));
    const saved = namingState(a);
    E.PlaceNames.generate(a);
    assert.deepEqual(namingState(a), saved);
    const restored = plain(a); E.PlaceNames.generate(restored);
    assert.deepEqual(namingState(restored), saved);
});

test('Place naming changes only names and their provenance', () => {
    const sim = fixture();
    const withoutNames = s => plain({ ...s, provinces: s.provinces.map(({ name, namedFor, nameOrigin, ...p }) => p) });
    const before = withoutNames(sim);
    E.PlaceNames.generate(sim);
    assert.deepEqual(withoutNames(sim), before, 'ownership, people, faiths, RNG rolls and the chronicle are unchanged');
});

test('Existing and custom town names survive rule changes while a new town inherits its country culture', () => {
    const sim = fixture(); E.PlaceNames.generate(sim);
    const p = sim.provinces[3], prior = plain(p.nameOrigin), oldName = p.name;
    p.owner = 1; p.faith = E.FAITHS.map((_, i) => Number(i === 4));
    sim.realms[1].faith = 4;
    E.PlaceNames.generate(sim);
    assert.equal(p.name, oldName, 'conquest and conversion preserve the historical place name');
    assert.deepEqual(p.nameOrigin, prior);
    const handEdited = sim.provinces[4], explicitCustom = sim.provinces[5];
    handEdited.name = 'The user’s chosen town';
    explicitCustom.namedFor = 'custom'; explicitCustom.name = 'My $& Sanctuary';
    for (const town of [handEdited, explicitCustom]) {
        const before = plain(town);
        E.PlaceNames.assign(sim, town, { force: true });
        assert.deepEqual(town, before, 'even forced generation preserves a user edit');
        assert.equal(E.PlaceNames.describe(town), '', 'a user name must not display stale generated provenance');
    }
    const country = sim.realms[1], culture = plain(country.namingCulture);
    assert(E.civilizationAction(sim, 'rename', country.id, -1, 'My new country name').ok);
    const next = { ...sim.provinces[20], id: sim.provinces.length, i: 6001, name: 'New district' };
    delete next.nameOrigin; delete next.namedFor;
    sim.provinces.push(next); country.provinces.push(next.id);
    E.PlaceNames.assign(sim, next);
    assertLinked(sim, next);
    assert.deepEqual(country.namingCulture, culture);
    assert.equal(country.name, 'My new country name');
});

let world, initial;
const liveWorld = async () => {
    if (!world) {
        world = await E.generateWorld(fantasyDefaults);
        initial = E.createCivilization(world, { realms: 18, historySeed: 'First-dawn' });
    }
    return { world, sim: plain(initial) };
};

test('Every settled town in the current default world follows its country naming family', async () => {
    const { sim } = await liveWorld();
    const towns = sim.provinces.filter(p => p.owner >= 0 && p.settled);
    assert(towns.length > 0, 'exercise the inhabited application default');
    for (const p of towns) assertLinked(sim, p);
});

test('The version 3 rift gives both later high mountain cities linked names before recording their founding', async () => {
    // High cities require feasible platforms; the current Aereth default has
    // none. Meridian's rift exercises both real post-polity founding paths.
    const world = await E.generateWorld({ ...fantasyDefaults, landformVersion: 3, seed: 'Meridian-21', form: 'rift' });
    const sim = E.createCivilization(world, { realms: 18, historySeed: 'First-dawn' });
    const high = sim.provinces.filter(p => p.highCitadel);
    assert.equal(high.length, 2, 'exercise both post-polity high city founding paths');
    for (const p of high) {
        assertLinked(sim, p);
        assert(!p.name.includes(' · '), 'the city name is distinct from its type label');
        assert(p.highCitadel.originalName, 'the original district name remains in historical metadata');
        assert(sim.events.some(e => e.details?.province === p.id && e.details.highCitadel && e.text.includes(p.name)),
            'the founding event records the final linked city name');
    }
});

test('A district crossing the settlement threshold receives its country town naming pattern', async () => {
    const { world, sim } = await liveWorld();
    const p = sim.provinces.find(p => p.owner >= 0 && !p.settled && !p.highCitadel);
    assert(p, 'exercise a previously dispersed district');
    Object.assign(p, { pop: 20000, urbanPop: 649, urbanSupport: 20000, capacity: 60000, dev: 1, unrest: 0 });
    E.stepCivilization(sim, world);
    assert(p.settled, 'the fixture must actually become a settlement during the annual step');
    assertLinked(sim, p);
    assert.notEqual(p.nameOrigin.pattern, 'landscape', 'a newly inhabited town uses the cultural town pattern');
});

test('The save validator preserves legacy naming and new JSON saves continue identically', async () => {
    const { world, sim } = await liveWorld();
    const ui = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const body = ui.slice(ui.indexOf('function validateSimulation('), ui.indexOf('function refreshAll('));
    const validate = Function(...Object.keys(E), body + ';return validateSimulation;')(...Object.values(E));
    const legacy = plain(sim);
    for (const p of legacy.provinces) { delete p.nameOrigin; delete p.namedFor; p.name = `Legacy district ${p.id}`; }
    for (const c of legacy.realms) { delete c.namingCulture; delete c.nameOrigin; c.namedFor = 'plate'; c.name = `Legacy realm ${c.id}`; }
    const original = plain(legacy);
    validate(legacy, world);
    assert.deepEqual(legacy, original, 'loading a historical save does not rewrite its places or history');
    const restored = plain(sim);
    validate(restored, world);
    for (let year = 0; year < 3; year++) { E.stepCivilization(sim, world); E.stepCivilization(restored, world); }
    assert.deepEqual(restored, sim, 'names and cultural metadata survive the actual annual continuation');
});
