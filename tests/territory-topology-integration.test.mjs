import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,PoliticalLand,RealmProfile,AtlasRenderer,AtlasSpace,physicalFingerprint,settlementFingerprint,politicalFingerprint,GW,GH,GN};')();
const specs=[{seed:'Aereth-47'},{seed:'Tanguine'},{seed:'Ninefold-9'},{seed:'Meridian-21',form:'rift'}],rows=[];
const fingerprints=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
const dry=(w,i)=>w.height[i]>0&&w.lake[i]<=0;
const direct=(w,s,i)=>{const p=s.provinces[w.provinceId[i]];return dry(w,i)&&p?.owner>=0&&s.realms[p.owner]?.alive!==false?p.owner:-1;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-10,`${a} differs from ${b}`);
function neighbours(i){const x=i%E.GW,y=Math.floor(i/E.GW),result=[];if(x>0)result.push(i-1);if(x+1<E.GW)result.push(i+1);if(y>0)result.push(i-E.GW);if(y+1<E.GH)result.push(i+E.GW);return result;}
const edge=i=>i%E.GW===0||i%E.GW===E.GW-1||i<E.GW||i>=E.GN-E.GW;

// Independent four-neighbour topology oracle. A country's complement can have
// enclosed components only when a different living country occupies the island.
function enclosed(owners,id){
 const seen=new Uint8Array(E.GN),queue=new Int32Array(E.GN),result=[];
 for(let start=0;start<E.GN;start++){
  if(seen[start]||owners[start]===id)continue;
  let head=0,tail=1,open=false;const foreign=new Set();queue[0]=start;seen[start]=1;
  while(head<tail){const i=queue[head++];if(edge(i))open=true;if(owners[i]>=0)foreign.add(owners[i]);
   for(const j of neighbours(i)){if(seen[j]||owners[j]===id)continue;seen[j]=1;queue[tail++]=j;}
  }
  if(!open)result.push({cells:Array.from(queue.subarray(0,tail)),foreign:[...foreign]});
 }
 return result;
}
function openOcean(w){
 const sea=new Uint8Array(E.GN),queue=new Int32Array(E.GN);let head=0,tail=0;
 for(let i=0;i<E.GN;i++)if(edge(i)&&w.height[i]<=0){sea[i]=1;queue[tail++]=i;}
 while(head<tail)for(const j of neighbours(queue[head++])){if(sea[j]||w.height[j]>0)continue;sea[j]=1;queue[tail++]=j;}
 return sea;
}
function renderer(w,s){const r=Object.create(E.AtlasRenderer.prototype);Object.assign(r,{world:w,sim:s,layer:'realms',relief:1,focusRealm:null,hoveredRealm:null,options:{},meshes:{},request(){},buildTerrain(){},upload(name,g,shadow,unlit,alpha){this.meshes[name]={data:g.data,shadow,unlit,alpha};}});r.prepareTerritory();return r;}
const key=(x,y)=>x.toFixed(5)+','+y.toFixed(5);
function centers(data){const result=new Map();for(let at=0;at<data.length;at+=54){let x=0,z=0;for(let j=0;j<6;j++){x+=data[at+j*9]/6;z+=data[at+j*9+2]/6;}const q=E.AtlasSpace.grid(x,z),id=key(q[0],q[1]);result.set(id,(result.get(id)||0)+1);}return result;}

test.before(async()=>{for(const spec of specs){const w=await E.generateWorld({...defaults,...spec}),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});rows.push({spec,w,s,before:fingerprints(w,s),society:JSON.stringify(s),grid:w.provinceId.slice(),territory:E.PoliticalLand.territory(w,s),sea:openOcean(w)});}});

