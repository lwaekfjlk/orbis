/** The regression that would have caught the original defect.
 *
 * Before this suite existed, `forest` was assigned to 18 towns spanning 6.7 C to
 * 27.8 C and every one of them was built from the same meshes, the same palette and
 * the same tree species; the map blended all five forest biomes 40% toward one khaki,
 * so boreal and tropical forest differed by about 5/255 in RGB. Nothing failed.
 *
 * These tests assert the two things that were actually wrong: that climate reaches
 * the ground colour, and that it reaches the buildings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scripts} from '../scripts/manifest.mjs';
import {root, defaults} from './engine-loader.mjs';
const code = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(s => readFileSync(resolve(root, s), 'utf8')).join('\n');
const E = Function(code + '\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,CityEnvironment,TownCatalog,ArtisanCityKit,LandmarkCatalog,LandmarkKit,AtlasRenderer,BIOME,GW,GN};')();
const rgbDistance = (a, b) => Math.hypot(...a.map((v, i) => (v - b[i]) * 255));
const digest = g => createHash('sha256').update(Buffer.from(Float32Array.from(g.data).buffer)).digest('hex');
let world, sim;
const worlds = {};
const report = {version: 1, seed: defaults.seed, checks: {}};
test.before(async () => {
 world = await E.generateWorld(defaults);
 sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
 // Two more worlds, so "no tradition is stranded" can be asked of the model rather
 // than of one seed's luck.
 for (const seed of ['Tanguine', 'Ninefold-9']) {
  const other = await E.generateWorld({...defaults, seed});
  worlds[seed] = {world: other, sim: E.createCivilization(other, {realms: 18, historySeed: 'First-dawn'})};
 }
});

test('cold and hot ground are told apart on the map, inside a biome and across biomes', () => {
 const byBiome = {};
 for (let i = 0; i < E.GN; i++) if (world.height[i] > 0) (byBiome[world.biome[i]] ||= []).push(i);
 const median = b => E.CityEnvironment.cellColor(world, byBiome[b][Math.floor(byBiome[b].length / 2)]);
 // The headline failure: boreal forest against tropical rainforest.
 const borealVsTropical = rgbDistance(median(8), median(11));
 assert(borealVsTropical > 24, `boreal vs tropical rainforest only ${borealVsTropical.toFixed(1)}/255 apart`);
 assert(rgbDistance(median(2), median(6)) > 24, 'tundra and savanna must not share a colour');
 assert(rgbDistance(median(7), median(8)) > 18, 'temperate and boreal forest must not share a colour');
 // Within one biome, a wide temperature range has to show as a gradient. Water and
 // ice are excluded: those resolve to the shared water/ice ramps, not to ground
 // colour. Biomes whose own range is narrow are excluded too, because the biome
 // classifier already split those by temperature.
 const graded = [];
 for (const [b, cells] of Object.entries(byBiome)) {
  if (cells.length < 200 || [0, 15, 16, 17].includes(Number(b))) continue;
  const sorted = cells.slice().sort((x, y) => world.temp[x] - world.temp[y]);
  const lo = sorted[Math.floor(sorted.length * .05)], hi = sorted[Math.floor(sorted.length * .95)];
  if (world.temp[hi] - world.temp[lo] < 10) continue;
  const spread = rgbDistance(E.CityEnvironment.cellColor(world, lo), E.CityEnvironment.cellColor(world, hi));
  graded.push({biome: Number(b), degrees: +(world.temp[hi] - world.temp[lo]).toFixed(1), spread: +spread.toFixed(1)});
  assert(spread > 6, `biome ${b} spans ${(world.temp[hi] - world.temp[lo]).toFixed(1)} C but only ${spread.toFixed(1)}/255 of colour`);
 }
 assert(graded.length >= 3, 'expected several wide-range biomes to grade');
 report.checks.groundColour = {borealVsTropical: +borealVsTropical.toFixed(1), gradedBiomes: graded};
});

test('vegetation form follows temperature and aridity, and stops at the treeline', () => {
 const form = (b, t, a) => E.CityEnvironment.canopy(b, t, a).form;
 assert.equal(form(8, 1, 1.2), 'conifer', 'cold forest is conifer');
 assert.equal(form(11, 26, 2.0), 'rainforest', 'hot perhumid forest is closed rainforest');
 assert.equal(form(6, 24, .6), 'acacia', 'savanna is flat-crowned');
 assert.equal(form(5, 20, .5), 'scrub', 'dry steppe is scrub');
 assert.equal(form(7, -2, 1.0), 'cushion', 'below the treeline temperature, cover is dwarf');
 assert.equal(form(7, -10, 1.0), 'none', 'nothing grows in the cold extreme');
 // Density falls monotonically as the same forest gets colder: this is the treeline.
 const ramp = [14, 8, 4, 2, 0, -2, -4, -6].map(t => E.CityEnvironment.canopy(7, t, 1.2).density);
 for (let k = 1; k < ramp.length; k++) assert(ramp[k] <= ramp[k - 1] + 1e-9, 'canopy density must not rise as it gets colder');
 assert.equal(ramp.at(-1), 0, 'cover reaches zero above the treeline');
 // Every biome the world actually uses resolves to a defined form.
 const used = new Set();
 for (let i = 0; i < E.GN; i++) if (world.height[i] > 0) used.add(world.biome[i]);
 for (const b of used) assert(typeof form(b, world.temp[0], 1) === 'string');
 report.checks.vegetation = {treelineRamp: ramp.map(v => +v.toFixed(3)), biomesResolved: used.size};
});

test('the same house responds to snow load, heat, drought and rain', () => {
 const recipe = E.LandmarkCatalog.recipe('river', 'climate-probe', {urbanStyle: 'river'});
 const probe = (t, a, ice = 0, snow = 0, wet = 0) => {
  const cl = {...E.CityEnvironment.climate(t, a, 200, ice, snow), wet};
  const k = new E.LandmarkKit(recipe, {base: false, lod: 2});
  k.palette = {...E.ArtisanCityKit.palettes.river}; k.climate = cl;
  k.part('p', 'p', 'architecture', () => E.ArtisanCityKit.house(k, 0, 0, 0, 4, 5, 4.5, 'river', 0));
  const m = k.finish(), roofs = m.parts.filter(p => p.role === 'roof');
  const roofSpan = axis => Math.max(...roofs.map(p => p.bounds.max[axis])) - Math.min(...roofs.map(p => p.bounds.min[axis]));
  return {height: m.bounds.max[1] - m.bounds.min[1], width: m.bounds.max[0] - m.bounds.min[0], depth: m.bounds.max[2] - m.bounds.min[2], roofWidth: roofSpan(0), roofDepth: roofSpan(2), cl};
 };
 const arctic = probe(-8, 1.3, 40, .6), boreal = probe(2, 1.2), temperate = probe(14, 1.0), hotDry = probe(26, .25), hotWet = probe(26, 2.4);
 // Snow load steepens the roof; a dry heat flattens it into a terrace.
 assert(arctic.height > boreal.height, 'a snow-loaded roof must be steeper than a boreal one');
 assert(boreal.height > temperate.height, 'a boreal roof must be steeper than a temperate one');
 assert(temperate.height > hotDry.height, 'a hot arid house must be lower than a temperate one');
 assert(arctic.height / hotDry.height > 1.35, 'the extremes must differ by more than a rounding error');
 // Measure the roof itself: adobe window sills project past the battered wall
 // and can widen the house's body without adding any eave to its dry terrace.
 assert(hotWet.roofWidth > temperate.roofWidth + .5 && hotWet.roofDepth > temperate.roofDepth + .8, 'deep eaves must project in a hot wet climate');
 assert(hotDry.roofWidth <= temperate.roofWidth + .1, 'a dry climate must not grow an eave');
 report.checks.houseResponse = Object.fromEntries(Object.entries({arctic, boreal, temperate, hotDry, hotWet})
  .map(([k, v]) => [k, {height: +v.height.toFixed(2), width: +v.width.toFixed(2), depth: +v.depth.toFixed(2), roofWidth: +v.roofWidth.toFixed(2), roofDepth: +v.roofDepth.toFixed(2), load: +v.cl.load.toFixed(2)}]));
});

test('one tradition built at both ends of its own range is not the same town twice', () => {
 const byStyle = {};
 for (const p of sim.provinces.filter(p => p.city)) {
  const e = E.CityEnvironment.profile(world, p);
  (byStyle[E.TownCatalog.native(p, world)] ||= []).push({p, e});
 }
 const compared = [];
 for (const [style, towns] of Object.entries(byStyle)) {
  if (towns.length < 2) continue;
  towns.sort((a, b) => a.e.temperature - b.e.temperature);
  const cold = towns[0], hot = towns.at(-1);
  if (hot.e.temperature - cold.e.temperature < 6) continue;
  const build = q => {
   const c = E.generateCity(world, sim, q.p.id);
   // A dense city's ordinary homes can all use LOD 0. Climate still shapes
   // those houses; decorative-detail allocation must not erase this coverage.
   const b = c.buildings.find(b => !b.landmark);
   return b ? E.ArtisanCityKit.compound(b, c, q.p, sim.realms[q.p.owner]) : null;
  };
  const a = build(cold), b = build(hot);
  if (!a || !b) continue;
  assert.notEqual(digest(a.body), digest(b.body), `${style} builds identically at ${cold.e.temperature.toFixed(1)} C and ${hot.e.temperature.toFixed(1)} C`);
  compared.push({style, coldC: +cold.e.temperature.toFixed(1), hotC: +hot.e.temperature.toFixed(1), span: +(hot.e.temperature - cold.e.temperature).toFixed(1)});
 }
 assert(compared.length >= 5, 'expected several traditions to span a wide climate range');
 report.checks.sameTraditionDiffers = compared;
});

test('the wall is built of a different material at each end of the range, not just tinted', () => {
 const recipe = E.LandmarkCatalog.recipe('river', 'material-probe', {urbanStyle: 'river'});
 const build = (t, a, winter, ice = 0, snow = 0) => {
  const cl = E.CityEnvironment.climate(t, a, 200, ice, snow, winter);
  const k = new E.LandmarkKit(recipe, {base: false, lod: 2});
  k.palette = E.ArtisanCityKit.climatePalette(E.ArtisanCityKit.palettes.river, cl); k.climate = cl;
  k.part('p', 'p', 'architecture', () => E.ArtisanCityKit.house(k, 0, 0, 0, 4, 5, 4.5, 'river', 0));
  const m = k.finish();
  const material = Object.keys(m.stats.modules).find(x => x.endsWith('-construction'));
  return {material: material && material.replace('-construction', ''), snowParts: m.stats.modules['lying-snow'] || 0, cover: cl.cover};
 };
 const arctic = build(-8, 1.3, -22, 40, .6), subarctic = build(-1.3, 1.14, -8.9),
       temperate = build(11, 1.0, 3.5), hotDry = build(26, .25, 20), hotWet = build(26.8, 2.0, 26.2);
 // A tint is not a material. Cold builds in log, hot and dry in earth, hot and wet
 // in light frame and thatch — these have to be different constructions.
 assert.equal(arctic.material, 'log');
 assert.equal(subarctic.material, 'log');
 assert.equal(hotDry.material, 'adobe');
 assert.equal(hotWet.material, 'thatch');
 assert.equal(new Set([arctic.material, temperate.material, hotDry.material, hotWet.material]).size, 4,
  'the four climate extremes must not share a construction');
 report.checks.materials = {arctic: arctic.material, subarctic: subarctic.material, temperate: temperate.material, hotDry: hotDry.material, hotWet: hotWet.material};
});
test('snow lies on the towns whose winter freezes, and on no others', () => {
 const recipe = E.LandmarkCatalog.recipe('river', 'snow-probe', {urbanStyle: 'river'});
 const cover = (t, a, winter, ice = 0, snow = 0) => {
  const cl = E.CityEnvironment.climate(t, a, 200, ice, snow, winter);
  const k = new E.LandmarkKit(recipe, {base: false, lod: 2});
  k.palette = E.ArtisanCityKit.climatePalette(E.ArtisanCityKit.palettes.river, cl); k.climate = cl;
  k.part('p', 'p', 'architecture', () => E.ArtisanCityKit.house(k, 0, 0, 0, 4, 5, 4.5, 'river', 0));
  return {cl, snowParts: k.finish().stats.modules['lying-snow'] || 0};
 };
 // The annual mean is not the test: -1.3 C annual with a -8.9 C winter is a snowy
 // town, and reading only the mean is why cold towns used to be drawn bare.
 const subarctic = cover(-1.3, 1.14, -8.9);
 assert(subarctic.cl.cover > .6, `a -8.9 C winter must lie under snow, got ${subarctic.cl.cover.toFixed(2)}`);
 assert(subarctic.snowParts > 0, 'and that snow must be drawn');
 const marginal = cover(2.6, 1.4, -1.4);
 assert(marginal.cl.cover > .05 && marginal.cl.cover < .5, 'a winter just below freezing is a dusting, not a burial');
 assert(marginal.snowParts > 0, 'a dusting is still drawn');
 for (const [label, c] of [['cool temperate', cover(11, 1.0, 3.5)], ['hot arid', cover(26, .25, 20)], ['hot humid', cover(26.8, 2.0, 26.2)]]) {
  assert.equal(c.cl.cover, 0, label + ' must never be snowed');
  assert.equal(c.snowParts, 0, label + ' must draw no snow');
 }
 // A cold DRY interior holds less than a cold wet one at the same temperature.
 assert(cover(-2, .15, -9).cl.cover < cover(-2, 1.8, -9).cl.cover, 'moisture must modulate cover');
 report.checks.snow = {subarctic: +subarctic.cl.cover.toFixed(2), marginal: +marginal.cl.cover.toFixed(2)};
});
test('a real cold town carries snow across its own elevation gradient', () => {
 const cold = sim.provinces.filter(p => p.city)
  .map(p => ({p, e: E.CityEnvironment.profile(world, p)}))
  .sort((a, b) => a.e.temperature - b.e.temperature)[0];
 const c = E.generateCity(world, sim, cold.p.id);
 let lo = 1, hi = 0, snowed = 0;
 for (const b of c.buildings) {
  const cv = E.CityEnvironment.snowCover(c.environment, c.index(b.x, b.z));
  lo = Math.min(lo, cv); hi = Math.max(hi, cv); if (cv > .3) snowed++;
 }
 assert(snowed / c.buildings.length > .4, 'most of the coldest town must be under snow');
 assert(hi - lo > .15, 'and the cover has to vary across the town, not be one flat value');
 report.checks.coldTown = {name: cold.p.name, annualC: +cold.e.temperature.toFixed(1), coverLo: +lo.toFixed(2), coverHi: +hi.toFixed(2), snowedFraction: +(snowed / c.buildings.length).toFixed(2)};
});
test('the tradition palette is retoned by climate without losing the tradition', () => {
 const base = E.ArtisanCityKit.palettes.river;
 const cold = E.ArtisanCityKit.climatePalette(base, E.CityEnvironment.climate(-6, 1.2, 200, 20, .4));
 const hot = E.ArtisanCityKit.climatePalette(base, E.CityEnvironment.climate(26, .25, 200));
 const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
 assert(rgbDistance(hex(cold.wall), hex(hot.wall)) > 20, 'walls must not be the same colour at both extremes');
 assert(rgbDistance(hex(cold.roof), hex(hot.roof)) > 20, 'roofs must not be the same colour at both extremes');
 // A neutral climate must leave the authored palette exactly alone, so the fixed
 // precinct signatures in tests/artisan.test.mjs stay meaningful.
 assert.deepEqual(E.ArtisanCityKit.climatePalette(base, E.ArtisanCityKit.neutralClimate).wall, base.wall);
 report.checks.palette = {coldWall: cold.wall, hotWall: hot.wall, coldRoof: cold.roof, hotRoof: hot.roof};
});

test('the subtropics have a name, a colour and a tree of their own', () => {
 // Every humid cell from 7 to 21 C was called "Temperate forest" and grew the same
 // generic broadleaf, so a laurel forest at 19 C and a beech wood at 11 C were the
 // same two words and the same silhouette. Measured before: 1133 temperate-forest
 // cells covering both, and one vegetation form across the whole warm half.
 const names = E.BIOME.map(b => b[0]);
 const laurel = names.indexOf('Subtropical laurel forest'), hard = names.indexOf('Subtropical dry woodland');
 assert(laurel > 0 && hard > 0, 'the subtropical classes exist');
 let counts = {laurel: 0, hard: 0, temperate: 0};
 for (let i = 0; i < E.GN; i++) {
  if (world.height[i] <= 0) continue;
  if (world.biome[i] === laurel) counts.laurel++;
  else if (world.biome[i] === hard) counts.hard++;
  else if (world.biome[i] === 7) counts.temperate++;
 }
 assert(counts.laurel > 120 && counts.hard > 80, `subtropics barely appear: ${JSON.stringify(counts)}`);
 // They must be warm, or the class is decorative.
 let coldest = Infinity;
 for (let i = 0; i < E.GN; i++)
  if (world.biome[i] === laurel || world.biome[i] === hard) coldest = Math.min(coldest, world.temp[i]);
 assert(coldest >= 16, `a subtropical cell at ${coldest.toFixed(1)} C`);
 // Their own silhouettes, distinct from the temperate broadleaf next door.
 const formOf = b => E.CityEnvironment.canopy(b, 19, 1.5).form;
 assert.equal(formOf(laurel), 'laurel');
 assert.equal(formOf(hard), 'hardleaf');
 assert.notEqual(formOf(7), 'laurel');
 // The written description has to use the same vocabulary the biome name does, or the
 // two halves of a place contradict each other. 16.5 and 21 are the classifier's own
 // boundaries.
 assert(E.CityEnvironment.band(19, 1.5).startsWith('Subtropical'));
 assert(E.CityEnvironment.band(23, 1.5).startsWith('Tropical'));
 assert(E.CityEnvironment.band(14, 1.5).startsWith('Warm temperate'));
 assert(E.CityEnvironment.band(19, 1.5, 3200).includes('highland'), 'a high plateau says so');
 report.checks.subtropics = counts;
});
test('all fifteen traditions are reachable and none is stranded outside its climate', () => {
 // "Not stranded" is the claim that matters, and it is per world: every tradition
 // has somewhere it could be built. Which ones actually come up is luck of the
 // draw — this world assigns 13 of 15, another assigns all 15 — so requiring all
 // fifteen in one particular seed was testing the seed. It broke the moment the
 // landform priors moved the towns, without anything being stranded.
 for (const t of E.TownCatalog.styles)
  assert(sim.provinces.some(p => p.city && E.TownCatalog.allowed(p, world, t.id)), t.id + ' has no compatible site');
 const used = new Set(sim.provinces.filter(p => p.city).map(p => E.TownCatalog.native(p, world)));
 assert(used.size >= E.TownCatalog.styles.length - 3, `only ${used.size} traditions built in a default world`);
 // ...and every one of them is reached by some world, so none is decorative.
 const reach = new Set(used);
 for (const seed of ['Tanguine', 'Ninefold-9']) {
  const other = worlds[seed];
  for (const p of other.sim.provinces)
   if (p.city)
    reach.add(E.TownCatalog.native(p, other.world));
 }
 assert.equal(reach.size, E.TownCatalog.styles.length, 'a tradition no world ever builds is decorative');
 // The two families added for the extremes must actually sit at the extremes.
 const bandOf = id => sim.provinces.filter(p => p.city && E.TownCatalog.native(p, world) === id)
  .map(p => E.CityEnvironment.profile(world, p).temperature);
 const taiga = bandOf('taiga'), monsoon = bandOf('monsoon');
 assert(taiga.length && monsoon.length, 'the two extreme traditions have to appear in the default world');
 assert(taiga.length && Math.max(...taiga) < 9, 'the boreal log town must stay cold');
 assert(monsoon.length && Math.min(...monsoon) > 18, 'the monsoon stilt town must stay hot');
 report.checks.traditions = {count: used.size, reachableAcrossSeeds: reach.size, taiga: taiga.map(v => +v.toFixed(1)), monsoon: monsoon.map(v => +v.toFixed(1))};
});

test('climate leaves the physical world and current settlement baseline intact', () => {
 assert.equal(E.physicalFingerprint(world), '440ae5d0');
 assert.equal(E.settlementFingerprint(sim), 'e6aee7b8');
 report.checks.unchanged = {physicalFingerprint: '440ae5d0', settlementFingerprint: 'e6aee7b8'};
});

test.after(() => writeFileSync(resolve(root, 'docs/CLIMATE_RESULTS.json'), JSON.stringify(report, null, 2)));
