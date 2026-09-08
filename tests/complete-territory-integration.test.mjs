import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,PoliticalLand,RealmProfile,AtlasRenderer,AtlasSpace,physicalPalette,physicalFingerprint,settlementFingerprint,politicalFingerprint,colorMix,rgb,BIOME,GW,GH,GN};')();
const specs=[{seed:'Aereth-47'},{seed:'Tanguine'},{seed:'Ninefold-9'},{seed:'Meridian-21',form:'rift'}],rows=[];
const fingerprints=(w,s)=>[E.physicalFingerprint(w),E.settlementFingerprint(s),E.politicalFingerprint(s)];
const direct=(w,s,i)=>{const p=s.provinces[w.provinceId[i]];return p?.owner>=0&&s.realms[p.owner]?.alive!==false?p.owner:-1;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-10,`${a} differs from ${b}`);
function renderer(w,s){const r=Object.create(E.AtlasRenderer.prototype);Object.assign(r,{world:w,sim:s,layer:'realms',relief:1,focusRealm:null,hoveredRealm:null,options:{},meshes:{},request(){},buildTerrain(){},upload(name,g,shadow,unlit,alpha){this.meshes[name]={data:g.data,shadow,unlit,alpha};}});r.prepareTerritory();return r;}
const key=(x,y)=>x.toFixed(5)+','+y.toFixed(5);
function centers(data){const result=new Map();for(let at=0;at<data.length;at+=54){let x=0,z=0;for(let j=0;j<6;j++){x+=data[at+j*9]/6;z+=data[at+j*9+2]/6;}const q=E.AtlasSpace.grid(x,z),id=key(q[0],q[1]);result.set(id,(result.get(id)||0)+1);}return result;}

test.before(async()=>{for(const spec of specs){const w=await E.generateWorld({...defaults,...spec}),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});rows.push({spec,w,s,before:fingerprints(w,s),grid:w.provinceId.slice(),territory:E.PoliticalLand.territory(w,s)});}});

test('all real land and inland water across four generated worlds belongs to living countries without changing inhabited provinces',t=>{
 for(const {spec,w,s,territory}of rows){let land=0,water=0,previouslyUnowned=0,landArea=0,waterArea=0;const owners=territory.owners;
  for(let i=0;i<E.GN;i++){
   if(w.height[i]<=0){assert.equal(owners[i],-1,'ocean remains outside national territory');continue;}
   assert.ok(owners[i]>=0&&s.realms[owners[i]]&&s.realms[owners[i]].alive!==false,spec.seed+' leaves a non-ocean gap at '+i);
   if(w.lake[i]>0){water++;waterArea+=w.area[i];continue;}
   land++;landArea+=w.area[i];const existing=direct(w,s,i);
   if(existing>=0)assert.equal(owners[i],existing,'the read-only completion cannot take an existing province from its country');else previouslyUnowned++;
  }
  const areas=Object.values(territory.areas);close(areas.reduce((n,a)=>n+a.land,0),landArea);close(areas.reduce((n,a)=>n+a.water,0),waterArea);assert.equal(areas.reduce((n,a)=>n+a.cells,0),land+water);
  assert.deepEqual(E.PoliticalLand.labels(w,s),[],'complete country coverage needs no wilderness annotation');
  assert.strictEqual(E.PoliticalLand.territory(w,s),territory,'unchanged generation should reuse its derived territory snapshot');
  t.diagnostic(JSON.stringify({seed:spec.seed,form:spec.form||'global',landCells:land,lakeCells:water,previouslyUnownedDryCells:previouslyUnowned,claimedCells:land+water,landArea,waterArea,highCitadels:s.provinces.filter(p=>p.highCitadel).map(p=>p.highCitadel.kind)}));
 }
});

