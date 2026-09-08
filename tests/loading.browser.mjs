// Optional Chromium regression and cold-load benchmark. No browser dependency
// ships in the application. TELLURIC_HTML can select a previous standalone build.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.TELLURIC_PERF_OUTPUT || join(root, 'previews/loading'));
await mkdir(output, {recursive: true});
const baseline = process.env.TELLURIC_BASELINE === '1';
const runs = Number(process.env.TELLURIC_PERF_RUNS || 3);
const original = await readFile(process.env.TELLURIC_HTML || join(root, 'dist/telluric-onemap.html'), 'utf8');
const instrumentation = `
window.__loadProbe={start:performance.now(),fullCities:0,siteQueries:0,terrainBuilds:0};
const probeGenerate=generateCity;generateCity=function(...args){__loadProbe.fullCities++;return probeGenerate(...args);};
if(typeof generateCityLandmark==='function'){const probeQuery=generateCityLandmark;generateCityLandmark=function(...args){__loadProbe.siteQueries++;return probeQuery(...args);};}
const probePreload=SacredCityKit.preload;
if(probePreload)SacredCityKit.preload=function(...args){const job=probePreload(...args);let done=false,frames=0;function frame(){if(!done){frames++;requestAnimationFrame(frame);}}requestAnimationFrame(frame);job.promise=job.promise.then(result=>{done=true;__loadProbe.index={...result,frames};return result;});return job;};
const probeTerrain=ContinuousCityLayer.prototype.buildTerrain;
ContinuousCityLayer.prototype.buildTerrain=function(...args){__loadProbe.terrainBuilds++;return probeTerrain.apply(this,args);};
`;
const html = original.replace('/** One renderer and one atlas canvas.', instrumentation + '/** One renderer and one atlas canvas.');
assert.notEqual(html, original, 'bootstrap instrumentation was not installed');
const results = [];
for (let run = 0; run < runs; run++) {
 const profile = await mkdtemp(join(tmpdir(), 'telluric-loading-'));
 const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), ['--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], {stdio: 'ignore', detached: true});
 child.unref();
 let browser;
 try {
  let port;
  for (let k = 0; k < 100 && !port; k++) {
   try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
   catch { await new Promise(r => setTimeout(r, 100)); }
  }
  assert(port, 'Chromium did not start');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = await browser.newContext({viewport: {width: 1480, height: 980}, reducedMotion: 'reduce'});
  await context.setOffline(true);
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => {if (/^https?:/.test(r.url())) external.push(r.url());});
  const stable = () => page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading', null, {timeout: 180000});
  await page.setContent(html, {waitUntil: 'load', timeout: 180000});
  await stable();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = await page.evaluate(() => ({
   readyMs: performance.now() - __loadProbe.start, generationMs: window.lastGenerationMs,
   fullCities: __loadProbe.fullCities, terrainBuilds: __loadProbe.terrainBuilds,
   siteQueries: __loadProbe.siteQueries, index: __loadProbe.index,
   directory: LandmarkUI.registry.length, sacredSites: LandmarkUI.registry.filter(s => s.recipe.sacred).length,
   fingerprints: [physicalFingerprint(world), settlementFingerprint(sim), politicalFingerprint(sim)],
   software: !!renderer.software, nearRoadVertices: renderer.meshes.roadsNear?.count || 0
  }));
  // Include settled camera work as well as the first completed frame. The former
  // startup reset invalidated its just-uploaded terrain and rebuilt it on a timer.
  await page.waitForTimeout(350); await stable();
  result.settledTerrainBuilds = await page.evaluate('__loadProbe.terrainBuilds');
  assert.deepEqual(result.fingerprints, ['440ae5d0', '6b6c5ea8', baseline ? 'aaa577eb' : 'd8ba763d']);
  assert.equal(result.directory, baseline ? 168 : 152); assert.equal(result.sacredSites, 69);
  if (!baseline) {
   assert.equal(result.fullCities, 0, 'startup generated complete cities for its directory');
   assert.equal(result.siteQueries, 0, 'startup ran its site queries on the UI thread');
   assert.equal(result.index.status, 'complete'); assert(result.index.frames > 2, 'landmark queries blocked animation frames');
   assert.equal(result.settledTerrainBuilds, 1, 'startup rebuilt identical terrain');
   assert.equal(result.nearRoadVertices, 0, 'startup assembled invisible detailed roads');
  }
  console.log('Cold load', run + 1, JSON.stringify(result));
  if (run === runs - 1) {
   await page.screenshot({path: join(output, 'world.png')});
   result.cities = [];
   for (const pid of [507, 349]) {
    const city = await page.evaluate(async id => {
     const start = performance.now();
     const m = await ContinuousMap.focusTown(id);
     return {id, readyMs: performance.now() - start, buildings: m.city.buildings.length, triangles: m.triangles, worker: !!ContinuousMap.layer.worker};
    }, pid);
    await stable(); await page.waitForTimeout(350); await stable();
    assert(city.worker); assert(city.buildings > 400); assert(city.triangles > 200000);
    result.cities.push(city); console.log('City', JSON.stringify(city));
    await page.screenshot({path: join(output, 'city-' + pid + '.png')});
   }
   if (!baseline) {
    // Exercise regeneration from a town: attach to the new world and reset the
    // camera before the first upload, then reuse the terrain during UI binding.
    await page.evaluate(async () => {__loadProbe.fullCities = 0; __loadProbe.terrainBuilds = 0; await buildWorld();});
    await stable(); await page.waitForTimeout(350); await stable();
    assert.deepEqual(await page.evaluate('({cities:__loadProbe.fullCities,terrain:__loadProbe.terrainBuilds,zoom:renderer.zoom,bound:ContinuousMap.layer.world===world})'), {cities:0,terrain:1,zoom:1,bound:true});
    assert(await page.evaluate("['roads','bridges','ports','seaLanes'].every(name=>renderer.meshes[name]?.count>0)"), 'same-seed regeneration lost the road network');
    await page.evaluate(() => ContinuousMap.focusTown(349).then(() => null)); await stable();
    await page.evaluate('window.__beforeFailureWorld=world;window.__beforeFailureSim=sim');
    // Force attachment failure only inside this isolated test page.
    await page.evaluate(async () => {
     const previous = renderer.buildCivilization;
     renderer.buildCivilization = function() {renderer.buildCivilization = previous; throw Error('TEST attachment failure');};
     await buildWorld({...GEN_DEFAULTS, seed:'Loading-recovery'});
    });
    await stable(); await page.waitForTimeout(350); await stable();
    assert(await page.evaluate('world===__beforeFailureWorld&&sim===__beforeFailureSim'), 'failed replacement lost the previous world or history');
    assert(await page.evaluate('renderer.world===world&&renderer.sim===sim&&ContinuousMap.layer.world===world&&!!window.__error'));
    assert(await page.evaluate("['roads','bridges','ports','seaLanes'].every(name=>renderer.meshes[name]?.count>0)"), 'failed replacement did not restore roads and ports');
    assert(await page.evaluate('ContinuousMap.layer.natural&&renderer.zoom>=AtlasSpace.TOWN_ZOOM'), 'failed replacement left the restored close view in atlas mode');
    await page.waitForFunction('ContinuousMap.layer.models.size>0&&!ContinuousMap.layer.loading', null, {timeout:60000});
    result.regeneration = true; result.failureRecovery = true;
    // The offline page also works where Blob workers are unavailable.
    await page.evaluate(async () => {
     const previous = window.Worker;
     try {window.Worker = undefined; await buildWorld();}
     finally {window.Worker = previous;}
    });
    await stable();
    assert.deepEqual(await page.evaluate('({status:__loadProbe.index.status,directory:LandmarkUI.registry.length,world:renderer.world===world})'), {status:'unavailable',directory:152,world:true});
    result.noWorkerFallback = true;
   }
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  results.push(result);
 } finally {
  if (browser) await browser.close();
  try {process.kill(-child.pid, 'SIGKILL');} catch {}
  await rm(profile, {recursive: true, force: true});
 }
}
const median = a => a.slice().sort((a,b) => a-b)[Math.floor(a.length/2)];
const report = {renderer: 'Chromium with SwiftShader', viewport: [1480,980], offline: true, runs: results, medianReadyMs: median(results.map(r => r.readyMs))};
await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS loading', JSON.stringify({runs, medianReadyMs: report.medianReadyMs, baseline}));
