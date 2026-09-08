// Optional real-browser terrain regression. Uses the same Playwright environment
// overrides as city-coherence.browser.mjs. TERRAIN_HTML / TERRAIN_BASELINE permit
// a visual comparison against an older offline bundle without changing source.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.env.TERRAIN_BASELINE==='1',out=resolve(process.env.TELLURIC_TERRAIN_OUTPUT||resolve(root,'previews/terrain-refinement',baseline?'before':'after'));
await mkdir(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await chromium.launchServer({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const browser=await chromium.connect(server.wsEndpoint());
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:240000});
const settled=async()=>{await stable();if(!baseline)await page.waitForFunction('ContinuousMap.layer.lastTerrainKey===ContinuousMap.layer.terrainKey()',null,{timeout:240000});await stable();};
try{
 // Hold the photographed Glassbeck saddle constant across renderer versions.
 const original=await readFile(process.env.TERRAIN_HTML||resolve(root,'dist/telluric-onemap.html'),'utf8');
 const html=original.replace('/** One renderer and one atlas canvas.','GEN_DEFAULTS.landformVersion=0;\n/** One renderer and one atlas canvas.');
 assert.notEqual(html,original,'legacy terrain fixture was not installed');
 await page.setContent(html,{waitUntil:'load',timeout:180000});await stable();
 assert.equal(await page.evaluate('world.params.landformVersion||0'),0);
 assert.equal(await page.evaluate('physicalFingerprint(world)'),'440ae5d0');console.log('PASS original terrain fixture');
 if(!baseline)await page.evaluate(()=>{window.__farOverlays=Object.fromEntries(['roads','rivers'].map(name=>[name,renderer.meshes[name].vertices.slice()]));});
 await page.locator('#omSearchToggle').click();await page.locator('#omSearch').fill(await page.evaluate('sim.provinces[507].name'));await page.locator('[data-search-enter]').first().click();await settled();
 if(!baseline)assert(await page.evaluate(()=>Object.entries(window.__farOverlays).every(([name,v])=>v.some((n,i)=>n!==renderer.meshes[name].vertices[i]))),'entering detail must reseat both road and river overlays on the curved terrain');
 await page.screenshot({path:resolve(out,'city.png')});console.log('PASS city entry');
 // Inspect actual uploaded terrain, including triangle interiors. Vertex-only
 // checks cannot detect subdividing the same original two flat faces forever.
 const measure=()=>page.evaluate(()=>{
  const r=renderer,l=ContinuousMap.layer,v=r.meshes.terrain.vertices;let seen=0,maxEdge=0,maxError=0;
  r.updateCamera();
  for(let k=0;k<v.length;k+=27){if(v[k+1]<0)continue;
   const p=[0,9,18].map(i=>[v[k+i],v[k+i+1],v[k+i+2]]),center=p[0].map((a,j)=>(a+p[1][j]+p[2][j])/3),q=project4(r.mvp,center),sx=(q[0]/q[3]*.5+.5)*r.width,sy=(.5-q[1]/q[3]*.5)*r.height;
   if(sx<40||sx>r.width-40||sy<100||sy>r.height-100)continue;
   const grid=AtlasSpace.grid(center[0],center[2]);if(grid[0]<0||grid[0]>GW-1||grid[1]<0||grid[1]>GH-1)continue;
   const screen=p.map(a=>{const q=project4(r.mvp,a);return[q[0]/q[3]*r.width*.5,q[1]/q[3]*r.height*.5];});
   for(let j=0;j<3;j++)maxEdge=Math.max(maxEdge,Math.hypot(screen[j][0]-screen[(j+1)%3][0],screen[j][1]-screen[(j+1)%3][1]));
   maxError=Math.max(maxError,Math.abs(center[1]-AtlasSpace.surface(world,...grid,r.relief)));seen++;
  }
  return{zoom:r.zoom,detail:l.terrainDetail,target:l.terrainTarget||l.tessellation(),triangles:l.terrainTriangles,seen,maxEdge,maxError,key:l.lastTerrainKey};
 });
 const town=await measure();checks.push(town);console.log('TERRAIN',town);
 if(!baseline){assert(town.detail>=32);assert(town.triangles<400000);}
 // The terrain-only views make the landform and its shading directly reviewable.
 await page.evaluate(()=>{window.__terrainVisible=renderer.visible;renderer.visible=function(name){return name==='terrain'||name==='water';};renderer.dirtyShadow=true;renderer.request();});
 await page.addStyleTag({content:'#cmLabels,#cmContext,#cmStatus{visibility:hidden!important}'});await settled();await page.screenshot({path:resolve(out,'ground.png')});
 for(const zoom of[240,620]){
  await page.evaluate(z=>{renderer.zoom=z;renderer.request();},zoom);await settled();
  const state=await measure();checks.push(state);console.log('TERRAIN',state);
  if(!baseline){assert(state.detail>=64);assert(state.triangles<400000);assert(state.seen>300);}
 }
 await page.screenshot({path:resolve(out,'ground-close.png')});
 // A diagnostic overlay of actual uploaded edges shows what changed in mesh
 // density, independent of ground colour or the buildings covering it.
 await page.evaluate(()=>{
  const r=renderer,g=new Geometry(),v=r.meshes.terrain.vertices,width=2*r.halfW/r.width*.48;
  for(let k=0;k<v.length;k+=27){const p=[0,9,18].map(i=>[v[k+i],v[k+i+1]+.0001,v[k+i+2]]),center=p[0].map((a,j)=>(a+p[1][j]+p[2][j])/3),q=project4(r.mvp,center);
   if(Math.abs(q[0]/q[3])>1.1||Math.abs(q[1]/q[3])>1.1)continue;
   for(let i=0;i<3;i++)g.line(p[i],p[(i+1)%3],width,rgb('#375d58'));
  }
  r.upload('terrain-wire',g,false,1);r.visible=function(name){return name==='terrain'||name==='water'||name==='terrain-wire';};r.request();
 });await stable();await page.screenshot({path:resolve(out,'wire-close.png')});
 await page.evaluate(()=>{ContinuousMap.layer.drop('terrain-wire');renderer.visible=function(name){return name==='terrain'||name==='water';};renderer.request();});
 const beforePan=await page.evaluate('renderer.target.slice()');await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(1050,450,{steps:5});await page.mouse.up();await settled();
 const pan=await measure();checks.push({...pan,action:'pan'});assert.notDeepEqual(await page.evaluate('renderer.target.slice()'),beforePan);if(!baseline)assert(pan.maxEdge<64,'the new pan position retains fine terrain');console.log('PASS pan');
 await page.setViewportSize({width:430,height:900});await page.waitForFunction('renderer.width===430');await settled();const mobile=await measure();checks.push({...mobile,action:'resize'});if(!baseline)assert.notEqual(mobile.key,pan.key);
 if(!baseline){
  await page.evaluate(()=>{renderer.visible=window.__terrainVisible;renderer.request();});await page.setViewportSize({width:1440,height:900});await page.waitForFunction('renderer.width===1440');
  await page.evaluate(()=>ContinuousMap.home());await settled();
  const home=await page.evaluate(()=>({natural:ContinuousMap.layer.natural,zoom:renderer.zoom,overlays:Object.entries(window.__farOverlays).map(([name,v])=>({name,equal:v.length===renderer.meshes[name].vertices.length&&v.every((n,i)=>n===renderer.meshes[name].vertices[i])}))}));
  assert.equal(home.natural,false);assert.equal(home.zoom,1);assert(home.overlays.every(o=>o.equal),'returning to the atlas must restore its original road and river heights');checks.push({...home,action:'home'});console.log('PASS close-to-world surface transition',home);
 }
 assert.equal(errors.length,0,errors.join('\n'));await writeFile(resolve(out,'results.json'),JSON.stringify({checks,errors},null,2)+'\n');
 console.log('PASS terrain zoom, pan, resize; no page errors');
}catch(error){console.error(error);throw error;}finally{await server.kill();await browser.close();}
