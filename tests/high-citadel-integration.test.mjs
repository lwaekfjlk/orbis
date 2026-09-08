import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = scripts.slice(0, scripts.indexOf('src/ui/world-ui.js')).map(read).join('\n');
const E = Function(source + `
const calls={full:0,sacred:0,artisan:0};
const full=generateCity,sacred=SacredCityKit.build,artisan=ArtisanCityKit.precinct;
generateCity=(...a)=>{calls.full++;return full(...a)};
SacredCityKit.build=(...a)=>{calls.sacred++;return sacred(...a)};
ArtisanCityKit.precinct=(...a)=>{calls.artisan++;return artisan(...a)};
return {generateWorld,createCivilization,generateCity,generateCityLandmark,citySurvey,
TownCatalog,LandmarkCatalog,LandmarkBinding,HighlandCityKit,ContinuousCityLayer,AtlasRenderer,
AtlasSpace,LandscapeRelief,project4,physicalFingerprint,settlementFingerprint,politicalFingerprint,calls};`)();
let world, sim, sites, rows, before;
const browser = {}, previousWindow = globalThis.window;
function renderer(w, s, p) {
    const meshes = {}, r = Object.create(E.AtlasRenderer.prototype);
    Object.assign(r, {world: w, sim: s, relief: 1, layer: 'relief', zoom: 80, width: 1440, height: 900,
        azimuth: -.38, elevation: .85, target: E.AtlasSpace.point(w, p.x, p.y), meshes, options: {},
        upload(name, g, shadow = true, unlit = 0, alpha = 1) { meshes[name] = {vertices: new Float32Array(g.data), shadow, unlit, alpha}; },
        request() {}, buildTerrain() {}, buildRivers() {}, buildNearRoads() {}, canvas: {id: 'map'}});
    const layer = new E.ContinuousCityLayer(r); layer.world = w; layer.sim = s; layer.natural = true;
    return {r, layer, meshes};
}
const fingerprints = () => [E.physicalFingerprint(world), E.settlementFingerprint(sim), E.politicalFingerprint(sim)];
test.before(async () => {
    world = await E.generateWorld(defaults); sim = E.createCivilization(world, {realms: 18, historySeed: 'First-dawn'});
    sites = sim.provinces.filter(p => p.highCitadel);
    assert.equal(sites.length, 2, 'default geography should support the two rare high settlements');
    globalThis.window = browser; browser.world = world; browser.sim = sim;
    before = fingerprints();
    rows = sites.map(p => { const r = renderer(world, sim, p), model = r.layer.build(p); return {...r, p, model}; });
});
test.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });

test('both tiny high towns keep dedicated architecture at detail and regional LOD without a wonder overlay', t => {
    assert.deepEqual(sites.map(p => p.highCitadel.kind).sort(), ['dragon', 'holy']);
    assert.equal(E.calls.sacred, 0, 'dedicated highland structures must not call the cathedral/wonder builder');
    assert.equal(E.calls.artisan, 0, 'the royal and holy anchors must not turn into ordinary civic palaces');
    for (const {p, model, meshes} of rows) {
        const c = model.city;
        assert.equal(p.city, false, 'the sites remain tiny towns, not economic city flags');
        assert.ok(p.urbanPop >= 650 && p.highCitadel.elevation > 3500);
        for (const key of Object.keys(p.highCitadel)) assert.deepEqual(c.highCitadel[key], p.highCitadel[key]);
        assert.ok(c.buildings.length >= 10 && c.buildings.length <= 18);
        assert.ok(c.buildings.every(b => b.highRole && !b.sacred && !b.wonder));
        assert.ok(c.terrainSpan < .8, 'the town should occupy a small mountain site');
        const low = meshes[`cm:${p.id}:silhouettes`].vertices, detail = meshes[`cm:${p.id}:buildings`].vertices, roofs = meshes[`cm:${p.id}:roofs`].vertices;
        assert.ok(low.length / 27 > c.buildings.length * 25, 'regional zoom must retain authored courts, towers and roofs, not one box per parcel');
        assert.ok(detail.length + roofs.length > low.length, 'close LOD should add meaningful architectural detail');
        let lowest = Infinity, highest = -Infinity;
        for (let i = 1; i < low.length; i += 9) { lowest = Math.min(lowest, low[i]); highest = Math.max(highest, low[i]); }
        const ground = E.AtlasSpace.surface(world, p.x, p.y);
        assert.ok(lowest > ground - .7 && highest < ground + 1, 'regional geometry must be mounted on the same highland surface');
        t.diagnostic(`${p.name}: ${c.buildings.length} parcels, ${Math.round(p.highCitadel.elevation)} m, ${low.length / 27} regional triangles`);
    }
});

