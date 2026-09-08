// Production browser acceptance: real catalog sites, mounted atlas meshes and
// the visible navigation/export controls. Uses no browser dependency in the app.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {loadEngine} from './engine-loader.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname),out=process.env.TELLURIC_DRAGON_OUTPUT||join(tmpdir(),'telluric-dragon-sites');
const declaration=(await readFile(join(root,'src/ui/world-ui.js'),'utf8')).match(/const GEN_DEFAULTS = \{[^\n]+\};/)?.[0];
assert(declaration,'source generation defaults are missing');
const params=Function(declaration+'return GEN_DEFAULTS;')();assert.equal(params.landformVersion,3);
const E=loadEngine(),referenceFor=async params=>{
 const w=await E.generateWorld(params),s=E.createCivilization(w,{realms:18,conflict:1});
 return{params,fingerprints:[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)],
  high:s.provinces.filter(p=>p.highCitadel&&p.settled&&p.urbanPop>=650).map(p=>({provinceId:p.id,kind:p.highCitadel.kind,name:p.name})).sort((a,b)=>a.provinceId-b.provinceId)};
};
const defaultReference=await referenceFor(params),highReference=await referenceFor({...params,seed:'Meridian-21',form:'rift'});
assert.deepEqual(highReference.high.map(({provinceId,kind})=>({provinceId,kind})),[{provinceId:199,kind:'dragon'},{provinceId:407,kind:'holy'}],'the real alternate v3 world must retain both legal high-city sites');
await mkdir(out,{recursive:true});const profile=await mkdtemp(join(tmpdir(),'telluric-dragon-browser-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});
child.unref();let browser,activePage;
function glb(buffer,expected,site){
 assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const length=buffer.readUInt32LE(12);assert.equal(buffer.readUInt32LE(16),0x4e4f534a);
 const json=JSON.parse(buffer.toString('utf8',20,20+length));assert.equal(buffer.readUInt32LE(24+length),0x004e4942);
 assert.equal(buffer.readUInt32LE(20+length),json.buffers[0].byteLength);assert.equal(28+length+json.buffers[0].byteLength,buffer.length);
 assert.equal(json.asset.extras.kind,'dragon-ruin');assert.equal(json.asset.extras.name,site.name);assert.equal(json.asset.extras.cell,site.i);
 assert.deepEqual(json.meshes.map(m=>m.name).sort(),expected.map(m=>m.name).sort(),'the file must contain exactly this ruin, without cities or world terrain');
 let vertices=0;
 for(const mesh of json.meshes){assert(mesh.name.startsWith('ruin:'+site.id+':'));const p=mesh.primitives[0],a=json.accessors[p.attributes.POSITION],wanted=expected.find(m=>m.name===mesh.name);
  assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');assert.equal(a.count,wanted.count);assert.equal(a.count%3,0);assert.deepEqual(a.min,wanted.min);assert.deepEqual(a.max,wanted.max);vertices+=a.count;
  const view=json.bufferViews[a.bufferView],start=28+length+(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||12;
  for(let i=0;i<a.count;i++)for(let k=0;k<3;k++)assert(Number.isFinite(buffer.readFloatLE(start+i*stride+k*4)),'GLB positions must remain finite');
 }
 assert(vertices>300);return{bytes:buffer.length,meshes:json.meshes.length,vertices};
}
try{
 let port;for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{await new Promise(r=>setTimeout(r,100))}}
 assert(port,'Chromium did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'reduce',acceptDownloads:true}),page=activePage=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 if(process.env.TELLURIC_DRAGON_URL)await page.goto(process.env.TELLURIC_DRAGON_URL,{waitUntil:'load',timeout:180000});
 else{await context.setOffline(true);await page.setContent(await readFile(join(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000})}
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading&&!ContinuousMap.ruinLayer.loading',null,{timeout:180000});
 const fingerprints=()=>page.evaluate(()=>[physicalFingerprint(world),settlementFingerprint(sim),politicalFingerprint(sim)]);
 await stable();await page.evaluate(()=>document.fonts.ready);const before=await fingerprints();
 assert.deepEqual(before,defaultReference.fingerprints,'the default browser world must match independent source generation');
 const readSites=()=>page.evaluate(()=>LandmarkUI.registry.filter(s=>s.highCitadel||s.dragonRuins).map(s=>({id:s.id,name:s.name,i:s.i,provinceId:s.provinceId,kind:s.highCitadel?.kind||'dragon-ruin'})));
 const sites=await readSites();
 const high=sites.filter(s=>s.kind!=='dragon-ruin'),ruins=sites.filter(s=>s.kind==='dragon-ruin');
 await writeFile(join(out,'catalog.json'),JSON.stringify({before,sites},null,2)+'\n');
 const highIdentity=sites=>sites.filter(s=>s.kind!=='dragon-ruin').map(({provinceId,kind,name})=>({provinceId,kind,name})).sort((a,b)=>a.provinceId-b.provinceId);
 assert.deepEqual(highIdentity(high),defaultReference.high,'the default catalog must include exactly its real legal high cities, including an empty set');assert(ruins.length>=1&&ruins.length<=3,'the actual world catalog has a bounded set of ruins');
 const report={before,source:defaultReference,sites,high:[],ruins:[]},save=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 const home=async()=>{await page.locator('#omHome').click();await stable();await page.evaluate(()=>positionLabels());assert((await page.evaluate(()=>renderer.zoom))<16)};
 const pins=async(expectedSites=sites)=>{
  const rows=await page.locator('#worldLandmarkPins [data-atlas-site]').evaluateAll(nodes=>nodes.map(e=>{const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{id:e.dataset.siteId,kind:e.dataset.atlasSite,svg:!!e.querySelector('svg path'),visible:e.checkVisibility({checkVisibilityCSS:true}),hittable:hit===e||e.contains(hit),w:b.width,h:b.height}}));
  for(const site of expectedSites){const p=rows.find(p=>p.id===site.id);assert(p,site.name+' needs its dedicated symbol');assert.equal(p.kind,site.kind);assert(p.svg&&p.visible&&p.hittable&&p.w>=18&&p.h>=18,site.name+' must have a visible, clickable SVG symbol')}
  return rows;
 };
 report.overviewPins=await pins();await page.screenshot({path:join(out,'special-sites-world.png')});
 const meshEvidence=arg=>page.evaluate(({id,ruin})=>{
  const model=ruin?ContinuousMap.ruinLayer.models.get(id):ContinuousMap.layer.models.get(id);if(!model)return null;
  const names=ruin?model.meshNames:model.meshNames.filter(n=>/:(buildings|roofs)$/.test(n));let vertices=0,onScreen=0,samples=0,uploaded=true,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const meshes=[];for(const name of names){const mesh=renderer.meshes[name];if(!mesh?.vertices?.length||!renderer.visible(name))continue;uploaded&&=!!mesh.buffer&&!!mesh.vao;const data=mesh.vertices,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];vertices+=data.length/9;
   for(let i=0;i<data.length;i+=9)for(let k=0;k<3;k++){min[k]=Math.min(min[k],data[i+k]);max[k]=Math.max(max[k],data[i+k])}
   meshes.push({name,count:data.length/9,min,max});const step=Math.max(1,Math.floor(data.length/9/300))*9;
   for(let i=0;i<data.length;i+=step){const p=project4(renderer.mvp,[data[i],data[i+1],data[i+2]]),x=(p[0]/p[3]*.5+.5)*renderer.width,y=(.5-p[1]/p[3]*.5)*renderer.height;samples++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x>=0&&x<=renderer.width&&y>=0&&y<=renderer.height)onScreen++}
  }
  let pick=null,mounted=null;
  if(ruin){
   const origin=AtlasSpace.point(world,model.site.x,model.site.y,renderer.relief);
   mounted={originError:Math.hypot(...origin.map((v,i)=>v-model.frame.origin[i])),scale:model.frame.scale,parts:model.parts.length,matchingUploads:model.parts.every(p=>renderer.meshes[p.meshName]?.vertices.length===p.geometry.data.length)};
   outer:for(const part of model.parts.filter(p=>p.role!=='foundation')){const v=part.geometry.data,n=v.length/27;
    for(let j=0;j<Math.min(10,n);j++){const k=Math.floor(j*n/Math.min(10,n))*27,point=[0,1,2].map(a=>(v[k+a]+v[k+9+a]+v[k+18+a])/3),q=project4(renderer.mvp,point),x=(q[0]/q[3]*.5+.5)*renderer.width,y=(.5-q[1]/q[3]*.5)*renderer.height;
     if(x<0||x>renderer.width||y<0||y>renderer.height)continue;const hit=ContinuousMap.ruinLayer.pick(x,y);if(hit?.model.id===id){pick={id:hit.model.id,part:hit.part.id,x,y};break outer;}
    }
   }
  }
  if(!ruin)for(const b of model.city.buildings){const a=model.frame.anchors.get(b.id);if(!a)continue;
   const q=project4(renderer.mvp,[a.x,a.y+(model.heights[b.id]||b.h)*a.scale*.8,a.z]),x=(q[0]/q[3]*.5+.5)*renderer.width,y=(.5-q[1]/q[3]*.5)*renderer.height;
   if(x<0||x>renderer.width||y<0||y>renderer.height)continue;const hit=ContinuousMap.layer.pick(x,y);if(hit?.model.p.id===id){pick={id:hit.model.p.id,building:hit.building.id,x,y};break;}
  }
  return{id,kind:ruin?'dragon-ruin':model.city.highCitadel.kind,roles:ruin?model.parts.map(p=>p.role):model.city.buildings.map(b=>b.highRole),vertices,uploaded,onScreen,samples,width:maxX-minX,height:maxY-minY,zoom:renderer.zoom,meshes,mounted,pick};
 },arg);
 const assertMesh=(m,site)=>{assert(m&&m.vertices>300&&m.uploaded,site.name+' must upload real triangles to WebGL');assert(m.onScreen>m.samples*.45&&m.width>40&&m.height>40,site.name+' must be substantially visible, not merely a moved camera');if(m.mounted){assert(m.mounted.originError<1e-6&&m.mounted.scale>0&&m.mounted.scale<1&&m.mounted.matchingUploads);assert(m.pick,site.name+' must expose actual above-ground triangles to the scene picker')}else{assert(m.roles.length>=10&&m.roles.every(Boolean));assert(m.pick,site.name+' must expose its buildings in front of the terrain to the scene picker')};};
 // Click the map symbols themselves for both dedicated high-city models.
 const visitHighCities=async(highSites,catalog,target,prefix='')=>{
  for(const site of highSites){await page.locator(`#worldLandmarkPins [data-site-id="${site.id}"]`).click();await page.waitForFunction(id=>window.__continuousFocus===id&&window.__cityReady&&!window.__cityError,site.provinceId,{timeout:180000});await stable();const m=await meshEvidence({id:site.provinceId,ruin:false});assertMesh(m,site);target.push(m);await page.screenshot({path:join(out,prefix+site.kind+'-city.png')});await home();await pins(catalog);await save()}
 };
 const featuredSearch=async(highSites,ruinSites,prefix='')=>{
  await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('');
  assert.equal(await page.locator('[data-high-city]').count(),highSites.length);assert.equal(await page.locator('[data-ruin-site]').count(),ruinSites.length);
  assert.equal(await page.locator('[data-high-city] svg, [data-ruin-site] svg').count(),highSites.length+ruinSites.length);
  await page.screenshot({path:join(out,prefix+'featured-search.png')});
  if(highSites.length){await page.locator(`[data-high-city="${highSites[0].provinceId}"]`).click();await stable();await page.waitForFunction(id=>window.__continuousFocus===id,highSites[0].provinceId)}else await page.keyboard.press('Escape');
  await home();
 };
 await visitHighCities(high,sites,report.high);await featuredSearch(high,ruins);
 // The empty-search relic card must enter the same real site as its map pin.
 await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('');
 await page.locator(`[data-ruin-site="${ruins[0].id}"]`).click();
 await page.waitForFunction(id=>window.__ruinReady&&window.__ruinFocus===id,ruins[0].id,{timeout:180000});await stable();await home();
 // Chinese search must route to a catalog ruin and assemble it in this canvas.
 await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill('龙族遗迹');
 assert.equal(await page.locator('[data-search-hit]').count(),ruins.length);
 await page.locator('[data-search-hit]').first().click();await page.waitForFunction(ids=>window.__ruinReady&&ids.includes(window.__ruinFocus),ruins.map(s=>s.id),{timeout:180000});await stable();
 report.chineseSearch=await page.evaluate(()=>window.__ruinFocus);await home();
 for(const [index,site] of ruins.entries()){
  await pins();await page.locator(`#worldLandmarkPins [data-site-id="${site.id}"]`).click();
  await page.waitForFunction(id=>window.__ruinReady&&window.__ruinFocus===id,site.id,{timeout:180000});await stable();
  const m=await meshEvidence({id:site.id,ruin:true});assertMesh(m,site);assert(m.roles.some(r=>r!=='foundation'));await page.screenshot({path:join(out,site.id+'.png')});
  await page.locator('#cmRuinDetails').click();assert((await page.locator('#inspector').innerText()).includes(site.name));
  const parts=await page.locator('[data-ruin-part]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.ruinPart,name:e.textContent.replace(/\s*↗\s*$/,'')})));assert(parts.length>0);
  const part=parts[0];await page.locator(`[data-ruin-part="${part.id}"]`).click();await stable();
  const focus=await page.evaluate(({id,part})=>{const model=ContinuousMap.ruinLayer.models.get(id),view=ContinuousMap.ruinLayer.view(model,part);return{error:Math.hypot(...renderer.target.map((v,i)=>v-view.target[i])),zoom:renderer.zoom}}, {id:site.id,part:part.id});
  assert(focus.error<1e-5,'the fragment button must focus its actual mounted bounds');assert((await page.locator('#omSelectionBody h3').innerText()).includes(part.name));
  if(index===0)await page.screenshot({path:join(out,'ruin-part.png')});
  await page.locator('#cmRuinWhole').click();await stable();assert((await page.locator('#omSelectionBody h3').innerText()).includes(site.name));
  const expected=(await meshEvidence({id:site.id,ruin:true})).meshes;
  const downloaded=page.waitForEvent('download');await page.locator('#cmRuinGLB').click();const download=await downloaded;
  assert(download.suggestedFilename().endsWith('-ruin.glb'));const file=join(out,site.id+'.glb');await download.saveAs(file);assert.equal(await download.failure(),null);
  const exported=glb(await readFile(file),expected,site);report.ruins.push({...m,partFocus:{part:part.id,...focus},exported});await home();await pins();await save();
 }
 assert.deepEqual(await fingerprints(),before,'visiting, inspecting and exporting sites must not change the world or simulation');
 assert.deepEqual(await page.evaluate(()=>ContinuousMap.ruinLayer.report().failures),[]);assert.deepEqual(errors,[]);
 if(!process.env.TELLURIC_DRAGON_URL)assert.deepEqual(requests,[],'the production bundle must work without network assets');
 report.after=await fingerprints();report.errors=errors;await save();
 // History uses a separate saved-simulation fixture, cloned only after the
 // unmodified exploration fingerprints have been saved. Redistributing one
 // ordinary town's existing population to urban=649 makes the real +1-year
 // simulation cross the city-detail threshold; a default year need not do so.
 await page.evaluate(()=>{window.__qaHistoryBase={params:JSON.parse(JSON.stringify(world.params)),sim:JSON.parse(JSON.stringify(sim))}});
 const historySite=ruins[0];
 const loadThresholdFixture=async()=>{
  const fixture=await page.evaluate(async()=>{
   const s=JSON.parse(JSON.stringify(window.__qaHistoryBase.sim)),capitals=new Set(s.realms.filter(r=>r.alive).map(r=>r.capital));
   const candidates=s.provinces.filter(p=>p.settled&&!p.highCitadel&&!capitals.has(p.id)&&p.urbanPop>=650&&p.pop>2000&&Math.min(p.pop*.58,p.urbanSupport*(.70+.22*p.dev))>1200).sort((a,b)=>a.pop-b.pop);
   const p=candidates[0];if(!p)throw Error('No ordinary town can support the critical-population saved fixture');
   const original={urban:p.urbanPop,rural:p.ruralPop,total:p.pop},total=s.provinces.reduce((n,p)=>n+p.pop,0);
   p.urbanPop=649;p.ruralPop=p.pop-p.urbanPop;aggregateRealms(s);validateSimulation(s,world);
   const balanced=s.provinces.every(p=>Math.abs(p.pop-(p.urbanPop+p.ruralPop))<1e-7);
   if(!balanced||s.provinces.reduce((n,p)=>n+p.pop,0)!==total)throw Error('Critical-population fixture did not preserve population accounting');
   const info={kind:'critical-population saved simulation',provinceId:p.id,name:p.name,original,urban:p.urbanPop,rural:p.ruralPop,total:p.pop,worldPopulation:total,urbanSupport:p.urbanSupport,predictedUrbanTarget:Math.min(p.pop*.58,p.urbanSupport*(.70+.22*p.dev)),validated:true,populationBalanced:balanced};
   await buildWorld({...window.__qaHistoryBase.params},s.options,s);if(window.__error)throw Error(window.__error);
   validateSimulation(sim,world);return info;
  });
  await stable();assert.equal((await fingerprints())[0],before[0],'loading the threshold save must preserve the original geography');
  await page.locator(`#worldLandmarkPins [data-site-id="${historySite.id}"]`).click();
  await page.waitForFunction(id=>window.__ruinReady&&window.__ruinFocus===id&&ContinuousMap.ruinLayer.models.get(id)?.lod===2&&!ContinuousMap.ruinLayer.loading,historySite.id,{timeout:180000});
  await stable();await page.locator('#cmRuinDetails').click();return fixture;
 };
 const captureHistory=()=>page.evaluate(id=>{
  const m=window.__qaHistoryRuin=ContinuousMap.ruinLayer.models.get(id);window.__qaHistoryDetails=document.querySelector('[data-ruin-part]');
  return{year:sim.year,key:m.key,lod:m.lod,landscapeKey:LandscapeRelief.key(world),camera:{target:[...renderer.target],zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation}};
 },historySite.id);
 const advanceAndReload=async(previous,fixture)=>{
  assert.equal(previous.lod,2,'history must start after the initial LOD refinement is complete');
  await page.locator('#step1').click();await page.waitForFunction(year=>sim.year===year+1&&!busy&&!simAdvancing,previous.year,{timeout:180000});
  await page.waitForFunction(({id,key})=>LandscapeRelief.key(world)!==key&&ContinuousMap.ruinLayer.models.get(id)?.lod===2&&!ContinuousMap.ruinLayer.loading,{id:historySite.id,key:previous.landscapeKey},{timeout:60000});await stable();
  const next=await page.evaluate(({id,provinceId})=>{const m=ContinuousMap.ruinLayer.models.get(id),p=sim.provinces[provinceId];validateSimulation(sim,world);return{year:sim.year,key:m.key,lod:m.lod,landscapeKey:LandscapeRelief.key(world),urban:p.urbanPop,settled:p.settled,replaced:m!==window.__qaHistoryRuin,detailsReplaced:!window.__qaHistoryDetails.isConnected,
   meshOwnersCurrent:m.meshNames.every(n=>ContinuousMap.ruinLayer.meshOwners.get(n)?.model===m),parts:m.parts.filter(p=>p.role!=='foundation').map(p=>({id:p.id,name:p.name})),camera:{target:[...renderer.target],zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation}}},{id:historySite.id,provinceId:fixture.provinceId});
  assert(next.settled&&next.urban>=650,'the actual annual simulation must cross the city-detail threshold');
  assert.notEqual(next.landscapeKey,previous.landscapeKey,'a true landscape invalidation, not merely LOD refinement, must occur');assert.equal(next.lod,previous.lod);
  assert.notEqual(next.key,previous.key);assert(next.replaced&&next.detailsReplaced&&next.meshOwnersCurrent,'the same-LOD model, mesh ownership and details must all be refreshed');
  assert.deepEqual(next.camera,previous.camera,'history must restream the ruin without moving the camera');return next;
 };
 const fixture=await loadThresholdFixture(),historyBefore=await captureHistory(),historyAfter=await advanceAndReload(historyBefore,fixture);
 const historyMesh=await meshEvidence({id:historySite.id,ruin:true});assertMesh(historyMesh,historySite);
 assert(await page.locator('#cmRuinGLB').isEnabled());
 const historyParts=await page.locator('[data-ruin-part]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.ruinPart,name:e.textContent.replace(/\s*↗\s*$/,'')})));
 assert.deepEqual(historyParts,historyAfter.parts,'details must enumerate the latest mounted assembly');
 const historyDownload=page.waitForEvent('download');await page.locator('#cmRuinGLB').click();const artifact=await historyDownload,path=join(out,historySite.id+'-after-history.glb');await artifact.saveAs(path);assert.equal(await artifact.failure(),null);
 const historyExport=glb(await readFile(path),historyMesh.meshes,historySite);
 report.history={site:historySite.id,fixture,before:historyBefore,after:historyAfter,fingerprints:await fingerprints(),mesh:historyMesh,exported:historyExport};
 assert.equal(report.history.fingerprints[0],before[0],'advancing civilization must preserve physical geography');await save();
 await page.screenshot({path:join(out,'ruin-after-history.png')});
 // A fresh copy of the same threshold save independently exercises the closed
 // card path, so this assertion cannot pass just because no rebuild occurred.
 const closedFixture=await loadThresholdFixture();await page.locator('#omSelectionClose').click();assert.equal(await page.locator('#omSelection').isVisible(),false);
 const closedBefore=await captureHistory(),closedAfter=await advanceAndReload(closedBefore,closedFixture);
 assert.equal(await page.locator('#omSelection').isVisible(),false,'a history reload must not reopen a card the user closed');
 const closedMesh=await meshEvidence({id:historySite.id,ruin:true});assertMesh(closedMesh,historySite);
 report.history.closedCard={fixture:closedFixture,before:closedBefore,after:closedAfter,stillHidden:true,pick:closedMesh.pick,fingerprints:await fingerprints()};
 await page.screenshot({path:join(out,'ruin-history-card-closed.png')});await home();await pins();
 assert.deepEqual(await page.evaluate(()=>ContinuousMap.ruinLayer.report().failures),[]);assert.deepEqual(errors,[]);
 if(!process.env.TELLURIC_DRAGON_URL)assert.deepEqual(requests,[]);
 await page.evaluate(()=>{delete window.__qaHistoryRuin;delete window.__qaHistoryDetails;delete window.__qaHistoryBase});await save();
 // A second genuinely generated v3 world has two suitable highland sites. The
 // default world's lack of legal sites must not skip the actual high-city UI,
 // rendering, picking and search acceptance checks or force a terrain edit.
 await page.evaluate(params=>buildWorld(params),highReference.params);await stable();
 const highBefore=await fingerprints();assert.deepEqual(highBefore,highReference.fingerprints);
 const highSites=await readSites(),fixtureHigh=highSites.filter(s=>s.kind!=='dragon-ruin'),fixtureRuins=highSites.filter(s=>s.kind==='dragon-ruin');
 assert.deepEqual(highIdentity(fixtureHigh),highReference.high,'the second bundled world must mount both independently generated high cities');
 report.highCityFixture={source:highReference,before:highBefore,sites:highSites,high:[],overviewPins:await pins(highSites)};
 await page.screenshot({path:join(out,'meridian-special-sites-world.png')});
 await visitHighCities(fixtureHigh,highSites,report.highCityFixture.high,'meridian-');
 await featuredSearch(fixtureHigh,fixtureRuins,'meridian-');
 report.highCityFixture.after=await fingerprints();assert.deepEqual(report.highCityFixture.after,highBefore,'visiting both real high cities must not change the second world');
 assert.deepEqual(await page.evaluate(()=>ContinuousMap.ruinLayer.report().failures),[]);assert.deepEqual(errors,[]);
 if(!process.env.TELLURIC_DRAGON_URL)assert.deepEqual(requests,[]);await save();
 console.log(JSON.stringify({sites:sites.map(s=>({id:s.id,kind:s.kind})),high:report.high.map(m=>({kind:m.kind,vertices:m.vertices,onScreen:m.onScreen,samples:m.samples})),highCityFixture:{params:highReference.params,fingerprints:report.highCityFixture.after,high:report.highCityFixture.high.map(m=>({id:m.id,kind:m.kind,vertices:m.vertices,onScreen:m.onScreen,samples:m.samples,pick:m.pick}))},ruins:report.ruins.map(m=>({id:m.id,parts:m.mounted.parts,vertices:m.vertices,pick:m.pick,exported:m.exported})),fingerprints:report.after,history:{fixture:fixture.kind,from:historyBefore.year,to:historyAfter.year,landscapeKeys:[historyBefore.landscapeKey,historyAfter.landscapeKey],lod:[historyBefore.lod,historyAfter.lod],reloaded:historyAfter.replaced,cameraUnchanged:true,exported:historyExport,fingerprints:report.history.fingerprints,closedCard:{from:closedBefore.year,to:closedAfter.year,landscapeKeys:[closedBefore.landscapeKey,closedAfter.landscapeKey],stillHidden:true,reloaded:closedAfter.replaced}},errors,out},null,2));
}catch(error){
 if(activePage){try{await activePage.screenshot({path:join(out,'failure.png')});const state=await activePage.evaluate(()=>({city:window.__continuousFocus,cityError:window.__cityError,ruin:window.__ruinFocus,ruinReady:window.__ruinReady,ruins:window.ContinuousMap?.ruinLayer?.report(),selection:document.getElementById('omSelectionBody')?.innerText}));await writeFile(join(out,'failure.json'),JSON.stringify({message:String(error),state},null,2)+'\n')}catch{}}
 throw error;
}finally{if(browser)await browser.close();try{process.kill(child.pid,'SIGTERM')}catch{}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
