import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
import {defaults} from './engine-loader.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,PoliticalLand,AtlasRenderer,AtlasSpace,physicalPalette,physicalFingerprint,settlementFingerprint,politicalFingerprint,colorMix,rgb,GW,GH,GN};')();
let world,sim,baseline,grid;
function renderer(s=sim){const r=Object.create(E.AtlasRenderer.prototype);Object.assign(r,{world,sim:s,layer:'realms',relief:1,focusRealm:null,hoveredRealm:null,meshes:{},options:{},request(){},buildTerrain(){},upload(name,g,shadow,unlit,alpha){this.meshes[name]={data:g.data,shadow,unlit,alpha};}});r.prepareTerritory();return r;}
function component(first){const cells=[first],seen=new Set(cells);for(let k=0;k<cells.length;k++){const i=cells[k];for(const j of neighbours(i)){if(world.lake[j]<=0||seen.has(j))continue;seen.add(j);cells.push(j);}}return cells;}
function neighbours(i){const x=i%E.GW,y=Math.floor(i/E.GW);return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>[x+dx,y+dy]).filter(([x,y])=>x>=0&&x<E.GW&&y>=0&&y<E.GH).map(([x,y])=>y*E.GW+x);}
function shores(cells){return [...new Set(cells.flatMap(neighbours).filter(i=>world.height[i]>0&&world.lake[i]<=0))];}
const fingerprints=()=>[E.physicalFingerprint(world),E.settlementFingerprint(sim),E.politicalFingerprint(sim)];
const key=(x,y)=>x.toFixed(5)+','+y.toFixed(5);
function lineCenters(data){const result=new Map();for(let at=0;at<data.length;at+=54){let x=0,z=0;for(let j=0;j<6;j++){x+=data[at+j*9]/6;z+=data[at+j*9+2]/6;}const q=E.AtlasSpace.grid(x,z),id=key(q[0],q[1]);result.set(id,(result.get(id)||0)+1);}return result;}

test.before(async()=>{world=await E.generateWorld(defaults);sim=E.createCivilization(world,{realms:18,historySeed:'First-dawn'});baseline=fingerprints();grid=world.provinceId.slice();});

test('the real default inland lakes receive shore territory while retaining their original water and empty province cells',()=>{
 const territory=E.PoliticalLand.territory(world,sim);assert.strictEqual(E.PoliticalLand.territory(world,sim),territory);
 const enclosed=component(10285),salt=component(13254),fresh=component(30531);
 assert.equal(enclosed.length,38);assert.equal(salt.length,85);assert.equal(fresh.length,13);
 assert.ok(enclosed.every(i=>territory.owners[i]===13));
 for(const [cells,owners]of [[salt,[8,13]],[fresh,[1,7]]])assert.deepEqual([...new Set(cells.map(i=>territory.owners[i]))].sort((a,b)=>a-b),owners);
 for(const cells of [enclosed,salt,fresh])for(const i of cells){assert.equal(world.provinceId[i],-1);assert.ok(world.lake[i]>world.height[i]);const status=E.PoliticalLand.status(world,sim,i);assert.equal(status.kind,'realm');assert.equal(status.province,null);assert.equal(status.water,true);assert.equal(status.realm.id,territory.owners[i]);assert.match(E.PoliticalLand.description(world,sim,i),/^Territory of /);}
 for(let i=0;i<E.GN;i++)if(world.height[i]<=0)assert.equal(territory.owners[i],-1,'ocean has no political claim');
});

