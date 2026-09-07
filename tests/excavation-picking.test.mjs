import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {AtlasRenderer,AtlasSpace,ContinuousCityLayer,ExcavationTerrain,TownCityBinding,LandmarkCatalog};')();
function scene(elevation,radius=.2){
 const r=Object.create(E.AtlasRenderer.prototype);
 Object.assign(r,{world:{},width:800,height:600,zoom:200,elevation,azimuth:0,relief:1,target:[0,0,0],selected:-1,meshes:{},options:{}});
 const layer=new E.ContinuousCityLayer(r),hole=E.ExcavationTerrain.prepare([[-radius,-radius],[radius,-radius],[radius,radius],[-radius,radius]],-2,'test-shaft');
 layer.world=r.world;layer.models.set(1,{p:{id:1},excavations:[hole]});r.continuousLayer=layer;
 // Derive grid conversion from the production helper rather than grid dimensions.
 const origin=E.AtlasSpace.grid(0,0),dx=E.AtlasSpace.grid(1,0)[0]-origin[0],dz=E.AtlasSpace.grid(0,1)[1]-origin[1];
 r.ground=(x,y)=>E.ExcavationTerrain.contains(hole,(x-origin[0])/dx,(y-origin[1])/dz)?hole.floorY:0;
 return{r,hole};
}
test('vertical ground picking reaches an excavated floor below the old sea-level cutoff',()=>{
 const{r}=scene(Math.PI/2),hit=E.AtlasSpace.pickGround(r,400,300);
 assert(hit,'the underground floor must remain selectable');assert(Math.abs(hit.point[1]+2)<1e-7);assert(Math.abs(hit.point[0])<1e-8);assert(Math.abs(hit.point[2])<1e-8);
});
test('an oblique ray through a narrow mouth meets its far wall instead of the uncut ground plane',()=>{
 const{r,hole}=scene(.87,.0017),hit=E.AtlasSpace.pickGround(r,400,300);
 assert(hit);assert(hit.point[1]<-.0001&&hit.point[1]>hole.floorY,'ray should enter the shaft and meet a wall');
 assert(Math.abs(Math.abs(hit.point[2])-.0017)<1e-7,'the hit must lie at the actual opening edge');
});
test('ordinary terrain picking retains the original surface without an excavation layer',()=>{
 const{r}=scene(1.16);delete r.continuousLayer;r.ground=()=>0;
 const hit=E.AtlasSpace.pickGround(r,400,300);assert(hit);assert(Math.abs(hit.point[1])<1e-7);
});
test('generic town miniatures preserve the Ninth Stair entrance datum and rotation',()=>{
 const recipe=E.LandmarkCatalog.recipe('labyrinth','ninth-stair-town'),lot={x:13,y:8,z:-4,w:24,d:30,angle:.63};
 const placed=E.TownCityBinding.miniature(recipe,lot);assert(placed.excavation);assert(placed.depth>0);
 let floor=Infinity;for(const g of[placed.body,placed.roof])for(let i=0;i<g.data.length;i+=9){const[x,y,z]=g.data.slice(i,i+3);floor=Math.min(floor,y);assert(x>=lot.x-lot.w/2-1e-8&&x<=lot.x+lot.w/2+1e-8);assert(z>=lot.z-lot.d/2-1e-8&&z<=lot.z+lot.d/2+1e-8);}
 assert(Math.abs(floor-(lot.y-placed.depth))<1e-8);assert(floor<lot.y);
});
