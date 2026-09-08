import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root } from './engine-loader.mjs';

const source = readFileSync(`${root}/src/civilization/realm-profile.js`, 'utf8');
const Names = { fullName: c => `Kingdom of ${c.name}`, describe: c => c.nameOrigin ? 'Norse mythology: Asgard, the dwelling of the Aesir gods.' : '' };
const Profile = new Function('RealmNames', 'PEOPLES', 'FAITHS', 'GOVERNMENTS', 'BIOME', source + '\nreturn RealmProfile;')(
    Names, [{ name: 'Humans' }, { name: 'Sylvans' }], [{ name: 'Dawn Communion' }, { name: 'Veil of Stars' }], ['Feudal monarchy'], [['Ocean'], ['Forest'], ['Grassland']]);
function fixture() {
    const world = { height: [1, 2, 3, 0, 5, 6, 7], lake: [-1, -1, 0, -1, 8, -1, -1], area: [1, 2, 3, 50, 50, 4, 5], biome: [1, 1, 2, 0, 1, 2, 2], temp: [10, 14, 20, 25, -30, 26, 30], arid: [1, 1, .5, 0, 0, .4, .2], continents: [{ id: 8, name: 'Thaloria' }] };
    const provinces = [
        { id: 0, owner: 0, name: 'High Seat', settled: true, cells: [0, 1], pop: 100, people: [1, 0], faith: [.1, .9], landmass: 8, foodCapacity: 150, ore: .2, forest: 1, coast: .2 },
        { id: 1, owner: 0, name: 'Green Fields', settled: true, cells: [2, 3, 4], pop: 300, people: [0, 1], faith: [.5, .5], landmass: 8, foodCapacity: 250, ore: .8, forest: 0, lake: .3 },
        { id: 2, owner: 1, name: 'Far Watch', settled: true, cells: [5], pop: 200, people: [.5, .5], faith: [1, 0], foodCapacity: 100 },
        { id: 3, owner: -1, name: 'Free Valley', cells: [6], pop: 70, people: [1, 0], faith: [1, 0] }
    ];
    const sim = { year: 420, provinces, realms: [
        { id: 0, alive: true, name: 'Asgard', nameOrigin: {}, gov: 0, founded: 400, capital: 0, faith: 0, policy: 'Concord', army: 2.5, navy: 1, arcana: 1.4, income: 12, tradeIncome: 3, treasury: 50, foodRatio: .95, imports: 20, provinces: [99], population: 999999 },
        { id: 1, alive: true, name: 'Penglai', capital: 2 }, { id: 2, alive: false, name: 'Lost Crown' }
    ], relations: { a: { a: 0, b: 1, alliance: true, trade: true }, b: { a: 0, b: 2, alliance: true } }, wars: [{ a: 0, b: 1, start: 419, ended: false }], events: [
        { year: 400, type: 'founding', actors: [0], text: 'Asgard forms around High Seat.' },
        { year: 419, type: 'war', actors: [0, 1], text: 'Asgard declares war on Penglai.' },
        { year: 418, type: 'prosperity', actors: [1], details: { province: 1 }, text: 'An event belonging to another polity.' },
        { year: 421, type: 'war', actors: [0], text: 'A future event must not be narrated.' }
    ] };
    return { world, sim };
}
const section = (profile, name) => profile.sections.find(s => s.title === name).text;
function freeze(value) {
    if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
    return value;
}

test('Realm area counts weighted, owned dry land exactly once, including zero-valued lake sentinels', () => {
    const { world, sim } = fixture();
    assert.equal(Profile.landArea(world, sim.provinces.slice(0, 2)), 6);
    assert.equal(Profile.landArea(world, [...sim.provinces.slice(0, 2), sim.provinces[0], { cells: [0, -1, 999] }]), 6);
    assert.equal(Profile.landArea(world, []), 0);
    assert.equal(Profile.landArea({}, [{ cells: [0] }]), 0);
    const typed = { height: new Float32Array(world.height), lake: new Float32Array(world.lake), area: new Float32Array(world.area) };
    assert.equal(Profile.landArea(typed, sim.provinces.slice(0, 2)), 6);
});

