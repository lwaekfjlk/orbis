import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './engine-loader.mjs';
const {PoliticalLand:P}=loadEngine();

function grid(rows){
    const width=rows[0].length,n=width*rows.length;
    assert(rows.every(row=>row.length===width));
    const w={height:new Float32Array(n),lake:new Float32Array(n).fill(-1),provinceId:new Int32Array(n).fill(-1),area:new Float32Array(n).fill(1),ice:new Float32Array(n),arid:new Float32Array(n)};
    const s={realms:[{id:0,alive:true,name:'Asgard'},{id:1,alive:true,name:'Duat'}],provinces:[{id:0,owner:0,pop:1000,cells:[]},{id:1,owner:1,pop:2000,cells:[]}]};
    for(let y=0;y<rows.length;y++)for(let x=0;x<width;x++){
        const ch=rows[y][x],i=y*width+x;w.height[i]=ch==='#'?-100:100;
        if(ch==='~')w.lake[i]=150;
        if(ch==='A'||ch==='B'){const p=ch==='A'?0:1;w.provinceId[i]=p;s.provinces[p].cells.push(i);}
    }
    return {w,s,width,at:(x,y)=>y*width+x};
}
const state=(w,s)=>JSON.stringify({w:Object.fromEntries(Object.entries(w).map(([k,v])=>[k,Array.from(v)])),s});
function neighbours(i,width,n){const x=i%width,out=[];if(x)out.push(i-1);if(x+1<width&&i+1<n)out.push(i+1);if(i>=width)out.push(i-width);if(i+width<n)out.push(i+width);return out;}
// Independently inspect each country's complement. A bounded component is a
// valid enclave only when it contains actual territory of another country.
function noDomesticHoles(t,s,width){
    const n=t.owners.length;
    for(const r of s.realms.filter(r=>r.alive)){
        const seen=new Set();
        for(let i=0;i<n;i++){
            if(t.owners[i]===r.id||seen.has(i))continue;
            const q=[i];seen.add(i);let outside=false,foreign=false;
            for(let k=0;k<q.length;k++){
                const j=q[k];outside ||= j%width===0||j%width===width-1||j<width||j+width>=n;
                foreign ||= t.owners[j]>=0&&t.owners[j]!==r.id;
                for(const v of neighbours(j,width,n))if(t.owners[v]!==r.id&&!seen.has(v)){seen.add(v);q.push(v);}
            }
            assert(outside||foreign,`country ${r.id} has an empty internal loop at ${i}`);
        }
    }
}
const ring=()=>grid(['.........','.AAAAAAA.','.A.....A.','.A.~#..A.','.A.....A.','.A.....A.','.A.....A.','.AAAAAAA.','.........']);