test('country profiles account for the whole dry-world area and the temperature extremes of remote ice and desert',t=>{
 let extendedClimate=0,remoteDesert=0,remoteIce=0;
 for(const {spec,w,s,territory}of rows){let shares=0,total=0;
  for(const realm of s.realms.filter(r=>r.alive!==false)){
   const profile=E.RealmProfile.create(w,s,realm.id),held=s.provinces.filter(p=>p.owner===realm.id),oldCells=held.flatMap(p=>p.cells).filter(i=>w.height[i]>0&&w.lake[i]<=0),cells=[];
   for(let i=0;i<E.GN;i++)if(territory.owners[i]===realm.id&&w.height[i]>0&&w.lake[i]<=0)cells.push(i);
   close(profile.facts.area,territory.areas[realm.id].land);close(profile.facts.population,held.reduce((n,p)=>n+p.pop,0));shares+=profile.facts.areaShare;total+=profile.facts.area;
   if(!cells.length||!oldCells.length)continue;
   const min=Math.min(...cells.map(i=>w.temp[i])),max=Math.max(...cells.map(i=>w.temp[i])),oldMin=Math.min(...oldCells.map(i=>w.temp[i])),oldMax=Math.max(...oldCells.map(i=>w.temp[i]));
   for(const i of cells)if(direct(w,s,i)<0){if(w.biome[i]===4)remoteDesert++;if(w.ice[i]>25)remoteIce++;}
   if(min<oldMin-.5||max>oldMax+.5){const text=profile.sections.find(section=>section.title==='Land and climate').text,n=v=>v.toLocaleString('en-US',{maximumFractionDigits:1});assert.ok(text.includes('range from '+n(min)+' to '+n(max)+' °C'),spec.seed+' profile drops its remote temperature extremes');extendedClimate++;}
  }
  close(shares,1);close(total,Object.values(territory.areas).reduce((n,a)=>n+a.land,0));
 }
 assert.ok(extendedClimate>3,'several actual countries need the newly included remote climate');assert.ok(remoteDesert>0&&remoteIce>0,'the full territory includes real previously omitted desert and ice');
 t.diagnostic(`${extendedClimate} country climate ranges extended; ${remoteDesert} remote desert cells and ${remoteIce} remote ice cells included.`);
});

test('remote dry land reports its new country and receives the same temporary map highlight as inhabited territory',()=>{
 const {w,s,territory}=rows[0],derived=[];for(let i=0;i<E.GN;i++)if(w.height[i]>0&&w.lake[i]<=0&&direct(w,s,i)<0)derived.push(i);
 assert.ok(derived.length>500,'the real default world should exercise substantial previously omitted territory');
 const r=renderer(w,s),samples=[derived[0],derived.reduce((a,b)=>w.ice[a]>w.ice[b]?a:b),derived.reduce((a,b)=>w.height[a]>w.height[b]?a:b)];
 for(const i of new Set(samples)){const id=territory.owners[i],status=E.PoliticalLand.status(w,s,i);assert.equal(status.kind,'realm');assert.equal(status.realm.id,id);assert.equal(status.derived,true);assert.match(E.PoliticalLand.description(w,s,i),/^Territory of /);
  r.layer='realms';r.focusRealm=null;r.hoveredRealm=null;const base=r.palette(i);r.setHoveredRealm(id);assert.notDeepEqual(r.palette(i),base,'an unmapped rock/ice cell must participate in country hover');r.setHoveredRealm(null);assert.deepEqual(r.palette(i),base,'leaving restores exact original remote-land color');
 }
});

test('rendered borders and country hover outlines include the previously missing remote districts',()=>{
 const {w,s,territory}=rows[0],r=renderer(w,s);r.buildCivilization();const lines=centers(r.meshes.frontiers.data),owners=territory.owners;let remoteBorderEdges=0;
 for(let y=0;y<E.GH;y++)for(let x=0;x<E.GW;x++){const i=y*E.GW+x;if(w.height[i]<=0)continue;for(const [dx,dy]of[[1,0],[0,1]]){if(x+dx>=E.GW||y+dy>=E.GH)continue;const j=i+dx+dy*E.GW;if(w.height[j]<=0||owners[i]===owners[j])continue;assert.equal(lines.get(key(x+dx*.5,y+dy*.5)),2,'a real national boundary must have its full cased line');if(direct(w,s,i)<0||direct(w,s,j)<0)remoteBorderEdges++;}}
 assert.ok(remoteBorderEdges>20,'actual border geometry must include remote rock, ice, islands or inland water');
 const sample=Array.from({length:E.GN},(_,i)=>i).find(i=>w.height[i]>0&&w.lake[i]<=0&&direct(w,s,i)<0&&[i-1,i+1,i-E.GW,i+E.GW].some(j=>j>=0&&j<E.GN&&owners[j]!==owners[i]));assert.ok(sample!==undefined);
 const id=owners[sample];r.hoveredRealm=id;r.buildRealmHover();const outline=centers(r.meshes.realmHover.data);let remoteEdges=0;
 for(let y=0;y<E.GH;y++)for(let x=0;x<E.GW;x++){const i=y*E.GW+x;if(owners[i]!==id)continue;for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*E.GW+xx;if(xx>=0&&xx<E.GW&&yy>=0&&yy<E.GH&&owners[j]===id)continue;assert.equal(outline.get(key(x+dx*.5,y+dy*.5)),2,'hover must trace the country’s complete coast and foreign boundary');if(direct(w,s,i)<0)remoteEdges++;}}
 assert.ok(remoteEdges>0,'hover includes the newly assigned remote region');
});

test('complete-territory rendering leaves geographic rasters, source province membership, populations and political history untouched',()=>{
 for(const {w,s,before,grid}of rows){assert.deepEqual(fingerprints(w,s),before);assert.deepEqual(w.provinceId,grid);}
});
