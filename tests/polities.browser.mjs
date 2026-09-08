// Optional offline Chromium regression for country labels, territory and people.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.env.TELLURIC_POLITY_OUTPUT||join(root,'previews/polities'));
const baseline=process.env.TELLURIC_BASELINE==='1';
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
  fingerprints:[physicalFingerprint(world),settlementFingerprint(sim),politicalFingerprint(sim)]
 }));
 const report={baseline,desktop:await measure()};
 console.log('Desktop',JSON.stringify(report.desktop));
 await page.screenshot({path:join(out,'world.png')});
 if(!baseline){
  assert(report.desktop.realms>=18&&report.desktop.realms<=28);
  assert.equal(report.desktop.unownedTowns,0);
  assert(report.desktop.majority.every(c=>c.share>.5));
  assert.equal(report.desktop.labels.filter(l=>l.visible).length,report.desktop.realms,'every country must have a visible name or clickable marker');
  assert(report.desktop.wilderness>0,'remaining wilderness must be named');
  assert.deepEqual(report.desktop.fingerprints.slice(0,2),['440ae5d0','6b6c5ea8']);
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
  await page.setViewportSize({width:430,height:900});await stable();await page.waitForTimeout(200);
  report.mobile=await measure();await page.screenshot({path:join(out,'mobile.png')});
  assert(report.mobile.labels.some(l=>l.visible),'mobile hides all country names');
  assert.equal(report.mobile.labels.length,report.desktop.realms);
  const id=report.mobile.labels.find(l=>l.visible)?.id;
  await page.evaluate(id=>{const c=sim.realms[id],p=sim.provinces[c.capital];renderer.focus(p.x,p.y);},id);await stable();
  assert(await page.locator('#labels [data-realm-id="'+id+'"]').evaluate(e=>e.style.opacity==='1'));
  await page.screenshot({path:join(out,'mobile-region.png')});
  assert.deepEqual((await measure()).fingerprints,report.desktop.fingerprints,'reading the map changed its world');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({...report,errors,external},null,2)+'\n');
 console.log('PASS polities browser');
} finally {if(browser)await browser.close();try{process.kill(-child.pid,'SIGKILL');}catch{}await rm(profile,{recursive:true,force:true});}
