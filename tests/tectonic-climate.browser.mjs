// Compare the v3 terrain and land cover against the published version-2 map
// at exactly the same camera, and restore both versions through the real save UI.
// PLAYWRIGHT_MODULE / CHROMIUM_PATH select an existing browser installation.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.env.MOUNTAIN_OUTPUT || join(root, 'previews/tectonic-climate'));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'telluric-fantasy-browser-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'
], {stdio: 'ignore', detached: true});
child.unref();
let browser;
const report = {viewport: [1480, 980], renderer: 'Chromium with SwiftShader'};

try {
    await mkdir(join(out, 'after'), {recursive: true});
    await mkdir(join(out, 'before'), {recursive: true});
    let port;
    for (let i = 0; i < 100 && !port; i++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({viewport: {width: 1480, height: 980}, reducedMotion: 'reduce'});
    await context.setOffline(true);
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const stable = () => page.waitForFunction(
        'window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',
        null, {timeout: 240000});
    const settled = async () => {
        await stable();
        await page.waitForTimeout(350);
        await page.waitForFunction('ContinuousMap.layer.lastTerrainKey===ContinuousMap.layer.terrainKey()', null, {timeout: 240000});
        await stable();
    };
    const fingerprints = () => page.evaluate(() => ({
        physical: physicalFingerprint(world), settlements: settlementFingerprint(sim), politics: politicalFingerprint(sim)
    }));
    const assertReady = async () => {
        assert.equal(await page.evaluate('window.__error||window.__continuousError||null'), null);
        assert(await page.evaluate('renderer.world===world&&renderer.sim===sim&&ContinuousMap.layer.world===world'));
    };
    // Exercise the application's real layer controls. These extra images expose
    // landform geometry without cartographic tree/settlement/border symbols; the
    // ordinary world and four region screenshots retain the normal presentation.
    const diagnosticControls = ['trees', 'frontiers', 'settlements', 'roads', 'folk', 'names', 'legends'];
    const setControls = values => page.evaluate(values => {
        for (const [id, checked] of Object.entries(values)) {
            const input = document.getElementById(id);
            if (input.checked !== checked) { input.checked = checked; input.dispatchEvent(new Event('change', {bubbles: true})); }
        }
    }, values);
    const startDiagnostic = async () => {
        const previous = await page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).checked])), diagnosticControls);
        await setControls(Object.fromEntries(diagnosticControls.map(id => [id, false])));
        return previous;
    };

    const testedHtml = await readFile(process.env.FANTASY_HTML || join(root, 'dist/telluric-onemap.html'));
    report.bundleSha256 = createHash('sha256').update(testedHtml).digest('hex');
    await page.setContent(testedHtml.toString('utf8'), {waitUntil: 'load', timeout: 240000});
    await page.evaluate(() => document.fonts.ready); await settled(); await assertReady();
    assert.equal(await page.evaluate('world.params.landformVersion'), 3);
    report.fantasy = await fingerprints();
    await page.screenshot({path: join(out, 'after/world.png')});
    const regions = await page.evaluate(() => {
        const regions=world.landformRegions.filter(r=>r.type===3).map(r=>({id:r.id,name:r.name,center:r.center,rx:r.rx,ry:r.ry,statistics:r.statistics}));
        for(const [name,predicate] of [
            ['wet-highland',i=>world.height[i]>1300&&world.height[i]<2900&&world.arid[i]>1&&world.temp[i]>0&&world.temp[i]<16&&world.ice[i]<1],
            ['dry-tableland',i=>world.height[i]>900&&world.landform[i]===1&&world.arid[i]<.7&&world.ice[i]<1]
        ]) {
            const candidates=[];for(let i=0;i<GN;i++)if(world.lake[i]<0&&predicate(i))candidates.push(i);
            const score=i=>{let count=0;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const x=i%GW+dx,y=Math.floor(i/GW)+dy;if(x>=0&&x<GW&&y>=0&&y<GH&&predicate(y*GW+x))count++;}return count*100+(world.dist[i]||0);};
            const scores=new Map(candidates.map(i=>[i,score(i)]));
            candidates.sort((a,b)=>scores.get(b)-scores.get(a));
            if(candidates.length){const i=candidates[0];regions.push({id:name,name,center:{x:i%GW,y:Math.floor(i/GW)},rx:10,ry:8,cell:{height:world.height[i],temp:world.temp[i],arid:world.arid[i],biome:world.biome[i]}});}
        }
        return regions;
    });
    assert(regions.filter(r=>typeof r.id==='number').length >= 2);
    for(const id of ['wet-highland','dry-tableland'])assert(regions.some(r=>r.id===id),'missing representative '+id);
    await startDiagnostic(); await settled();
    await page.screenshot({path:join(out,'after/world-terrain.png')});
    report.cameras = [];
    for (const region of regions) {
        const camera = await page.evaluate(r => {
            setLayer('relief'); OneMap.clearSelection(); OneMap.closeDrawer(); ContinuousMap.cancel(); ContinuousMap.layer.focusId = null;
            renderer.target = AtlasSpace.point(world,r.center.x,r.center.y,renderer.relief);
            renderer.zoom = Math.max(3,Math.min(24,105/Math.max(r.rx,r.ry)));
            renderer.azimuth=-.42; renderer.elevation=.88; renderer.request();
            return {target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation};
        },region);
        await settled(); await assertReady();
        await page.screenshot({path:join(out,'after',`range-${region.id}.png`)});
        report.cameras.push({...region,camera});
    }
    if(process.env.MOUNTAIN_COMPARE !== '0') {
        const newSave = await page.evaluate(() => JSON.stringify(makeSave()));
        await page.evaluate(() => buildWorld({...GEN_DEFAULTS,landformVersion:2})); await settled(); await assertReady();
        assert.equal((await fingerprints()).physical,'2377e4fa');
        await startDiagnostic();
        await page.locator('#omHome').click(); await settled();
        await page.screenshot({path:join(out,'before/world-terrain.png')});
        for(const region of report.cameras) {
            await page.evaluate(camera => {setLayer('relief');ContinuousMap.cancel();ContinuousMap.layer.focusId=null;Object.assign(renderer,camera,{target:camera.target.slice()});renderer.request();},region.camera);
            await settled(); await assertReady();
            assert.deepEqual(await page.evaluate(()=>({target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation})),region.camera);
            await page.screenshot({path:join(out,'before',`range-${region.id}.png`)});
        }
        await page.evaluate(() => advance(1)); await settled();
        const v2Save = await page.evaluate(() => JSON.stringify(makeSave()));
        await page.evaluate(saved=>loadSimulation(new File([saved],'version3.json',{type:'application/json'})),newSave); await settled();
        assert.equal(await page.evaluate('world.params.landformVersion'),3);
        assert.deepEqual(await page.evaluate('JSON.parse(JSON.stringify(sim))'),JSON.parse(newSave).simulation);
        await page.evaluate(saved=>loadSimulation(new File([saved],'version2.json',{type:'application/json'})),v2Save); await settled();
        assert.equal(await page.evaluate('world.params.landformVersion'),2);
        assert.equal((await fingerprints()).physical,'2377e4fa');
        assert.deepEqual(await page.evaluate('JSON.parse(JSON.stringify(sim))'),JSON.parse(v2Save).simulation);
        report.savedVersions = [2,3];
    }
    assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
    report.errors=errors;report.externalRequests=requests;
    await writeFile(join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS tectonic climate and land cover comparison',out);
} finally {
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, {recursive: true, force: true});
}
