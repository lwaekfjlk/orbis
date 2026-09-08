import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './engine-loader.mjs';

const {PoliticalLand:P}=loadEngine();
function grid(width,height){
    const n=width*height,w={height:new Float32Array(n).fill(-100),lake:new Float32Array(n).fill(-1),provinceId:new Int32Array(n).fill(-1),area:new Float32Array(n).fill(1),ice:new Float32Array(n),arid:new Float32Array(n)};
    const s={realms:[{id:0,alive:true,capital:0,name:'Asgard'},{id:1,alive:true,capital:1,name:'Duat'}],provinces:[{id:0,owner:0,pop:1000,cells:[]},{id:1,owner:1,pop:2000,cells:[]}]};
    const at=(x,y)=>y*width+x;
    const land=(x,y,owner=-1)=>{const i=at(x,y);w.height[i]=100;w.provinceId[i]=owner;if(owner>=0){s.provinces[owner].i??=i;s.provinces[owner].cells.push(i);}return i;};
    const lake=(x,y)=>{const i=land(x,y);w.lake[i]=150;return i;};
    return {w,s,width,at,land,lake};
}
function sourceState(w,s){return JSON.stringify({w:Object.fromEntries(Object.entries(w).map(([k,v])=>[k,Array.from(v)])),s});}
function assertComplete(w,s,owners){for(let i=0;i<owners.length;i++){
    if(w.height[i]<=0)assert.equal(owners[i],-1,'ocean is not territory');
    else assert(s.realms[owners[i]]?.alive,'every positive-height cell belongs to a living country');
    const direct=s.provinces[w.provinceId[i]]?.owner;
    if(w.height[i]>0&&w.lake[i]<=0&&s.realms[direct]?.alive)assert.equal(owners[i],direct,'directly held province cells cannot change hands');
}}