test('A single-country ring fills its empty dry land, lake and below-sea-level inland basin',()=>{
    const {w,s,width,at}=ring(),before=state(w,s),t=P.territory(w,s,width);
    for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)assert.equal(t.owners[at(x,y)],0);
    for(const i of [at(3,3),at(4,3)]){assert.equal(t.inlandWater[i],1);assert.equal(P.owner(w,s,i,width),0);assert.equal(P.status(w,s,i,width).water,true);assert.equal(P.status(w,s,i,width).realm.id,0);}
    assert.equal(t.owners[at(0,0)],-1,'outside wildness is preserved');
    assert.deepEqual(t.areas[0],{land:47,water:2,cells:49});
    assert.equal(state(w,s),before);noDomesticHoles(t,s,width);
});
test('Opening a land corridor restores genuine wildness instead of extending a neighboring country',()=>{
    const {w,s,width,at}=ring(),first=P.territory(w,s,width);
    w.provinceId[at(4,1)]=-1;
    const opened=P.territory(w,s,width);
    assert.notEqual(opened.key,first.key);
    for(const i of [at(4,1),at(4,2),at(3,3),at(4,3),at(5,5)])assert.equal(opened.owners[i],-1);
    assert.equal(first.owners[at(5,5)],0,'prior snapshots remain stable');
    assert.equal(P.status(w,s,at(4,3),width).label,'wildness');assert.equal(P.status(w,s,at(4,3),width).water,true);
    assert.equal(P.description(w,s,at(4,3),width),'wildness');noDomesticHoles(opened,s,width);
    w.provinceId[at(4,1)]=0;
    assert.equal(P.territory(w,s,width).owners[at(5,5)],0,'closing the real border removes the internal hole again');
});
test('A foreign enclave remains complete inside a surrounding country',()=>{
    const {w,s,width,at}=ring();
    for(let y=3;y<=5;y++)for(let x=3;x<=5;x++){const i=at(x,y);w.height[i]=100;w.lake[i]=-1;w.provinceId[i]=1;}
    const before=state(w,s),t=P.territory(w,s,width);
    for(let y=3;y<=5;y++)for(let x=3;x<=5;x++)assert.equal(t.owners[at(x,y)],1);
    assert.equal(t.owners[at(1,4)],0);assert.equal(t.owners[at(2,4)],-1,'a jointly bordered region is not arbitrarily taken from another country');
    noDomesticHoles(t,s,width);assert.equal(state(w,s),before);
});
test('A domestic lake with an uninhabited central island has no hollow inner outline',()=>{
    const {w,s,width,at}=grid(['.........','.AAAAAAA.','.A~~~~~A.','.A~~~~~A.','.A~~.~~A.','.A~~~~~A.','.A~~~~~A.','.AAAAAAA.','.........']);
    const t=P.territory(w,s,width);
    assert.equal(t.owners[at(4,4)],0);assert.equal(P.status(w,s,at(4,4),width).derived,true);
    noDomesticHoles(t,s,width);
});
test('A sea channel keeps a bay open and cannot be annexed to hide its coastline',()=>{
    const {w,s,width,at}=ring();
    for(let y=0;y<=4;y++)w.height[at(4,y)]=-100;
    const t=P.territory(w,s,width);
    for(let y=0;y<=4;y++){assert.equal(t.inlandWater[at(4,y)],0);assert.equal(t.owners[at(4,y)],-1);assert.equal(P.status(w,s,at(4,y),width).kind,'water');}
    assert.equal(t.owners[at(5,5)],-1,'land opening directly onto the sea is still wildness');noDomesticHoles(t,s,width);
});
test('Remote islands and open icefields or deserts are not assigned by proximity',()=>{
    const {w,s,width,at}=grid(['#############','#A###...###B#','#####...#####','#####...#####','#############']);
    for(let y=1;y<=3;y++)for(let x=5;x<=7;x++){w.ice[at(x,y)]=x<7?500:0;w.arid[at(x,y)]=x===7?10:0;}
    const before=state(w,s),t=P.territory(w,s,width);
    for(let y=1;y<=3;y++)for(let x=5;x<=7;x++)assert.equal(t.owners[at(x,y)],-1);
    assert.equal(state(w,s),before);noDomesticHoles(t,s,width);
});
test('Only edge-connected negative water is ocean, including a one-cell non-wrapping passage',()=>{
    const {w,s,width,at}=grid(['AAAAAA#','A#AAAAA','AAAAAAA']);
    const t=P.territory(w,s,width);
    assert.equal(t.inlandWater[at(6,0)],0);assert.equal(t.owners[at(6,0)],-1);
    assert.equal(t.inlandWater[at(1,1)],1);assert.equal(t.owners[at(1,1)],0);
    w.height[at(0,1)]=-100;
    const opened=P.territory(w,s,width);assert.equal(opened.inlandWater[at(1,1)],0);assert.equal(opened.owners[at(1,1)],-1);
});
test('Countryless worlds and existing countries without direct land retain lowercase wildness',()=>{
    const {w,s,width,at}=grid(['........','........','........','........','........']);
    const t=P.territory(w,s,width);assert(t.owners.every(o=>o===-1));
    for(const realms of [s.realms,[]]){s.realms=realms;assert.equal(P.status(w,s,at(2,2),width).label,'wildness');assert.equal(P.description(w,s,at(2,2),width),'wildness');
        const labels=P.labels(w,s,width);assert.equal(labels.length,1);assert.equal(labels[0].name,'wildness');assert.equal(labels[0].wildness,true);assert.doesNotMatch(JSON.stringify(labels),/wilderness|Unclaimed wilds|Independent communities/);}
});
test('Extinction removes a domestic infill and weighted summaries stay live without changing the ledger',()=>{
    const {w,s,width,at}=ring(),first=P.territory(w,s,width);
    w.area[at(4,3)]=3;
    const resized=P.territory(w,s,width);assert.notEqual(resized.key,first.key);assert.deepEqual(resized.owners,first.owners);
    assert.equal(resized.areas[0].water,4);assert.equal(first.areas[0].water,2);assert(Object.isFrozen(resized.areas[0]));
    s.realms[0].alive=false;
    const dead=P.territory(w,s,width);assert(dead.owners.every(o=>o===-1));assert.equal(dead.areas[0].cells,0);
    assert.equal(P.status(w,s,at(4,3),width).kind,'wildness');assert.equal(P.status(w,s,at(4,3),width).water,true);
    s.realms[0].alive=true;
    assert.equal(P.owner(w,s,at(4,3),width),0);assert.equal(s.provinces[0].pop,1000);
});
