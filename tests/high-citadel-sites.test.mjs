import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const exports = '\nreturn {HighCitadels,HighCitadelPlan,CityEnvironment,citySurvey,generateWorld,createCivilization,physicalFingerprint,settlementFingerprint,politicalFingerprint,stepCivilization,auditCivilization,GW};';
const E = Function(source + exports)();
// Compare the ordinary founding path with the same trusted modules and the one
// new, deterministic post-allocation hook disabled. No alternate world is built.
assert.equal(source.split('HighCitadels.found(sim, w);').length, 2);
const B = Function(source.replace('HighCitadels.found(sim, w);', 'void 0;') + exports)();
const ui = readFileSync(new URL('../src/ui/world-ui.js', import.meta.url), 'utf8');
const rerollSource = ui.slice(ui.indexOf('function rerollPolitics()'), ui.indexOf('function saveBlob('));
const validationSource = ui.slice(ui.indexOf('function validateSimulation('), ui.indexOf('function refreshAll('));
// Execute the production UI behavior with only its DOM notifications replaced.
const UI = Function(source + `
let world,sim,busy=false,selectedRealm,selectedCell,diplomacyTarget;
const window={};function pause(){}function refreshAll(){}function setLayer(){}function toast(){}
${rerollSource}
${validationSource}
return {validateSimulation,reroll(w,s){world=w;sim=s;try{rerollPolitics();return{sim,error:null};}catch(e){return{sim,error:e.message};}}};`)();
const options = {realms: 18, historySeed: 'First-dawn'};
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
let w, ordinaryWorld, sim, ordinary, physics;
test.before(async () => {
    w = await E.generateWorld(defaults); physics = E.physicalFingerprint(w); ordinaryWorld = structuredClone(w);
    ordinary = B.createCivilization(ordinaryWorld, options); sim = E.createCivilization(w, options);
});
const citadels = () => sim.provinces.filter(p => p.highCitadel);

test('two rare citadels use the original dry mountain sites above 3500 metres', () => {
    const ps = citadels(); assert.deepEqual(ps.map(p => p.id), [419, 455]);
    assert.deepEqual(ps.map(p => p.highCitadel.kind), ['dragon', 'holy']);
    assert.deepEqual(ps.map(p => p.urbanPop), [1100, 748]);
    assert.ok(Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) >= 2);
    for (const p of ps) {
        const before = ordinary.provinces[p.id], high = p.highCitadel, site = E.HighCitadels.site(w, p);
        assert.equal(before.settled, false); assert.equal(before.urbanPop, 0);
        assert.deepEqual([p.i, p.x, p.y, p.cells], [before.i, before.x, before.y, before.cells]);
        assert.equal(high.elevation, w.height[p.i]); assert.ok(high.elevation >= 3500);
        assert.equal(high.sourceCell, p.i); assert.ok(site.maximumGrade <= .95);
        assert.equal(high.surveySpan, 2.16); assert.equal(high.terrainSpan, .648);
        assert.ok(p.name.startsWith(before.name + ' · ')); assert.match(p.name, /Dragon King's Aerie|High Sanctuary/);
        assert.equal(p.settled, true); assert.equal(p.city, false); assert.ok(p.urbanPop >= 650 && p.urbanPop <= 1100);
        assert.ok(w.human.waterCapacity[p.i] >= high.support, 'the original site has insufficient modeled water');
        const rx = high.terrainSpan / 2, ry = rx * E.CityEnvironment.cityDimensions.depth / E.CityEnvironment.cityDimensions.width;
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
            const ground = E.CityEnvironment.sampleSite(w, p.x + x * rx / 5, p.y + y * ry / 5);
            assert.equal(ground.water, 0); assert.ok(ground.ice <= 25); assert.ok(ground.snow <= .5);
        }
    }
});