test('production frontier geometry crosses both real shared lakes and omits same-country internal lake shores',()=>{
 const r=renderer();r.buildCivilization();const centers=lineCenters(r.meshes.frontiers.data),owners=r.territoryOwners;
 for(const first of [13254,30531]){const cells=component(first),seen=new Set();let crossed=0;
  for(const i of cells)for(const j of neighbours(i)){const id=[i,j].sort((a,b)=>a-b).join('/');if(seen.has(id))continue;seen.add(id);if(owners[i]<0||owners[j]<0||owners[i]===owners[j])continue;
   const x=(i%E.GW+j%E.GW)/2,y=(Math.floor(i/E.GW)+Math.floor(j/E.GW))/2;assert.equal(centers.get(key(x,y)),2,'a cased two-country frontier must cross the water boundary');crossed++;
  }assert.ok(crossed>=2,'even the narrow two-cell lake crossing needs every water border edge');
 }
 const enclosed=component(10285);for(const i of enclosed)for(const j of neighbours(i)){if(owners[i]!==owners[j])continue;assert.equal(centers.has(key((i%E.GW+j%E.GW)/2,(Math.floor(i/E.GW)+Math.floor(j/E.GW))/2)),false,'domestic lake cells and shores must have no political seam');}
 r.hoveredRealm=13;r.buildRealmHover();const hover=lineCenters(r.meshes.realmHover.data);
 for(const i of enclosed)for(const j of neighbours(i)){if(world.lake[j]>0)continue;assert.equal(hover.has(key((i%E.GW+j%E.GW)/2,(Math.floor(i/E.GW)+Math.floor(j/E.GW))/2)),false,'highlight must not punch a shoreline hole into a domestic lake');}
});

test('lake selection and hover use the real water palette in every political layer and restore it exactly on leaving',()=>{
 const r=renderer(),i=10285,owner=13,other=8,physical=E.physicalPalette.call(r,i),realm=sim.realms[owner];
 for(const layer of ['realms','diplomacy','faiths','peoples','wealth','magic']){
  r.layer=layer;r.focusRealm=null;r.hoveredRealm=null;r.prepareTerritory();assert.deepEqual(r.palette(i),physical,layer+' must not invent population, faith or wealth paint on lake water');
  r.focusRealm=owner;const base=r.palette(i),selected=['realms','diplomacy'].includes(layer)?E.colorMix(physical,E.rgb(realm.color),.14):physical;assert.deepEqual(base,selected);
  r.setHoveredRealm(owner);assert.deepEqual(r.palette(i),E.colorMix(physical,E.rgb(realm.color),.34));
  r.setHoveredRealm(other);assert.deepEqual(r.palette(i),physical,'another country hover leaves this water untouched');
  r.setHoveredRealm(null);assert.deepEqual(r.palette(i),base,layer+' must restore the exact pre-hover color');
 }
});

test('in-place shore transfer and realm death refresh rendered ownership without reallocating water to population provinces',()=>{
 const changed=structuredClone(sim),r=renderer(changed),cells=component(10285),near=shores(cells),provinceIDs=[...new Set(near.map(i=>world.provinceId[i]))];
 assert.ok(provinceIDs.every(id=>id>=0));const before=E.PoliticalLand.territory(world,changed);
 for(const id of provinceIDs)changed.provinces[id].owner=8;
 r.prepareTerritory();assert.notEqual(E.PoliticalLand.territory(world,changed).key,before.key);assert.ok(cells.every(i=>r.territoryOwners[i]===8));
 const i=cells[0];assert.equal(E.PoliticalLand.status(world,changed,i).realm.id,8);assert.equal(E.PoliticalLand.status(world,changed,i).province,null);
 r.focusRealm=8;assert.notDeepEqual(r.palette(i),E.physicalPalette.call(r,i));
 changed.realms[8].alive=false;r.buildCivilization();assert.ok(cells.every(i=>r.territoryOwners[i]===-1));assert.equal(E.PoliticalLand.status(world,changed,i).kind,'water');assert.deepEqual(r.palette(i),E.physicalPalette.call(r,i));
 assert.deepEqual(world.provinceId,grid);
});

test('all territory, frontier, palette and status operations leave source geography and the real simulation unchanged',()=>{
 assert.deepEqual(fingerprints(),baseline);assert.deepEqual(world.provinceId,grid);
});
