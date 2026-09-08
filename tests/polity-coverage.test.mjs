import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEngine, defaults, root } from './engine-loader.mjs';

const E = loadEngine();
const options = { realms: 18, historySeed: 'First-dawn', highCitadelsVersion: 0 };
const currentOptions = { realms: 18, historySeed: 'First-dawn' };
// Captured before the sovereignty change. These include full precision people
// counts and every province's cells, rather than just rounded fingerprint inputs.
const baselines = [
    { seed: 'Aereth-47', form: 'global', physical: '440ae5d0', settlement: '6b6c5ea8', records: 'bb6e4b4fc5119dc6e22b987a2ce16af7b41b77da2e18c8a5e421362abc4cdb44', population: 11802982.688698875, urbanPopulation: 3347878.8835059092, provinces: 619, towns: 88, settled: 102, gridSignature: 1945107923 },
    { seed: 'Landmark-index-2', form: 'global', physical: 'd8afdceb', settlement: '40cf763f', records: '6d59424ed9ad3f0bf3b452f02fb2d409e6056a88541516a16cc9270176dcd1c1', population: 11124601.543224564, urbanPopulation: 3095895.633478693, provinces: 594, towns: 97, settled: 112, gridSignature: 1936042145 },
    { seed: 'Meridian-21', form: 'rift', physical: '02a4a06d', settlement: '395254c3', records: '1b696840804b3d8340880644e4bef9724afcc70d132701bea5b547f38a2c95e7', population: 9114658.009405773, urbanPopulation: 2644871.553258386, provinces: 501, towns: 68, settled: 81, gridSignature: 2348767987 }
];
const snapshots = [];
const scenarios = () => snapshots.flatMap(snapshot => [snapshot, { ...snapshot, s: snapshot.current }]);
const faithBaselines = [
    '0fee3ccbb66bb69d32f91ba57bdcb06127852322e72db097b86e7305561f9dd4',
    'f6d1d243acbd4e6246f6fdf5f67ca4053c86200ea89b18b5da4f4a59465aa2da',
    'fc625356bf3947503b729df923249f2d5b421a911e2c18041ef74dfb22018433'
];
const records = s => s.provinces.map(p => ({ id: p.id, i: p.i, x: p.x, y: p.y, cells: p.cells, pop: p.pop, urbanPop: p.urbanPop, urbanSupport: p.urbanSupport, detailSupport: p.detailSupport, detailMana: p.detailMana, city: p.city, settled: p.settled, settlementType: p.settlementType }));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assertAudit(s, w) {
    const audit = E.auditCivilization(s, w);
    for (const field of ['invalidOwners', 'badShares', 'badPop', 'badCapitals', 'waterClaims', 'routeErrors']) assert.equal(audit[field], 0, field);
    assert(audit.finiteRealms);
}

test.before(async () => {
    for (const baseline of baselines) {
        const w = await E.generateWorld({ ...defaults, seed: baseline.seed, form: baseline.form });
        snapshots.push({ baseline, w, s: E.createCivilization(w, options), current: E.createCivilization(w, currentOptions) });
    }
});

test('sovereignty changes preserve geography, every settlement and the exact population budget across seeds', () => {
    for (const { baseline: b, w, s } of snapshots) {
        assert.equal(E.physicalFingerprint(w), b.physical, b.seed + ' terrain');
        assert.equal(E.settlementFingerprint(s), b.settlement, b.seed + ' settlements');
        assert.equal(digest(records(s)), b.records, b.seed + ' full precision settlement records');
        assert.equal(s.provinces.reduce((n, p) => n + p.pop, 0), b.population);
        assert.equal(s.provinces.reduce((n, p) => n + p.urbanPop, 0), b.urbanPopulation);
        assert.equal(s.provinces.length, b.provinces);
        assert.equal(s.provinces.filter(p => p.city).length, b.towns);
        assert.equal(s.provinces.filter(p => p.settled).length, b.settled);
        assert.equal(s.gridSignature, b.gridSignature, 'old saves must rebuild the same province raster');
        assert.equal(digest(s.provinces.map(p => p.faith)), faithBaselines[baselines.indexOf(b)], 'settlement cultures must not consume or change the faith random stream');
        assertAudit(s, w);
    }
});

