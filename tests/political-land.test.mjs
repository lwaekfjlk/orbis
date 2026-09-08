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
test('Borders enclose a realm against wilderness in either scan direction, including raster edges', () => {
    const w={height:new Float32Array(E.GN).fill(-100),lake:new Float32Array(E.GN).fill(-1),provinceId:new Int32Array(E.GN).fill(-1),biome:new Uint8Array(E.GN)};
    const r=Object.create(E.AtlasRenderer.prototype), meshes={};
    Object.assign(r,{world:w,sim:{provinces:[{owner:0},{owner:-1},{owner:1}],realms:[],routes:[],relations:{},wars:[]},layer:'realms',coord:(x,y,h=0)=>[x,h,y],ground:()=>0,upload:(name,g)=>{meshes[name]=g.data},request(){}});
    const land=(x,y,p)=>{const i=y*E.GW+x;w.height[i]=100;w.provinceId[i]=p;return i};
    // Each isolated pair contributes exactly one two-triangle wilderness dash.
    land(10,10,0);land(11,10,-1);
    land(20,10,-1);land(21,10,0);
    land(30,10,1);land(31,10,0);
    land(E.GW-1,E.GH-2,0);land(E.GW-1,E.GH-1,-1);
    land(E.GW-6,E.GH-1,-1);land(E.GW-5,E.GH-1,0);
    // A national border is cased: two lines/four triangles. Same-owner edges
    // and coast/lake edges contribute nothing to this political mesh.
    land(40,10,0);land(41,10,2);
    land(50,10,0);land(51,10,0);
    land(60,10,0);w.lake[land(61,10,-1)]=110;
    r.buildCivilization();
    assert.equal(meshes.frontiers.length/27,5*2+4);
    assert(meshes.frontiers.every(Number.isFinite));
});