test('citadel residents and support are transferred from the retained rural budget exactly once', () => {
    const ps = citadels(), reserve = ps.reduce((sum, p) => sum + p.highCitadel.support, 0);
    for (const p of ps) {
        const before = ordinary.provinces[p.id], high = p.highCitadel;
        assert.equal(p.pop, before.pop); close(p.ruralPop + p.urbanPop, before.ruralPop);
        assert.equal(p.capacity, before.capacity, 'founding invented carrying capacity');
        for (const key of ['foodCapacity', 'waterCapacity', 'ruralCapacity']) assert.equal(p[key], before[key]);
        close(high.ruralSupportAfter + high.support, high.ruralSupportBefore);
        assert.ok(high.ruralSupportAfter >= p.ruralPop, 'the transfer took support needed by the remaining rural population');
        assert.ok(high.support <= p.ruralCapacity * .20);
        assert.equal(p.urbanSupport, high.support); assert.equal(p.detailSupport, high.support);
    }
    for (const key of ['available', 'allocated', 'retained']) close(sim.settlementBudget[key] - ordinary.settlementBudget[key], reserve);
    close(sim.settlementBudget.reservedFromRural, reserve);
    close(sim.settlementBudget.available - sim.settlementBudget.allocated, ordinary.settlementBudget.available - ordinary.settlementBudget.allocated);
    assert.ok(sim.settlementBudget.retained <= sim.settlementBudget.allocated + 1e-7);
    const copy = structuredClone(sim), budget = structuredClone(copy.settlementBudget);
    assert.deepEqual(E.HighCitadels.found(copy, w), []); assert.deepEqual(copy.settlementBudget, budget);
});

test('ordinary towns, cultural draws and political founding stay unchanged', () => {
    const selected = new Set(citadels().map(p => p.id));
    for (const p of sim.provinces) {
        const before = ordinary.provinces[p.id];
        assert.equal(p.pop, before.pop); assert.deepEqual(p.people, before.people); assert.deepEqual(p.faith, before.faith);
        if (!selected.has(p.id)) assert.deepEqual(p, before, before.name + ' was changed by rare founding');
        if (before.settled) assert.deepEqual(E.citySurvey(sim, p), B.citySurvey(ordinary, before), before.name + ' survey was resized by a nearby high citadel');
    }
    assert.deepEqual(sim.culturalOrigins, ordinary.culturalOrigins);
    assert.deepEqual(sim.realms, ordinary.realms); assert.deepEqual(sim.relations, ordinary.relations);
    assert.equal(E.politicalFingerprint(sim), B.politicalFingerprint(ordinary));
    assert.deepEqual(w.provinceId, ordinaryWorld.provinceId);
    assert.equal(E.physicalFingerprint(w), physics); assert.equal(B.physicalFingerprint(ordinaryWorld), physics);
});

test('founding records include the new small settlements without adding people or sovereign capitals', () => {
    assert.equal(sim.initialSettlements.length, ordinary.initialSettlements.length + 2);
    assert.equal(sim.settlementSignature, E.settlementFingerprint(sim));
    assert.equal(sim.history[0].population, ordinary.history[0].population);
    assert.equal(sim.initialRealmCount, ordinary.initialRealmCount);
    for (const p of citadels()) {
        const record = sim.initialSettlements.find(s => s.province === p.id);
        assert.equal(record.cell, p.i); assert.equal(record.urbanPop, p.urbanPop); assert.equal(record.type, p.settlementType);
        assert.ok(sim.events.some(e => e.type === 'founding' && e.details?.province === p.id && e.details.highCitadel === p.highCitadel.kind));
        assert.equal(sim.realms.some(r => r.capital === p.id), false);
    }
});

test('low mountains, ice sheets and unsupported districts receive no forced citadels', () => {
    for (const mutate of [
        world => world.height.fill(3000),
        world => world.ice.fill(200),
        world => world.human.waterCapacity.fill(0)
    ]) {
        const world = structuredClone(ordinaryWorld), society = structuredClone(ordinary); mutate(world);
        const before = JSON.stringify(society); assert.deepEqual(E.HighCitadels.found(society, world), []);
        assert.equal(JSON.stringify(society), before);
    }
    const society = structuredClone(ordinary);
    for (const p of society.provinces) if (!p.settled) p.ruralPop = p.pop = 600;
    const before = JSON.stringify(society); assert.deepEqual(E.HighCitadels.found(society, ordinaryWorld), []);
    assert.equal(JSON.stringify(society), before);
});