test('Land-connected expansion takes precedence over a nearer country across water',()=>{
    const {w,s,width,at,land}=grid(9,7);
    for(let y=1;y<=5;y++)for(let x=1;x<=3;x++)land(x,y);
    land(1,5,0);land(5,1,1);
    const before=sourceState(w,s),t=P.territory(w,s,width);
    assert.equal(t.owners[at(3,1)],0,'the opposite shore is closer in a straight line, but does not replace a connected country');
    assertComplete(w,s,t.owners);assert.equal(sourceState(w,s),before);
});
test('A connected country boundary follows equal land distance and never overrides direct ownership',()=>{
    const {w,s,width,at,land}=grid(11,5);
    for(let y=1;y<=3;y++)for(let x=1;x<=9;x++)land(x,y);
    land(1,2,0);land(9,2,1);
    const t=P.territory(w,s,width);
    for(let x=1;x<=9;x++)assert.equal(t.owners[at(x,2)],x<=5?0:1);
    assertComplete(w,s,t.owners);
    w.provinceId[at(4,2)]=1;
    assert.equal(P.territory(w,s,width).owners[at(4,2)],1,'a direct enclave remains with its recorded owner');
});
test('A remote ice-and-desert island joins its nearest coast as one territory, including its lake',()=>{
    const {w,s,width,at,land,lake}=grid(15,9);
    land(1,3,0);land(13,3,1);
    const island=[];
    for(let y=2;y<=6;y++)for(let x=6;x<=9;x++){const i=land(x,y);w.height[i]=6000;w.ice[i]=x<8?300:0;w.arid[i]=x>=8?7:0;island.push(i);}
    const water=lake(7,4),before=sourceState(w,s),t=P.territory(w,s,width);
    for(const i of island)assert.equal(t.owners[i],1,'the island uses its nearest established shore, without being split into arbitrary inland strips');
    assert.equal(t.owners[water],1);assert.equal(P.status(w,s,at(6,2),width).derived,true);
    assertComplete(w,s,t.owners);assert.equal(sourceState(w,s),before);assert.deepEqual(P.labels(w,s,width),[]);
});
test('Assigning one island cannot pull a farther island away from its nearest original coast',()=>{
    const {w,s,width,at,land}=grid(24,8);
    land(1,1,0);land(20,1,1);
    for(let x=5;x<=12;x++)land(x,4);
    land(14,4);
    const t=P.territory(w,s,width);
    for(let x=5;x<=12;x++)assert.equal(t.owners[at(x,4)],0);
    assert.equal(t.owners[at(14,4)],1,'new outer territory does not become a zero-distance springboard for the next island');
    assertComplete(w,s,t.owners);
});
test('Shore searches never wrap the end of one row onto the start of the next',()=>{
    const {w,s,width,at,land}=grid(10,4);
    land(9,0,0);land(0,2,1);land(0,1);
    assert.equal(P.territory(w,s,width).owners[at(0,1)],1);
});
test('Small isolated lakes use the nearest coast even without dry shoreline cells',()=>{
    const {w,s,width,at,land,lake}=grid(15,5);
    land(1,2,0);land(12,2,1);lake(10,2);
    assert.equal(P.territory(w,s,width).owners[at(10,2)],1);
});
test('A living country without province raster seeds uses its capital, and a countryless world remains neutral',()=>{
    const {w,s,width,at,land}=grid(10,6);
    for(let y=0;y<6;y++)for(let x=0;x<10;x++)land(x,y);
    s.provinces[0].i=at(1,2);s.provinces[1].i=at(8,2);
    const before=sourceState(w,s),t=P.territory(w,s,width);
    assert.equal(t.owners[at(1,2)],0);assert.equal(t.owners[at(8,2)],1);assertComplete(w,s,t.owners);
    assert.equal(sourceState(w,s),before,'capital fallback creates neither residents nor realm objects');
    s.provinces[1].i=at(3,2);
    assert.notStrictEqual(P.territory(w,s,width),t,'capital movement invalidates a seedless-world map');
    s.realms.forEach(r=>r.alive=false);
    const neutral=P.territory(w,s,width);
    assert(neutral.owners.every(o=>o===-1));
    assert.equal(P.status(w,s,at(2,2),width).label,'No countries yet');
    assert.doesNotMatch(JSON.stringify(P.labels(w,s,width))+P.description(w,s,at(2,2),width),/wilderness|unclaimed wilds/i);
    s.realms[1].alive=true;
    const revived=P.territory(w,s,width);assert(revived.owners.every(o=>o===1));
    assert.deepEqual(P.labels(w,s,width),[]);
});
test('An all-lake raster still uses an existing capital while oceans remain unowned',()=>{
    const {w,s,width,at,lake}=grid(9,5);
    for(let x=6;x<9;x++)lake(x,2);
    s.provinces[0].i=at(0,2);s.provinces[1].i=at(8,2);
    const t=P.territory(w,s,width);
    assert.equal(t.owners[at(7,2)],1);assertComplete(w,s,t.owners);
});
test('Territorial area summaries include outer land and water and invalidate when area changes',()=>{
    const {w,s,width,at,land,lake}=grid(9,5);
    for(let y=1;y<=3;y++)for(let x=1;x<=7;x++)land(x,y);
    land(1,2,0);land(7,2,1);lake(4,2);
    for(let i=0;i<w.area.length;i++)w.area[i]=(i+1)/4;
    const first=P.territory(w,s,width),expected=s.realms.map(()=>({land:0,water:0,cells:0}));
    for(let i=0;i<w.height.length;i++)if(first.owners[i]>=0){const a=expected[first.owners[i]];a[w.lake[i]>0?'water':'land']+=w.area[i];a.cells++;}
    assert.deepEqual(first.areas,expected);assert(Object.isFrozen(first.areas));assert(Object.isFrozen(first.areas[0]));
    w.area[at(1,1)]+=2;
    const changed=P.territory(w,s,width);
    assert.notEqual(changed.key,first.key);assert.notStrictEqual(changed,first);assert.deepEqual(changed.owners,first.owners);
    assert.equal(changed.areas[0].land,first.areas[0].land+2);assert.strictEqual(P.territory(w,s,width),changed);
});