test('four real worlds retain open wildness and ocean while closing every country hole that contains no foreign enclave',t=>{
 for(const {spec,w,s,territory,sea}of rows){
  const owners=territory.owners;let wildDry=0,wildWater=0,derivedDry=0,negativeWater=0,claimed=0,landArea=0,waterArea=0;
  assert.equal(territory.inlandWater.length,E.GN);
  for(let i=0;i<E.GN;i++){
   assert.equal(Boolean(territory.inlandWater[i]),w.height[i]>0?w.lake[i]>0:!sea[i],spec.seed+' classifies inland water by its actual connection to the open ocean');
   if(sea[i]){assert.equal(owners[i],-1,'open ocean cannot receive a country');continue;}
   const existing=direct(w,s,i);
   if(existing>=0)assert.equal(owners[i],existing,'derived borders cannot remove or transfer an administered province');
   else if(dry(w,i)&&(edge(i)||neighbours(i).some(j=>sea[j])))assert.equal(owners[i],-1,'unclaimed dry land open to the map edge or ocean must remain wildness');
   if(owners[i]<0){if(dry(w,i))wildDry++;else wildWater++;continue;}
   assert.ok(s.realms[owners[i]]&&s.realms[owners[i]].alive!==false,'only living countries can own territory');claimed++;
   if(dry(w,i)){landArea+=w.area[i];if(existing<0)derivedDry++;}
   else{waterArea+=w.area[i];if(w.height[i]<=0)negativeWater++;}
  }
  for(const realm of s.realms.filter(r=>r.alive!==false)){
   const holes=enclosed(owners,realm.id);
   assert.deepEqual(holes.filter(h=>h.foreign.length===0).map(h=>h.cells[0]),[],spec.seed+' leaves an empty enclosed ring inside '+realm.name);
  }
  assert.ok(wildDry>1000,spec.seed+' must preserve substantial open wildness instead of distributing the whole world');
  assert.ok(negativeWater>0,'real below-sea-level inland basins must be included in the topology');
  const areas=Object.values(territory.areas);close(areas.reduce((n,a)=>n+a.land,0),landArea);close(areas.reduce((n,a)=>n+a.water,0),waterArea);assert.equal(areas.reduce((n,a)=>n+a.cells,0),claimed);
  const labels=E.PoliticalLand.labels(w,s);assert.ok(labels.length>0);for(const label of labels){assert.equal(label.name,'wildness');assert.equal(owners[label.i],-1);assert.ok(dry(w,label.i));}
  assert.strictEqual(E.PoliticalLand.territory(w,s),territory,'unchanged inputs reuse the same derived snapshot');
  t.diagnostic(JSON.stringify({seed:spec.seed,form:spec.form||'global',wildDry,wildWater,derivedDry,negativeWater,claimed,landArea,waterArea,wildnessLabels:labels.length}));
 }
});

test('country profiles count only actual claimed dry territory and keep population in its original administered provinces',()=>{
 for(const {w,s,territory}of rows){let shares=0,total=0,worldArea=0;for(let i=0;i<E.GN;i++)if(dry(w,i))worldArea+=w.area[i];
  for(const realm of s.realms.filter(r=>r.alive!==false)){
   const profile=E.RealmProfile.create(w,s,realm.id),held=s.provinces.filter(p=>p.owner===realm.id),cells=[];
   for(let i=0;i<E.GN;i++)if(territory.owners[i]===realm.id&&dry(w,i))cells.push(i);
   close(profile.facts.area,territory.areas[realm.id].land);close(profile.facts.population,held.reduce((n,p)=>n+p.pop,0));shares+=profile.facts.areaShare;total+=profile.facts.area;
   if(cells.length){const min=Math.min(...cells.map(i=>w.temp[i])),max=Math.max(...cells.map(i=>w.temp[i])),text=profile.sections.find(section=>section.title==='Land and climate').text,n=v=>v.toLocaleString('en-US',{maximumFractionDigits:1});assert.ok(text.includes('range from '+n(min)+' to '+n(max)+' °C'),'country climate must describe its actual claimed cells');}
  }
  close(total,Object.values(territory.areas).reduce((n,a)=>n+a.land,0));close(shares,total/worldArea);assert.ok(shares>0&&shares<1,'wildness occupies real area outside all country summaries');
 }
});

test('filled dry holes identify their surrounding country while open wildness never acquires a hover wash',()=>{
 const {w,s,territory}=rows[0],derived=[],wild=[];for(let i=0;i<E.GN;i++)if(dry(w,i)&&direct(w,s,i)<0)(territory.owners[i]<0?wild:derived).push(i);
 assert.ok(derived.length>0&&wild.length>1000,'the real default map must exercise both enclosed dry holes and open wildness');
 const r=renderer(w,s);
 for(const i of [derived[0],derived.reduce((a,b)=>w.height[a]>w.height[b]?a:b)]){
  const id=territory.owners[i],status=E.PoliticalLand.status(w,s,i);assert.equal(status.kind,'realm');assert.equal(status.realm.id,id);assert.equal(status.derived,true);
  r.focusRealm=null;r.hoveredRealm=null;const base=r.palette(i);r.setHoveredRealm(id);assert.notDeepEqual(r.palette(i),base);r.setHoveredRealm(null);assert.deepEqual(r.palette(i),base);
 }
 const samples=[wild[0],wild.reduce((a,b)=>w.ice[a]>w.ice[b]?a:b),wild.reduce((a,b)=>w.height[a]>w.height[b]?a:b)];
 for(const i of new Set(samples)){
  const status=E.PoliticalLand.status(w,s,i);assert.equal(status.kind,'wildness');assert.equal(status.label,'wildness');assert.equal(status.realm,null);assert.match(E.PoliticalLand.description(w,s,i),/wildness/);
  for(const layer of ['realms','diplomacy','faiths','peoples','wealth','magic']){r.layer=layer;r.focusRealm=null;r.hoveredRealm=null;const base=r.palette(i);for(const realm of s.realms.filter(r=>r.alive!==false)){r.hoveredRealm=realm.id;assert.deepEqual(r.palette(i),base,'no country may wash open wildness');}r.setHoveredRealm(null);assert.deepEqual(r.palette(i),base);}
 }
});

