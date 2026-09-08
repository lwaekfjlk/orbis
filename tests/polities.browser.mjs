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
 assert(declaration,'source defaults are missing');const params=Function(declaration+'return GEN_DEFAULTS;')();assert.equal(params.landformVersion,2);
 const E=loadEngine(),w=await E.generateWorld(params),s=E.createCivilization(w,{realms:18,conflict:1});
 const territory=E.PoliticalLand.territory(w,s);let landCells=0,lakeCells=0,unclaimedCells=0,enclosedSeaCells=0;
 for(let i=0;i<w.height.length;i++){
  if(w.height[i]<=0){if(territory.inlandWater[i])enclosedSeaCells++;continue;}
  if(w.lake[i]>0)lakeCells++;else landCells++;if(territory.owners[i]<0)unclaimedCells++;
 }
 reference={fingerprints:[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)],realms:s.realms.filter(c=>c.alive).length,towns:s.provinces.filter(p=>p.settled).length,
  territory:{landCells,lakeCells,unclaimedCells,invalidClaims:0,oceanClaims:0,enclosedSeaCells},owners:Array.from(territory.owners),inlandWater:Array.from(territory.inlandWater),
  enclosedSea:{owner:territory.owners[15995],country:s.realms[territory.owners[15995]]?.name},
  highCities:s.provinces.filter(p=>p.highCitadel&&p.settled).map(p=>({id:p.id,kind:p.highCitadel.kind}))};
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
 const measure=()=>page.evaluate(()=>{
  const territory=typeof PoliticalLand!=='undefined'&&PoliticalLand.territory?PoliticalLand.territory(world,sim):null;
  const owners=territory?.owners||Int32Array.from(world.height,(h,i)=>h>0&&world.lake[i]<=0?(sim.provinces[world.provinceId[i]]?.owner??-1):-1);
  let landCells=0,lakeCells=0,unclaimedCells=0,invalidClaims=0,oceanClaims=0,enclosedSeaCells=0;
  for(let i=0;i<world.height.length;i++){
   if(owners[i]>=0&&(!sim.realms[owners[i]]||sim.realms[owners[i]].alive===false))invalidClaims++;
   if(world.height[i]<=0){if(territory?.inlandWater[i])enclosedSeaCells++;else if(owners[i]>=0)oceanClaims++;continue;}
   if(world.lake[i]>0)lakeCells++;else landCells++;
   if(owners[i]<0)unclaimedCells++;
  }
  return {
  realms:sim.realms.filter(c=>c.alive).length,
  towns:sim.provinces.filter(p=>p.settled).length,
  visibleTownNames:labelItems.filter(v=>v.feature.town&&v.element.style.opacity==='1').length,
  majority:sim.realms.filter(c=>c.alive).map(c=>({id:c.id,name:c.name,share:Math.max(...c.people)})),
  unownedTowns:sim.provinces.filter(p=>p.settled&&p.owner<0).length,
  unownedPopulation:sim.provinces.filter(p=>p.owner<0).reduce((n,p)=>n+p.pop,0),
  population:sim.provinces.reduce((n,p)=>n+p.pop,0),
  labels:labelItems.filter(v=>v.feature.realm!=null).map(({element:e,feature:f})=>{const b=e.getBoundingClientRect();return{id:f.realm,text:e.innerText,visible:e.style.opacity==='1',variant:e.dataset.labelVariant||'original',x:b.x,y:b.y,w:b.width,h:b.height,
   lettering:['.realmFullName','.realmCompactName'].map(selector=>{const s=getComputedStyle(e.querySelector(selector));return{family:s.fontFamily,style:s.fontStyle,weight:s.fontWeight};})};}),
  wildness:labelItems.filter(v=>v.feature.wildness).map(v=>({name:v.feature.name,text:v.element.innerText,visible:v.element.style.opacity==='1'})),
  territory:{landCells,lakeCells,unclaimedCells,invalidClaims,oceanClaims,enclosedSeaCells},
  fingerprints:[physicalFingerprint(world),settlementFingerprint(sim),politicalFingerprint(sim)],
  landformVersion:world.params.landformVersion||0
 };});
 const report={baseline,desktop:await measure()};
 console.log('Desktop',JSON.stringify(report.desktop));
 await page.screenshot({path:join(out,'world.png')});
 if(!baseline){
  assert.equal(report.desktop.landformVersion,2,'the default atlas loaded legacy terrain');
  assert.equal(report.desktop.realms,reference.realms,'browser founding differs from independent source generation');
  assert(report.desktop.realms>=18&&report.desktop.realms<=28);
  assert.equal(report.desktop.towns,reference.towns);assert.equal(report.desktop.visibleTownNames,reference.towns);
  assert.equal(report.desktop.unownedTowns,0);
  assert(report.desktop.majority.every(c=>c.share>.5));
  assert.equal(report.desktop.labels.filter(l=>l.visible).length,report.desktop.realms,'every country must have a visible name or clickable marker');
  assert(report.desktop.wildness.some(l=>l.visible),'open unowned terrain must retain a visible wildness label');
  assert(report.desktop.wildness.every(l=>l.name==='wildness'&&(!l.visible||l.text==='wildness')));
  assert.deepEqual(report.desktop.territory,reference.territory,'the bundled political topology differs from independent source generation');
  assert.deepEqual(await page.evaluate('Array.from(PoliticalLand.territory(world,sim).owners)'),reference.owners,'the bundled territory grid differs from independent source generation');
  assert.deepEqual(await page.evaluate('Array.from(PoliticalLand.territory(world,sim).inlandWater)'),reference.inlandWater,'the bundled inland-water topology differs from independent source generation');
  assert(report.desktop.territory.unclaimedCells>5000,'open wildness must not be assigned wholesale to nearby countries');
  assert.equal(report.desktop.territory.invalidClaims,0);assert.equal(report.desktop.territory.oceanClaims,0);
  assert(report.desktop.territory.enclosedSeaCells>=64,'closed inland water must not be mistaken for edge-connected ocean');
  assert(report.desktop.labels.every(l=>l.lettering.every(f=>f.family.includes('IM Fell English')&&f.style==='italic'&&f.weight==='400')),'full and compact country names need the actual antique italic face');
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
  // Open land outside national territory stays wildness. A real pointer hit
  // must not invent a nearby country's title for its card.
  const wild=await page.evaluate(()=>{
   const owners=PoliticalLand.territory(world,sim).owners;
   const named=new Set([...(world.features||[]),...(world.legends||[])].map(f=>f.i));
   let i=-1;
   for(let y=3;y<GH-3&&i<0;y++)for(let x=3;x<GW-3;x++){
    const at=y*GW+x,id=owners[at];
    if(world.height[at]<=0||world.lake[at]>0||world.provinceId[at]>=0||id>=0||named.has(at))continue;
    let interior=true;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const j=at+dy*GW+dx;if(world.height[j]<=0||world.lake[j]>0||world.provinceId[j]>=0||owners[j]!==id)interior=false;}
    if(interior){i=at;break;}
   }
   if(i<0)return null;
   const camera={target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation},names=$('names').checked;
   $('names').checked=false;positionLabels();
   renderer.target=renderer.coord(i%GW,Math.floor(i/GW));renderer.zoom=4;renderer.azimuth=.018;renderer.elevation=1.4;renderer.request();
   return{i,status:PoliticalLand.status(world,sim,i).kind,camera,names};
  });
  assert(wild,'default map needs real open wildness outside the province raster');assert.equal(wild.status,'wildness');await stable();
  const point=await page.evaluate(i=>{
   renderer.updateCamera();const [x,y]=renderer.screen(i%GW,Math.floor(i/GW),0),hit=AtlasSpace.pickGround(renderer,x,y),rect=renderer.canvas.getBoundingClientRect();
   return{x:x+rect.left,y:y+rect.top,hit:hit?.i};
  },wild.i);
  assert(Number.isInteger(point.hit));
  assert(await page.evaluate(i=>world.provinceId[i]<0&&PoliticalLand.status(world,sim,i).kind==='wildness',point.hit),'the pointer should hit the same open wildness');
  await page.mouse.click(point.x,point.y);await stable();
  const selected=await page.evaluate(()=>({i:selectedCell,province:world.provinceId[selectedCell],owner:PoliticalLand.owner(world,sim,selectedCell)}));
  assert.equal(selected.province,-1);assert.equal(selected.owner,-1);
  const wildCard=await page.locator('#omSelectionBody').innerText();
  assert.equal(await page.locator('#omSelectionBody > .om-eyebrow').innerText(),'wildness','open land card must use the requested exact label');
  assert.doesNotMatch(wildCard,/wilderness|unclaimed|No realm claims/i);
  report.wild={...selected,status:wild.status};await page.screenshot({path:join(out,'wildness.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(({camera,names})=>{Object.assign(renderer,camera);$('names').checked=names;positionLabels();renderer.request();},wild);await stable();
  // The negative-height inland sea is closed by Annwn's shore. It must retain
  // its country even though the physical height raster classifies it as water.
  const sea=await page.evaluate(()=>{
   const i=15995,t=PoliticalLand.territory(world,sim),status=PoliticalLand.status(world,sim,i),cells=[i],seen=new Set(cells);
   for(let k=0;k<cells.length;k++){
    const at=cells[k],x=at%GW,y=Math.floor(at/GW);
    for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
     const xx=x+dx,yy=y+dy,j=yy*GW+xx;
     if(xx<0||xx>=GW||yy<0||yy>=GH||seen.has(j)||world.height[j]>0||!t.inlandWater[j])continue;
     seen.add(j);cells.push(j);
    }
   }
   const camera={target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation},names=$('names').checked;
   $('names').checked=false;positionLabels();renderer.target=renderer.coord(i%GW,Math.floor(i/GW));renderer.zoom=6;renderer.azimuth=.018;renderer.elevation=1.4;renderer.request();
   return{i,height:world.height[i],inland:t.inlandWater[i],owner:t.owners[i],country:status.realm?.name,fullName:status.label,status:status.kind,cells,owners:[...new Set(cells.map(j=>t.owners[j]))],camera,names};
  });await stable();
  assert(sea.height<0&&sea.inland);assert.equal(sea.status,'realm');assert.equal(sea.owner,reference.enclosedSea.owner);assert.equal(sea.country,reference.enclosedSea.country);assert.equal(sea.cells.length,64);assert.deepEqual(sea.owners,[reference.enclosedSea.owner]);
  const seaPoint=await page.evaluate(i=>{renderer.updateCamera();const [x,y]=renderer.screen(i%GW,Math.floor(i/GW),0),hit=AtlasSpace.pickGround(renderer,x,y),r=renderer.canvas.getBoundingClientRect();return{x:x+r.left,y:y+r.top,hit:hit?.i};},sea.i);
  assert(sea.cells.includes(seaPoint.hit),'the pointer must hit the real closed-sea component');
  await page.mouse.click(seaPoint.x,seaPoint.y);await stable();
  assert.equal(await page.locator('#omSelectionBody > .om-eyebrow').innerText(),sea.country);
  assert((await page.locator('#omSelectionBody h3').innerText()).includes('Inland sea'));
  assert((await page.locator('#inspector').innerText()).includes('Territory of '+sea.fullName));
  report.inlandSea={i:sea.i,height:sea.height,inland:sea.inland,owner:sea.owner,country:sea.country,cells:sea.cells.length,hit:seaPoint.hit};
  await page.screenshot({path:join(out,'inland-sea.png')});await page.keyboard.press('Escape');
  await page.evaluate(owner=>{selectRealm(owner);OneMap.closeDrawer();$('names').checked=true;positionLabels();renderer.setHoveredRealm(owner);renderer.request();},sea.owner);await stable();
  assert.equal(await page.evaluate(()=>renderer.focusRealm),sea.owner,'the sea overview must highlight its actual country');
  await page.screenshot({path:join(out,'enclosed-sea.png')});
  await page.evaluate(()=>renderer.setHoveredRealm(null));
  await page.evaluate(({camera,names})=>{Object.assign(renderer,camera);$('names').checked=names;positionLabels();renderer.request();},sea);await stable();
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
  assert.equal(report.mobile.visibleTownNames,reference.towns);assert.equal(report.mobile.territory.unclaimedCells,report.desktop.territory.unclaimedCells);assert.equal(report.mobile.territory.invalidClaims,0);
  assert(report.mobile.wildness.length>0&&report.mobile.wildness.every(l=>l.name==='wildness'));
  assert(report.mobile.labels.every(l=>l.lettering.every(f=>f.family.includes('IM Fell English')&&f.style==='italic'&&f.weight==='400')));
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
  // High cities require suitable existing terrain: the menu must match every
  // legal founding, including an empty set when this world has no safe site.
  const highCities=await page.evaluate(()=>sim.provinces.filter(p=>p.highCitadel&&p.settled).map(p=>({id:p.id,kind:p.highCitadel.kind})));
  assert.deepEqual(highCities,reference.highCities,'the bundled high-city founding differs from source');
  const visitHighCities=async expected=>{
   const visits=[];
   await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('');
   assert.deepEqual(await page.locator('[data-high-city]').evaluateAll(es=>es.map(e=>+e.dataset.highCity).sort((a,b)=>a-b)),expected.map(p=>p.id).sort((a,b)=>a-b),'the search menu must expose exactly the actual high cities');
   for(const [index,high]of expected.entries()){
    if(index){await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('');}
    const entry=page.locator('[data-high-city="'+high.id+'"]');assert(await entry.isVisible(),'a high city is missing from the empty search menu');
    await entry.click();await stable();
    const actual=await page.evaluate(()=>{const m=ContinuousMap.layer.models.get(ContinuousMap.layer.focusId);return{id:m?.p.id,kind:m?.city.highCitadel?.kind,buildings:m?.city.buildings.length};});
    assert.equal(actual.id,high.id);assert.equal(actual.kind,high.kind);assert(actual.buildings>0);visits.push(actual);
   }
   if(!expected.length)await page.keyboard.press('Escape');return visits;
  };
  report.highCities=await visitHighCities(highCities);
  assert.deepEqual((await measure()).fingerprints,report.desktop.fingerprints,'visiting a high city changed the world');
  // Keep the original terrain's two known safe mountain sites as a positive
  // UI/model fixture; new terrain must not force towns onto unsuitable slopes.
  await page.evaluate(()=>buildWorld({...GEN_DEFAULTS,landformVersion:0}));await stable();
  assert.equal(await page.evaluate('physicalFingerprint(world)'),'440ae5d0');
  const oldHighCities=await page.evaluate(()=>sim.provinces.filter(p=>p.highCitadel&&p.settled).map(p=>({id:p.id,kind:p.highCitadel.kind})));
  assert.equal(oldHighCities.length,2,'the original terrain lost its two legal high cities');
  assert.deepEqual(oldHighCities.map(p=>p.kind).sort(),['dragon','holy']);
  const highCitySave=await page.evaluate('JSON.parse(JSON.stringify(sim))');
  report.originalHighCities=await visitHighCities(oldHighCities);
  await page.evaluate(s=>buildWorld({...GEN_DEFAULTS,landformVersion:0},s.options,s),highCitySave);await stable();
  assert.deepEqual(await page.evaluate(()=>sim.provinces.filter(p=>p.highCitadel).map(p=>({id:p.id,highCitadel:p.highCitadel,pop:p.pop,urbanPop:p.urbanPop}))),highCitySave.provinces.filter(p=>p.highCitadel).map(p=>({id:p.id,highCitadel:p.highCitadel,pop:p.pop,urbanPop:p.urbanPop})),'restoring an original-terrain save lost or changed its high cities');
  report.restoredHighCities=await visitHighCities(oldHighCities);
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
   assert(report.legacy.territory.unclaimedCells>0);assert.equal(report.legacy.territory.invalidClaims,0);assert.equal(report.legacy.territory.oceanClaims,0);
   assert(report.legacy.wildness.every(l=>l.name==='wildness'));
   assert.equal(report.legacy.labels.filter(l=>l.visible).length,report.legacy.realms,'an old save still loses its country labels');
   await page.screenshot({path:join(out,'legacy.png')});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'results.json'),JSON.stringify({...report,errors,external},null,2)+'\n');
 console.log('PASS polities browser');
} finally {if(browser)await browser.close();try{process.kill(-child.pid,'SIGKILL');}catch{}await rm(profile,{recursive:true,force:true});}
