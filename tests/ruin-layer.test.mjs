import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=['src/world/geography.js','src/city/environment.js','src/render/world-renderer.js','src/continuous/atlas-space.js','src/continuous/ruin-layer.js'].map(read).join('\n');
let authored;
const E=Function('LandmarkTemplates',source+';return{ContinuousRuinLayer,AtlasSpace,AtlasRenderer,SoftwareAtlasRenderer,Geometry,project4,GW,GH,MAP_X,MAP_Z};')({build:(recipe,options)=>authored(recipe,options)});
// Analytic synthetic hills let us verify both the exact mounting transform and
// ray occlusion, while retaining production geometry, projection and picking.
E.AtlasSpace.surface=(w,x,y)=>w.surface(x,y);
E.AtlasSpace.point=(w,x,y)=>[(x/(E.GW-1)-.5)*E.MAP_X,w.surface(x,y),(y/(E.GH-1)-.5)*E.MAP_Z];
function world(surface=(x,y)=>2+.08*(x-100)+.03*(y-60)){return{params:{seed:'ruin-layer'},surface};}
function site(id='ruin-a',x=100,y=60){return{id,i:y*E.GW+x,x,y,name:id,span:.72,dragonRuins:{version:1,variant:'ring'},recipe:{id,material:'basalt'}};}
function fixture(w=world()){
 const r=Object.create(E.AtlasRenderer.prototype),deleted=[];
 Object.assign(r,{world:w,relief:1,zoom:80,width:1440,height:900,azimuth:0,elevation:1.1,target:E.AtlasSpace.point(w,100,60),options:{},meshes:{},canvas:{id:'map'},request(){},ground(x,y){return w.surface(x,y);},upload(name,g){this.meshes[name]={vertices:new Float32Array(g.data),buffer:{name},vao:{name}};},gl:{deleteBuffer(b){deleted.push(b.name);},deleteVertexArray(){}}});
 r.updateCamera();r.screen=(x,y)=>{r.updateCamera();const p=E.project4(r.mvp,E.AtlasSpace.point(w,x,y));return[(p[0]/p[3]*.5+.5)*r.width,(.5-p[1]/p[3]*.5)*r.height];};
 const layer=new E.ContinuousRuinLayer(r,{prepareLandscape(){}});layer.bind(w,{},[site()]);return{r,layer,w,deleted};
}
function box(g,x,y,z,w,h,d){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],q=[x-w/2,y,z+d/2],up=p=>[p[0],p[1]+h,p[2]],color=[.4,.43,.38];for(const [p,r] of[[a,b],[b,c],[c,q],[q,a]])g.quad(p,up(p),up(r),r,color);g.quad(up(a),up(q),up(c),up(b),color);g.quad(a,b,c,q,color);}
function model(){
 const geometry=new E.Geometry();box(geometry,-4,0,0,2,8,2);box(geometry,4,0,0,2,8,2);box(geometry,0,8,0,10,1.2,2);
 const ornament=new E.Geometry();box(ornament,0,9.2,0,1,1,1);
 const mount={x:0,z:0,groundY:0,footprint:[10,2],supports:[{x:-4,z:0,w:2,d:2},{x:4,z:0,w:2,d:2}]};
 return{footprint:[36,30],parts:[{id:'gate',name:'Broken gate',role:'masonry',note:'An open portal',geometry,mountGroup:'gate',mount},{id:'crown',name:'Dragon crest',role:'ornament',geometry:ornament,mountGroup:'gate',mount}]};
}
test.beforeEach(()=>{authored=()=>model();});
test('all parts in an assembly remain rigid and support feet join the real sloped ground',async()=>{
 const {layer,w}=fixture(),original=model(),before=original.parts.map(p=>p.geometry.data.slice());authored=()=>original;
 const m=await layer.ensure('ruin-a');assert(m,JSON.stringify(layer.report()));assert.equal(m.groups.size,1);assert.equal(m.parts.length,2);
 const group=m.groups.get('gate');assert(group.top>group.low);const scale=m.frame.scale;
 for(let j=0;j<original.parts.length;j++){
  const local=original.parts[j].geometry.data,v=m.parts[j].geometry.data;
  for(let k=0;k<local.length;k+=9){assert(Math.abs(v[k+1]-(group.y+local[k+1]*scale))<1e-12);assert(Math.abs(Math.hypot(...v.slice(k+3,k+6))-1)<1e-12);}
 }
 assert.deepEqual(original.parts.map(p=>p.geometry.data),before,'mounting never changes authored geometry');
 const foundation=m.parts[0].geometry.data.slice(before[0].length);assert(foundation.length>0);
 for(let k=0;k<foundation.length;k+=9){const [x,y]=E.AtlasSpace.grid(foundation[k],foundation[k+2]),ground=w.surface(x,y);assert(Math.abs(foundation[k+1]-group.y)<1e-10||Math.abs(foundation[k+1]-(ground-.035*scale))<1e-10);assert(Math.abs(Math.hypot(...foundation.slice(k+3,k+6))-1)<1e-10);}
 // Top caps face up; terrain-facing underside faces down; side normals stay horizontal.
 assert(foundation.some((v,k)=>k%9===4&&v>.99));assert(foundation.some((v,k)=>k%9===4&&v<-.9));
});
test('a hill inside an empty gateway cannot lift its separate stone supports',async()=>{
 const {layer}=fixture(world((x,y)=>2+.3*Math.exp(-((x-100)**2+(y-60)**2)/.0001)));
 const m=await layer.ensure('ruin-a');assert(m);assert(m.groups.get('gate').top<2.0001,'only the two actual pillars are sampled');
 const v=m.parts[0].geometry.data,original=model().parts[0].geometry.data.length;
 for(let k=original;k<v.length;k+=9){const localX=(v[k]-m.frame.origin[0])/m.frame.sx;assert(Math.abs(localX)>=3-1e-9,'foundation geometry must not fill the open doorway');}
});
test('rotated foundations stay within their authored support rectangle',async()=>{
 const {layer}=fixture();authored=()=>{const m=model();m.parts=m.parts.slice(0,1);m.parts[0].mount={...m.parts[0].mount,supports:[{x:-4,z:0,w:2,d:1,angle:Math.PI/4}]};return m;};
 const m=await layer.ensure('ruin-a'),support=m.groups.get('gate').supports[0],c=Math.SQRT1_2;
 for(const p of support.points){const x=(p[0]-m.frame.origin[0])/m.frame.sx+4,z=(p[2]-m.frame.origin[2])/m.frame.sz;assert(Math.abs(x*c+z*c)<=1+1e-9);assert(Math.abs(-x*c+z*c)<=.5+1e-9);}
});
test('site rotation applies to the whole assembly, ground survey and transformed normals',async()=>{
 const {layer,w}=fixture(),s={...site(),angle:1.12};layer.bind(w,{},[s]);const local=model(),m=await layer.ensure(s.id),C=Math.cos(s.angle),S=Math.sin(s.angle),group=m.groups.get('gate');
 for(let j=0;j<local.parts.length;j++)for(let k=0;k<local.parts[j].geometry.data.length;k+=9){
  const a=local.parts[j].geometry.data,b=m.parts[j].geometry.data,grid=m.frame.at(a[k],a[k+2]);
  assert(Math.abs(grid[0]-(s.x+(a[k]*C-a[k+2]*S)/36*s.span))<1e-12);
  assert(Math.abs(grid[1]-(s.y+(a[k]*S+a[k+2]*C)/36*s.span))<1e-12);
  const measured=E.AtlasSpace.grid(b[k],b[k+2]);assert(measured.every((v,n)=>Math.abs(v-grid[n])<1e-12));
  const n=[(a[k+3]*C-a[k+5]*S)/m.frame.sx,a[k+4]/m.frame.scale,(a[k+3]*S+a[k+5]*C)/m.frame.sz],length=Math.hypot(...n);assert(n.every((v,t)=>Math.abs(v/length-b[k+3+t])<1e-12));
 }
 for(const support of group.supports)for(const p of support.points){const at=E.AtlasSpace.grid(p[0],p[2]);assert(Math.abs(p[1]-w.surface(...at))<1e-12);}
 layer.bind(w,{},[{...s,angle:0}]);assert.equal(layer.models.size,0,'a changed site bearing invalidates mounted geometry');
});
test('zoom changes reuse the same world scale and upgrade detail only across its threshold',async()=>{
 const {layer,r}=fixture();r.zoom=20;const a=await layer.ensure('ruin-a');assert.equal(a.lod,1);r.zoom=50;assert.equal(await layer.ensure('ruin-a'),a);r.zoom=120;const b=await layer.ensure('ruin-a');assert.equal(b.lod,2);assert.notEqual(a,b);assert.deepEqual(a.bounds,b.bounds);assert.deepEqual(a.parts.map(p=>p.geometry.data),b.parts.map(p=>p.geometry.data));
 assert.equal(layer.visible(b.meshNames[0]),true);r.zoom=15;assert.equal(layer.visible(b.meshNames[0]),false);assert.equal(layer.visible('cm:1:buildings'),null);assert.equal(layer.visible('terrain'),null);
});
test('real triangle picking leaves portals empty and rejects geometry behind terrain',async()=>{
 const {layer,r,w}=fixture(world(()=>2)),m=await layer.ensure('ruin-a');r.elevation=.7;r.zoom=240;
 const screen=point=>{r.updateCamera();const q=E.project4(r.mvp,point);return[(q[0]/q[3]*.5+.5)*r.width,(.5-q[1]/q[3]*.5)*r.height];};
 const group=m.groups.get('gate'),s=m.frame.scale;
 const pillar=[m.frame.origin[0]-4*m.frame.sx,group.y+4*s,m.frame.origin[2]+m.frame.sz];
 const hit=layer.pick(...screen(pillar));assert.equal(hit?.part.id,'gate');assert(hit.distance>0);
 const opening=[m.frame.origin[0],group.y+4*s,m.frame.origin[2]];assert.equal(layer.pick(...screen(opening)),null,'box-only picking would select the empty doorway');
 w.surface=()=>3;assert.equal(layer.pick(...screen(pillar)),null,'a foreground ridge must occlude the ruin');
});
test('view bounds fit desktop and narrow viewports without changing the mounted model',async()=>{
 const {layer,r}=fixture(),m=await layer.ensure('ruin-a'),before=m.parts.map(p=>p.geometry.data.slice());
 for(const [width,height]of[[1480,980],[430,900],[320,844]]){
  Object.assign(r,{width,height});const view=layer.view(m);Object.assign(r,view);r.updateCamera();
  for(const p of view.corners){const q=E.project4(r.mvp,p);assert(Math.abs(q[0]/q[3])<.8);assert(Math.abs(q[1]/q[3])<.74);}
  assert(view.zoom>=60&&view.zoom<=620);assert.equal(layer.view(m,'crown').bounds,m.parts[1].bounds);
 }
 assert.deepEqual(m.parts.map(p=>p.geometry.data),before);
});
test('reset cancels pending work, releases GPU meshes and prevents old-world visibility',async()=>{
 const {layer,r,deleted}=fixture(),m=await layer.ensure('ruin-a');assert.equal(Object.keys(r.meshes).length,m.parts.length);
 const fresh=world(()=>4);r.world=fresh;assert.equal(layer.visible(m.meshNames[0]),false);assert.equal(layer.pick(720,450),null);
 layer.bind(fresh,{},[site()]);assert.equal(layer.models.size,0);assert.equal(Object.keys(r.meshes).length,0);assert.equal(deleted.length,m.parts.length);
 const pending=layer.ensure('ruin-a');layer.reset();assert.equal(await pending,null);assert.equal(layer.models.size,0);assert.equal(Object.keys(r.meshes).length,0);assert.equal(layer.loading,false);
});
test('the bounded streamer loads visible sites only and rejects a retired site',async()=>{
 const {layer,r,w}=fixture(),sites=[site('a'),site('b',101),site('c',102),site('d',103)];layer.bind(w,{},sites);r.screen=()=>[720,450];r.zoom=30;
 await layer.stream();assert.equal(layer.models.size,3);assert([...layer.models.values()].every(m=>m.lod===1));assert.equal(await layer.ensure('d'),null);
 layer.bind(w,{},[sites[1]]);assert.deepEqual([...layer.models.keys()],['b']);assert.equal(await layer.ensure('a'),null);
 r.screen=()=>[-1000,-1000];layer.remove('b');await layer.stream();assert.equal(layer.models.size,0);
});
test('mounted geometry uses the real software renderer upload path and cleans up without WebGL',async()=>{
 const {layer,r}=fixture();r.gl=null;r.upload=E.SoftwareAtlasRenderer.prototype.upload;
 const m=await layer.ensure('ruin-a');assert(m);
 for(const name of m.meshNames){const mesh=r.meshes[name];assert(mesh.vertices instanceof Float32Array);assert.equal(mesh.styles.length,mesh.vertices.length/27);assert(mesh.styles.every(s=>/^rgb\(\d+,\d+,\d+\)$/.test(s)));}
 layer.reset();assert.deepEqual(r.meshes,{});
});
test('current default geography mounts all three real ruins without changing world or population',async t=>{
 const {scripts}=await import('../scripts/manifest.mjs'),{fantasyDefaults}=await import('./engine-loader.mjs');
 const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(read).join('\n')+'\n'+read('src/continuous/ruin-layer.js');
 const A=Function(code+';return{generateWorld,createCivilization,physicalFingerprint,settlementFingerprint,DragonRuins,LandmarkTemplates,ContinuousRuinLayer,AtlasSpace,AtlasRenderer,LandscapeRelief,exportGeometryGLB};')();
 const w=await A.generateWorld(fantasyDefaults),s=A.createCivilization(w,{realms:18,historySeed:'First-dawn'}),before=[A.physicalFingerprint(w),A.settlementFingerprint(s)],sites=A.DragonRuins.sites(w,s);assert.equal(sites.length,3);
 const r=Object.create(A.AtlasRenderer.prototype);Object.assign(r,{world:w,sim:s,relief:1,zoom:120,width:1480,height:980,target:[0,0,0],azimuth:0,elevation:.9,meshes:{},options:{},canvas:{id:'map'},request(){},ground(x,y){return A.AtlasSpace.surface(w,x,y,1);},upload(name,g){this.meshes[name]={vertices:new Float32Array(g.data)};}});
 const layer=new A.ContinuousRuinLayer(r,{prepareLandscape(){A.LandscapeRelief.prepare(w,s);}});layer.bind(w,s,sites);
 for(const site of sites){
  const m=await layer.ensure(site.id);assert(m,JSON.stringify(layer.report()));assert.equal(m.frame.angle,site.angle);assert(m.triangles>5000&&m.triangles<15000);assert(m.groups.size>=18);
  const original=A.LandmarkTemplates.build(site.recipe,{base:false,lod:2});
  for(let j=0;j<m.parts.length;j++){
   const p=m.parts[j],base=original.parts[j],group=m.groups.get(base.mountGroup);
   for(let k=0;k<base.geometry.data.length;k+=9){const v=p.geometry.data,local=base.geometry.data;assert(Math.abs(v[k+1]-(group.y+local[k+1]*m.frame.scale))<1e-11);assert(Math.abs(Math.hypot(...v.slice(k+3,k+6))-1)<1e-10);}
   // Every added footing vertex is either on the common rigid datum or sunk
   // slightly into the exact geographic surface at that particular X/Z.
   for(let k=base.geometry.data.length;k<p.geometry.data.length;k+=9){const v=p.geometry.data,grid=A.AtlasSpace.grid(v[k],v[k+2]),ground=A.AtlasSpace.surface(w,...grid,1);assert(Math.abs(v[k+1]-group.y)<1e-10||Math.abs(v[k+1]-(ground-.035*m.frame.scale))<1e-10);}
  }
  const glb=Buffer.from(A.exportGeometryGLB(A.LandmarkTemplates.meshes(m),{site:site.id}));assert.equal(glb.readUInt32LE(0),0x46546c67);assert(glb.length>100000);
  t.diagnostic(JSON.stringify({id:site.id,name:site.name,x:site.x,y:site.y,angle:site.angle,triangles:m.triangles,groups:m.groups.size,glbBytes:glb.length}));
 }
 assert.deepEqual([A.physicalFingerprint(w),A.settlementFingerprint(s)],before);assert.equal(layer.models.size,3);layer.reset();assert.deepEqual(r.meshes,{});
});
