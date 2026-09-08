import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngine, root} from './engine-loader.mjs';

const E = loadEngine();
const P = Function('RealmNames', 'GW', readFileSync(root + '/src/civilization/political-land.js', 'utf8') + ';return PoliticalLand;')(E.RealmNames, E.GW);
function fixture(width = 16, height = 10) {
    const n = width * height, world = {height: new Float32Array(n).fill(100), lake: new Float32Array(n).fill(-1), area: new Float32Array(n).fill(1), provinceId: new Int32Array(n).fill(-1)};
    const sim = {realms: [{id: 0, name: 'Asgard', title: 'Kingdom of Asgard', alive: true}], provinces: [{owner: 0, pop: 20000}, {owner: -1, pop: 14000, settled: true}]};
    return {world, sim, width};
}
test('Land status distinguishes a realm, independent residents, wilderness and water using live ownership', () => {
    const {world: w, sim: s} = fixture();
    w.provinceId[0] = 0; w.provinceId[1] = 1; w.height[3] = -10; w.lake[4] = 150;
    const before = JSON.stringify(s);
    assert.equal(P.status(w,s,0).label, 'Kingdom of Asgard');
    assert.equal(P.status(w,s,1).kind, 'communities');
    s.provinces[1].pop = 200;
    assert.equal(P.status(w,s,1).kind, 'communities', 'a small community is not empty wilderness');
    s.provinces[1].pop = 14000;
    assert.equal(P.status(w,s,2).kind, 'wilderness');
    for (const i of [3,4,-1,w.height.length]) assert.equal(P.status(w,s,i).kind, 'water');
    assert.match(P.description(w,s,1), /communities live here/);
    assert.match(P.description(w,s,2), /No realm claims/);
    assert.equal(JSON.stringify(s), before);
    s.provinces[1].owner = 0;
    assert.equal(P.status(w,s,1).realm.id, 0, 'a conquest immediately changes the description');
    s.realms[0].alive = false;
    assert.equal(P.status(w,s,0).realm, null, 'a dead realm cannot keep a political claim');
});
test('Unclaimed regions never bridge water, wrap rows, or place their label on foreign land', () => {
    const {world: w, sim: s, width} = fixture();
    // A strip of owned land separates two connected free regions. Their centroids
    // need not themselves lie on the free cells once the regions curve around it.
    for (let y=0;y<10;y++) for (let x=6;x<10;x++) w.provinceId[y*width+x]=0;
    w.provinceId[0]=1;
    const labels=P.labels(w,s,width);
    assert.equal(labels.length,2);
    assert(labels.some(l=>l.name==='Independent communities'));
    assert(labels.some(l=>l.name==='Unclaimed wilds'));
    for(const l of labels){assert.equal(P.status(w,s,l.i).realm,null);assert(l.wilderness);assert.equal(l.kind,'NO REALM');}
    const unchanged = P.labels(w,s,width);
    assert.deepEqual(labels,unchanged);
    for(let i=0;i<w.height.length;i++)if(w.provinceId[i]!==0)w.height[i]=-5;
    assert.deepEqual(P.labels(w,s,width),[],'water never receives a wilderness label');
});
function lakeFixture() {
    const f = fixture(9,9), {world:w,sim:s,width} = f;
    w.provinceId.fill(0);
    s.realms.push({id:1,name:'Duat',title:'Kingdom of Duat',alive:true});
    s.provinces[1].owner=1;
    const cell=(x,y)=>y*width+x, lake=[];
    for(let y=2;y<=6;y++)for(let x=2;x<=6;x++){
        const i=cell(x,y);w.lake[i]=150;w.provinceId[i]=-1;lake.push(i);
    }
    return {...f,cell,lake};
}
test('An enclosed lake belongs to its surrounding realm without gaining a province or residents', () => {
    const {world:w,sim:s,width,lake,cell}=lakeFixture();
    const beforeWorld=Object.fromEntries(Object.entries(w).map(([k,v])=>[k,Array.from(v)])),beforeSim=JSON.stringify(s),keys=Object.keys(w);
    const t=P.territory(w,s,width);
    for(const i of lake){
        assert.equal(t.owners[i],0);assert.equal(w.provinceId[i],-1);
        assert.equal(P.owner(w,s,i,width),0);
    }
    const place=P.status(w,s,cell(4,4),width);
    assert.equal(place.kind,'realm');assert.equal(place.water,true);assert.equal(place.realm,s.realms[0]);assert.equal(place.province,null);
    assert.equal(P.description(w,s,cell(4,4),width),'Territory of Kingdom of Asgard.');
    assert.equal(P.territory(w,s,width),t,'unchanged inputs reuse the snapshot');
    assert.deepEqual(Object.keys(w),keys,'the world receives no derived cache fields');
    assert.deepEqual(Object.fromEntries(Object.entries(w).map(([k,v])=>[k,Array.from(v)])),beforeWorld);
    assert.equal(JSON.stringify(s),beforeSim);
});
test('A shared lake is partitioned by shore distance with deterministic national ties', () => {
    const {world:w,sim:s,width,lake,cell}=lakeFixture();
    for(let y=0;y<9;y++)for(let x=5;x<9;x++)if(w.lake[cell(x,y)]<0)w.provinceId[cell(x,y)]=1;
    const t=P.territory(w,s,width);
    for(const i of lake)assert.equal(t.owners[i],i%width<=4?0:1,'the dividing line crosses the lake');
    assert.equal(t.owners[cell(4,4)],0,'equally distant national shores use the lower realm index');
    const copy={...w,height:w.height.slice(),lake:w.lake.slice(),provinceId:w.provinceId.slice()};
    assert.deepEqual(P.territory(copy,structuredClone(s),width),t,'the partition and key are independent of cache/build order');
});
test('Unclaimed shoreline retains its share of water, including distance ties', () => {
    const {world:w,sim:s,width,cell,lake}=lakeFixture();
    w.provinceId[cell(4,1)]=-1;
    const t=P.territory(w,s,width);
    for(const y of [2,3,4])assert.equal(t.owners[cell(4,y)],-1);
    assert.equal(t.owners[cell(3,2)],0,'another shore still holds its own adjacent water');
    assert.equal(t.owners[cell(4,6)],0);
    assert.equal(P.status(w,s,cell(4,4),width).kind,'water');
    w.provinceId.fill(-1);
    for(const i of lake)assert.equal(P.territory(w,s,width).owners[i],-1,'a wholly unclaimed lake has no owner');
});
test('Actual connected lake surfaces are independent of basin identifiers', () => {
    const {world:w,sim:s,width}=fixture(11,7),cell=(x,y)=>y*width+x;
    s.realms.push({id:1,name:'Duat',alive:true});s.provinces[1].owner=1;
    for(let y=0;y<7;y++)for(let x=0;x<11;x++)w.provinceId[cell(x,y)]=x<5?0:1;
    w.lakeId=new Int32Array(w.height.length).fill(0);
    for(const x of [2,8]){w.lake[cell(x,3)]=150;w.provinceId[cell(x,3)]=-1;}
    const t=P.territory(w,s,width);
    assert.equal(t.owners[cell(2,3)],0);assert.equal(t.owners[cell(8,3)],1);
});
test('Ocean, coast-connected lake bits, and raster-edge water are never annexed', () => {
    const {world:w,sim:s,width,cell,lake}=lakeFixture();
    w.height[cell(4,1)]=-10;
    w.lake[cell(4,1)]=150;
    let t=P.territory(w,s,width);
    assert.equal(t.owners[cell(4,1)],-1,'a lake bit cannot convert ocean into national territory');
    for(const i of lake)assert.equal(t.owners[i],-1,'a lake directly open to the ocean stays unclaimed');
    w.height[cell(4,1)]=100;
    w.lake[cell(4,0)]=150;
    t=P.territory(w,s,width);
    for(const i of lake)assert.equal(t.owners[i],-1,'an open raster edge is not an enclosed lake');
    w.lake.fill(-1);w.lake[cell(8,3)]=150;w.lake[cell(0,4)]=150;
    t=P.territory(w,s,width);
    assert.equal(t.owners[cell(8,3)],-1);assert.equal(t.owners[cell(0,4)],-1,'adjacent array entries on different rows do not close a lake');
    assert.equal(P.owner(w,s,-1,width),-1);assert.equal(P.owner(w,s,w.height.length,width),-1);
});
test('Derived ownership invalidates after conquest, death, restoration and in-place raster edits', () => {
    const {world:w,sim:s,width,cell,lake}=lakeFixture();
    const first=P.territory(w,s,width);
    s.provinces[0].owner=1;
    const conquered=P.territory(w,s,width);
    assert.notEqual(conquered,first);assert.notEqual(conquered.key,first.key);
    for(const i of lake){assert.equal(first.owners[i],0,'previous snapshots remain stable');assert.equal(conquered.owners[i],1);}
    s.realms[1].alive=false;
    const dead=P.territory(w,s,width);
    for(const i of lake)assert.equal(dead.owners[i],-1);
    s.realms[1].alive=true;
    assert.equal(P.status(w,s,cell(4,4),width).realm,s.realms[1],'single-cell queries see live political restoration');
    const restored=P.territory(w,s,width);
    s.realms[1].title='Restored Kingdom of Duat';
    assert.equal(P.status(w,s,cell(4,4),width).label,'Restored Kingdom of Duat');
    assert.equal(P.territory(w,s,width),restored,'renaming does not rebuild the owner raster');
    w.provinceId[cell(4,1)]=-1;
    assert.equal(P.territory(w,s,width).owners[cell(4,2)],-1,'edited province membership invalidates the shore');
    w.lake[cell(4,4)]=-1;
    assert.equal(P.territory(w,s,width).owners[cell(4,4)],-1,'new unclaimed land is not a stale lake claim');
    assert.equal(P.status(w,s,cell(4,4),width).kind,'wilderness');
    const missingRealm=structuredClone(s);missingRealm.realms=[];
    assert(P.territory(w,missingRealm,width).owners.every(i=>i===-1),'missing realms cannot retain territory');
    assert.equal(P.territory({},s,width).owners.length,0);assert.equal(P.territory(null,null,width).key,'territory:none');
});
test('Borders enclose a realm against wilderness in either scan direction, including raster edges', () => {
    const w={height:new Float32Array(E.GN).fill(-100),lake:new Float32Array(E.GN).fill(-1),provinceId:new Int32Array(E.GN).fill(-1),biome:new Uint8Array(E.GN)};
    const r=Object.create(E.AtlasRenderer.prototype), meshes={};
    Object.assign(r,{world:w,sim:{provinces:[{owner:0},{owner:-1},{owner:1}],realms:[{id:0,alive:true},{id:1,alive:true}],routes:[],relations:{},wars:[]},layer:'realms',coord:(x,y,h=0)=>[x,h,y],ground:()=>0,upload:(name,g)=>{meshes[name]=g.data},request(){}});
    const land=(x,y,p)=>{const i=y*E.GW+x;w.height[i]=100;w.provinceId[i]=p;return i};
    // Each isolated pair contributes exactly one two-triangle wilderness dash.
    land(10,10,0);land(11,10,-1);
    land(20,10,-1);land(21,10,0);
    land(30,10,1);land(31,10,0);
    land(E.GW-1,E.GH-2,0);land(E.GW-1,E.GH-1,-1);
    land(E.GW-6,E.GH-1,-1);land(E.GW-5,E.GH-1,0);
    // A national border is cased: two lines/four triangles. Same-owner edges
    // and ocean edges contribute nothing to this political mesh. A malformed
    // lake open to the ocean stays unclaimed, with a wilderness shore dash.
    land(40,10,0);land(41,10,2);
    land(50,10,0);land(51,10,0);
    land(60,10,0);w.lake[land(61,10,-1)]=110;
    r.buildCivilization();
    assert.equal(meshes.frontiers.length/27,6*2+4);
    assert(meshes.frontiers.every(Number.isFinite));
});
