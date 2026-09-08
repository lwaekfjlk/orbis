// Production DOM / WebGL verification. Supply PLAYWRIGHT_MODULE and CHROMIUM_PATH
// when using an external browser runtime; no browser packages enter the app.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname);
const out=process.env.TELLURIC_LABEL_OUTPUT||join(tmpdir(),'telluric-labels-qa');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'telluric-label-browser-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});
child.unref();let browser;
try {
 let port;
 for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}
 assert(port,'Chromium did not start');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'reduce'});
 await context.setOffline(true);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:180000});
 await page.setContent(await readFile(join(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000});
 await stable();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>positionLabels());
 const measure=()=>page.evaluate(()=>{
  const labels=labelItems.filter(v=>v.feature.town||v.feature.realm!=null).map(({element:e,feature:f})=>{
   const b=e.getBoundingClientRect(),q=renderer.screen(f.x,f.y,f.town?0:.6);
   return{name:f.name,town:!!f.town,realm:f.realm,visible:e.style.opacity==='1'&&e.checkVisibility({checkVisibilityCSS:true}),onScreen:q[0]>=0&&q[0]<=renderer.width&&q[1]>=0&&q[1]<=renderer.height,
    text:f.town?e.querySelector('em').textContent:e.innerText,font:f.town?parseFloat(getComputedStyle(e.querySelector('em')).fontSize):null,x:b.x,y:b.y,w:b.width,h:b.height};
  });
  const visible=labels.filter(l=>l.visible),overlaps=[];
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
   const a=visible[i],b=visible[j];
   if(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1)overlaps.push([a.name,b.name]);
  }
  const pins=[...document.querySelectorAll('#worldLandmarkPins .world-landmark-pin, #cmLabels .cm-building-pin')]
   .filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};});
  const covered=visible.filter(a=>pins.some(b=>a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1)).map(l=>l.name);
  return{towns:sim.provinces.filter(p=>p.settled).length,realms:sim.realms.filter(c=>c.alive).length,width:renderer.width,height:renderer.height,labels,overlaps,covered};
 });
 const complete=m=>{
  const towns=m.labels.filter(l=>l.town);
  assert.equal(towns.length,m.towns,'no per-country, population or thematic label quota');
  assert(towns.filter(l=>l.onScreen).every(l=>l.visible),'an on-screen settlement lost its name');
  assert(towns.every(l=>l.text===l.name),'city names must remain complete');
  const clipped=towns.filter(l=>l.visible&&!(l.x>=0&&l.x+l.w<=m.width&&l.y>=0&&l.y+l.h<=m.height));
  assert.deepEqual(clipped,[],'a visible city name is clipped');
 };
 const report={desktop:await measure()};complete(report.desktop);
 report.territory=await page.evaluate(()=>{
  const t=PoliticalLand.territory(world,sim);let dry=0,lakes=0,gaps=0,oceanClaims=0,remote=0;
  for(let i=0;i<GN;i++)if(world.height[i]>0){if(world.lake[i]>0)lakes++;else dry++;if(!sim.realms[t.owners[i]]?.alive)gaps++;if(world.lake[i]<=0&&!(sim.realms[sim.provinces[world.provinceId[i]]?.owner]?.alive))remote++;}else if(t.owners[i]>=0)oceanClaims++;
  const areaShare=sim.realms.filter(c=>c.alive).reduce((v,c)=>v+RealmProfile.create(world,sim,c.id).facts.areaShare,0);
  return{dry,lakes,gaps,oceanClaims,remote,areaShare,wilderness:document.querySelectorAll('.wildernessLabel').length};
 });
 assert.equal(report.territory.gaps,0);assert.equal(report.territory.oceanClaims,0);assert.equal(report.territory.wilderness,0);
 assert(report.territory.remote>6000);assert(Math.abs(report.territory.areaShare-1)<1e-9);
 assert.equal(report.desktop.labels.filter(l=>l.town&&l.visible).length,104);
 assert.equal(report.desktop.labels.filter(l=>!l.town&&l.visible).length,22);
 assert.deepEqual(report.desktop.overlaps,[],'desktop labels must not overlap');
 assert.deepEqual(report.desktop.covered,[],'landmark icons must not cover desktop names');
 assert(report.desktop.labels.filter(l=>l.town).every(l=>l.font<=10));
 await page.screenshot({path:join(out,'overview-desktop.png')});
 report.layers={};
 for(const layer of ['relief','water','ice']){await page.evaluate(layer=>setLayer(layer),layer);await stable();report.layers[layer]=await measure();complete(report.layers[layer]);}
 await page.evaluate(()=>setLayer('realms'));await stable();
 const lake=await page.evaluate(()=>{
  const owners=PoliticalLand.territory(world,sim).owners;
  const i=Array.from(world.lake).findIndex((v,i)=>v>0&&owners[i]>=0);
  selectRealm(owners[i]);
  const selectedCache=ContinuousMap.layer.terrainColorCache?.focusRealm;
  OneMap.closeDrawer();inspectCell(i);return{i,owner:owners[i],selectedCache,realm:RealmNames.fullName(sim.realms[owners[i]]),shortName:sim.realms[owners[i]].name,status:PoliticalLand.status(world,sim,i).label};
 });await stable();
 assert.equal(lake.realm,lake.status);
 assert.equal(lake.selectedCache,lake.owner,'selecting a country without hover must refresh its lake wash');
 assert((await page.locator('#omSelection').innerText()).includes(lake.shortName),'the lake card must name its country');
 assert((await page.locator('#inspector').innerText()).includes('Territory of '+lake.realm),'lake geography dossier must describe sovereignty');
 await page.keyboard.press('Escape');await stable();
 await page.setViewportSize({width:430,height:900});
 await page.waitForFunction('renderer.width===430');await stable();
 report.mobile=await measure();await writeFile(join(out,'mobile-layout.json'),JSON.stringify(report.mobile,null,2)+'\n');
 await page.screenshot({path:join(out,'overview-mobile.png')});complete(report.mobile);
 assert.equal(report.mobile.labels.filter(l=>l.town&&l.visible).length,104);
 assert.equal(report.mobile.labels.filter(l=>!l.town&&l.visible).length,22);
 assert.deepEqual(report.mobile.overlaps,[],'narrow overview labels must not overlap');
 assert.deepEqual(report.mobile.covered,[],'landmark icons must not cover narrow-screen names');
 await page.screenshot({path:join(out,'overview-mobile.png')});
 await page.evaluate(()=>{document.getElementById('names').checked=false;positionLabels();});
 assert.equal(await page.locator('#labels').isVisible(),false,'names toggle hides the shared label layer');
 await page.evaluate(()=>{document.getElementById('names').checked=true;positionLabels();});
 complete(await measure());
 await page.setViewportSize({width:1480,height:980});await page.waitForFunction('renderer.width===1480');await stable();
 report.local=[];
 for(const zoom of [16,60,150]){
  await page.evaluate(zoom=>{const p=sim.provinces.find(p=>p.highCitadel);renderer.focus(p.x,p.y);renderer.target[1]=renderer.ground(p.x,p.y);renderer.zoom=zoom;renderer.request();},zoom);
  await stable();const m=await measure();complete(m);
  assert(m.labels.some(l=>l.town&&l.visible),'local view lost all city labels');report.local.push({zoom,...m});
 }
 report.highCities=[];
 await page.locator('#omHome').click();await stable();
 await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('');
 const highIds=await page.locator('[data-high-city]').evaluateAll(nodes=>nodes.map(n=>+n.dataset.highCity));
 assert.equal(highIds.length,2,'the default world must expose both real high cities without a query');
 await page.screenshot({path:join(out,'high-city-search.png')});
 for(const id of highIds){
  if(!(await page.locator('#omSearchPanel').isVisible()))await page.locator('#omSearchToggle').click();
  await page.locator('#omSearch').fill('');await page.locator(`[data-high-city="${id}"]`).click();
  await page.waitForFunction(id=>window.__continuousFocus===id&&window.__cityReady&&!window.__cityError,id,{timeout:180000});await stable();
  const model=await page.evaluate(id=>{const m=ContinuousMap.layer.models.get(id),p=sim.provinces[id];return{id,name:p.name,kind:m.city.highCitadel.kind,elevation:m.city.highCitadel.elevation,buildings:m.city.buildings.length,roles:m.city.buildings.map(b=>b.highRole),zoom:renderer.zoom};},id);
  assert(model.elevation>=3500&&model.buildings>=10&&model.buildings<=18);assert(model.roles.every(Boolean));assert(model.zoom>60);
  await page.screenshot({path:join(out,model.kind+'-city.png')});report.highCities.push(model);
 }
 for(const [q,kind]of[['龙王城','dragon'],['圣城','holy']]){
  await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill(q);
  assert.equal(await page.locator('[data-search-hit]').count(),1,'each Chinese type finds one real city');
  await page.locator('[data-search-hit]').click();await stable();
  await page.waitForFunction(kind=>sim.provinces[window.__continuousFocus]?.highCitadel?.kind===kind,kind);
  assert.equal(await page.locator('#omSearchPanel').isVisible(),false,'a primary result enters the model and closes search');
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({desktop:{towns:104,realms:22,overlaps:report.desktop.overlaps},mobile:{towns:104,realms:22,overlaps:report.mobile.overlaps},territory:report.territory,highCities:report.highCities,layers:Object.keys(report.layers),localZooms:report.local.map(v=>v.zoom),lake,errors,out},null,2));
}finally{
 if(browser)await browser.close();
 try{process.kill(child.pid,'SIGTERM');}catch{}
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
