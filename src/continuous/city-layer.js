/** A bounded streaming city layer inside the atlas renderer. Never opens a scene.
 * Fine terrain resolves the same four-corner height patches used to seat towns.
 * Local building assemblies are rigidly seated on that field; no baked backdrops.
 */
// Render-only excavation masks. Subtract convex outlines from terrain triangles;
// interpolate the original surface attributes at every new edge intersection.
// This also produces ordinary meshes for the software renderer and GLB export.
const ExcavationTerrain=(()=>{
 const EPS=1e-11;
 function prepare(outline,floorY,buildingId){
  if(!Number.isFinite(floorY)||!Array.isArray(outline)||outline.length<3)return null;
  const points=outline.map(p=>[p[0],p[1]]);if(points.some(p=>!p.every(Number.isFinite)))return null;
  let area=0;for(let j=0;j<points.length;j++){const a=points[j],b=points[(j+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}
  if(Math.abs(area)<EPS)return null;if(area<0)points.reverse();
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const p of points){bounds.minX=Math.min(bounds.minX,p[0]);bounds.maxX=Math.max(bounds.maxX,p[0]);bounds.minZ=Math.min(bounds.minZ,p[1]);bounds.maxZ=Math.max(bounds.maxZ,p[1]);}
  return{buildingId,outline:points,floorY,bounds};
 }
 function contains(hole,x,z){const b=hole.bounds;if(x<b.minX-EPS||x>b.maxX+EPS||z<b.minZ-EPS||z>b.maxZ+EPS)return false;
  for(let j=0;j<hole.outline.length;j++){const a=hole.outline[j],b=hole.outline[(j+1)%hole.outline.length];if((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])< -EPS)return false;}return true;
 }
 function mix(a,b,t){return a.map((v,j)=>v+(b[j]-v)*t);}
 function normalise(v){const n=Math.hypot(v[3],v[4],v[5])||1;if(Math.abs(n-1)<1e-9)return v;const p=v.slice();for(let j=3;j<6;j++)p[j]/=n;return p;}
 function split(poly,a,b){const inside=[],outside=[],distance=p=>(b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length];let dp=distance(p),dq=distance(q);if(Math.abs(dp)<EPS)dp=0;if(Math.abs(dq)<EPS)dq=0;
   if(dp>=0)inside.push(p);if(dp<=0)outside.push(p);
   if(dp*dq<0){const hit=mix(p,q,dp/(dp-dq));inside.push(hit);outside.push(hit);}
  }return{inside,outside};
 }
 function overlaps(poly,hole){const b=hole.bounds;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of poly){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);}
  return maxX>b.minX+EPS&&minX<b.maxX-EPS&&maxZ>b.minZ+EPS&&minZ<b.maxZ-EPS;
 }
 function subtract(poly,hole){if(!overlaps(poly,hole))return[poly];const fragments=[];let remaining=poly;
  for(let j=0;j<hole.outline.length&&remaining.length>=3;j++){
   const{inside,outside}=split(remaining,hole.outline[j],hole.outline[(j+1)%hole.outline.length]);if(outside.length>=3)fragments.push(outside);remaining=inside;
  }return fragments;
 }
 // Close the soil at the exact clipped edge, where the sloped terrain meets
 // a level retaining wall. Reusing intersection vertices prevents hairline gaps.
 function skirts(g,poly,holes){
  const wall=(a,b,y)=>{const da=a[1]-y,db=b[1]-y;if(Math.abs(da)<EPS&&Math.abs(db)<EPS)return;
   if(da*db<0){const m=mix(a,b,da/(da-db));m[1]=y;wall(a,m,y);wall(m,b,y);return;}
   const A=a.slice(0,3),B=b.slice(0,3),C=[a[0],y,a[2]],D=[b[0],y,b[2]],color=[6,7,8].map(j=>(a[j]+b[j])*.38);
   if(Math.abs(da)>EPS)g.tri(A,C,B,color);if(Math.abs(db)>EPS)g.tri(C,D,B,color);
  };
  for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];if(Math.hypot(a[0]-b[0],a[2]-b[2])<EPS)continue;
   for(const h of holes){if(!Number.isFinite(h.groundY))continue;
    for(let k=0;k<h.outline.length;k++){const p=h.outline[k],q=h.outline[(k+1)%h.outline.length],dx=q[0]-p[0],dz=q[1]-p[1],length2=dx*dx+dz*dz;
     if(length2<EPS*EPS)continue;
     const on=v=>Math.abs(dx*(v[2]-p[1])-dz*(v[0]-p[0]))<EPS;
     if(on(a)&&on(b)){const u=((a[0]-p[0])*dx+(a[2]-p[1])*dz)/length2,v=((b[0]-p[0])*dx+(b[2]-p[1])*dz)/length2,lo=Math.max(0,Math.min(u,v)),hi=Math.min(1,Math.max(u,v));
      if(hi-lo>EPS)wall(mix(a,b,(lo-u)/(v-u)),mix(a,b,(hi-u)/(v-u)),h.groundY);break;
     }
    }
   }
  }
 }
 function triangle(g,a,b,c,holes){const minX=Math.min(a[0],b[0],c[0]),maxX=Math.max(a[0],b[0],c[0]),minZ=Math.min(a[2],b[2],c[2]),maxZ=Math.max(a[2],b[2],c[2]),near=[];
  for(const hole of holes){const b=hole.bounds;if(maxX>=b.minX-EPS&&minX<=b.maxX+EPS&&maxZ>=b.minZ-EPS&&minZ<=b.maxZ+EPS)near.push(hole);}
  if(!near.length){g.smoothTri(a,b,c);return;}let fragments=[[a,b,c]];
  for(const hole of near){const next=[];for(const poly of fragments)next.push(...subtract(poly,hole));fragments=next;if(!fragments.length)return;}
  for(const poly of fragments){skirts(g,poly,near);for(let j=1;j<poly.length-1;j++){const p=poly[0],q=poly[j],r=poly[j+1];if(Math.abs((q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0]))>EPS)g.smoothTri(normalise(p),normalise(q),normalise(r));}}
 }
 // Subterranean courts enter at one authored street threshold. Seat that point
 // on the inherited terrain instead of lifting the whole court to a parcel summit.
 function seat(items,frame){for(const item of items||[]){const p=item.entrance,anchor=frame.anchors.get(item.buildingId);if(!anchor||!Array.isArray(p)||p.length<2||!p.every(Number.isFinite))continue;
  const y=frame.ground(p[0],p[1]);if(Number.isFinite(y))anchor.y=y;
 }return frame;}
 // Geometry was already mounted in the worker. Restore its exact entry anchor
 // after cityFrame reconstruction so selection and camera targets agree with it.
 function restore(holes,frame){for(const hole of holes||[]){const anchor=frame.anchors.get(hole.buildingId);if(anchor&&Number.isFinite(hole.groundY))anchor.y=hole.groundY;}return frame;}
 function map(items,frame){const result=[];for(const item of items||[]){const anchor=frame.anchors.get(item.buildingId);if(!anchor)continue;
  const outline=item.outline.map(([x,z])=>{const p=frame.vertex(x,item.floorY,z,anchor);return[p[0],p[2]];}),first=item.outline[0];if(!first)continue;
  const hole=prepare(outline,frame.vertex(first[0],item.floorY,first[1],anchor)[1],item.buildingId);if(hole){
   hole.groundY=anchor.y;if(Array.isArray(item.entrance)&&item.entrance.length>=2&&item.entrance.every(Number.isFinite)){const p=frame.vertex(item.entrance[0],anchor.b.y,item.entrance[1],anchor);hole.entrance=[p[0],p[2]];}result.push(hole);
  }
 }return result;}
 return{prepare,contains,subtract,triangle,seat,restore,map};
})();
const SEASON_SNOW=rgb('#e9f1f4');
class ContinuousCityLayer {
 constructor(r){this.r=r;this.world=null;this.sim=null;this.models=new Map();this.pending=new Set();this.failed=new Set();this.focusId=null;this.epoch=0;this.natural=false;this.loading=false;this.sequence=0;this.preparing=null;this.onChange=()=>{};this.maxModels=2;this.lastTerrainKey=null;this.lastExcavationKey='closed';this.retess=0;this.reriver=0;this.lastRiverKey=null;this.lastEnvironmentKey='none';this.reflora=0;this.worker=null;this.workerId=0;this.workerJobs=new Map();this.workerWorld=null;}
 key(p){return `${p.id}/${TownCatalog.signature(TownCatalog.resolve(this.world,this.sim,p))}/${JSON.stringify(this.sim.cityState?.[p.id]||{})}/${JSON.stringify(this.sim.landmarkRecipes||{})}/${this.sim.realms[p.owner]?.id}`;}
 remove(id){const a=this.models.get(id);if(!a)return;for(const key of a.meshNames)this.drop(key);this.models.delete(id);this.lastRiverKey=null;if(this.world&&this.r.world===this.world)this.r.buildRivers?.();
  if(a.excavations?.length){this.lastTerrainKey=null;if(this.world&&this.r.world===this.world){this.r.buildTerrain?.();this.r.request?.();}}
 }
 drop(key){const r=this.r,m=r.meshes[key];if(!m)return;if(r.gl){r.gl.deleteBuffer(m.buffer);r.gl.deleteVertexArray(m.vao);}delete r.meshes[key];r.dirtyShadow=true;}
 reset(w,s){const hadOpenings=this.activeExcavations().length>0;this.epoch++;clearTimeout(this.retess);clearTimeout(this.reflora);clearTimeout(this.reriver);this.lastRiverKey=null;clearTimeout(this.timer);this.lastEnvironmentKey='none';this.lastTerrainKey=null;this.lastExcavationKey='closed';if(this.worker){this.worker.terminate();this.worker=null;for(const job of this.workerJobs.values())job.reject(new Error('World replaced'));this.workerJobs.clear();this.workerWorld=null;}for(const id of [...this.models.keys()])this.remove(id);this.pending.clear();this.failed.clear();this.focusId=null;this.preparing=null;this.world=w;this.sim=s;this.loading=false;this.natural=false;this.r.continuousModels=this.models;if(hadOpenings&&this.r.world===w)this.r.buildTerrain?.();this.r.request();}
 bind(w,s){if(w!==this.world||(this.sim&&s!==this.sim))this.reset(w,s);else this.sim=s;}
 activeExcavations(){if(this.r.world&&this.r.world!==this.world)return[];return this.r.zoom>=AtlasSpace.DETAIL_ZOOM?[...this.models.values()].filter(m=>this.visible(`cm:${m.p.id}:buildings`)===true).flatMap(m=>m.excavations||[]):[];}
 excavationKey(){const holes=this.activeExcavations();return holes.length?holes.map(h=>[h.buildingId,h.floorY,...h.outline.flat()].join(',')).join(';'):'closed';}
 // Grid coordinates and atlas heights, matching renderer.ground/AtlasSpace.surface.
 ground(x,y){const w=this.r.world||this.world;if(!w)return 0;const holes=this.activeExcavations(),px=(x/(GW-1)-.5)*MAP_X,pz=(y/(GH-1)-.5)*MAP_Z;let floor=Infinity;
  for(const hole of holes)if(ExcavationTerrain.contains(hole,px,pz))floor=Math.min(floor,hole.floorY);
  return Number.isFinite(floor)?floor:(this.natural?AtlasSpace.surface:AtlasSpace.coarseSurface)(w,x,y,this.r.relief);
 }
 get lowestFloor(){return Math.min(-.1,...this.activeExcavations().map(h=>h.floorY));}
 // A thin opening can sit entirely between the regular terrain-ray samples.
 // Add its exact entry/exit and floor intersections, plus samples on either side
 // of each discontinuity, so the caller can retain its existing bracket/bisect.
 groundBreakpoints(origin,dir,start,end){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return[];const values=new Set(),epsilon=1e-7;
  const add=t=>{if(!Number.isFinite(t)||t<=start||t>=end)return;for(const d of[-epsilon,0,epsilon]){const at=t+d;if(at>start&&at<end)values.add(at);}};
  for(const hole of this.activeExcavations()){
   for(let j=0;j<hole.outline.length;j++){const a=hole.outline[j],b=hole.outline[(j+1)%hole.outline.length],ex=b[0]-a[0],ez=b[1]-a[1],qx=a[0]-origin[0],qz=a[1]-origin[2],det=dir[0]*ez-dir[2]*ex;
    if(Math.abs(det)<1e-14)continue;const t=(qx*ez-qz*ex)/det,u=(qx*dir[2]-qz*dir[0])/det;
    if(u>=-1e-10&&u<=1+1e-10)add(t);
   }
   if(Math.abs(dir[1])>1e-14){const t=(hole.floorY-origin[1])/dir[1],x=origin[0]+dir[0]*t,z=origin[2]+dir[2]*t;if(ExcavationTerrain.contains(hole,x,z))add(t);}
  }return[...values].sort((a,b)=>a-b);
 }


