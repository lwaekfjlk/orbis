// Optional real-browser regression. PLAYWRIGHT_MODULE and CHROMIUM_PATH can
// select an existing installation; the application itself has no dependencies.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'previews/civic-layout/after');await mkdir(out,{recursive:true});
// An isolated process/profile also avoids inheriting a user's open browser.
const profile=await mkdtemp(join(tmpdir(),'telluric-civic-browser-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});child.unref();
let browser;
try {
 let port;for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}assert(port,'Chromium did not start');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[],checks=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:240000});
 await page.setContent(await readFile(resolve(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000});await stable();
 const fingerprint=()=>page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim)})');
 const before=await fingerprint();
 for(const name of ['Glassbeck','Scorchspire','Oakwaystead','Millwell','Longshaw']){
  await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill(name);await page.locator('[data-search-enter]').first().click();await stable();
  const state=await page.evaluate(()=>{
   const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId),r=renderer,homes=m.city.buildings.filter(b=>!b.landmark);let visible=0,sampled=0;r.updateCamera();
   // Survey an independent, evenly spaced set of rooftops against actual terrain.
   for(let i=0;i<homes.length;i+=Math.max(1,Math.floor(homes.length/40))){const b=homes[i],a=m.frame.anchors.get(b.id),p=[a.x,a.y+(m.heights[b.id]||b.h)*a.scale*.8,a.z],q=project4(r.mvp,p),x=(q[0]/q[3]*.5+.5)*r.width,y=(.5-q[1]/q[3]*.5)*r.height;if(x<0||x>r.width||y<0||y>r.height)continue;sampled++;const floor=AtlasSpace.pickGround(r,x,y);if(!floor||dot(sub(floor.point,p),r.dir)>=-.025)visible++;}
   return {id:m.p.id,name:m.p.name,buildings:m.city.buildings.length,azimuth:r.azimuth,elevation:r.elevation,visible,sampled,worker:!!ContinuousMap.layer.worker};
  });
  assert(state.buildings>100,name+' lost its residential neighborhoods');assert(state.sampled>=20&&state.visible/state.sampled>.85,name+' is obscured by foreground terrain');
  assert(state.elevation<1.0,'city entry became a plan view');assert(Math.abs(Math.sin(2*state.azimuth))>.6,'city entry only shows one facade');assert(state.worker);
  await page.screenshot({path:resolve(out,`town-${state.id}.png`)});checks.push(state);console.log('PASS city',state);
  if(name==='Longshaw'){
   await page.evaluate(id=>{const m=ContinuousMap.layer.models.get(id);return ContinuousMap.focusBuilding(id,m.city.primaryMonumentId);},state.id);await stable();await page.screenshot({path:resolve(out,'hillside-sanctuary.png')});
  }
 }
 // Re-entering a city must give the same useful view after an unrelated orbit.
 const flat=checks.find(x=>x.name==='Scorchspire');
 await page.evaluate(()=>{renderer.azimuth=-1.9;renderer.request();});await page.evaluate(id=>ContinuousMap.focusTown(id),flat.id);await stable();
 const bearingDelta=await page.evaluate('renderer.azimuth')-flat.azimuth;assert(Math.abs(Math.atan2(Math.sin(bearingDelta),Math.cos(bearingDelta)))<1e-8,'city bearing depends on the previously visited city');
 const hit=await page.evaluate(()=>{const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId);for(const b of m.city.buildings.filter(b=>!b.landmark)){const a=m.frame.anchors.get(b.id),q=project4(renderer.mvp,[a.x,a.y+(m.heights[b.id]||b.h)*a.scale*.7,a.z]),x=(q[0]/q[3]*.5+.5)*renderer.width,y=(.5-q[1]/q[3]*.5)*renderer.height;if(x<100||x>renderer.width-100||y<180||y>renderer.height-240)continue;const h=ContinuousMap.layer.pick(x,y);if(h&&!h.building.landmark)return{x,y};}return null;});
 assert(hit,'no visible house can be selected');await page.mouse.click(hit.x,hit.y);await page.locator('#cmFocusBuilding').click();await stable();assert(await page.evaluate('renderer.elevation')<.8);
 await page.screenshot({path:resolve(out,'house.png')});
 const palace=await page.evaluate(()=>{const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId),b=m.city.buildings.find(b=>b.type==='civic');return{pid:m.p.id,bid:b.id};});
 await page.evaluate(({pid,bid})=>ContinuousMap.focusBuilding(pid,bid),palace);await stable();await page.screenshot({path:resolve(out,'palace.png')});
 await page.keyboard.down('Shift');await page.mouse.move(900,450);await page.mouse.down();await page.mouse.move(1060,470,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');await stable();
 await page.setViewportSize({width:430,height:900});await stable();await page.screenshot({path:resolve(out,'mobile.png')});await page.setViewportSize({width:1480,height:980});
 // Existing underground rooms still need a steeper view down their entrance.
 const underground=await page.evaluate(()=>sim.provinces.find(p=>p.name==='Stormbeck').id);await page.evaluate(id=>ContinuousMap.focusTown(id),underground);await stable();
 const hole=await page.evaluate(()=>{const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId);return{pid:m.p.id,bid:m.excavations[0].buildingId};});
 await page.evaluate(({pid,bid})=>ContinuousMap.focusBuilding(pid,bid),hole);await stable();assert(await page.evaluate('renderer.elevation')>1.1);await page.screenshot({path:resolve(out,'underground.png')});
 assert.deepEqual(await fingerprint(),before,'viewing buildings changed the world');assert.equal(errors.length,0,errors.join('\n'));assert(!requests.some(u=>/^https?:/.test(u)),'offline bundle requested network assets');
 await writeFile(resolve(out,'results.json'),JSON.stringify({checks,errors,externalRequests:requests.filter(u=>/^https?:/.test(u)),stableBearing:true,housePicking:true,obliqueCloseup:true,orbit:true,mobile:true,undergroundCloseup:true},null,2)+'\n');
 console.log('PASS stable bearing, house selection, palace closeup, orbit, mobile, underground entry, offline worker');
} finally {
 if(browser)await browser.close();try{process.kill(-child.pid,'SIGKILL');}catch{}await rm(profile,{recursive:true,force:true});
}
