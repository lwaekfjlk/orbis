import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, defaults, root } from './engine-loader.mjs';
const E = loadEngine();
let w, s, geo;
const results = { engine: process.version, seed: defaults.seed, checks: {} };
const hashFields = w => Object.fromEntries(Object.entries(w).filter(([, v]) => ArrayBuffer.isView(v)).map(([k, v]) => [k, createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')]));
const pristine = () => E.createCivilization(w, { realms: 18, historySeed: 'First-dawn' });
function audit(s) { const a = E.auditCivilization(s, w); assert(a.finiteRealms); for (const k of ['invalidOwners', 'badShares', 'badPop', 'badCapitals', 'waterClaims', 'routeErrors'])
    assert.equal(a[k], 0, k); return a; }
test.before(async () => { w = await E.generateWorld(defaults); geo = E.physicalFingerprint(w); s = pristine(); });
test('World and existing towns precede city detail', () => {
    // Counts, not constants: both move whenever the terrain does, and neither is the
    // claim. What is being checked is that the world settles before it is divided —
    // several realms, a town on every reasonable site, no continent of five or more
    // towns left under a single crown, and nothing orphaned.
    const towns = s.provinces.filter(p => p.city).length;
    assert(s.realms.length >= 18, `only ${s.realms.length} realms formed`);
    assert(towns >= 60, `only ${towns} towns founded`);
    const d = E.politicalDiagnostics(s, w);
    assert(d.continents.filter(c => c.towns >= 5).every(c => c.polities > 1));
    assert.equal(d.disconnected, 0);
    results.checks.geographyFirst = { realms: s.realms.length, towns, physicalHash: geo, continents: d.continents };
});
test('Every default town has deterministic, dry, non-overlapping detail', () => {
    const before = JSON.stringify(s), fields = hashFields(w), rows = [];
    for (const p of s.provinces.filter(p => p.city)) {
        const c = E.generateCity(w, s, p.id), a = E.auditCity(c);
        assert(c.buildings.length > 15, p.name); // Compounds contain multiple structures; not one old cuboid per record.
        for (const k of ['wetBuildings', 'roadBuildings', 'overlaps', 'nonfinite', 'seaRoads'])
            assert.equal(a[k], 0, `${p.name}: ${k}`);
        const twice = E.generateCity(w, s, p.id);
        assert.equal(c.fingerprint, twice.fingerprint);
        rows.push({ id: p.id, name: p.name, buildings: c.buildings.length, landmarks: c.landmarks.length, fingerprint: c.fingerprint, waterPercent: c.stats.waterPercent });
    }
    assert.equal(JSON.stringify(s), before);
    assert.deepEqual(hashFields(w), fields);
    assert.equal(E.physicalFingerprint(w), geo);
    results.checks.allTowns = { towns: rows.length, allParentArraysUnchanged: true, simulationUnchanged: true, minBuildings: Math.min(...rows.map(x => x.buildings)), maxBuildings: Math.max(...rows.map(x => x.buildings)), scenes: rows };
});
test('Non-settled districts do not get invented cities', () => {
    const p = s.provinces.find(p => !p.settled);
    assert(p);
    assert.throws(() => E.generateCity(w, s, p.id), /existing village or town/);
    results.checks.noAutomaticRuralCities = true;
});
test('Political reroll preserves local street geometry', () => {
    const p = s.provinces.filter(p => p.city).sort((a, b) => b.urbanPop - a.urbanPop)[0], first = E.generateCity(w, s, p.id).fingerprint;
    const alt = E.createCivilization(w, { realms: 18, historySeed: 'First-dawn', politySeed: 'First-councils*' });
    assert.equal(E.settlementFingerprint(alt), E.settlementFingerprint(s));
    assert.notEqual(E.politicalFingerprint(alt), E.politicalFingerprint(s));
    assert.equal(E.generateCity(w, alt, p.id).fingerprint, first);
    s = pristine();
    results.checks.polityIndependentCityPlan = true;
});
test('Project pays once, finishes at due year, survives JSON save, preserves geography', () => {
    const state = structuredClone(s), p = state.provinces.filter(p => p.city && p.owner >= 0).sort((a, b) => b.harbor - a.harbor)[0], c = state.realms[p.owner], before = c.treasury, support = p.urbanSupport;
    const layout = E.generateCity(w, state, p.id).fingerprint, result = E.startCityProject(state, w, p.id, 'granary');
    assert(result.ok);
    assert.equal(c.treasury, before - result.cost);
    assert(!E.startCityProject(state, w, p.id, 'granary').ok);
    E.stepCivilization(state, w);
    E.stepCityProjects(state, w);
    assert.equal(p.urbanSupport, support);
    const restored = JSON.parse(JSON.stringify(state));
    E.validateCityState(restored);
    for (let i = 0; i < 4; i++) {
        E.stepCivilization(state, w);
        E.stepCityProjects(state, w);
        E.stepCivilization(restored, w);
        E.stepCityProjects(restored, w);
    }
    assert.deepEqual(state, restored);
    assert.equal(state.cityState[p.id].levels.granary, 1);
    assert(Math.abs(p.urbanSupport - support * 1.08) < 1e-7);
    assert.equal(E.generateCity(w, state, p.id).fingerprint, layout);
    assert.equal(E.physicalFingerprint(w), geo);
    audit(state);
    results.checks.project = { cost: result.cost, completed: state.cityState[p.id].projects[0].completed, supportBefore: support, supportAfter: p.urbanSupport, planUnchanged: true, saveContinuationIdentical: true };
});
test('Project preconditions, upgrade cap and malformed save validation', () => {
    const z = structuredClone(s), p = z.provinces.find(p => p.city && p.owner >= 0 && p.harbor < .12 && p.siteLake < .25);
    assert(p);
    assert(!E.cityProjectQuote(z, p.id, 'harbor').ok);
    const c = z.realms[p.owner];
    c.treasury = 0;
    assert(!E.startCityProject(z, w, p.id, 'academy').ok);
    assert(!E.startCityProject(z, w, p.id, 'not-a-project').ok);
    p.fresh = 0;
    assert(!E.cityProjectQuote(z, p.id, 'waterworks').ok);
    z.cityState = { [p.id]: { levels: { granary: 99 }, projects: [], events: [] } };
    assert.throws(() => E.validateCityState(z), /Invalid city upgrade/);
    z.cityState = { [p.id]: { levels: {}, projects: [{ key: 'granary', status: 'building', started: 400, due: 390, cost: 5 }], events: [] } };
    assert.throws(() => E.validateCityState(z), /Invalid city project/);
    results.checks.projectValidation = true;
});
test('Journey follows graph, unreachable towns do not get teleport routes', () => {
    const towns = s.provinces.filter(p => p.city);
    let found = null, absent = false;
    for (const p of towns.slice(0, 12))
        for (const q of towns.slice(-12)) {
            const route = E.planJourney(s, p.id, q.id);
            if (route.ok && route.nodes.length > 1 && !found)
                found = route;
            else if (!route.ok)
                absent = true;
        }
    assert(found);
    for (const seg of found.segments) {
        assert(s.marketGraph[seg.from].some(e => e.to === seg.to));
    }
    assert(absent);
    results.checks.journey = { routeExists: true, onlyGraphEdges: true, unreachableRefused: true, example: found };
});
test('120 years remain finite and city projects do not mutate natural fields', () => {
    const z = structuredClone(s), p = z.provinces.find(p => p.city && p.owner >= 0);
    E.startCityProject(z, w, p.id, 'academy');
    for (let i = 0; i < 120; i++) {
        E.stepCivilization(z, w);
        E.stepCityProjects(z, w);
        audit(z);
    }
    assert.equal(E.physicalFingerprint(w), geo);
    results.checks.longRun = { year: z.year, livingRealms: z.realms.filter(c => c.alive).length, projects: 1, audit: audit(z) };
});
test('GLB exporter creates aligned glTF buffers and rejects nonfinite coordinates', () => {
    const vertices = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]);
    const data = E.exportGeometryGLB({ mesh: { vertices } }, { city: 'Test' }), dv = new DataView(data);
    assert.equal(dv.getUint32(0, true), 0x46546c67);
    assert.equal(dv.getUint32(8, true), data.byteLength);
    const n = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, n)));
    assert.equal(j.accessors[0].count, 3);
    assert.equal(j.bufferViews[0].byteStride, 36);
    assert.equal(j.buffers[0].byteLength, vertices.byteLength);
    vertices[0] = NaN;
    assert.throws(() => E.exportGeometryGLB({ mesh: { vertices } }), /Nonfinite/);
    results.checks.glb = true;
});
test.after(() => { mkdirSync(resolve(root, 'artifacts'), { recursive: true }); writeFileSync(resolve(root, 'artifacts/engine-results.json'), JSON.stringify(results, null, 2)); });
