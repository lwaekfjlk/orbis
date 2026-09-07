import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const {Geometry,ExcavationTerrain:H}=Function(source+'\nreturn {Geometry,ExcavationTerrain};')();
test('a level excavation rim seals both uphill and downhill terrain at the exact clipped edge',()=>{
 const outline=[[-.7,-.55],[.7,-.55],[.7,.55],[-.7,.55]],hole={...H.prepare(outline,-3,'sloped-pit'),groundY:2},surface=(x,z)=>2+x*.5+z*.3;
 const v=(x,z)=>[x,surface(x,z),z,0,1,0,.4,.5,.3],g=new Geometry();
 H.triangle(g,v(-2,-2),v(-2,2),v(2,2),[hole]);H.triangle(g,v(-2,-2),v(2,2),v(2,-2),[hole]);
 let actualArea=0,above=0,below=0;
 for(let i=0;i<g.data.length;i+=27){const [a,b,c]=[0,9,18].map(j=>g.data.slice(i+j,i+j+3)),u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(Math.abs(cross[1])>1e-10)continue;actualArea+=Math.hypot(...cross)/2;
  for(const p of[a,b,c]){assert(Math.abs(p[1]-surface(p[0],p[2]))<1e-9||Math.abs(p[1]-hole.groundY)<1e-9,'the seam uses original edge heights and the actual rim datum');assert(Math.abs(Math.abs(p[0])-.7)<1e-9||Math.abs(Math.abs(p[2])-.55)<1e-9);if(p[1]>2+1e-9)above++;if(p[1]<2-1e-9)below++;}
 }
 let expectedArea=0;for(let j=0;j<4;j++){const a=outline[j],b=outline[(j+1)%4],d0=surface(...a)-2,d1=surface(...b)-2,length=Math.hypot(b[0]-a[0],b[1]-a[1]);expectedArea+=length*(d0*d1>=0?(Math.abs(d0)+Math.abs(d1))/2:(d0*d0+d1*d1)/(2*(Math.abs(d0)+Math.abs(d1))));}
 assert(above>0&&below>0,'the join must handle soil above and below the entrance');assert(Math.abs(actualArea-expectedArea)<1e-9,'soil walls must fully cover the height difference without duplicate faces');
 for(let i=0;i<g.data.length;i+=9)assert(Math.abs(Math.hypot(...g.data.slice(i+3,i+6))-1)<1e-9,'nondegenerate unit normals at every seam');
});

test('an opening aligned exactly with terrain edges still closes the adjacent soil wall',()=>{
 const hole={...H.prepare([[0,0],[1,0],[1,1],[0,1]],-2,'aligned-pit'),groundY:1},g=new Geometry(),v=(x,z)=>[x,2,z,0,1,0,.4,.5,.3];
 for(const x of[-1,0]){H.triangle(g,v(x,0),v(x,1),v(x+1,1),[hole]);H.triangle(g,v(x,0),v(x+1,1),v(x+1,0),[hole]);}
 let seamArea=0,horizontalArea=0;
 for(let i=0;i<g.data.length;i+=27){const[a,b,c]=[0,9,18].map(j=>g.data.slice(i+j,i+j+3)),u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(Math.abs(cross[1])<1e-9){seamArea+=Math.hypot(...cross)/2;assert([a,b,c].every(p=>Math.abs(p[0])<1e-9),'only the shared cut edge gets a skirt');}
  else horizontalArea+=Math.abs(cross[1])/2;
 }
 assert.equal(horizontalArea,1,'the full inside cell is removed and the outside cell survives');assert.equal(seamArea,1,'the aligned one-unit soil edge is completely sealed');
});