test('rare high citadels preserve the three worlds population, ordinary provinces and majority countries', t => {
    for (const { s, current, w, baseline } of snapshots) {
        const high = current.provinces.filter(p => p.highCitadel), added = new Set(high.map(p => p.id));
        assert.equal(current.options.highCitadelsVersion, 1); assert(high.length <= 2);
        assert.equal(current.provinces.reduce((sum, p) => sum + p.pop, 0), baseline.population);
        assert.equal(current.provinces.filter(p => p.city).length, baseline.towns);
        assert.equal(current.provinces.filter(p => p.settled).length, baseline.settled + high.length);
        for (const p of current.provinces) {
            const before = s.provinces[p.id];
            assert.equal(p.pop, before.pop); assert.deepEqual(p.people, before.people); assert.deepEqual(p.faith, before.faith);
            if (!added.has(p.id)) assert.deepEqual(p, before, baseline.seed + ': ordinary province changed');
            else {
                assert.equal(p.i, before.i); assert.equal(before.settled, false);
                assert.equal(p.capacity, before.capacity); assert.equal(p.ruralCapacity, before.ruralCapacity);
                assert(p.urbanPop >= 650 && p.urbanPop <= 1100); assert(p.highCitadel.elevation >= 3500);
                assert.equal(p.ruralPop, p.pop - p.urbanPop);
            }
        }
        assert.deepEqual(current.culturalOrigins, s.culturalOrigins);
        assert.deepEqual(current.realms, s.realms); assert.deepEqual(current.relations, s.relations);
        assert.equal(E.politicalFingerprint(current), E.politicalFingerprint(s));
        assert.equal(E.physicalFingerprint(w), baseline.physical); assert.equal(current.gridSignature, baseline.gridSignature);
        assertAudit(current, w);
        t.diagnostic(JSON.stringify({ seed: baseline.seed, highCitadels: high.map(p => p.id), settlement: E.settlementFingerprint(current), political: E.politicalFingerprint(current) }));
    }
});

test('each founding country has a visible majority and still contains minority populations', () => {
    for (const { s, baseline } of scenarios()) {
        const countries = s.realms.filter(c => c.alive);
        if (baseline.seed === defaults.seed) assert(countries.length >= 20 && countries.length <= 26, 'the default world should contain twenty-something countries, got ' + countries.length);
        assert(countries.length > 1 && countries.length < s.provinces.filter(p => p.city).length, baseline.seed + ': settlement geography should produce multiple consolidated countries');
        for (const c of countries) {
            const held = s.provinces.filter(p => p.owner === c.id);
            const population = held.reduce((n, p) => n + p.pop, 0);
            assert(population > 0, c.name + ' has no resident population');
            const shares = E.PEOPLES.map((_, k) => held.reduce((n, p) => n + p.pop * p.people[k], 0) / population);
            for (let k = 0; k < shares.length; k++) assert(Math.abs(c.people[k] - shares[k]) < 1e-10, c.name + ': the displayed mixture must count actual residents');
            const ranked = shares.slice().sort((a, b) => b - a);
            assert(ranked[0] > .52 - 1e-10, c.name + ': largest population share is only ' + ranked[0]);
            assert.equal(shares[c.originPeople], ranked[0], c.name + ': the declared founding people must be the measured majority');
            assert(ranked[0] < 1, c.name + ': founding must retain minority residents');
            assert(ranked[1] > 0, c.name + ': minority residents were discarded');
            assert(shares.every(v => Number.isFinite(v) && v >= 0));
        }
    }
});

test('all existing towns belong to connected land territories with bounded direct administration', () => {
    for (const { s, w, baseline } of scenarios()) {
        for (const p of s.provinces.filter(p => p.settled)) assert(s.realms[p.owner]?.alive, baseline.seed + ': unclaimed settlement ' + p.name);
        for (const c of s.realms.filter(c => c.alive)) {
            assert.equal(s.provinces[c.capital].owner, c.id, c.name + ' owns its capital');
            const held = s.provinces.filter(p => p.owner === c.id);
            const visited = new Set([c.capital]), queue = [c.capital];
            while (queue.length) {
                const p = s.provinces[queue.pop()];
                for (const id of p.neighbors) if (s.provinces[id].owner === c.id && !visited.has(id)) { visited.add(id); queue.push(id); }
            }
            assert.equal(visited.size, held.length, c.name + ': sovereignty cannot leap over foreign land or sea routes');
            assert(Number.isFinite(c.adminUsed) && c.adminUsed >= 0 && c.adminUsed <= c.adminBudget + 1e-9, c.name + ': direct administration exceeds its budget');
            for (const p of held) {
                assert(['direct', 'local'].includes(p.administration), p.name + ': distinguish sovereignty from administrative reach');
                for (const i of p.cells) assert(w.height[i] > 0 && w.lake[i] <= 0, p.name + ': territorial claims include water');
            }
        }
    }
});

