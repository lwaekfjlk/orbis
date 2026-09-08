/** Rank the default world's complete ordinary city layouts for README previews.
 * Usage: node scripts/rank-readme-cities.mjs [output.json]
 *        node scripts/rank-readme-cities.mjs --output output.json
 * Explicit output paths are relative to the working directory; the default is
 * previews/readme/grids/city-ranking.json in this script's repository.
 */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {scripts} from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = resolve(root, 'previews/readme/grids/city-ranking.json');
const civilizationOptions = {realms: 18, conflict: 1};

function hullArea(points) {
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lower = [], upper = [];
    for (const p of points) {
        while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
        lower.push(p);
    }
    for (const p of points.slice().reverse()) {
        while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
        upper.push(p);
    }
    const polygon = lower.slice(0, -1).concat(upper.slice(0, -1));
    return Math.abs(polygon.reduce((sum, a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return sum + a[0] * b[1] - a[1] * b[0];
    }, 0)) / 2;
}

export function measureCity(province, city) {
    const corners = city.buildings.flatMap(b => [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        .map(([x, z]) => [b.x + x * b.w / 2, b.z + z * b.d / 2]));
    return {
        name: province.name,
        id: province.id,
        population: province.urbanPop,
        buildingPlots: city.buildings.length,
        parcelArea: city.buildings.reduce((sum, b) => sum + b.w * b.d, 0),
        hullArea: hullArea(corners)
    };
}

export function rankingReport(metadata, rows) {
    const cities = rows.slice().sort((a, b) => b.buildingPlots - a.buildingPlots || b.parcelArea - a.parcelArea || a.id - b.id)
        .map((row, i) => ({rank: i + 1, ...row}));
    return {
        schemaVersion: 1,
        sourceVersion: metadata.sourceVersion,
        sourceSHA256: metadata.sourceSHA256,
        parameters: metadata.parameters,
        civilizationOptions,
        fingerprints: metadata.fingerprints,
        method: 'Every settled ordinary city with urbanPop >= 650, using complete generateCity output. Rank by buildingPlots descending, then parcelArea descending, then id ascending. A building plot is one compound or landmark parcel, not an individual structure or population estimate.',
        areaUnits: 'Consistent local town-model square units, not square kilometres. parcelArea sums all building footprints; hullArea encloses all parcel corners, including spaces between them.',
        cityCount: cities.length,
        cities
    };
}

async function main(args) {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
        console.log('Usage: node scripts/rank-readme-cities.mjs [output.json]\n       node scripts/rank-readme-cities.mjs --output output.json\nDefault: previews/readme/grids/city-ranking.json');
        return;
    }
    const destination = args.length === 0 ? defaultOutput
        : args.length === 1 && !args[0].startsWith('-') ? resolve(args[0])
        : args.length === 2 && args[0] === '--output' ? resolve(args[1]) : null;
    if (!destination) throw Error('Expected an optional output path or --output path. Use --help for usage.');
    const boundary = scripts.indexOf('src/ui/world-ui.js');
    assert(boundary > 0, 'Production engine boundary is missing from the manifest.');
    const [modules, ui, packageText] = await Promise.all([
        Promise.all(scripts.slice(0, boundary).map(f => readFile(resolve(root, f), 'utf8'))),
        readFile(resolve(root, 'src/ui/world-ui.js'), 'utf8'),
        readFile(resolve(root, 'package.json'), 'utf8')
    ]);
    const declaration = ui.match(/const GEN_DEFAULTS = \{[^\n]+\};/)?.[0];
    assert(declaration, 'Application generation defaults are missing.');
    const parameters = Function(declaration + '\nreturn GEN_DEFAULTS;')();
    // Compile trusted local production modules in their original lexical scope.
    // The test loader omits some optional modules, so use the production manifest.
    const source = modules.join('\n');
    const engine = Function(source + '\nreturn {generateWorld,createCivilization,generateCity,physicalFingerprint,settlementFingerprint,politicalFingerprint};')();
    const world = await engine.generateWorld(parameters);
    const sim = engine.createCivilization(world, civilizationOptions);
    const fingerprints = () => ({
        physical: engine.physicalFingerprint(world),
        settlements: engine.settlementFingerprint(sim),
        political: engine.politicalFingerprint(sim)
    });
    const before = fingerprints();
    const provinces = sim.provinces.filter(p => p.settled && p.urbanPop >= 650 && !p.highCitadel)
        .sort((a, b) => b.urbanPop - a.urbanPop);
    const rows = provinces.map(p => measureCity(p, engine.generateCity(world, sim, p.id)));
    assert.deepEqual(fingerprints(), before, 'Ranking cities must not change the parent world.');
    const report = rankingReport({
        sourceVersion: JSON.parse(packageText).version,
        sourceSHA256: createHash('sha256').update(source).digest('hex'),
        parameters,
        fingerprints: before
    }, rows);
    await mkdir(dirname(destination), {recursive: true});
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(`Ranked ${rows.length} cities → ${destination}`);
    for (const city of report.cities.slice(0, 4)) console.log(`${city.rank}. ${city.name} (${city.id}) — ${city.buildingPlots} building plots`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
