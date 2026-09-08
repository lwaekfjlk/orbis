import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Compile trusted local modules together, mirroring classic-script lexical scope.
// No eval of user uploads. Function avoids vm global-lookup overhead in climate loops.
const code = ['src/world/geography.js', 'src/civilization/realm-names.js', 'src/civilization/simulation.js', 'src/civilization/political-land.js', 'src/world/roads.js', 'src/civilization/folk.js', 'src/civilization/portrait.js', 'src/civilization/saga.js', 'src/city/environment.js', 'src/civilization/high-citadels.js', 'src/towns/catalog.js', 'src/towns/grammar.js', 'src/towns/fortifications.js', 'src/city/high-citadel-plan.js', 'src/city/generator.js', 'src/city/actions.js', 'src/render/world-renderer.js', 'src/continuous/atlas-space.js', 'src/render/road-renderer.js', 'src/render/folk-models.js', 'src/render/folk-renderer.js', 'src/render/export-glb.js'].map(f => readFileSync(resolve(root, f), 'utf8')).join('\n');
export function loadEngine() { return new Function(code + '\nreturn {PoliticalLand,RealmNames,nameRealms,civilizationAction,AtlasRenderer,BIOME,AtlasSpace,Geometry,CityEnvironment,HighCitadels,TownCatalog,TownGrammar,RoadNetwork,Folk,Saga,Portrait,PEOPLES,FAITHS,GOVERNMENTS,generateWorld,createCivilization,initializeSettlements,formPolities,physicalFingerprint,settlementFingerprint,politicalFingerprint,politicalDiagnostics,stepCivilization,auditCivilization,generateCity,auditCity,cityProjectQuote,startCityProject,stepCityProjects,validateCityState,planJourney,exportGeometryGLB,CITY_PROJECTS,GW,GH,GN};')(); }
export const defaults = { seed: 'Aereth-47', form: 'global', plates: 24, continents: 6, islands: 1.2, volcanism: .85, uplift: 1.2, sea: 0, aridity: .85, current: 1, erosion: .7, temperature: 0, glaciation: 1.2 };
// Existing geometry fixtures describe the original terrain. New-world checks
// explicitly use the application default, without rewriting historical hashes.
export const fantasyDefaults = { ...defaults, landformVersion: 3 };
