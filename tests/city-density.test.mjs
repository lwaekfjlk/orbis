import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root} from './engine-loader.mjs';

const baseline=JSON.parse(readFileSync(resolve(root,'tests/fixtures/city-density-baseline.json'),'utf8'));
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,ArtisanCityKit,physicalFingerprint,settlementFingerprint,politicalFingerprint};')();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const geometry=b=>[b.id,b.x,b.z,b.w,b.d,b.h,b.y,b.angle||0,b.streetSocket,b.module,b.infill];
const houses=b=>b.infill?1:Math.max(1,Math.round(b.w/2.7))*Math.max(1,Math.round(b.d/2.7));
let world,sim,cities,before;
const fingerprints=()=>[E.physicalFingerprint(world),E.settlementFingerprint(sim),E.politicalFingerprint(sim)];
test.before(async()=>{
    world=await E.generateWorld(baseline.parameters);
    sim=E.createCivilization(world,{realms:18,conflict:1});
    before=fingerprints();
    cities=baseline.cities.map(old=>({old,city:E.generateCity(world,sim,old.id)}));
});

test('four reference large cities double actual small houses and add occupied ground inside the old walls',()=>{
    for(const {old,city}of cities){
        const ordinary=city.buildings.filter(b=>!b.landmark),added=ordinary.filter(b=>b.denseInfill);
        assert(ordinary.length>=old.ordinary*2,`${city.name}: ${ordinary.length} plots versus ${old.ordinary}`);
        const visible=ordinary.reduce((sum,b)=>sum+houses(b),0);
        assert(visible>=old.visibleHouses*2,`${city.name}: ${visible} visible houses versus ${old.visibleHouses}`);
        const area=ordinary.reduce((sum,b)=>sum+b.w*b.d,0);
        assert(area>=old.ordinaryArea*1.25,`${city.name} needs materially more occupied ground, not only a larger counter`);
        assert(added.length>=old.visibleHouses,`${city.name} must retain its earlier houses and add independent ones`);
        for(const b of added){
            assert(Math.min(b.w,b.d)>=1.1,'small houses keep the established usable minimum');
            for(const x of[b.x-b.w/2,b.x+b.w/2])for(const z of[b.z-b.d/2,b.z+b.d/2])
                assert(old.perimeter.every((a,i)=>{const q=old.perimeter[(i+1)%old.perimeter.length];return(q.x-a.x)*(z-a.z)-(q.z-a.z)*(x-a.x)>=-1e-8;}),'infill must stay within the original curtain');
        }
        // Check the real kit, whose structures count comes from actual house
        // placements. b.components is a historical program estimate, not proof.
        const p=sim.provinces[old.id];
        for(let i=0;i<added.length;i+=Math.max(1,Math.floor(added.length/16))){
            const model=E.ArtisanCityKit.compound(added[i],city,p,sim.realms[p.owner]);
            assert.equal(model.structures,1,'every newly counted small plot must render a house');
            assert(model.body.data.length>0&&model.roof.data.length>0);
        }
    }
});

test('density preserves every earlier house, public landmark, street and curtain',()=>{
    for(const {old,city}of cities){
        assert.equal(digest(city.buildings.filter(b=>!b.landmark&&!b.denseInfill).map(geometry)),old.ordinaryGeometrySHA256,city.name+' moved or shrank earlier houses');
        assert.deepEqual(city.buildings.filter(b=>b.landmark).map(geometry),old.landmarks,city.name+' moved a public site or its entrance');
        assert.equal(digest(city.roads.filter(r=>r.role!=='courtyard-access')),old.roadsSHA256,city.name+' changed an earlier street or external gate approach');
        assert.deepEqual(city.defenses.perimeter,old.perimeter);
        assert.equal(city.defenses.gates.length,old.gates);
        assert.equal(new Set(city.buildings.map(b=>b.id)).size,city.buildings.length,'new IDs cannot reuse a removed plot ID');
    }
    assert.deepEqual(fingerprints(),before,'refining a city must not change its population or planet');
});