test('remaining unclaimed residents have real connected communities and wilderness stays a small remainder', () => {
    for (const { s, w, baseline } of scenarios()) {
        let unclaimedPopulation = 0, totalArea = 0, claimedArea = 0;
        for (const p of s.provinces) {
            const area = p.cells.reduce((n, i) => n + w.area[i], 0);
            totalArea += area;
            if (p.owner >= 0) { claimedArea += area; continue; }
            unclaimedPopulation += p.pop;
            assert(!p.settled, p.name + ': existing settlements cannot disappear into wilderness');
            if (p.pop > 0) {
                const community = s.localCommunities[p.localCommunity];
                assert(community && community.provinces.includes(p.id), p.name + ': resident households need a real community record');
                assert(community.name && community.government, p.name + ': the community must be identifiable');
            }
        }
        assert(unclaimedPopulation <= baseline.population * .02, baseline.seed + ': too many residents lack national territory');
        assert(claimedArea / totalArea >= .90, baseline.seed + ': provinces leave too much land without sovereignty');
        const assigned = new Set();
        for (const community of s.localCommunities) {
            const ids = new Set(community.provinces);
            assert(ids.has(community.capital));
            assert.equal(ids.size, community.provinces.length);
            const reached = new Set([community.capital]), queue = [community.capital];
            while (queue.length) for (const id of s.provinces[queue.pop()].neighbors) if (ids.has(id) && !reached.has(id)) { reached.add(id); queue.push(id); }
            assert.equal(reached.size, ids.size, 'independent communities cannot merge unrelated shores');
            for (const id of ids) {
                assert(!assigned.has(id)); assigned.add(id);
                assert.equal(s.provinces[id].owner, -1);
                assert.equal(s.provinces[id].localCommunity, community.id);
            }
            assert.equal(community.foundingPopulation, community.provinces.reduce((n, id) => n + s.provinces[id].pop, 0));
        }
    }
});

test('founding and political rerolls are deterministic without moving settlements', () => {
    const { w, s, baseline } = snapshots[0];
    assert.deepEqual(E.createCivilization(w, options), s);
    const rerolled = E.createCivilization(w, { ...options, politySeed: 'First-councils*' });
    assert.notEqual(E.politicalFingerprint(rerolled), E.politicalFingerprint(s));
    assert.equal(digest(records(rerolled)), baseline.records);
    assert.equal(E.physicalFingerprint(w), baseline.physical);
    assertAudit(rerolled, w);
    for (const { w, current, baseline } of snapshots) {
        assert.deepEqual(E.createCivilization(w, currentOptions), current);
        const next = E.createCivilization(w, E.HighCitadels.historyOptions(current, { politySeed: 'First-councils*' }));
        assert.equal(digest(records(next)), digest(records(current)), baseline.seed + ': current reroll moved or changed a settlement');
        assert.equal(E.physicalFingerprint(w), baseline.physical); assertAudit(next, w);
    }
});

test('the actual save validator preserves stored populations and histories and JSON saves continue identically', () => {
    const ui = readFileSync(root + '/src/ui/world-ui.js', 'utf8');
    const body = ui.slice(ui.indexOf('function validateSimulation('), ui.indexOf('function refreshAll('));
    const validate = Function(...Object.keys(E), body + ';return validateSimulation;')(...Object.values(E));
    for (const { w, s, baseline } of scenarios()) {
        const original = structuredClone(s);
        for (let year = 0; year < 3; year++) E.stepCivilization(original, w);
        const restored = JSON.parse(JSON.stringify(original));
        const saved = JSON.stringify(restored);
        validate(restored, w);
        assert.equal(JSON.stringify(restored), saved, 'loading must not redraw borders or homogenize stored people');
        // Older saves and later migrations can have no majority at all. The
        // founding presentation goal is not a reason to rewrite that history.
        const plural = JSON.parse(JSON.stringify(restored));
        for (const p of plural.provinces) p.people = E.PEOPLES.map(() => 1 / E.PEOPLES.length);
        for (const c of plural.realms) c.people = E.PEOPLES.map(() => 1 / E.PEOPLES.length);
        const pluralSave = JSON.stringify(plural);
        validate(plural, w);
        assert.equal(JSON.stringify(plural), pluralSave, 'a historical population without a majority remains valid');
        for (let year = 0; year < 6; year++) {
            E.stepCivilization(original, w);
            E.stepCivilization(restored, w);
        }
        assert.deepEqual(restored, original, baseline.seed + ' saved continuation');
        assertAudit(restored, w);
        assert.equal(E.physicalFingerprint(w), baseline.physical);
    }
});