test('the directory publishes exact compact-town anchors, including sites below the city flag, with no eager full-city builds', () => {
    // Keep real province IDs/realms, but enumerate only the two sites. This is a
    // bounded directory integration test, not a survey of every ordinary wonder.
    const bounded = {...sim, provinces: sim.provinces.map(p => p.highCitadel ? p : {...p, city: false, settled: false})};
    const fullBefore = E.calls.full, entries = E.LandmarkBinding.inventory(world, bounded);
    assert.equal(E.calls.full, fullBefore);
    assert.equal(entries.length, 2, 'generic palace, wonder or regional entries should not cover the dedicated site');
    assert.equal(structuredClone(entries).length, 2);
    for (const entry of entries) {
        const row = rows.find(r => r.p.id === entry.provinceId), b = row.model.city.buildings.find(b => b.id === entry.buildingId);
        assert.ok(b?.landmark && ['keep', 'sanctuary'].includes(b.highRole));
        assert.equal(entry.recipe.buildingId, b.id); assert.deepEqual(entry.highCitadel, row.p.highCitadel);
        assert.ok(!entry.recipe.sacred && !entry.recipe.artisan);
        assert.match((entry.name+' '+entry.kind).toLowerCase(), row.p.highCitadel.kind === 'dragon' ? /dragon/ : /holy/);
        assert.ok(entry.kind.includes(Math.round(row.p.highCitadel.elevation).toLocaleString()));
    }
});

test('high-town framing includes the whole shifted hillside settlement inside the available screen', t => {
    for (const row of rows) for (const [width, height] of [[1280, 720], [900, 900], [1440, 900]]) {
        row.r.width = width; row.r.height = height;
        const view = row.layer.townView(row.model);
        Object.assign(row.r, {target: view.target, zoom: view.zoom, elevation: view.elevation, azimuth: view.azimuth});
        row.r.updateCamera();
        for (const corner of view.corners) {
            const q = E.project4(row.r.mvp, corner), x = (q[0] / q[3] * .5 + .5) * width, y = (.5 - q[1] / q[3] * .5) * height;
            assert.ok(x > 70 && x < width - 70 && y > 100 && y < height - 100, `a ${row.p.highCitadel.kind} building is clipped at ${x},${y} in ${width}x${height}`);
        }
        if (width === 1280) t.diagnostic(`${row.p.highCitadel.kind}: focus ${view.target.map(v=>v.toFixed(4)).join(',')}, zoom ${view.zoom.toFixed(1)}, azimuth ${view.azimuth.toFixed(3)}; parcel bounds ${view.bounds.min.map(v=>v.toFixed(4)).join(',')} → ${view.bounds.max.map(v=>v.toFixed(4)).join(',')}`);
    }
});

test('the real worker payload preserves dedicated metadata, regional meshes and exact geometry', () => {
    const worker = {postMessage(value) { this.result = value; }};
    Function('self', 'window', source + '\n' + read('src/continuous/worker-body.js'))(worker, worker);
    for (const row of rows) {
        worker.onmessage({data: {id: row.p.id, pid: row.p.id, world: structuredClone(world), sim: structuredClone(sim), relief: 1}});
        assert.equal(worker.result.error, undefined, worker.result.stack);
        const payload = worker.result.payload;
        assert.deepEqual(payload.city.highCitadel, row.model.city.highCitadel);
        assert.deepEqual(payload.city.buildings.map(b => [b.id, b.highRole, b.sacred]), row.model.city.buildings.map(b => [b.id, b.highRole, b.sacred]));
        for (const name of row.model.meshNames) assert.deepEqual(payload.meshes[name].vertices, row.meshes[name].vertices, name + ' differs in the worker');
    }
});

test('changing citadel kind or metadata changes model keys and retires the former geometry before refresh', () => {
    const changed = structuredClone(sim), p = changed.provinces[sites[0].id], row = rows[0], f = renderer(world, changed, p);
    f.layer.prepareLandscape();
    const old = {...row.model, p, meshNames: row.model.meshNames.slice()}, key = f.layer.key(p);
    f.layer.models.set(p.id, old); f.layer.focusId = p.id;
    for (const name of old.meshNames) f.meshes[name] = {vertices: new Float32Array(0)};
    f.layer.bind(world, changed);
    assert.equal(f.layer.models.get(p.id), old, 'derived shoulder/orientation metadata must not invalidate an unchanged province');
    p.highCitadel.kind = 'holy';
    assert.notEqual(f.layer.key(p), key);
    const changedKey = f.layer.key(p); p.highCitadel.version++;
    assert.notEqual(f.layer.key(p), changedKey);
    let refreshes = 0;
    f.r.buildTerrain = () => { assert.equal(f.layer.models.has(p.id), false); refreshes++; };
    f.layer.buildEnvironment = () => {};
    try {
        f.layer.bind(world, changed);
        assert.equal(f.layer.models.size, 0); assert.equal(f.layer.focusId, p.id);
        assert.ok(old.meshNames.every(n => !f.meshes[n])); assert.ok(refreshes > 0);
        const count = refreshes; f.layer.bind(world, changed); assert.equal(refreshes, count);
    } finally { E.LandscapeRelief.prepare(world, sim); }
});