// Independent exact capsule/rectangle checks. They exercise full pavement width,
// including end caps, without consulting the generator's road occupancy bitmap.
function segmentDistance(p,a,b){const x=b.x-a.x,z=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z||1)));return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);}
function crosses(a,b,c,d){const side=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);return side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0;}
function ribbonHits(a,b,half,plot){
    const corners=[{x:plot.x-plot.w/2,z:plot.z-plot.d/2},{x:plot.x+plot.w/2,z:plot.z-plot.d/2},{x:plot.x+plot.w/2,z:plot.z+plot.d/2},{x:plot.x-plot.w/2,z:plot.z+plot.d/2}];
    const pointBox=p=>Math.hypot(Math.max(0,Math.abs(p.x-plot.x)-plot.w/2),Math.max(0,Math.abs(p.z-plot.z)-plot.d/2));
    if(pointBox(a)<half-1e-8||pointBox(b)<half-1e-8)return true;
    return corners.some((p,i)=>segmentDistance(p,a,b)<half-1e-8||crosses(a,b,p,corners[(i+1)%4]));
}
function plotIndex(buildings){
    const bins=new Map(),each=(x0,z0,x1,z1,fn)=>{for(let z=Math.floor(z0/4);z<=Math.floor(z1/4);z++)for(let x=Math.floor(x0/4);x<=Math.floor(x1/4);x++)fn(x+','+z);};
    for(const b of buildings)each(b.x-b.w/2,b.z-b.d/2,b.x+b.w/2,b.z+b.d/2,k=>{if(!bins.has(k))bins.set(k,[]);bins.get(k).push(b);});
    return(a,b,r)=>{const found=new Set();each(Math.min(a.x,b.x)-r,Math.min(a.z,b.z)-r,Math.max(a.x,b.x)+r,Math.max(a.z,b.z)+r,k=>{for(const plot of bins.get(k)||[])found.add(plot);});return found;};
}

test('the full width of every new lane and every new doorstep clears homes and inherited water',()=>{
    assert(ribbonHits({x:-2,z:.6},{x:2,z:.6},.12,{x:0,z:0,w:1,d:1}),'a clear centerline alone does not establish full-width clearance');
    for(const {city}of cities){
        const near=plotIndex(city.buildings);
        const alleys=city.roads.filter(r=>r.role==='courtyard-access');
        assert(alleys.length>0,city.name+' needs real access into its back courts');
        for(const r of city.roads){
            const alley=r.role==='courtyard-access',half=alley?r.halfWidth:city.townProfile.width*(r.kind==='arterial'?.67:r.kind==='street'?.5:.37);
            if(alley)assert.equal(half,.12);
            for(let k=1;k<r.points.length;k++){
                const a=r.points[k-1],b=r.points[k],width=half+((a.bridge||b.bridge)?.18:0);
                for(const plot of near(a,b,width))if(alley||plot.denseInfill)assert(!ribbonHits(a,b,width,plot),`${city.name} ${r.role||r.kind} crosses ${plot.id}`);
                if(alley){
                    const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/.05)),nx=-(b.z-a.z)/(length||1),nz=(b.x-a.x)/(length||1);
                    for(let j=0;j<=steps;j++)for(const side of[-1,0,1]){const t=j/steps,i=city.index(a.x+(b.x-a.x)*t+nx*half*side,a.z+(b.z-a.z)*t+nz*half*side);assert(!city.water[i],city.name+' placed a courtyard lane over water');}
                }
            }
        }
        assert.equal(city.connectors.length,city.buildings.length);
        for(const path of city.connectors)for(const b of near(path.a,path.b,.08))if(b.id!==path.blockId)assert(!ribbonHits(path.a,path.b,.08,b),`${city.name} blocks ${path.blockId}'s doorway with ${b.id}`);
        const audit=E.auditCity(city);for(const key of['wetBuildings','roadBuildings','overlaps','nonfinite','seaRoads','iceBuildings'])assert.equal(audit[key],0,city.name+': '+key);
    }
});

test('all new courtyard streets and homes remain connected to the market',()=>{
    for(const {city}of cities){
        const graph=new Map();
        for(const road of city.roads)for(let k=1;k<road.nodes.length;k++){const a=road.nodes[k-1],b=road.nodes[k];if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a).add(b);graph.get(b).add(a);}
        const queue=[city.marketIndex],seen=new Set(queue);for(const a of queue)for(const b of graph.get(a)||[])if(!seen.has(b)){seen.add(b);queue.push(b);}
        for(const node of graph.keys())assert(seen.has(node),city.name+' has an isolated courtyard lane');
        for(const b of city.buildings)assert(seen.has(b.streetSocket),city.name+' has an isolated house');
    }
});
