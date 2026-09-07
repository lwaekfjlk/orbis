import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {scripts} from '../scripts/manifest.mjs';
import {root} from './engine-loader.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(file=>readFileSync(resolve(root,file),'utf8')).join('\n');
const E=Function(source+'\nreturn {ContinuousCityLayer,AtlasRenderer,AtlasSpace,CityEnvironment,GW,GH};')();
const cellX=150,cellY=90,cell=cellY*E.GW+cellX,count=E.GW*E.GH;
const world={height:new Float32Array(count).fill(100),lake:new Float32Array(count).fill(-1),ice:new Float32Array(count),biome:new Uint8Array(count).fill(5),temp:new Float32Array(count).fill(20),arid:new Float32Array(count).fill(.8)};
for(const i of [cell,cell+E.GW+1]){world.height[i]=1000;world.biome[i]=13;}

function fixture(){
    const r=Object.create(E.AtlasRenderer.prototype);
    Object.assign(r,{world,relief:1,layer:'relief',width:1440,height:900,zoom:620,azimuth:.3,elevation:.9,target:E.AtlasSpace.point(world,cellX+.5,cellY+.5),palette(){return [.5,.6,.4];},upload(name,g){if(name==='terrain')this.terrain=g.data;}});
    const layer=new E.ContinuousCityLayer(r);
    Object.assign(layer,{world,natural:true});
    return {r,layer};
}

let mixed;
test.before(()=>{
    mixed=fixture();
    // Four core cells fit the full 128 level. The production builder chooses its
    // level-8 collar and untouched level-1 surroundings, including real stitch fans.
    mixed.layer.tessellation=()=>128;
    mixed.layer.viewBox=()=>({x0:cellX-3,x1:cellX+3,y0:cellY-3,y1:cellY+3});
    mixed.layer.buildTerrain();
});

function gridVertex(data,i){
    const [x,y]=E.AtlasSpace.grid(data[i],data[i+2]);
    return {x,y,h:data[i+1]};
}

function findVertex(data,x,y){
    for(let i=0;i<data.length;i+=9){
        const q=gridVertex(data,i);
        if(Math.abs(q.x-x)<1e-8&&Math.abs(q.y-y)<1e-8)return data.slice(i,i+9);
    }
    assert.fail(`terrain did not contain the sample at ${x},${y}`);
}

test('natural terrain approximates curved interiors rather than repeating two coarse faces',()=>{
    const {layer,r}=mixed,d=r.terrain;
    assert.equal(layer.terrainDetail,128);
    assert(layer.terrainTriangles<400000);
    let fineError=0,coreTriangles=0;
    for(let i=0;i<d.length;i+=27){
        const a=gridVertex(d,i),b=gridVertex(d,i+9),c=gridVertex(d,i+18);
        const x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3;
        if(x<=cellX||x>=cellX+1||y<=cellY||y>=cellY+1)continue;
        fineError=Math.max(fineError,Math.abs((a.h+b.h+c.h)/3-E.AtlasSpace.surface(world,x,y)));
        coreTriangles++;
    }
    const high=E.AtlasSpace.height(world,cell),low=E.AtlasSpace.height(world,cell+1);
    const coarseError=Math.abs((2*high+low)/3-E.AtlasSpace.surface(world,cellX+2/3,cellY+1/3));
    assert(coarseError>.1,'fixture must expose a visible diagonal ridge in a coarse mesh');
    assert.equal(coreTriangles,2*128*128,'the visible parent cell receives the requested detail');
    assert(fineError<coarseError/100,`refined interiors still miss the curved surface by ${fineError}`);
    const middle=findVertex(d,cellX+.5,cellY+.5);
    assert(Math.abs(middle[1]-(high+low)/2)<1e-10);
    assert(middle[1]<high-.3,'refinement must change the coarse ridge shape');
});

test('128-to-8-to-1 transitions have no internal open or nonmanifold edges',()=>{
    const d=mixed.r.terrain,stride=E.GH*256+1,edges=new Map();
    const id=q=>Math.round(q.x*256)*stride+Math.round(q.y*256);
    const boundary=id=>{const x=Math.floor(id/stride),y=id%stride;return x===0||x===(E.GW-1)*256||y===0||y===(E.GH-1)*256;};
    let fanCenters=0;
    for(let i=0;i<d.length;i+=27){
        if(d[i+1]<0)continue; // The deliberate ocean apron is separate from the grid.
        const points=[0,9,18].map(k=>gridVertex(d,i+k)),ids=points.map(id);
        for(const p of points){
            assert(Math.abs(p.h-E.AtlasSpace.surface(world,p.x,p.y))<1e-9,'a terrain or stitching vertex left the shared surface');
            // Outside the level-128 core, odd 1/16 coordinates belong to the
            // centres of level-8 stitch fans, not to its regular 1/8 grid.
            if((p.x<cellX-1||p.x>cellX+1||p.y<cellY-1||p.y>cellY+1)&&Math.abs(p.x*16-Math.round(p.x*16))<1e-7&&Math.abs(p.y*16-Math.round(p.y*16))<1e-7&&Math.round(p.x*16)%2&&Math.round(p.y*16)%2)fanCenters++;
        }
        for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+'/'+b:b+'/'+a;edges.set(key,(edges.get(key)||0)+1);}
    }
    assert(fanCenters>0,'exercise the newly inserted transition fan centres');
    for(const [key,n]of edges){
        assert(n<=2,'overlapping terrain faces share an edge more than twice');
        if(n===1){const [a,b]=key.split('/').map(Number);assert(boundary(a)&&boundary(b),'an internal terrain edge has no matching neighbour');}
    }
});

test('natural terrain colours follow the four-corner patch without a coarse diagonal',()=>{
    const corners=[cell,cell+1,cell+E.GW,cell+E.GW+1].map(i=>E.CityEnvironment.cellColor(world,i));
    const u=.25,v=.25,weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
    const expected=[0,1,2].map(k=>corners.reduce((n,c,i)=>n+c[k]*weights[i],0));
    const vertex=findVertex(mixed.r.terrain,cellX+u,cellY+v);
    for(let k=0;k<3;k++)assert(Math.abs(vertex[6+k]-expected[k])<1e-6,'terrain colour retained a triangular interpolation boundary');
    assert(Math.hypot(...expected.map((n,k)=>n-corners[0][k]))>.01,'fixture distinguishes the old high-corner diagonal colour');
});

test('deep zoom and low-angle views keep visible cells detailed within the mesh budget',()=>{
    for(const [width,height,elevation]of [[1440,900,.87],[2560,720,.21]]){
        const {r,layer}=fixture();Object.assign(r,{width,height,elevation});
        layer.buildTerrain();
        assert(layer.terrainDetail>=32,`deep zoom lost visible detail at elevation ${elevation}`);
        assert(layer.terrainTriangles<400000,`terrain exceeded its budget with ${layer.terrainTriangles} triangles`);
        let visible=0;
        for(let i=0;i<r.terrain.length;i+=27){
            const a=gridVertex(r.terrain,i),b=gridVertex(r.terrain,i+9),c=gridVertex(r.terrain,i+18),x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3;
            if(x>cellX&&x<cellX+1&&y>cellY&&y<cellY+1)visible++;
        }
        assert(visible>=2*32*32,'the reported detail was not actually applied to the visible cell');
    }
});