test('a same-size citadel changing while its worker is busy cannot upload stale architecture', async () => {
    const changed = structuredClone(sim), p = changed.provinces[sites[0].id], f = renderer(world, changed, p), span = E.citySurvey(changed, p).terrainSpan;
    let request, posted;
    const whenPosted = new Promise(resolve => { posted = resolve; });
    browser.Worker = true; browser.TELLURIC_TOWN_WORKER = 'test-worker';
    f.layer.workerWorld = world; f.layer.worker = {postMessage(data) { request = data; posted(); }};
    f.layer.buildEnvironment = () => {};
    try {
        const pending = f.layer.ensure(p.id); await whenPosted;
        p.highCitadel.kind = 'holy'; assert.equal(E.citySurvey(changed, p).terrainSpan, span);
        const job = f.layer.workerJobs.get(request.id); f.layer.workerJobs.delete(request.id);
        job.resolve({city: {terrainSpan: span}, meshes: {stale: {vertices: new Float32Array(27)}}});
        assert.equal(await pending, null);
        assert.equal(f.layer.models.size, 0); assert.deepEqual(Object.keys(f.meshes), []);
        assert.equal(f.layer.pending.size, 0); assert.equal(f.layer.loading, false); assert.equal(f.layer.failed.size, 0);
    } finally { delete browser.Worker; delete browser.TELLURIC_TOWN_WORKER; }
});

test('legacy landmark actions visit or focus the actual high city instead of opening a generic standalone model', () => {
    const row = rows[0], p = row.p, entry = {id: 'high-test', highCitadel: p.highCitadel, provinceId: p.id}, calls = [];
    const CityUI = {activeId: p.id, open(id) { calls.push(['town', id]); }, selectBuilding(id) { calls.push(['select', id]); }, renderer: {focusBuilding(b) { calls.push(['focus', b.id]); }}};
    const win = {CityUI}, document = {getElementById() { return null; }};
    // The public directory update and open actions run with a DOM that contains
    // no atelier. Entering a fake standalone monument would fail this test.
    Function('window', 'CityUI', 'world', 'sim', 'LandmarkBinding', 'document', 'renderer', read('src/ui/landmark-ui.js'))(win, CityUI, world, sim, {inventory: () => [entry]}, document, null);
    win.LandmarkUI.onWorldUpdate(); win.LandmarkUI.openSite(entry.id); win.LandmarkUI.openCity(p.id, 'temple');
    const b = row.model.city.buildings[0]; win.LandmarkUI.openBuilding(p.id, b);
    assert.deepEqual(calls, [['town', p.id], ['town', p.id], ['select', b.id], ['focus', b.id]]);
    assert.equal(win.LandmarkUI.isOpen, false); assert.equal(win.LandmarkUI.model, null);
});

test('the real search input finds both small high cities by English and Chinese identity and shows their altitude', () => {
    const nodes = new Map();
    function element(id) {
        if (!nodes.has(id)) nodes.set(id, {id, value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
            classList: {toggle() {}, add() {}, remove() {}}, setAttribute() {}, addEventListener() {},
            querySelectorAll() { return []; }, focus() {}, appendChild() {}});
        return nodes.get(id);
    }
    const document = {getElementById: element, querySelectorAll: () => [], querySelector: () => null,
        addEventListener() {}, body: {dataset: {}}, activeElement: null};
    const win = {addEventListener() {}}, realmNames = {fullName: r => r.name};
    const args = ['window', 'document', 'world', 'sim', 'LandmarkUI', 'CityUI', 'LandmarkBinding', 'TownCatalog', 'RealmNames', 'fmtPop', 'escapeHTML', 'busy', 'simAdvancing', 'playing'];
    Function(...args, read('src/ui/onemap-ui.js'))(win, document, world, sim, {registry: []}, {}, E.LandmarkBinding, E.TownCatalog, realmNames, String, String, false, false, false);
    win.OneMap.bind(); win.OneMap.onWorldUpdate();
    for (const [query, kind] of [['dragon', 'dragon'], ['holy', 'holy'], ['龙王', 'dragon'], ['圣城', 'holy']]) {
        const p = sites.find(p => p.highCitadel.kind === kind);
        element('omSearch').value = query; element('omSearch').oninput();
        const html = element('omSearchResults').innerHTML;
        assert.ok(html.includes(p.name), `${query} fails to find the tiny settlement`);
        assert.ok(html.includes(E.LandmarkBinding.highCitadelLabel(p)));
        assert.ok(html.includes(Math.round(p.highCitadel.elevation).toLocaleString() + ' m'));
    }
});