 // Screen-space tessellation: one parent grid cell can cover a large part of the
 // screen once the camera closes in, and its two flat faces then read as two
 // wedges rather than as ground. Resolve the curved four-corner patches at about
 // twelve pixels per subdivision. Dyadic levels share exact sample coordinates;
 // the mesh budget below limits the cost on wide or very low-angle views.
 tessellation(){const r=this.r;if(!r.width||!r.zoom)return 1;r.updateCamera();const perCell=r.width/Math.max(1e-6,2*r.halfW)*AtlasSpace.X;return 2**Math.ceil(Math.log2(clamp(perCell/12,1,128)));}
 // Grid-space bounds of the ground the camera can currently see. A tilted
 // orthographic view stretches along its forward axis, so screen height covers
 // halfH/sin(elevation) of ground rather than halfH; a square reach around the
 // target would refine several times more terrain than is ever on screen.
 viewBox(){const r=this.r;r.updateCamera();const fw=r.halfH/Math.max(.2,Math.sin(r.elevation)),fx=-Math.sin(r.azimuth),fz=-Math.cos(r.azimuth);
  let x0=1/0,x1=-1/0,z0=1/0,z1=-1/0;
  for(const a of[-1,1])for(const b of[-1,1]){const px=r.target[0]+r.right[0]*r.halfW*a+fx*fw*b,pz=r.target[2]+r.right[2]*r.halfW*a+fz*fw*b;x0=Math.min(x0,px);x1=Math.max(x1,px);z0=Math.min(z0,pz);z1=Math.max(z1,pz);}
  const lo=AtlasSpace.grid(x0,z0),hi=AtlasSpace.grid(x1,z1);return{x0:lo[0]-2,x1:hi[0]+2,y0:lo[1]-2,y1:hi[1]+2};}
 // Terrain is only rebuilt when this changes, so a continuous zoom crosses a
 // handful of discrete refinement steps instead of remeshing every frame.
 terrainKey(){const n=this.tessellation(),openings=this.excavationKey();if(n<=1&&!this.natural)return 'base/'+this.r.layer+'/'+this.r.relief+'/'+openings;const b=this.viewBox();return [n,Math.floor(b.x0+2),Math.floor(b.y0+2),Math.ceil(b.x1-2),Math.ceil(b.y1-2),this.natural,this.r.layer,this.r.relief,this.r.width,this.r.height,[...this.models.keys()].join(','),openings].join('/');}
 // One continuous normal field for shading, derived once per world from the same
 // height field by central differences. Refined vertices interpolate it, so coarse
 // and refined patches meet without a shading seam. Shading only: every vertex
 // still sits exactly on the shared height patch.
 normalField(){const r=this.r,w=r.world;if(this.normalWorld===w&&this.normalRelief===r.relief)return this.normals;
  const n=new Float32Array(GN*3),ix=1/(2*AtlasSpace.X),iz=1/(2*AtlasSpace.Z),h=(x,y)=>AtlasSpace.height(w,cell(x,y),r.relief);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){const o=cell(x,y)*3,dx=(h(x+1,y)-h(x-1,y))*ix,dz=(h(x,y+1)-h(x,y-1))*iz,l=Math.sqrt(dx*dx+1+dz*dz);n[o]=-dx/l;n[o+1]=1/l;n[o+2]=-dz/l;}
  this.normals=n;this.normalWorld=w;this.normalRelief=r.relief;return n;
 }
 // This renders the whole world, not a circular/square platform beneath the town.
 buildTerrain(){const r=this.r,w=r.world;if(!w)return;const g=new Geometry(),near=this.natural,areas=[...this.models.values()].map(m=>m.p);
  const field=this.normalField(),tess=this.tessellation(),box=this.viewBox(),openings=this.activeExcavations();
  const emit=openings.length?(a,b,c)=>ExcavationTerrain.triangle(g,a,b,c,openings):(a,b,c)=>g.smoothTri(a,b,c);
  // Only visible cells receive the finest level. A coarse collar and cached town
  // surroundings keep panning continuous without subdividing the entire world.
  const core={x0:Math.floor(box.x0+2),x1:Math.ceil(box.x1-2),y0:Math.floor(box.y0+2),y1:Math.ceil(box.y1-2)},levels=new Uint8Array(GN);
  let detail=tess,estimated;
  do{estimated=0;for(let y=0;y<GH-1;y++)for(let x=0;x<GW-1;x++){
   const visible=x>=core.x0&&x<core.x1&&y>=core.y0&&y<core.y1,collar=x>=core.x0-2&&x<core.x1+2&&y>=core.y0-2&&y<core.y1+2;
   let n=visible?detail:collar?Math.max(1,Math.min(8,detail/2)):1;
   if(near&&areas.some(p=>Math.abs(p.x-x)<9&&Math.abs(p.y-y)<8))n=Math.max(n,4);
   levels[y*GW+x]=n;estimated+=n*n*2;
  }if(estimated>300000&&detail>1)detail/=2;else break;}while(true);
  const colors=new Float32Array(GN*3);
  for(let i=0;i<GN;i++){let c=r.palette(i);if(near&&w.height[i]>0){c=CityEnvironment.cellColor(w,i);const cover=CityEnvironment.cellCover(w,i);if(cover>.05)c=colorMix(c,SEASON_SNOW,clamp(cover*.80));}colors.set(c,i*3);}
  // 256 also represents the centre of a 1/128 cell, used by boundary stitching.
  // Fine and coarse neighbours share these vertices, colours and shading normals.
  const vertices=new Map();
  const vertex=(x,y)=>{const k=Math.round(x*256)*(GH*256+1)+Math.round(y*256);let a=vertices.get(k);if(a)return a;
   const p=AtlasSpace.point(w,x,y,r.relief);
   if(!near)p[1]=AtlasSpace.coarseSurface(w,x,y,r.relief);
   const ax=Math.min(GW-1,Math.floor(x)),ay=Math.min(GH-1,Math.floor(y)),u=x-ax,v=y-ay;
   const i0=cell(ax,ay)*3,i1=cell(ax+1,ay)*3,i2=cell(ax,ay+1)*3,i3=cell(ax+1,ay+1)*3;
   const nx=lerp(lerp(field[i0],field[i1],u),lerp(field[i2],field[i3],u),v),ny=lerp(lerp(field[i0+1],field[i1+1],u),lerp(field[i2+1],field[i3+1],u),v),nz=lerp(lerp(field[i0+2],field[i1+2],u),lerp(field[i2+2],field[i3+2],u),v);
   const l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
   // A triangle-based colour interpolation kept the original giant diagonal
   // visible even after its geometry was refined. Colour follows the same patch.
   const channel=k=>lerp(lerp(colors[i0+k],colors[i1+k],u),lerp(colors[i2+k],colors[i3+k],u),v);
   const cr=channel(0),cg=channel(1),cb=channel(2);
   a=[p[0],p[1],p[2],nx/l,ny/l,nz/l,cr,cg,cb];vertices.set(k,a);return a;
  };
  for(let y=0;y<GH-1;y++)for(let x=0;x<GW-1;x++){
   const n=levels[y*GW+x],left=x?levels[y*GW+x-1]:n,right=x<GW-2?levels[y*GW+x+1]:n,top=y?levels[(y-1)*GW+x]:n,bottom=y<GH-2?levels[(y+1)*GW+x]:n;
   const s=n+1,V=[];
   for(let j=0;j<s;j++)for(let i=0;i<s;i++)V.push(vertex(x+i/n,y+j/n));
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*s+i,b=a+1,c=a+s,d=c+1;
    if(i===0&&left>n||i===n-1&&right>n||j===0&&top>n||j===n-1&&bottom>n){
     const edge=[V[a]];
     if(i===0)for(let k=1;k<left/n;k++)edge.push(vertex(x,y+j/n+k/left));edge.push(V[c]);
     if(j===n-1)for(let k=1;k<bottom/n;k++)edge.push(vertex(x+i/n+k/bottom,y+1));edge.push(V[d]);
     if(i===n-1)for(let k=1;k<right/n;k++)edge.push(vertex(x+1,y+(j+1)/n-k/right));edge.push(V[b]);
     if(j===0)for(let k=1;k<top/n;k++)edge.push(vertex(x+(i+1)/n-k/top,y));
     const center=vertex(x+(i+.5)/n,y+(j+.5)/n);for(let k=0;k<edge.length;k++)emit(center,edge[k],edge[(k+1)%edge.length]);
    }else if((x+y)%2){emit(V[a],V[c],V[b]);emit(V[b],V[c],V[d]);}else{emit(V[a],V[c],V[d]);emit(V[a],V[d],V[b]);}
   }
  }
  const c=rgb('#4d859e'),a=-MAP_X/2,b=MAP_X/2,n=-MAP_Z/2,s=MAP_Z/2,R=500;
  g.quad([-R,-.015,-R],[-R,-.015,n],[R,-.015,n],[R,-.015,-R],c);g.quad([-R,-.015,s],[-R,-.015,R],[R,-.015,R],[R,-.015,s],c);g.quad([-R,-.015,n],[-R,-.015,s],[a,-.015,s],[a,-.015,n],c);g.quad([b,-.015,n],[b,-.015,s],[R,-.015,s],[R,-.015,n],c);
  r.upload('terrain',g,true,near?0:r.layer==='relief'?0:.30);this.terrainTriangles=g.data.length/27;this.terrainDetail=detail;this.terrainTarget=tess;this.lastTerrainKey=this.terrainKey();this.lastExcavationKey=this.excavationKey();r.selectionKey=null;
 }
 // Zooming in used to STRIP the world. Everything the atlas draws to say what a place
 // is — trees, dunes, glacier tongues, sea ice, reeds — is hidden past 4.8 because those
 // symbols are sized for the whole map, and the only thing that replaced them was a patch
 // of vegetation inside each loaded town's own 22x18 cell box. Beyond that box the
 // landscape went bare, so approaching a lake or a mountain showed you LESS of it than
 // the world view did. This is the replacement: the same climate vocabulary, at a spacing
 // that follows the camera, over everything currently on screen.
 environmentKey(){
  if(!this.natural)return 'none';
  const b=this.viewBox(),q=v=>Math.round(v/4);
  return [this.step().toFixed(2),q(b.x0),q(b.y0),q(b.x1),q(b.y1),this.r.layer].join('/');
 }
 // Plant spacing in parent cells. Closer camera, finer scatter — bounded at both ends so
 // a regional view does not try to plant a continent and a rooftop view does not plant a
 // lawn one blade at a time.
 // Spacing is chosen against a sample BUDGET, not against zoom alone. Zoom alone put
 // 33,000 samples and 419k triangles on screen at zoom 16 and took 731 ms to remesh,
 // because the window shrinks more slowly than the spacing does in the middle of the
 // range. Solving for the step keeps the cost flat wherever the camera is.
 step(){
  const r=this.r;r.updateCamera();
  const b=this.viewBox(),cells=Math.max(1,(b.x1-b.x0)*(b.y1-b.y0));
  const perCell=r.width/Math.max(1e-6,2*r.halfW)*AtlasSpace.X;
  return clamp(Math.max(9/perCell,Math.sqrt(cells/13000)),.13,.62);
 }
 buildEnvironment(){
  const r=this.r,w=r.world;
  if(!w||!this.natural){for(const name of ['cm:env:flora','cm:env:rock','cm:env:reeds','cm:env:ice','cm:env:falls'])this.drop(name);this.lastEnvironmentKey='none';return;}
  const flora=new Geometry(),rock=new Geometry(),reeds=new Geometry(),ice=new Geometry(),falls=new Geometry();
  const box=this.viewBox(),step=this.step(),towns=[...this.models.values()].map(m=>m.p);
  const x0=Math.max(1,Math.floor(box.x0)),x1=Math.min(GW-2,Math.ceil(box.x1));
  const y0=Math.max(1,Math.floor(box.y0)),y1=Math.min(GH-2,Math.ceil(box.y1));
  const relief=r.relief,rnd=(a,b,salt)=>hash2(Math.round(a*97),Math.round(b*97),w.seed+salt);
  const X=AtlasSpace.X,Z=AtlasSpace.Z;
  const grade=(gx,gy)=>{const e=.5;
   const dx=(AtlasSpace.surface(w,gx+e,gy,relief)-AtlasSpace.surface(w,gx-e,gy,relief))/(2*e*X);
   const dz=(AtlasSpace.surface(w,gx,gy+e,relief)-AtlasSpace.surface(w,gx,gy-e,relief))/(2*e*Z);
   return Math.hypot(dx,dz);};
  let plants=0,stones=0,cataracts=0;
  for(let gy=y0;gy<=y1;gy+=step)for(let gx=x0;gx<=x1;gx+=step){
   const jx=gx+(rnd(gx,gy,31)-.5)*step*1.5,jy=gy+(rnd(gx,gy,37)-.5)*step*1.5;
   if(jx<1||jx>=GW-1||jy<1||jy>=GH-1)continue;
   // A loaded town plants its own ground; do not stack a second forest on its streets.
   if(towns.some(p=>Math.abs(p.x-jx)<11.5&&Math.abs(p.y-jy)<9.5))continue;
   const e=CityEnvironment.sample(w,jx,jy);
   if(e.water)continue;
   const v=AtlasSpace.point(w,jx,jy,relief),roll=rnd(gx,gy,43);
   if(e.ice>25){
    if(roll<.30){const sz=.05+rnd(gx,gy,47)*.05;
     ice.cone(v[0],v[1],v[2],sz*1.6,sz*.7,sz*1.3,rgb('#dcefef'),5,rnd(gx,gy,53)*6);}
    continue;
   }
   if([18,19,20].includes(e.biome)&&roll<.5){
    const unit=AtlasSpace.TOWN_UNIT;
    for(let k=0;k<3;k++)reeds.cone(v[0]+(k-1)*.4*unit,v[1],v[2]+(k%2)*.35*unit,.14*unit,.035*unit,(1.2+(k%2)*.4)*unit,rgb('#426f59'),4);
    continue;
   }
   const steep=grade(jx,jy);
   if(steep>.62&&roll<.34){
    const sz=.045+rnd(gx,gy,59)*.055;
    rock.cone(v[0],v[1],v[2],sz,sz*.45,sz*.9,colorScale(rgb('#8d8878'),.86+rnd(gx,gy,61)*.3),5,rnd(gx,gy,67)*6);
    stones++;continue;
   }
   const can=CityEnvironment.canopy(e.biome,e.temperature,e.aridity);
   const leaf=CityEnvironment.leafColor(e.temperature,e.aridity);
   if(can.density>0&&roll<can.density*.85){
    const h=CityEnvironment.treeHeight(can.form,rnd(gx,gy,71))*AtlasSpace.TOWN_UNIT;
    plantForm(flora,v,can.form,h,leaf,()=>rnd(gx,gy,73),true);
    plants++;
   }else if(e.temperature>2&&e.aridity>.35&&roll<.42){
    // Open ground is not bare ground. A meadow reads as ground cover, not as trees.
    const t=(.35+rnd(gx,gy,79)*.25)*AtlasSpace.TOWN_UNIT,col=colorScale(leaf,1.06+rnd(gx,gy,83)*.16);
    for(let k=0;k<2;k++)flora.cone(v[0]+(k-.5)*t*1.5,v[1],v[2]+(k-.5)*t*1.2,t*.55,0,t*2.6,col,4);
    plants++;
   }
  }
  // Where a channel drops hard, it falls. The same measurement the Weeping Stair legend
  // is chosen by, applied everywhere the camera can see it.
  const down=w.riverDown||w.down;
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){
   const i=gy*GW+gx,d=down?.[i];
   if(d==null||d<0||w.height[i]<=0||w.lake[i]>0)continue;
   if(w.flow[i]<(w.channelThreshold?.[i]||w.riverThreshold)*2)continue;
   const drop=w.height[i]-w.height[d];
   if(drop<160)continue;
   const a=AtlasSpace.point(w,gx,gy,relief),b=AtlasSpace.point(w,d%GW,d/GW|0,relief);
   const run=Math.hypot(b[0]-a[0],b[2]-a[2])||1e-6;
   if((a[1]-b[1])/run<.55)continue;
   const width=clamp(.03+Math.sqrt(w.flow[i]/(w.channelThreshold?.[i]||w.riverThreshold))*.02,.035,.13);
   const white=rgb('#e8f4f2');
   for(let k=0;k<5;k++){
    const t0=k/5,t1=(k+1)/5;
    const p0=[lerp(a[0],b[0],t0),lerp(a[1],b[1],t0),lerp(a[2],b[2],t0)];
    const p1=[lerp(a[0],b[0],t1),lerp(a[1],b[1],t1),lerp(a[2],b[2],t1)];
    falls.line(p0,p1,width*(1+t0*.5),white);
   }
   falls.blob(b[0],b[1]+width*1.5,b[2],width*2.1,rgb('#eef7f4'),.75);
   cataracts++;
  }
  r.upload('cm:env:flora',flora,true);
  r.upload('cm:env:rock',rock,true);
  r.upload('cm:env:reeds',reeds,true);
  r.upload('cm:env:ice',ice,true,.15);
  r.upload('cm:env:falls',falls,false,.30);
  this.environmentStats={plants,stones,cataracts,step:+step.toFixed(3),
   cells:(x1-x0+1)*(y1-y0+1),triangles:(flora.data.length+rock.data.length+reeds.data.length+ice.data.length+falls.data.length)/27};
  this.lastEnvironmentKey=this.environmentKey();
 }
 build(p){const w=this.world,s=this.sim,c=generateCity(w,s,p.id),collector=createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(c,p,s.realms[p.owner],s.cityState?.[p.id]||{});
  const frame=AtlasSpace.cityFrame(w,p,c,this.r.relief);ExcavationTerrain.seat(collector.excavations,frame);
  const model={p,city:c,frame,key:this.key(p),meshNames:[],last:++this.sequence,heights:collector.landmarkHeights,excavations:ExcavationTerrain.map(collector.excavations,frame),triangles:0};
  const excavatedBuildings=new Set(model.excavations.map(h=>h.buildingId));
  for(const[name,m]of Object.entries(collector.meshes)){
   if(!['buildings','roofs','details','streets','farms','cityWalls','trees','port'].includes(name))continue;
   const g=new Geometry(),data=m.vertices,ranges=collector.buildingRanges[name]||[];let rangeIndex=0;
   for(let k=0;k<data.length;k+=27){
    while(rangeIndex<ranges.length&&ranges[rangeIndex].end<=k)rangeIndex++;
    const range=ranges[rangeIndex],anchor=range&&range.start<=k?frame.anchors.get(range.id):null,pts=[];
    for(let j=0;j<3;j++){const t=k+j*9;const q=frame.vertex(data[t],data[t+1],data[t+2],anchor);
     // Footings reach the actual slope instead of hovering below flat compounds.
     if(anchor&&!excavatedBuildings.has(range.id)&&data[t+1]<anchor.b.y-.015)q[1]=Math.min(q[1],frame.ground(data[t],data[t+2])-.006);
     pts.push(q);
    }g.tri(pts[0],pts[1],pts[2],[data[k+6],data[k+7],data[k+8]]);
   }
   const key=`cm:${p.id}:${name}`;this.r.upload(key,g,m.shadow,m.unlit,1);model.meshNames.push(key);model.triangles+=g.data.length/27;
  }
  // RiverDetail renders inherited city tributaries with the parent channels.
  // A second fixed-resolution stream ribbon would overlap the same river.

  const vegetation=new Geometry();
  for(let dy=-9;dy<=9;dy+=.43)for(let dx=-11;dx<=11;dx+=.43){const gx=p.x+dx+noise(dx*3,dy*3,w.seed)*.10,gy=p.y+dy+noise(dx*3,dy*3,w.seed+6)*.10;if(gx<0||gx>=GW||gy<0||gy>=GH)continue;
   const e=CityEnvironment.sample(w,gx,gy);if(e.water||e.ice>12||hash2(Math.round(dx*100),Math.round(dy*100),w.seed+11)>e.treeDensity*.65)continue;
   const [lx,lz]=[(gx-p.x)*c.width/frame.cells,(gy-p.y)*c.width/frame.cells];
   if(Math.abs(lx)<=c.width/2&&Math.abs(lz)<=c.depth/2&&(c.road[c.index(lx,lz)]||c.buildings.some(b=>Math.abs(b.x-lx)<b.w/2+2&&Math.abs(b.z-lz)<b.d/2+2)))continue;
   const v=AtlasSpace.point(w,gx,gy,this.r.relief);
   // Same form vocabulary and climate colour as the town scene and the atlas symbols,
   // replacing a bare temperature<10 cone/blob switch in two fixed greens.
   const form=CityEnvironment.canopy(e.biome,e.temperature,e.aridity).form;
   const h=CityEnvironment.treeHeight(form,hash2(dx*100,dy*100,w.seed))*frame.scale;
   plantForm(vegetation,v,form,h,CityEnvironment.leafColor(e.temperature,e.aridity),()=>hash2(Math.round(dx*61),Math.round(dy*61),w.seed+17));
  }
  this.r.upload(`cm:${p.id}:vegetation`,vegetation,true);model.meshNames.push(`cm:${p.id}:vegetation`);
  // Screen-scale LOD: readable roofs at regional zoom; fine carved assemblies close up.
  // Regional LOD. This is what a whole town looks like between TOWN_ZOOM and DETAIL_ZOOM, so it is the
  // view most of the map is seen in — and every building in every town on the world
  // shared one beige wall and one slate roof, with the wall not even asking which
  // town it belonged to. Each silhouette now takes the same paint the detailed mesh
  // will give that same building, so closing in changes the geometry, not the colour.
  const low=new Geometry();for(const b of c.buildings){const a=frame.anchors.get(b.id),h=(model.heights[b.id]||b.h)*frame.scale,paint=ArtisanCityKit.blockPaint(c,b),wall=rgb(paint.wall),roof=rgb(paint.roof);
   low.box(a.x,a.y,a.z,b.w*frame.sx*.48,b.d*frame.sz*.48,h*.58,wall);const A=[a.x-b.w*frame.sx*.55,a.y+h*.58,a.z-b.d*frame.sz*.55],B=[a.x+b.w*frame.sx*.55,a.y+h*.58,a.z-b.d*frame.sz*.55],C=[a.x+b.w*frame.sx*.55,a.y+h*.58,a.z+b.d*frame.sz*.55],D=[a.x-b.w*frame.sx*.55,a.y+h*.58,a.z+b.d*frame.sz*.55],P=[a.x,a.y+h,a.z];low.tri(A,B,P,roof);low.tri(B,C,P,roof);low.tri(C,D,P,roof);low.tri(D,A,P,roof);}
  this.r.upload(`cm:${p.id}:silhouettes`,low,true);model.meshNames.push(`cm:${p.id}:silhouettes`);
  return model;
 }
 workerBuild(p){
  if(!window.Worker||!window.TELLURIC_TOWN_WORKER)return Promise.resolve(this.build(p));
  if(!this.worker){const blob=new Blob([window.TELLURIC_TOWN_WORKER],{type:'application/javascript'}),url=URL.createObjectURL(blob);this.worker=new Worker(url);URL.revokeObjectURL(url);
   this.worker.onmessage=e=>{const job=this.workerJobs.get(e.data.id);if(!job)return;this.workerJobs.delete(e.data.id);if(e.data.error){job.reject(Error(e.data.error));return;}job.resolve(e.data.payload);};
   this.worker.onerror=e=>{for(const job of this.workerJobs.values())job.reject(Error(e.message||'Mesh worker failed'));this.workerJobs.clear();};
  }
  const requestKey=this.key(p),requestEpoch=this.epoch;const id=++this.workerId,data={id,pid:p.id,sim:this.sim,relief:this.r.relief};if(this.workerWorld!==this.world){data.world=this.world;this.workerWorld=this.world;}
  return new Promise((resolve,reject)=>{this.workerJobs.set(id,{resolve,reject});this.worker.postMessage(data);}).then(data=>{
   if(requestEpoch!==this.epoch)throw Error('World replaced');const c=data.city;c.xy=k=>({x:(k%c.n/(c.n-1)-.5)*c.width,z:(Math.floor(k/c.n)/(c.n-1)-.5)*c.depth});c.index=(x,z)=>clamp(Math.round((z/c.depth+.5)*(c.n-1)),0,c.n-1)*c.n+clamp(Math.round((x/c.width+.5)*(c.n-1)),0,c.n-1);
   c.context.xy=k=>({x:(k%c.context.n/(c.context.n-1)-.5)*c.context.width,z:(Math.floor(k/c.context.n)/(c.context.n-1)-.5)*c.context.depth});
   const model={p,city:c,frame:AtlasSpace.cityFrame(this.world,p,c,this.r.relief),key:requestKey,heights:data.heights,excavations:data.excavations||[],triangles:data.triangles,last:++this.sequence,meshNames:[]};
   ExcavationTerrain.restore(model.excavations,model.frame);
   for(const[name,m]of Object.entries(data.meshes)){this.r.upload(name,{data:m.vertices},m.shadow,m.unlit,m.alpha);model.meshNames.push(name);}return model;
  });
 }
 async ensure(id){if(!this.world||!this.sim)return null;const p=this.sim.provinces[id];if(!p?.settled||p.urbanPop<650)return null;const key=this.key(p),old=this.models.get(id);if(old?.key===key){old.last=++this.sequence;return old;}if(this.failed.has(key))return null;
  if(this.pending.has(key)){while(this.pending.has(key))await new Promise(r=>setTimeout(r,25));return this.models.get(id)||null;}
  const epoch=this.epoch;this.pending.add(key);this.loading=true;this.preparing=p.name;this.onChange();
  await new Promise(resolve=>setTimeout(resolve,15));
  if(epoch!==this.epoch){this.pending.delete(key);return null;}
  try{this.remove(id);while(this.models.size>=this.maxModels){const entries=[...this.models.values()].sort((a,b)=>a.last-b.last),victim=entries.find(m=>m.p.id!==this.focusId)||entries[0];this.remove(victim.p.id);}
   const model=await this.workerBuild(p);if(epoch!==this.epoch)return null;this.models.set(id,model);while(this.models.size>this.maxModels){const victims=[...this.models.values()].filter(m=>m.p.id!==id).sort((a,b)=>a.last-b.last);this.remove((victims.find(m=>m.p.id!==this.focusId)||victims[0]).p.id);}this.r.continuousModels=this.models;this.r.buildTerrain();this.r.buildRivers?.();this.buildEnvironment();this.r.dirtyShadow=true;this.r.request();return model;
  }catch(error){if(epoch!==this.epoch)return null;this.failed.add(key);console.error('Atlas town detail',p.name,error);window.__continuousError=error.message;return null;}
  finally{this.pending.delete(key);this.loading=this.pending.size>0;this.preparing=null;this.onChange();}
 }
 visible(name){
  if(name.startsWith('cm:env:')){
   if(!this.natural)return false;
   const kind=name.split(':').at(-1);
   if(kind==='flora')return this.r.options.trees!==false;
   if(kind==='ice')return this.r.options.ice!==false;
   if(kind==='falls')return this.r.options.rivers!==false;
   return true;
  }
 if(name.startsWith('cm:')){if(name==='cm:selection')return this.r.zoom>AtlasSpace.TOWN_ZOOM*.88;const type=name.split(':').at(-1);if(type==='silhouettes')return this.r.zoom>=AtlasSpace.TOWN_ZOOM&&this.r.zoom<AtlasSpace.DETAIL_ZOOM;if(['buildings','roofs','details','cityWalls'].includes(type)&&this.r.zoom<AtlasSpace.DETAIL_ZOOM)return false;return this.r.zoom>=AtlasSpace.TOWN_ZOOM&&(type!=='roofs'||this.r.continuousRoofs!==false)&&(!['trees','vegetation'].includes(type)||this.r.options.trees!==false)&&(type!=='streams'||this.r.options.rivers!==false)&&(!['port','streets'].includes(type)||this.r.options.roads!==false);}
  // The cartographic overlay stops where the town itself begins. A quay symbol is drawn
  // to the same scale as the town marker beside it — about forty buildings across — so
  // leaving it on once the architecture resolves puts a giant pier through the streets.
  // Its replacement is the town's own cm:*:port waterfront, which appears at this zoom.
  // The world's own symbols still stand down here — they are sized for the whole map —
  // but cm:env:* now takes their place across everything on screen, not just inside a
  // loaded town's box. Rivers stay: cutting them took the water out of the landscape
  // exactly where you had come to look at it.
  if(this.r.zoom>=AtlasSpace.TOWN_ZOOM){if(['settlements','trees','smoke','dunes','iceflow','icefloes','reeds','ports','seaLanes'].includes(name))return false;if(name==='frontiers')return false;if(name==='rivers')return this.r.options.rivers!==false;}
  return null;
 }
 cameraChanged(){if(!this.world||!this.sim||busy)return;const close=this.r.zoom>=AtlasSpace.TOWN_ZOOM;if(close!==this.natural){this.natural=close;this.r.buildTerrain();this.r.roadKey=null;this.r.nearRoadKey=null;this.r.buildRoads?.();this.r.buildLines?.();this.buildEnvironment();this.r.request();}
  // A detail/range LOD transition changes whether the well exists in the visible
  // scene. Match the terrain immediately, before the delayed refinement rebuild.
  if(this.excavationKey()!==this.lastExcavationKey){clearTimeout(this.retess);this.r.buildTerrain();this.r.dirtyShadow=true;this.r.request();}
  // The scatter follows the camera, on the same settle-first rule as the terrain: it is
  // a remesh, and it must not run inside a wheel or a drag.
  if(this.environmentKey()!==this.lastEnvironmentKey){clearTimeout(this.reflora);this.reflora=setTimeout(()=>{if(this.environmentKey()!==this.lastEnvironmentKey&&!busy){this.buildEnvironment();this.r.dirtyShadow=true;this.r.request();}},190);}
  // Water follows settled zoom, pan and viewport changes without rebuilding
  // unrelated atlas overlays. An unchanged camera reuses the existing buffer.
  if(typeof RiverDetail!=='undefined'&&this.r.buildRivers&&RiverDetail.key(this)!==this.lastRiverKey){clearTimeout(this.reriver);this.reriver=setTimeout(()=>{if(!busy&&RiverDetail.key(this)!==this.lastRiverKey){this.r.buildRivers();this.r.request();}},160);}
  if(close)this.r.buildNearRoads?.();
  // A finer or coarser terrain patch is a remesh, so it waits for the camera to
  // settle rather than running inside a wheel or drag gesture.
  if(this.terrainKey()!==this.lastTerrainKey){clearTimeout(this.retess);this.retess=setTimeout(()=>{if(this.terrainKey()!==this.lastTerrainKey&&!busy){this.r.buildTerrain();this.r.dirtyShadow=true;this.r.request();}},170);}
  if(!close){this.onChange();return;}clearTimeout(this.timer);this.timer=setTimeout(()=>this.stream(),180);this.onChange();
 }
 async stream(){if(this.loading||!this.world||busy||this.r.zoom<AtlasSpace.TOWN_ZOOM)return;const r=this.r,a=AtlasSpace.grid(r.target[0],r.target[2]);
  const candidates=this.sim.provinces.filter(p=>p.settled&&p.urbanPop>=650).map(p=>({p,d:Math.hypot(p.x-a[0],p.y-a[1])})).filter(q=>q.d<18).sort((a,b)=>a.d-b.d).slice(0,this.maxModels);
  for(const{p}of candidates){const [x,y]=r.screen(p.x,p.y,0);if(x< -120||x>r.width+120||y< -120||y>r.height+120)continue;if(this.models.get(p.id)?.key!==this.key(p)&&!this.failed.has(this.key(p))){await this.ensure(p.id);break;}}
 }
 pick(sx,sy){if(this.r.zoom<AtlasSpace.TOWN_ZOOM)return null;const{origin,dir}=AtlasSpace.ray(this.r,sx,sy),surface=AtlasSpace.pickGround(this.r,sx,sy),floorT=surface?Math.hypot(...sub(surface.point,origin)):Infinity;let best=null,bestT=Infinity;
  for(const m of this.models.values())for(const a of m.frame.anchors.values()){const b=a.b,h=(m.heights[b.id]||b.h)*a.scale,excavation=this.r.zoom>=AtlasSpace.DETAIL_ZOOM?m.excavations?.find(h=>h.buildingId===b.id):null,low=Math.min(a.low,excavation?.floorY??a.low),t=AtlasSpace.hitBox(origin,dir,[a.x-b.w*m.frame.sx*.55,low,a.z-b.d*m.frame.sz*.55],[a.x+b.w*m.frame.sx*.55,a.y+h,a.z+b.d*m.frame.sz*.55]);if(t<bestT&&t<floorT+.012){bestT=t;best={model:m,building:b,anchor:a};}}
  return best;
 }
 select(hit){const g=new Geometry();if(hit){const{anchor:a,building:b,model:m}=hit,x=b.w*m.frame.sx*.55,z=b.d*m.frame.sz*.55,y=a.y+.013,pts=[[a.x-x,y,a.z-z],[a.x+x,y,a.z-z],[a.x+x,y,a.z+z],[a.x-x,y,a.z+z]];for(let i=0;i<4;i++)g.line(pts[i],pts[(i+1)%4],.008,rgb('#f6d987'));}this.r.upload('cm:selection',g,false,1);this.r.request();}
 report(){return{epoch:this.epoch,worldSeed:this.world?.params.seed,models:[...this.models.values()].map(m=>({id:m.p.id,name:m.p.name,buildings:m.city.buildings.length,triangles:m.triangles,setting:m.city.siteEnvironment.label,reference:AtlasSpace.matrixFor(m.frame)})),loading:this.loading,terrainTriangles:this.terrainTriangles,singleCanvas:this.r.canvas.id};}
}
