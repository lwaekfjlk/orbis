// Optional offline Chromium regression for country labels, territory and people.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEngine} from './engine-loader.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.env.TELLURIC_POLITY_OUTPUT||join(root,'previews/polities'));
const baseline=process.env.TELLURIC_BASELINE==='1';
let reference=null;
if(!baseline){
 const ui=await readFile(join(root,'src/ui/world-ui.js'),'utf8'),declaration=ui.match(/const GEN_DEFAULTS = \{[^\n]+\};/)?.[0];
 assert(declaration,'source defaults are missing');const params=Function(declaration+'return GEN_DEFAULTS;')();assert.equal(params.landformVersion,1);
 const E=loadEngine(),w=await E.generateWorld(params),s=E.createCivilization(w,{realms:18,conflict:1});
 reference={fingerprints:[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)],realms:s.realms.filter(c=>c.alive).length};
}
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'telluric-polities-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});
child.unref();let browser;
try {
 let port;for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}
 assert(port,'Chromium did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'reduce'});await context.setOffline(true);
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:180000});
 await page.setContent(await readFile(process.env.TELLURIC_HTML||join(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000});await stable();
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350);await stable();
 const measure=()=>page.evaluate(()=>({
  realms:sim.realms.filter(c=>c.alive).length,
  majority:sim.realms.filter(c=>c.alive).map(c=>({id:c.id,name:c.name,share:Math.max(...c.people)})),
  unownedTowns:sim.provinces.filter(p=>p.settled&&p.owner<0).length,
  unownedPopulation:sim.provinces.filter(p=>p.owner<0).reduce((n,p)=>n+p.pop,0),
  population:sim.provinces.reduce((n,p)=>n+p.pop,0),
  labels:labelItems.filter(v=>v.feature.realm!=null).map(({element:e,feature:f})=>{const b=e.getBoundingClientRect();return{id:f.realm,text:e.innerText,visible:e.style.opacity==='1',variant:e.dataset.labelVariant||'original',x:b.x,y:b.y,w:b.width,h:b.height};}),
  wilderness:labelItems.filter(v=>v.feature.wilderness&&v.element.style.opacity==='1').length,
  fingerprints:[physicalFingerprint(world),settlementFingerprint(sim),politicalFingerprint(sim)],
  landformVersion:world.params.landformVersion||0
 }));
 const report={baseline,desktop:await measure()};
 console.log('Desktop',JSON.stringify(report.desktop));
 await page.screenshot({path:join(out,'world.png')});
 if(!baseline){
  assert.equal(report.desktop.landformVersion,1,'the default atlas loaded legacy terrain');
  assert.equal(report.desktop.realms,reference.realms,'browser founding differs from independent source generation');
  assert(report.desktop.realms>=18&&report.desktop.realms<=28);
  assert.equal(report.desktop.unownedTowns,0);
  assert(report.desktop.majority.every(c=>c.share>.5));
  assert.equal(report.desktop.labels.filter(l=>l.visible).length,report.desktop.realms,'every country must have a visible name or clickable marker');
  assert(report.desktop.wilderness>0,'remaining wilderness must be named');
  assert.deepEqual(report.desktop.fingerprints,reference.fingerprints,'the bundled world differs from current source defaults');
  const visible=report.desktop.labels.filter(l=>l.visible);
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
   const a=visible[i],b=visible[j];assert(!(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1),'overlapping country labels: '+a.text+' / '+b.text);
  }
  const label=page.locator('#labels [data-realm-id="'+visible[0].id+'"]');
  await label.hover();await stable();assert.equal(await page.evaluate('renderer.hoveredRealm'),visible[0].id);
  await label.click();await stable();
  assert(await page.locator('.realm-community').isVisible());
  assert.match(await page.locator('.realm-community').innerText(),/majority community/);
  await page.screenshot({path:join(out,'realm.png')});await page.keyboard.press('Escape');await stable();
  const wild=await page.evaluate(()=>labelItems.find(v=>v.feature.wilderness&&v.element.style.opacity==='1')?.feature.i);
  assert(Number.isInteger(wild));await page.evaluate(i=>inspectCell(i),wild);await stable();
  assert.match(await page.locator('#omSelectionBody').innerText(),/No realm claims|outside the territory of any realm/);
  await page.keyboard.press('Escape');
  // Zooming and resizing must reveal names in the visible territory, preserve
  // hover/click access, and keep the complete realm list on a narrow display.
  await page.setViewportSize({width:430,height:900});
  await page.waitForFunction('renderer.width===430');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await stable();
  await page.screenshot({path:join(out,'mobile.png')});report.mobile=await measure();
  const mobileLayout=await page.evaluate(()=>labelItems.filter(v=>v.feature.realm!=null).map(({element:e,feature:f})=>({id:f.realm,name:f.name,visible:e.style.opacity==='1',anchors:(f.anchors||[f]).map(a=>({...a,screen:renderer.screen(a.x,a.y,.6)})),probes:[e.querySelector('.realmFullName'),e.querySelector('.realmCompactName'),e.querySelector('.realmMarker')].map(p=>({width:p.offsetWidth,height:p.offsetHeight}))})));
  await writeFile(join(out,'mobile-layout.json'),JSON.stringify({mobile:report.mobile,layout:mobileLayout},null,2)+'\n');
  assert.equal(report.mobile.labels.filter(l=>l.visible).length,report.desktop.realms,'mobile loses a country instead of retaining its marker');
  assert(report.mobile.labels.filter(l=>l.visible).every(l=>l.x>=0&&l.x+l.w<=430),'mobile label measurements came from the old desktop viewport');
  assert.equal(report.mobile.labels.length,report.desktop.realms);
  const mobileVisible=report.mobile.labels.filter(l=>l.visible);
  for(let i=0;i<mobileVisible.length;i++)for(let j=i+1;j<mobileVisible.length;j++){
   const a=mobileVisible[i],b=mobileVisible[j];assert(!(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1),'overlapping mobile country labels: '+a.id+' / '+b.id);
  }
  const id=mobileVisible.find(l=>l.variant==='marker')?.id??mobileVisible[0].id;
  const mobileLabel=page.locator('#labels [data-realm-id="'+id+'"]');
  assert(await mobileLabel.getAttribute('aria-label'),'a country marker must expose its complete name');
  await mobileLabel.click();await stable();
  assert(await page.locator('.realm-community').isVisible(),'a mobile country marker must open its overview');
  assert.equal(await page.locator('.realm-overview').getAttribute('data-realm-id'),String(id),'the mobile marker must select its own country');
  await page.keyboard.press('Escape');await stable();
  await page.evaluate(id=>{const c=sim.realms[id],p=sim.provinces[c.capital];renderer.focus(p.x,p.y);},id);await stable();
  assert(await page.locator('#labels [data-realm-id="'+id+'"]').evaluate(e=>e.style.opacity==='1'));
  await page.screenshot({path:join(out,'mobile-region.png')});
  assert.deepEqual((await measure()).fingerprints,report.desktop.fingerprints,'reading the map changed its world');
  if(process.env.TELLURIC_LEGACY_SIM){
   const saved=JSON.parse(await readFile(process.env.TELLURIC_LEGACY_SIM,'utf8'));
   const history=s=>JSON.stringify({year:s.year,events:s.events,provinces:s.provinces.map(p=>[p.owner,p.pop,p.people]),realms:s.realms.map(c=>[c.id,c.name,c.title])});
   const original=history(saved);
   await page.setViewportSize({width:1480,height:980});await page.waitForFunction('renderer.width===1480');
   await page.evaluate(s=>buildWorld({...GEN_DEFAULTS,landformVersion:0},s.options,s),saved);await stable();await page.waitForTimeout(350);await stable();
   assert.equal(await page.evaluate('world.params.landformVersion'),0,'a legacy simulation was restored on new terrain');
   assert.equal(await page.evaluate('physicalFingerprint(world)'),'440ae5d0');
   const restored=await page.evaluate(()=>({year:sim.year,events:sim.events,provinces:sim.provinces.map(p=>[p.owner,p.pop,p.people]),realms:sim.realms.map(c=>[c.id,c.name,c.title])}));
   assert.equal(JSON.stringify(restored),original,'loading an old save rewrote its borders, people or history');
   report.legacy=await measure();
   assert.equal(report.legacy.realms,saved.realms.filter(c=>c.alive).length);
   assert.equal(report.legacy.labels.filter(l=>l.visible).length,report.legacy.realms,'an old save still loses its country labels');
   await page.screenshot({path:join(out,'legacy.png')});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({...report,errors,external},null,2)+'\n');
 console.log('PASS polities browser');
} finally {if(browser)await browser.close();try{process.kill(-child.pid,'SIGKILL');}catch{}await rm(profile,{recursive:true,force:true});}