test('continuous building overlay does not duplicate persistent world town labels or gate them on population', () => {
    const nodes = new Map();
    function node() { return {id: '', children: [], replacements: 0, value: '', dataset: {}, style: {},
        classList: {toggle() {}, add() {}, remove() {}}, setAttribute() {}, addEventListener() {},
        appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
        replaceChildren() { this.children = []; this.replacements++; }}; }
    function element(id) { if (!nodes.has(id)) { const n = node(); n.id = id; nodes.set(id, n); } return nodes.get(id); }
    const document = {getElementById: element, createElement: node, addEventListener() {}, body: node()};
    class Layer { constructor() { this.models = new Map(); } bind() {} cameraChanged() {} }
    const r = {target: [0, 0, 0], zoom: 1, width: 1280, height: 720, canvas: {id: 'map'}, options: {}, visible() {}, onChange() {}, request() {}};
    const high = {id: 0, name: 'Unloaded Aerie', urbanPop: 650, settled: true, highCitadel: {kind: 'dragon', version: 1, elevation: 4096}};
    const ordinary = {id: 1, name: 'Unloaded Village', urbanPop: 700, settled: false};
    const state = {provinces: [high, ordinary], realms: []}, win = {};
    const args = ['window', 'document', 'world', 'sim', 'renderer', 'ContinuousCityLayer', 'AtlasSpace', 'LandmarkBinding', 'OneMap', 'installDepthRasterizer', 'rgb', 'mul4', 'ortho', 'lookAt'];
    Function(...args, read('src/ui/continuous-map.js'))(win, document, world, state, r, Layer, E.AtlasSpace, E.LandmarkBinding, {scene: 'world'}, () => {}, () => [], () => [], () => [], () => []);
    win.ContinuousMap.init(); win.ContinuousMap.onWorldUpdate();
    const labels = element('cmLabels'), metadata = JSON.stringify(high.highCitadel);
    assert.equal(win.ContinuousMap.layer.models.size, 0);
    assert.deepEqual(labels.children, [], 'world labels now own the cm-town-pin click targets across all zooms');
    const unchanged = labels.replacements; win.ContinuousMap.onWorldUpdate(); assert.equal(labels.replacements, unchanged, 'unchanged membership should retain cached buttons');
    high.urbanPop = 649; win.ContinuousMap.onWorldUpdate();
    assert.equal(labels.children.length, 0, 'population changes must not introduce a duplicate detail-overlay name');
    high.settled = false; high.urbanPop = 650; win.ContinuousMap.onWorldUpdate();
    assert.equal(labels.children.length, 0, 'population alone must not restore an unsettled town');
    ordinary.settled = true; win.ContinuousMap.onWorldUpdate();
    assert.deepEqual(labels.children, []);
    ordinary.settled = false; high.settled = true; win.ContinuousMap.onWorldUpdate();
    assert.deepEqual(labels.children, []);
    assert.equal(JSON.stringify(high.highCitadel), metadata); assert.equal(win.ContinuousMap.layer.models.size, 0);
    const anchor={x:0,y:0,z:0,scale:1},building={id:'sanctum',name:'Dragon Sanctum',landmark:true,h:10};
    win.ContinuousMap.layer.models.set(high.id,{p:high,key:'one-loaded-city',city:{buildings:[building]},heights:{},frame:{anchors:new Map([[building.id,anchor]])}});
    win.ContinuousMap.onWorldUpdate();
    assert.deepEqual(labels.children.map(n=>[n.className,n.textContent]),[['cm-pin cm-building-pin','Dragon Sanctum']], 'the continuous overlay still exposes loaded landmark buildings');
    win.ContinuousMap.layer.models.clear();win.ContinuousMap.onWorldUpdate();assert.deepEqual(labels.children,[]);
});

test('all rendering, worker and directory operations leave parent geography and simulation unchanged', () => {
    assert.deepEqual(fingerprints(), before);
});
