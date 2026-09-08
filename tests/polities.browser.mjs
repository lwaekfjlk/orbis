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
 const measure=()=>page.evaluate(()=>{
  const owners=typeof PoliticalLand!=='undefined'&&PoliticalLand.territory?PoliticalLand.territory(world,sim).owners
   :Int32Array.from(world.height,(h,i)=>h>0&&world.lake[i]<=0?(sim.provinces[world.provinceId[i]]?.owner??-1):-1);
  let landCells=0,lakeCells=0,unclaimedCells=0,invalidClaims=0,oceanClaims=0;
  for(let i=0;i<world.height.length;i++){
   if(world.height[i]<=0){if(owners[i]>=0)oceanClaims++;continue;}
   if(world.lake[i]>0)lakeCells++;else landCells++;
   if(owners[i]<0)unclaimedCells++;
   else if(!sim.realms[owners[i]]||sim.realms[owners[i]].alive===false)invalidClaims++;
  }
  return {
  realms:sim.realms.filter(c=>c.alive).length,
  majority:sim.realms.filter(c=>c.alive).map(c=>({id:c.id,name:c.name,share:Math.max(...c.people)})),
  unownedTowns:sim.provinces.filter(p=>p.settled&&p.owner<0).length,
  unownedPopulation:sim.provinces.filter(p=>p.owner<0).reduce((n,p)=>n+p.pop,0),
  population:sim.provinces.reduce((n,p)=>n+p.pop,0),
  labels:labelItems.filter(v=>v.feature.realm!=null).map(({element:e,feature:f})=>{const b=e.getBoundingClientRect();return{id:f.realm,text:e.innerText,visible:e.style.opacity==='1',variant:e.dataset.labelVariant||'original',x:b.x,y:b.y,w:b.width,h:b.height};}),
  wilderness:labelItems.filter(v=>v.feature.wilderness).length,
  territory:{landCells,lakeCells,unclaimedCells,invalidClaims,oceanClaims},
  fingerprints:[physicalFingerprint(world),settlementFingerprint(sim),politicalFingerprint(sim)]
 };});
 const report={baseline,desktop:await measure()};
 console.log('Desktop',JSON.stringify(report.desktop));
 await page.screenshot({path:join(out,'world.png')});
 if(!baseline){
  assert(report.desktop.realms>=18&&report.desktop.realms<=28);
  assert.equal(report.desktop.unownedTowns,0);
  assert(report.desktop.majority.every(c=>c.share>.5));
  assert.equal(report.desktop.labels.filter(l=>l.visible).length,report.desktop.realms,'every country must have a visible name or clickable marker');
  assert.equal(report.desktop.wilderness,0,'complete country territory must not show wilderness labels');
  assert.deepEqual(report.desktop.territory,{landCells:23087,lakeCells:538,unclaimedCells:0,invalidClaims:0,oceanClaims:0},'all positive-height cells need a living country while ocean stays unclaimed');
  assert.deepEqual(report.desktop.fingerprints.slice(0,2),['440ae5d0','e6aee7b8']);
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
  // Visit a real cell outside every administered province. The political card
  // must identify its derived country, and the pointer must still hit geography.
  const remote=await page.evaluate(()=>{
   const owners=PoliticalLand.territory(world,sim).owners;
   const named=new Set([...(world.features||[]),...(world.legends||[])].map(f=>f.i));
   let i=-1;
   for(let y=3;y<GH-3&&i<0;y++)for(let x=3;x<GW-3;x++){
    const at=y*GW+x,id=owners[at];
    if(world.height[at]<=0||world.lake[at]>0||world.provinceId[at]>=0||id<0||named.has(at))continue;
    let interior=true;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const j=at+dy*GW+dx;if(world.height[j]<=0||world.lake[j]>0||world.provinceId[j]>=0||owners[j]!==id)interior=false;}
    if(interior){i=at;break;}
   }
   if(i<0)return null;
   const camera={target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation},names=$('names').checked;
   $('names').checked=false;positionLabels();
   renderer.target=renderer.coord(i%GW,Math.floor(i/GW));renderer.zoom=4;renderer.azimuth=.018;renderer.elevation=1.4;renderer.request();
   return{i,realmId:owners[i],name:RealmNames.fullName(sim.realms[owners[i]]),shortName:sim.realms[owners[i]].name,camera,names};
  });
  assert(remote,'default map needs a real remote territory outside the province raster');await stable();
  const point=await page.evaluate(i=>{
   renderer.updateCamera();const [x,y]=renderer.screen(i%GW,Math.floor(i/GW),0),hit=AtlasSpace.pickGround(renderer,x,y),rect=renderer.canvas.getBoundingClientRect();
   return{x:x+rect.left,y:y+rect.top,hit:hit?.i};
  },remote.i);
  assert(Number.isInteger(point.hit));
  assert(await page.evaluate(({i,owner})=>world.provinceId[i]<0&&PoliticalLand.owner(world,sim,i)===owner,{i:point.hit,owner:remote.realmId}),'the pointer should hit the same unadministered country territory');
  await page.mouse.click(point.x,point.y);await stable();
  const selected=await page.evaluate(()=>({i:selectedCell,province:world.provinceId[selectedCell],owner:PoliticalLand.owner(world,sim,selectedCell)}));
  assert.equal(selected.province,-1);assert.equal(selected.owner,remote.realmId);
  const remoteCard=await page.locator('#omSelectionBody').innerText();
  assert.equal(await page.locator('#omSelectionBody > .om-eyebrow').innerText(),remote.shortName,'remote land card must name its actual country');
  assert.doesNotMatch(remoteCard,/wilderness|unclaimed|No realm claims/i);
  report.remote={...selected,country:remote.name};await page.screenshot({path:join(out,'remote-territory.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(({camera,names})=>{Object.assign(renderer,camera);$('names').checked=names;positionLabels();renderer.request();},remote);await stable();
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
  assert.equal(report.mobile.wilderness,0);assert.equal(report.mobile.territory.unclaimedCells,0);assert.equal(report.mobile.territory.invalidClaims,0);
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
   await page.evaluate(s=>buildWorld(GEN_DEFAULTS,s.options,s),saved);await stable();await page.waitForTimeout(350);await stable();
   const restored=await page.evaluate(()=>({year:sim.year,events:sim.events,provinces:sim.provinces.map(p=>[p.owner,p.pop,p.people]),realms:sim.realms.map(c=>[c.id,c.name,c.title])}));
   assert.equal(JSON.stringify(restored),original,'loading an old save rewrote its borders, people or history');
   report.legacy=await measure();
   assert.equal(report.legacy.realms,saved.realms.filter(c=>c.alive).length);
   assert.equal(report.legacy.wilderness,0);assert.equal(report.legacy.territory.unclaimedCells,0);assert.equal(report.legacy.territory.invalidClaims,0);assert.equal(report.legacy.territory.oceanClaims,0);
   assert.equal(report.legacy.labels.filter(l=>l.visible).length,report.legacy.realms,'an old save still loses its country labels');
   await page.screenshot({path:join(out,'legacy.png')});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({...report,errors,external},null,2)+'\n');
 console.log('PASS polities browser');
} finally {if(browser)await browser.close();try{process.kill(-child.pid,'SIGKILL');}catch{}await rm(profile,{recursive:true,force:true});}
