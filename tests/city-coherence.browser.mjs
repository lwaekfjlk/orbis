// Optional browser regression: install Playwright for tests, then run
// npm run test:city-browser. PLAYWRIGHT_MODULE / CHROMIUM_PATH can select an
// existing installation without adding any application dependencies.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'previews/city-coherence');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1480,height:980},reducedMotion:'reduce'}),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:240000});
const fingerprint=()=>page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim)})');
try {
 await page.setContent(await readFile(resolve(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000});await stable();
 const before=await fingerprint();await page.evaluate('window.__originalCanvas=renderer.canvas');
 const towns=await page.evaluate(`(()=>{const top=sim.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop);return [sim.provinces[507],top[0],top.find(p=>p.harbor>.4)].filter((p,i,a)=>p&&a.indexOf(p)===i).map(p=>({id:p.id,name:p.name}));})()`);
 for(const p of towns){
  // The search must reopen on the first click after entering the previous city.
  await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill(p.name);
  await page.locator('[data-search-enter]').first().click();
  await page.waitForFunction(id=>ContinuousMap.layer.models.has(id),p.id,{timeout:240000});await stable();
  const state=await page.evaluate(id=>{const m=ContinuousMap.layer.models.get(id);return {buildings:m.city.buildings.length,walls:m.city.defenses.walls.length,gates:m.city.defenses.gates.length,scarps:m.city.defenses.scarpSegments,worker:!!ContinuousMap.layer.worker,error:window.__continuousError||null,sameCanvas:renderer.canvas===window.__originalCanvas};},p.id);
  assert(state.buildings>100);assert.equal(state.scarps,0);assert(state.walls>20&&state.gates>0);assert(state.worker&&state.sameCanvas);assert.equal(state.error,null);
  await page.screenshot({path:resolve(out,`town-${p.id}.png`)});checks.push({...p,...state});console.log('PASS city',p.name,state);
 }
 assert.deepEqual(await fingerprint(),before);
 // Pick a real visible mesh, then use the actual Closer button.
 const hit=await page.evaluate(`(()=>{for(const m of ContinuousMap.layer.models.values())for(const b of m.city.buildings){const a=m.frame.anchors.get(b.id),q=project4(renderer.mvp,[a.x,a.y+(m.heights[b.id]||b.h)*a.scale*.7,a.z]),x=(q[0]/q[3]*.5+.5)*renderer.width,y=(.5-q[1]/q[3]*.5)*renderer.height;if(x<100||x>renderer.width-100||y<180||y>renderer.height-260)continue;const h=ContinuousMap.layer.pick(x,y);if(h)return{x,y};}return null;})()`);
 assert(hit);const zoom=await page.evaluate('renderer.zoom');await page.mouse.click(hit.x,hit.y);await page.locator('#cmFocusBuilding').click();await stable();assert(await page.evaluate('renderer.zoom')>=zoom);
 await page.screenshot({path:resolve(out,'building.png')});
 // Moving from a small house to a large precinct must refit its full bounds.
 const large=await page.evaluate(`(()=>{const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId),b=m.city.buildings.slice().sort((a,b)=>Math.max(b.w,b.d)-Math.max(a.w,a.d))[0];return {pid:m.p.id,bid:b.id,size:Math.max(b.w*m.frame.sx,b.d*m.frame.sz,(m.heights[b.id]||b.h)*m.frame.scale)};})()`);
 await page.evaluate(({pid,bid})=>ContinuousMap.focusBuilding(pid,bid),large);await stable();
 const fit=await page.evaluate('2*renderer.halfH');assert(large.size<fit,'a large precinct was clipped by the previous building zoom');
 // Buildings and streets remain intact after orbiting and changing screen size.
 await page.keyboard.down('Shift');await page.mouse.move(900,450);await page.mouse.down();await page.mouse.move(1080,490,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');await stable();
 await page.setViewportSize({width:430,height:900});await stable();await page.screenshot({path:resolve(out,'mobile.png')});
 await page.setViewportSize({width:1480,height:980});
 await page.locator('#forgeButton').click();await page.locator('#seed').fill('City-coherence-2026');await page.locator('#generate').click();await stable();
 assert.equal(await page.evaluate('world.params.seed'),'City-coherence-2026');assert.equal(await page.evaluate('ContinuousMap.layer.models.size'),0);
 const next=await page.evaluate('sim.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop)[0].name');
 await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill(next);await page.locator('[data-search-enter]').first().click();await stable();
 assert(await page.evaluate('ContinuousMap.layer.models.size')>0);assert.equal(await page.evaluate('window.__continuousError||null'),null);
 await page.screenshot({path:resolve(out,'regenerated.png')});
 assert.equal(errors.length,0,errors.join('\n'));assert(!requests.some(u=>/^https?:/.test(u)),'offline bundle requested network assets');
 await writeFile(resolve(out,'results.json'),JSON.stringify({checks,errors,externalRequests:requests.filter(u=>/^https?:/.test(u)),buildingPicking:true,closer:true,orbit:true,mobile:true,regeneration:true},null,2)+'\n');
 console.log('PASS picking, Closer, orbit, mobile, regeneration, offline worker; no page errors');
} finally {await browser.close();}
