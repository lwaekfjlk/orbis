/** The vocabulary is a recombination, so what has to be locked is not any one output
 * but the RULES: every form reachable, none stranded, weather decides construction,
 * belief decides ornament, the realm decides the seat of government — and ancestry
 * decides none of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root, defaults} from './engine-loader.mjs';
const code = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(s => readFileSync(resolve(root, s), 'utf8')).join('\n');
const E = Function(code + '\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,TownVocabulary,TownCityBinding,CityEnvironment,LandmarkCatalog,LandmarkKit,LandmarkTemplates,cDominant};')();
const digest = g => createHash('sha256').update(Buffer.from(Float32Array.from(g.data).buffer)).digest('hex');
let world, sim, survey;
const report = {version: 1, seed: defaults.seed, checks: {}};
const FAITHKEY = ['sun', 'stars', 'grove', 'hearth', 'tide', 'secular'];

test.before(async () => {
 world = await E.generateWorld(defaults);
 sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
 // One pass over every town, sampling the vocabulary its blocks actually resolve to.
 const roofs = {}, materials = {}, perTown = [];
 for (const p of sim.provinces.filter(q => q.city)) {
  const c = E.generateCity(world, sim, p.id);
  const faith = FAITHKEY[E.cDominant(p.faith)] || 'secular';
  const seen = new Set();
  for (const b of c.buildings.filter(b => !b.landmark).slice(0, 40)) {
   const cl = E.CityEnvironment.localClimate(c.environment, c.index(b.x, b.z));
   const v = E.TownVocabulary.select({climate: cl, site: {...c.siteEnvironment, ore: p.ore}, faith, people: E.cDominant(p.people), seed: c.townRecipe.seed + '/' + b.id});
   roofs[v.roof] = (roofs[v.roof] || 0) + 1;
   materials[v.material] = (materials[v.material] || 0) + 1;
   seen.add(v.roof);
  }
  perTown.push(seen.size);
 }
 survey = {roofs, materials, perTown};
});

test('every roof form and every material is reachable, and none dominates the world', () => {
 const total = Object.values(survey.roofs).reduce((a, b) => a + b, 0);
 for (const id of Object.keys(E.TownVocabulary.ROOFS))
  assert(survey.roofs[id] > 0, `roof form "${id}" is authored but never chosen anywhere`);
 for (const id of Object.keys(E.TownVocabulary.MATERIALS))
  assert(survey.materials[id] > 0, `material "${id}" is authored but never chosen anywhere`);
 // A library that resolves to one answer everywhere is the bug this replaced.
 for (const [id, n] of Object.entries(survey.roofs))
  assert(n / total < .45, `roof form "${id}" takes ${(n / total * 100).toFixed(0)}% of the world`);
 const avg = survey.perTown.reduce((a, b) => a + b, 0) / survey.perTown.length;
 assert(avg > 1.6, `a town averages only ${avg.toFixed(1)} roof forms; it should not be uniform`);
 report.checks.coverage = {roofs: survey.roofs, materials: survey.materials, formsPerTown: +avg.toFixed(2)};
});

test('weather picks the construction: the same ground answers differently as it changes', () => {
 const V = E.TownVocabulary, site = {forestFraction: .45, bed: 400, mountainous: false, aridity: 1.0, ore: .2};
 const at = (t, a, winter) => V.select({climate: E.CityEnvironment.climate(t, a, 400, 0, 0, winter), site: {...site, aridity: a}, faith: 'secular', people: 0, seed: 'weather'});
 const snowy = at(-6, 1.2, -16), temperate = at(14, 1.0, 4), monsoon = at(27, 2.3, 26), desert = at(28, .25, 22);
 assert.equal(snowy.roof, 'northern', 'a snow-loaded site must be pitched to shed');
 assert.equal(snowy.material, 'log');
 assert(['leaf', 'upturned', 'deepeave'].includes(monsoon.roof), 'monsoon must throw water clear of the wall, got ' + monsoon.roof);
 assert(['parapet', 'vault', 'rockcut'].includes(desert.roof), 'a rainless site should not be pitched, got ' + desert.roof);
 assert.equal(new Set([snowy.roof, temperate.roof, monsoon.roof, desert.roof]).size, 4, 'the four extremes must not share a roof');
 assert(snowy.pitch > temperate.pitch && temperate.pitch > desert.pitch, 'pitch must fall as the snow does');
 assert(monsoon.eave > temperate.eave && temperate.eave > desert.eave, 'eave must deepen with rain');
 report.checks.weather = Object.fromEntries(Object.entries({snowy, temperate, monsoon, desert})
  .map(([k, v]) => [k, {roof: v.roof, material: v.material, pitch: +v.pitch.toFixed(2), eave: +v.eave.toFixed(2)}]));
});

test('ancestry decides nothing: only belief and weather change the building', () => {
 const V = E.TownVocabulary, site = {forestFraction: .4, bed: 400, mountainous: false, aridity: 1.0, ore: .2};
 const cl = E.CityEnvironment.climate(16, 1.0, 400, 0, 0, 4);
 // Hold the place and the faith fixed, vary only the people. The FORM must not move.
 const forms = new Set();
 for (let people = 0; people < E.TownVocabulary.CRAFT.length; people++)
  forms.add(V.select({climate: cl, site, faith: 'sun', people, seed: 'ancestry'}).roof);
 assert.equal(forms.size, 1, 'the roof form changed with the inhabitants: ' + [...forms].join(', '));
 // Belief, by contrast, is allowed to show — that is what it is for.
 const crowns = new Set(['sun', 'stars', 'grove', 'hearth', 'tide', 'ancestors'].map(f => V.select({climate: cl, site, faith: f, people: 0, seed: 'faith'}).crown));
 assert(crowns.size >= 4, 'faith must reach the crown, got ' + [...crowns].join(', '));
 report.checks.ancestryNeutral = {roofFormsAcrossPeoples: forms.size, crownsAcrossFaiths: crowns.size};
});

test('the vocabulary replays exactly, and a different seed varies it', () => {
 const V = E.TownVocabulary, site = {forestFraction: .4, bed: 500, mountainous: false, aridity: .9, ore: .3};
 const cl = E.CityEnvironment.climate(15, .9, 500, 0, 0, 3);
 const a = V.select({climate: cl, site, faith: 'tide', people: 2, seed: 'replay'});
 const b = V.select({climate: cl, site, faith: 'tide', people: 2, seed: 'replay'});
 assert.deepEqual(a, b);
 const varied = new Set();
 for (let i = 0; i < 40; i++) varied.add(V.select({climate: cl, site, faith: 'tide', people: 2, seed: 'roll' + i}).roof);
 assert(varied.size > 1, 'one climate must not collapse to one single roof across a whole quarter');
 report.checks.replay = {deterministic: true, formsFromSeedAlone: varied.size};
});

test('the seat of government answers to its realm and its faith, not only to its weather', () => {
 // Same province, same ground, same climate; only the realm and the faith move.
 const p = sim.provinces.filter(q => q.city).sort((a, b) => b.urbanPop - a.urbanPop)[0];
 const c = E.generateCity(world, sim, p.id);
 const shape = altered => E.TownCityBinding.resolve(world, altered, altered.provinces[p.id], c, 'civic');
 const seen = new Map();
 for (const [archetype, gov] of [['forest', 0], ['maritime', 0], ['forge', 0], ['granary', 0], ['arcane', 0], ['lake', 0], ['frontier', 0], ['granary', 1], ['granary', 2]]) {
  const alt = structuredClone(sim);
  const realm = alt.realms[alt.provinces[p.id].owner];
  if (!realm) continue;
  realm.archetype = archetype; realm.gov = gov;
  seen.set(archetype + '/' + gov, shape(alt).style);
 }
 assert(new Set(seen.values()).size >= 4, 'the realm must change the seat of government, got ' + [...new Set(seen.values())].join(', '));
 // And the faith has to reach its crown.
 const crowns = new Set();
 for (let f = 0; f < 6; f++) {
  const alt = structuredClone(sim), q = alt.provinces[p.id];
  q.faith = q.faith.map((_, i) => i === f ? 1 : 0);
  crowns.add(shape(alt).crown);
 }
 assert(crowns.size >= 3, 'faith must change the crown of the civic hall, got ' + [...crowns].join(', '));
 report.checks.palace = {byRealm: Object.fromEntries(seen), crowns: [...crowns]};
});

test('a capital is visibly a capital and a hamlet a hamlet', () => {
 const rows = [];
 for (const p of sim.provinces.filter(q => q.settled && q.urbanPop >= 650)) {
  const c = E.generateCity(world, sim, p.id);
  rows.push({name: p.name, pop: p.urbanPop, span: c.span, blocks: c.buildings.length});
 }
 rows.sort((a, b) => a.span - b.span);
 const ratio = rows.at(-1).span / rows[0].span;
 assert(ratio > 2, `largest town is only ${ratio.toFixed(2)}x the smallest; population spans 34x`);
 // Extent has to answer to population, not only to how far the neighbour is.
 const mx = rows.reduce((a, r) => a + r.pop, 0) / rows.length, my = rows.reduce((a, r) => a + r.span, 0) / rows.length;
 let num = 0, dx = 0, dy = 0;
 for (const r of rows) { num += (r.pop - mx) * (r.span - my); dx += (r.pop - mx) ** 2; dy += (r.span - my) ** 2; }
 const corr = num / Math.sqrt(dx * dy);
 assert(corr > .3, `population barely reaches the footprint (r=${corr.toFixed(2)})`);
 // A small town still has to be a town.
 assert(rows[0].blocks > 40, 'the smallest town still needs enough blocks to read as one');
 report.checks.size = {ratio: +ratio.toFixed(2), correlation: +corr.toFixed(2),
  smallest: {name: rows[0].name, pop: Math.round(rows[0].pop), span: +rows[0].span.toFixed(1), blocks: rows[0].blocks},
  largest: {name: rows.at(-1).name, pop: Math.round(rows.at(-1).pop), span: +rows.at(-1).span.toFixed(1), blocks: rows.at(-1).blocks}};
});

test('every new roof form builds finite geometry inside its own footprint', () => {
 for (const kind of Object.keys(E.TownVocabulary.ROOFS)) {
  const recipe = E.LandmarkCatalog.recipe('river', 'roof/' + kind, {urbanStyle: 'river'});
  const k = new E.LandmarkKit(recipe, {base: false, lod: 2});
  k.part('r', 'r', 'architecture', () => k.roof(0, 0, 0, 4, 5, 2.4, 'roof', kind));
  const m = k.finish();
  assert(m.stats.triangles > 0, kind + ' drew nothing');
  for (const part of m.parts) for (const v of part.geometry.data) assert(Number.isFinite(v), kind + ' produced a non-finite vertex');
  // Generous but finite: a form may overhang its plan, it may not run away.
  assert(m.bounds.max[0] < 9 && m.bounds.min[0] > -9 && m.bounds.max[2] < 11 && m.bounds.min[2] > -11, kind + ' escaped its footprint');
  const again = new E.LandmarkKit(recipe, {base: false, lod: 2});
  again.part('r', 'r', 'architecture', () => again.roof(0, 0, 0, 4, 5, 2.4, 'roof', kind));
  assert.equal(digest(m.parts[0].geometry), digest(again.finish().parts[0].geometry), kind + ' is not deterministic');
 }
 report.checks.geometry = {forms: Object.keys(E.TownVocabulary.ROOFS).length};
});

test('none of this moved the physical world or the society', () => {
 assert.equal(E.physicalFingerprint(world), 'dfd91476');
 assert.equal(E.settlementFingerprint(sim), '77c3b21f');
});

test.after(() => writeFileSync(resolve(root, 'docs/VOCABULARY_RESULTS.json'), JSON.stringify(report, null, 2)));