test('failed exact parcel and approach preflight cannot commit a settlement or reserve', () => {
    const society = structuredClone(ordinary), before = JSON.stringify(society), viable = E.HighCitadelPlan.viable, checked = [];
    E.HighCitadelPlan.viable = (world, sim, p, kind) => { checked.push([p.id, kind]); return false; };
    try {
        assert.deepEqual(E.HighCitadels.found(society, w), []);
        assert.ok(checked.some(([id]) => id === 419)); assert.ok(checked.some(([id]) => id === 455));
        assert.equal(JSON.stringify(society), before, 'failed preflight consumed population or support');
    } finally { E.HighCitadelPlan.viable = viable; }
});

test('annual demographic growth preserves the small city cap and specialized settlement identity', () => {
    const society = structuredClone(sim), ids = citadels().map(p => p.id);
    for (const id of ids) { const p = society.provinces[id]; p.urbanSupport = 1e6; p.dev = 2.5; p.urbanPop = 20000; }
    for (let year = 0; year < 12; year++) {
        E.stepCivilization(society, w);
        for (const id of ids) {
            const p = society.provinces[id];
            assert.ok(p.urbanPop <= p.highCitadel.populationCap && p.urbanPop <= 1100);
            assert.equal(p.city, false); assert.equal(p.settled, true); assert.equal(p.settlementType, E.HighCitadels.type(p));
            close(p.ruralPop + p.urbanPop, p.pop); assert.ok(p.ruralPop >= 0);
        }
    }
    assert.equal(E.physicalFingerprint(w), physics);
    const audit = E.auditCivilization(society, w); assert.equal(audit.badPop, 0); assert.equal(audit.badShares, 0); assert.equal(audit.invalidOwners, 0);
});

test('loading and rerolling an older save preserves its original settlement generation', () => {
    const legacy = JSON.parse(JSON.stringify(ordinary)); delete legacy.options.highCitadelsVersion;
    assert.doesNotThrow(() => UI.validateSimulation(legacy, w));
    const result = UI.reroll(w, legacy);
    assert.equal(result.error, null); assert.equal(result.sim.options.highCitadelsVersion, 0);
    assert.equal(result.sim.settlementSignature, legacy.settlementSignature);
    assert.equal(result.sim.provinces.some(p => p.highCitadel), false);
    assert.deepEqual(result.sim.initialSettlements, legacy.initialSettlements);
    const broken = structuredClone(legacy); broken.settlementSignature = 'inconsistent';
    const rejected = UI.reroll(w, broken);
    assert.match(rejected.error, /Political reroll altered/); assert.equal(rejected.sim, broken, 'failed reroll replaced the current saved history');
});

test('current JSON saves restore high citadel metadata and reject invalid population caps before advancing', () => {
    const restored = JSON.parse(JSON.stringify(sim));
    assert.equal(restored.options.highCitadelsVersion, 1); assert.doesNotThrow(() => UI.validateSimulation(restored, w));
    const result = UI.reroll(w, restored);
    assert.equal(result.error, null); assert.equal(result.sim.settlementSignature, sim.settlementSignature);
    assert.deepEqual(result.sim.provinces.filter(p => p.highCitadel).map(p => p.highCitadel), citadels().map(p => p.highCitadel));
    // Metadata also identifies an early save made before the explicit option
    // was introduced; genuinely older worlds have neither field.
    delete restored.options.highCitadelsVersion;
    assert.equal(E.HighCitadels.historyOptions(restored).highCitadelsVersion, 1);
    for (const change of [h => { delete h.populationCap; }, h => { h.populationCap = 100000; }, h => { h.sourceCell++; }, h => { h.support = null; }]) {
        const bad = structuredClone(restored); change(bad.provinces[419].highCitadel);
        assert.throws(() => UI.validateSimulation(bad, w), /Invalid high citadel/);
    }
    assert.equal(E.physicalFingerprint(w), physics);
});
