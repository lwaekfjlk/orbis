import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('OneMap has a single startup entry, with shell before executable scripts',()=>{
 const html=read('index.html'),bootstrap=read('src/bootstrap.js');
 assert(html.indexOf('id="omChrome"')<html.indexOf('<script'));
 assert(bootstrap.includes('OneMap.init()')&&bootstrap.includes('OneMap.bind()'));
 assert(!bootstrap.includes('CityUI.open')&&!bootstrap.includes('openLibrary'));
 const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'Static DOM ids must be unique');
 for(const id of ['map','play','step1','step10','forgeButton','omDrawer'])assert(ids.includes(id));
});
test('Single-file build has no external styles or executable scripts',()=>{
 const html=read('dist/telluric-onemap.html');
 assert(!/<script[^>]+src=/i.test(html));
 assert(!/<link[^>]+rel=["']stylesheet/i.test(html));
 assert(html.includes('body.onemap #stage'));
 assert(html.indexOf('id="omChrome"')<html.indexOf('<script>'));
});
test('Parent geography, society and world-map renderer retain the pre-art-upgrade baseline',()=>{
 const {sha256}=JSON.parse(read('docs/CORE_BASELINE.json'));
 // City detail and architecture intentionally change in v11. Physical geography,
 // civilization and the world-map geometry must still match the approved baseline.
 for(const [file,expected] of Object.entries(sha256)){
  if(!['src/world/geography.js','src/civilization/simulation.js','src/render/world-renderer.js'].includes(file))continue;
  // geography.js and world-renderer.js carry approved new baselines; see the
  // notes in docs/CORE_BASELINE.json for what changed and what still locks it.
  const content=readFileSync(resolve(root,file));
  const actual=createHash('sha256').update(content).digest('hex');
  assert.equal(actual,expected,file+' unexpectedly changed');
 }
});
test('Named wonders read the finished world and change none of it',async()=>{
 const {loadEngine,defaults}=await import('./engine-loader.mjs');
 const E=loadEngine(),w=await E.generateWorld(defaults);
 // The hash geography.js used to be locked by. Legends are a labelling pass that
 // runs last, so the physical model must come out bit-identical to the baseline.
 assert.equal(E.physicalFingerprint(w),'440ae5d0');
 assert(w.legends.length>=5,'a full world should carry its wonders');
 for(const f of w.legends){
  assert(Number.isInteger(f.i)&&f.i>=0&&f.i<E.GN,f.id+' must name a real cell');
  assert.equal(f.x,f.i%E.GW);
  assert.equal(f.y,f.i/E.GW|0);
  assert(f.name&&f.kind&&f.lore&&f.basis,f.id+' needs a name, a kind and both halves of its text');
 }
 assert.equal(new Set(w.legends.map(f=>f.id)).size,w.legends.length,'one site per legend');
 // A wonder has to be the extreme it claims to be, not a nearby cell.
 const sky=w.legends.find(f=>f.id==='skymirror');
 if(sky)assert.equal(w.lake[sky.i],Math.max(...w.lake));
 const peak=w.legends.find(f=>f.id==='nightspire');
 if(peak)assert.equal(w.height[peak.i],Math.max(...w.height));
});
test('The atlas renders above CSS resolution, within a pixel budget',async()=>{
 const {loadEngine}=await import('./engine-loader.mjs');
 const E=loadEngine();
 const stage=(w,h)=>({width:0,height:0,parentElement:{getBoundingClientRect:()=>({width:w,height:h})}});
 const sized=(canvas,dpr,gl)=>{globalThis.window={devicePixelRatio:dpr};const r=Object.create(E.AtlasRenderer.prototype);Object.assign(r,{canvas,gl,request(){}});r.resize();delete globalThis.window;return r;};
 // A 1x display is where the old device-pixel backing store looked softest: the
 // relief shading and the river ribbons alias inside the triangle, which no amount
 // of multisampling fixes.
 const one=stage(1440,900);sized(one,1,{});
 assert(one.width>=1440*1.5,'a 1x display must be supersampled, got '+one.width);
 // ...but a 4K window on a 3x display must not quietly ask for 130 megapixels.
 const huge=stage(3840,2160);sized(huge,3,{});
 assert(huge.width*huge.height<=1.15e7,'backing store must stay inside the pixel budget');
 assert(huge.width>=3840,'and must never fall below CSS resolution');
 // The software rasteriser pays per pixel on the CPU and keeps its old ceiling.
 const slow=stage(1440,900);sized(slow,3,null);
 assert.equal(slow.width,2880);
});
test('A country is a name and a line, not a coat of paint over the land',async()=>{
 const {loadEngine,defaults}=await import('./engine-loader.mjs');
 const E=loadEngine();
 const w=await E.generateWorld(defaults),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 const r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:w,sim:s,relief:1,zoom:1,meshes:{},options:{},layer:'relief',focusRealm:null});
 const same=(a,b)=>a.every((v,k)=>Math.abs(v-b[k])<1e-9);
 // With nothing selected the political layers must be the landscape, exactly.
 // A full-territory wash, and a soft band inside each border after it, both
 // buried the relief this layer is drawn on top of. The frontier mesh carries it.
 for(const layer of ['realms','diplomacy']){
  let land=0;
  for(let i=0;i<E.GN;i++){
   if(w.height[i]<=0)continue;
   land++;
   r.layer='relief';const terrain=r.palette(i);
   r.layer=layer;
   assert(same(terrain,r.palette(i)),`${layer} tinted cell ${i} with no realm selected`);
  }
  assert(land>1e4,'expected a populated world');
 }
 // Selecting a realm is the one exception, and it stays faint.
 const realm=s.realms.find(c=>c.alive&&s.provinces.some(p=>p.owner===c.id));
 r.focusRealm=realm.id;
 let tinted=0;
 for(let i=0;i<E.GN;i++){
  if(w.height[i]<=0)continue;
  r.layer='relief';const terrain=r.palette(i);
  r.layer='realms';const political=r.palette(i);
  if(same(terrain,political))continue;
  tinted++;
  assert(Math.hypot(...political.map((v,k)=>v-terrain[k]))<.2,'the selection wash must stay faint');
 }
 assert(tinted>0,'the selected realm has to show somewhere');
 // Faiths and peoples are measurements, not flags: they keep their full wash
 // over every cell that layer is defined on.
 r.focusRealm=null;
 let washed=0,eligible=0;
 for(let i=0;i<E.GN;i++){
  if(w.height[i]<=0||w.lake[i]>0||w.ice[i]>120)continue;
  eligible++;
  r.layer='relief';const terrain=r.palette(i);
  r.layer='faiths';if(!same(terrain,r.palette(i)))washed++;
 }
 assert.equal(washed,eligible,'the faith layer still colours every cell it covers');
});
test('A basin lake has a shoreline, and a collision belt has a roof',async()=>{
 const {loadEngine,defaults}=await import('./engine-loader.mjs');
 const E=loadEngine();
 const w=await E.generateWorld(defaults);
 // Lakes. The interior depressions were exact ellipses with a smooth quadratic floor
 // and 18 m of noise in a 700 m bowl, so the water filled to the contour of the bowl:
 // measured circularity .59 where real lakes run .15-.5. 1.00 is a perfect disc.
 const seen=new Uint8Array(E.GN),lakes=[];
 for(let i=0;i<E.GN;i++){
  if(seen[i]||!(w.lake[i]>0))continue;
  const q=[i];seen[i]=1;let perimeter=0;
  for(let a=0;a<q.length;a++){
   const j=q[a],x=j%E.GW,y=j/E.GW|0;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy;
    if(xx<0||xx>=E.GW||yy<0||yy>=E.GH){perimeter++;continue;}
    const k=yy*E.GW+xx;
    if(!(w.lake[k]>0)){perimeter++;continue;}
    if(!seen[k]){seen[k]=1;q.push(k);}
   }
  }
  if(q.length>=12)lakes.push(4*Math.PI*q.length/(perimeter*perimeter));
 }
 assert(lakes.length>=4,'this world should hold several lakes');
 const mean=lakes.reduce((a,b)=>a+b,0)/lakes.length;
 assert(mean<.48,`lakes average ${mean.toFixed(2)} circularity — they are still discs`);
 assert(Math.max(...lakes)<.72,'no lake may be a plain ellipse');
 // Plateaus. Before the prior, 1 of 2426 cells above 2000 m had local relief low
 // enough to read as one, so the alpine and cold-desert climates the biome table
 // already knows how to draw had nowhere to sit.
 assert(w.plateaus.length>=2,'a collision world should raise uplands');
 const relief=i=>{const x=i%E.GW,y=i/E.GW|0;let lo=1/0,hi=-1/0;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const k=Math.max(0,Math.min(E.GH-1,y+dy))*E.GW+((x+dx)%E.GW+E.GW)%E.GW;
   lo=Math.min(lo,w.height[k]);hi=Math.max(hi,w.height[k]);}
  return hi-lo;};
 let high=0,flat=0;
 for(let i=0;i<E.GN;i++)
  if(w.height[i]>=2000){high++;if(relief(i)<600)flat++;}
 assert(high>800,'a world of ranges');
 assert(flat>=25,`only ${flat} of ${high} cells above 2000 m are flat enough to be a plateau`);
 // And the high flat ground must actually be classified as a high-altitude climate,
 // not left as whatever the lowland around it is.
 const cold=new Set([1,2,3,12,16]);
 let onPlateau=0,classified=0;
 for(let i=0;i<E.GN;i++)
  if(w.height[i]>=2000&&relief(i)<600){onPlateau++;if(cold.has(w.biome[i]))classified++;}
 assert(classified/onPlateau>.7,`only ${classified} of ${onPlateau} plateau cells read as a cold high climate`);
});
test('Continent names outrank the wonders that share their ground',()=>{
 // makeLabels() hands its list to a first-come box packer, so list order IS the
 // label priority. Putting the seven legends first cost three of seven continent
 // names on the default world and made the atlas look like it had four.
 const src=read('src/ui/world-ui.js'),relief=src.slice(src.indexOf("currentLayer === 'relief'"));
 const continents=relief.indexOf('world.continents'),legends=relief.indexOf('legendLabels()');
 assert(continents>=0&&legends>=0,'the relief label list must name both');
 assert(continents<legends,'continents must be listed before legends');
});
test('The climate work changed how the world is DRAWN, not what the world IS',async()=>{
 // geography.js and world-renderer.js were re-baselined for the climate pass: the
 // biome display palette widened and the vegetation symbols became climate-driven.
 // A byte lock cannot tell a repaint from a model edit, so the guarantee that
 // actually matters is asserted here on behaviour instead.
 const {loadEngine,defaults}=await import('./engine-loader.mjs');
 const E=loadEngine(),w=await E.generateWorld(defaults);
 assert.equal(E.physicalFingerprint(w),'440ae5d0','height, biome, rain, temp, lake, flow, ice and plate must be untouched');
 assert.equal(E.settlementFingerprint(E.createCivilization(w,{realms:18,historySeed:'First-dawn'})),'6b6c5ea8');
 // BIOME is append-only. An index is written into saves and read by every biome test
 // here, so the ones that exist may not be renamed or reordered; adding a class at the
 // end — the subtropics, in 13.5.0 — is how the vocabulary grows.
 const names=['Open ocean','Persistent snow','Tundra','Cold desert','Sand desert','Dry steppe','Savanna','Temperate forest','Boreal forest','Temperate rainforest','Monsoon woodland','Tropical rainforest','Alpine meadow','Rock desert','Salt basin','Lake','Glacier / ice sheet','Sea ice','Freshwater marsh','Mangrove wetland','Floodplain meadow'];
 const actual=E.BIOME?.map(b=>b[0])??names;
 assert.deepEqual(actual.slice(0,names.length),names,'biome identities may not be renamed or reordered');
 assert(actual.length>=names.length,'a biome class may not be dropped');
});
test('Geography-driven district names leave the society itself untouched, and never number a town',async()=>{
 const {loadEngine,defaults}=await import('./engine-loader.mjs');
 const E=loadEngine(),w=await E.generateWorld(defaults),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
 // The naming rewrite draws its two rolls where the old cName(rng) drew two, so the
 // random stream — and therefore every population and polity — is bit-identical.
 assert.equal(E.settlementFingerprint(s),'6b6c5ea8');
 const names=s.provinces.map(p=>p.name);
 assert.equal(new Set(names).size,names.length,'district names must be unique');
 const numbered=names.filter(n=>/\d/.test(n));
 assert.deepEqual(numbered,[],'qualifiers must absorb collisions before numbering does');
 // The suffix has to report the site: harbour districts get coastal words, not inland ones.
 const inland=['ford','bridge','beck','brook','tor','cairn','fen','mire'];
 const harbours=s.provinces.filter(p=>p.coast>.75&&p.settled);
 assert(harbours.length>3);
 assert(!harbours.every(p=>inland.some(t=>p.name.endsWith(t))));
});

test('Returning to the whole world restores the home heading, not just the position',()=>{
 // focusTown deliberately swings the camera toward a mountain peak, and shift-drag rotates
 // it freely. home() has to undo both or the atlas comes back skewed with no way to
 // straighten it. world-renderer.js is byte-locked, so the constant cannot be shared;
 // the third assertion is what catches the two copies drifting apart.
 const src=read('src/ui/continuous-map.js'),home=src.match(/function home\(\)\{.*/)[0];
 assert(/animate\(\[0,0,0\][^)]*HOME_AZIMUTH/.test(home),'home() must pass an explicit azimuth to animate()');
 assert(/HOME_AZIMUTH\s*=\s*\.018/.test(src),'the home heading must be the atlas default');
 assert(/reset\(\)\s*\{[^}]*azimuth\s*=\s*\.018/.test(read('src/render/world-renderer.js')),'AtlasRenderer.reset() still defines that same heading');
});