test('production borders retain wildness margins and lake crossings without interior country seams',()=>{
 const {w,s,territory,sea}=rows[0],r=renderer(w,s);r.buildCivilization();const lines=centers(r.meshes.frontiers.data),owners=territory.owners;let wildEdges=0,waterEdges=0;
 for(let y=0;y<E.GH;y++)for(let x=0;x<E.GW;x++){const i=y*E.GW+x;if(sea[i])continue;for(const [dx,dy]of[[1,0],[0,1]]){
  if(x+dx>=E.GW||y+dy>=E.GH)continue;const j=i+dx+dy*E.GW;if(sea[j])continue;
  const position=key(x+dx*.5,y+dy*.5),a=owners[i],b=owners[j];
  if(a===b||a<0&&b<0){assert.equal(lines.has(position),false,'same-country land and inland water must not have a false seam');continue;}
  const wild=a<0||b<0;assert.equal(lines.get(position),wild?1:2,wild?'open wildness needs its own border margin':'a national frontier must continue across inland water');if(wild)wildEdges++;if(territory.inlandWater[i]||territory.inlandWater[j])waterEdges++;
 }}
 assert.ok(wildEdges>100&&waterEdges>10,'the production mesh must cover both unclaimed margins and actual water boundaries');
 for(const realm of s.realms.filter(c=>c.alive!==false)){
  r.hoveredRealm=realm.id;r.buildRealmHover();const outline=centers(r.meshes.realmHover.data);
  for(let i=0;i<E.GN;i++)if(owners[i]===realm.id){const x=i%E.GW,y=Math.floor(i/E.GW);for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*E.GW+xx,same=xx>=0&&xx<E.GW&&yy>=0&&yy<E.GH&&owners[j]===realm.id;assert.equal(outline.get(key(x+dx*.5,y+dy*.5))||0,same?0:2,'hover must follow the actual outer or foreign boundary, without domestic water rings');}}
 }
});

test('a real interior province transferred to another living country remains a visible enclave',()=>{
 const {w,s,territory}=rows[0],p=s.provinces.find(p=>p.owner>=0&&p.cells.length>3&&p.cells.every(i=>dry(w,i)&&!edge(i)&&neighbours(i).every(j=>territory.owners[j]===p.owner)));
 assert.ok(p,'default geography must provide a complete interior province for the enclave regression');
 const changed=structuredClone(s),host=p.owner,foreign=s.realms.find(r=>r.alive!==false&&r.id!==host).id;changed.provinces[p.id].owner=foreign;
 const before=JSON.stringify(changed),owners=E.PoliticalLand.territory(w,changed).owners,holes=enclosed(owners,host);
 for(const i of p.cells)assert.equal(owners[i],foreign,'topology repair cannot annex a real foreign province');
 assert.ok(holes.some(h=>h.foreign.includes(foreign)&&h.cells.some(i=>w.provinceId[i]===p.id)),'the independent topology oracle must see the genuine enclave');
 const r=renderer(w,changed);r.hoveredRealm=host;r.buildRealmHover();const outline=centers(r.meshes.realmHover.data);let border=0;
 for(const i of p.cells)for(const j of neighbours(i))if(owners[j]===host){assert.equal(outline.get(key((i%E.GW+j%E.GW)/2,(Math.floor(i/E.GW)+Math.floor(j/E.GW))/2)),2,'the enclosing country must retain its visible foreign-enclave border');border++;}
 assert.ok(border>4);assert.equal(JSON.stringify(changed),before,'rendering cannot change the transferred province or its residents');
});

test('territory, labels, profiles and render meshes leave geographic rasters, city founding and simulation history untouched',()=>{
 for(const {w,s,before,society,grid}of rows){assert.deepEqual(fingerprints(w,s),before);assert.equal(JSON.stringify(s),society);assert.deepEqual(w.provinceId,grid);}
 assert.deepEqual(rows[0].before,['440ae5d0','e6aee7b8','d8ba763d'],'map lettering and topology do not regenerate towns or alter their founding');
});