test('Profile facts, geography, residents, economy and diplomacy follow source data', () => {
    const { world, sim } = fixture(), p = Profile.create(world, sim, 0);
    assert.equal(p.title, 'Kingdom of Asgard');
    assert.deepEqual(p.facts, { area: 6, areaShare: 6 / 15, areaRank: 1, provinceCount: 2, townCount: 2, population: 400, capital: 'High Seat', primaryPeople: 'Sylvans', primaryPeopleShare: .75 });
    assert.match(section(p, 'Peoples and faiths'), /Sylvans form the majority/);
    assert.match(section(p, 'Origins and identity'), /founded in year 400/);
    assert.match(section(p, 'Origins and identity'), /Norse mythology/);
    assert.match(section(p, 'Land and climate'), /Thaloria/);
    assert.match(section(p, 'Land and climate'), /10 to 20 °C/);
    assert.match(section(p, 'Land and climate'), /generally moderately moist/);
    assert.match(section(p, 'Peoples and faiths'), /Sylvans \(75%\)/);
    assert.match(section(p, 'Peoples and faiths'), /Dawn Communion is the state tradition/);
    assert.match(section(p, 'Peoples and faiths'), /Veil of Stars \(60%\)/);
    assert.match(section(p, 'Hinterland and exchange'), /Food is in short supply/);
    assert.match(section(p, 'Hinterland and exchange'), /95% of demand/);
    assert.match(section(p, 'Hinterland and exchange'), /Food imports/);
    assert.match(section(p, 'Hinterland and exchange'), /moderate mineral resources/);
    assert.match(section(p, 'Power and diplomacy'), /2.5 thousand/);
    assert.match(section(p, 'Power and diplomacy'), /Defensive allies are Penglai/);
    assert.match(section(p, 'Power and diplomacy'), /Penglai \(since 419\)/);
    assert(!JSON.stringify(p).includes('Lost Crown'));
    assert.deepEqual(p.events.map(e => e.year), [419, 400]);
    assert(!JSON.stringify(p).includes('future event'));
    assert(!JSON.stringify(p).includes('another polity'));
    assert(!/km²|square kilom/.test(JSON.stringify(p)));
    assert(!/population-equivalents|resource scale|water-to-demand index/.test(JSON.stringify(p)));
});

test('Each introduction reflects changed borders, people, capital, faith and diplomacy immediately', () => {
    const { world, sim } = fixture(), before = Profile.create(world, sim, 0);
    sim.provinces[0].owner = 1;
    sim.provinces[1].pop = 600;
    sim.provinces[1].faith = [0, 1];
    world.arid[2] = .1;
    sim.realms[0].capital = 1;
    sim.realms[0].faith = 1;
    sim.realms[0].army = 7;
    sim.relations.a.alliance = false;
    sim.wars[0].ended = true;
    sim.events.push({ year: 420, actors: [0], type: 'capital', text: 'Asgard moves its capital to Green Fields.' });
    const after = Profile.create(world, sim, 0);
    assert.notDeepEqual(after, before);
    assert.deepEqual(after.facts, { area: 3, areaShare: 3 / 15, areaRank: 2, provinceCount: 1, townCount: 1, population: 600, capital: 'Green Fields', primaryPeople: 'Sylvans', primaryPeopleShare: 1 });
    assert.match(section(after, 'Peoples and faiths'), /Veil of Stars is the state tradition/);
    assert.match(section(after, 'Peoples and faiths'), /Sylvans \(100%\)/);
    assert.match(section(after, 'Land and climate'), /generally arid/);
    assert.match(section(after, 'Hinterland and exchange'), /Mineral resources are plentiful/);
    assert.match(section(after, 'Power and diplomacy'), /7 thousand/);
    assert.match(section(after, 'Power and diplomacy'), /no recorded defensive allies/);
    assert.match(section(after, 'Power and diplomacy'), /not involved in any recorded active war/);
    assert.equal(after.events[0].type, 'capital');
});

test('Profiles are deterministic detached values and never mutate simulation or geography', () => {
    const { world, sim } = fixture(), before = JSON.stringify({ world, sim });
    freeze(world); freeze(sim);
    const a = Profile.create(world, sim, 0), b = Profile.create(world, sim, 0);
    assert.deepEqual(a, b);
    a.events[0].text = 'Changed output'; a.sections[0].text = 'Changed section'; a.facts.population = 0;
    assert.deepEqual(Profile.create(world, sim, 0), b);
    assert.equal(JSON.stringify({ world, sim }), before);
});

test('Sparse legal records, no events or allies, missing mixtures and tied areas remain readable', () => {
    const world = { height: [1, 2], lake: [-1, -1], area: [1, 1] };
    const sim = { realms: [{ id: 0, name: 'Small Realm', capital: 0 }, { id: 1, name: 'Neighbor' }], provinces: [{ id: 0, owner: 0, cells: [0], pop: 2 }, { id: 1, owner: 1, cells: [1], pop: 3 }] };
    const p = Profile.create(world, sim, 0);
    assert.equal(p.facts.capital, null);
    assert.equal(p.facts.areaRank, 1);
    assert.equal(Profile.create(world, sim, 1).facts.areaRank, 1);
    assert.equal(p.events.length, 0);
    assert(!p.sections.some(s => s.title === 'Recent history'));
    assert.match(section(p, 'Power and diplomacy'), /no recorded defensive allies/);
    assert.match(section(p, 'Peoples and faiths'), /No population mixture/);
    assert(!/undefined|NaN|Infinity/.test(JSON.stringify(p)));
    assert.equal(Profile.create(world, sim, 99), null);
    assert.equal(Profile.create({}, { realms: [{ id: 0, name: 'Lost Realm', alive: false }] }, 0).facts.areaRank, null);
});

test('Recent history is limited and ordered, and includes only explicit actors or recorded supporters', () => {
    const { world, sim } = fixture();
    sim.events = Array.from({ length: 10 }, (_, i) => ({ year: 410 + i, type: 'battle', actors: [1], details: { supporters: [0] }, text: `Recorded battle ${i}.` }));
    const p = Profile.create(world, sim, 0);
    assert.deepEqual(p.events.map(e => e.year), [419, 418, 417, 416, 415, 414]);
    assert.equal(p.events[0].text, 'Recorded battle 9.');
    assert(!p.sections.some(s => s.text.includes('Recorded battle')));
});
