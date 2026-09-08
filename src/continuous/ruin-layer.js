/** A few independent ruins share the atlas canvas and its physical ground.
 * Each authored assembly stays rigid; only its individual stone supports extend
 * down to the inherited terrain. Open courtyards and broken gateways stay open.
 */
class ContinuousRuinLayer {
 constructor(renderer,cityLayer){this.r=renderer;this.cityLayer=cityLayer;this.world=null;this.sim=null;this.sites=new Map();this.models=new Map();this.pending=new Map();this.failed=new Map();this.meshOwners=new Map();this.maxModels=3;this.epoch=0;this.sequence=0;this.loading=false;this.timer=null;this.onChange=()=>{};}
 reset(){this.epoch++;clearTimeout(this.timer);this.timer=null;for(const id of [...this.models.keys()])this.remove(id);this.pending.clear();this.failed.clear();this.sites.clear();this.world=null;this.sim=null;this.loading=false;this.r.request?.();}
 bind(w,s,sites=[]){
  if(w!==this.world)this.reset();this.world=w;this.sim=s;
  this.sites=new Map((sites||[]).filter(site=>site?.dragonRuins&&site.recipe&&Number.isFinite(site.x)&&Number.isFinite(site.y)).slice(0,this.maxModels).map(site=>[site.id,site]));
  for(const [id,m] of this.models){const site=this.sites.get(id);if(!site||m.key!==this.key(site,m.lod))this.remove(id);else m.site=site;}
  this.failed.clear();
 }
 key(site,lod){return JSON.stringify([site.id,site.x,site.y,site.span,site.angle,site.dragonRuins,site.recipe,lod,this.r.relief??1,typeof LandscapeRelief==='undefined'?'none':LandscapeRelief.key(this.world)]);}
 remove(id){const m=this.models.get(id);if(!m)return;for(const name of m.meshNames){const mesh=this.r.meshes[name];if(mesh&&this.r.gl){if(mesh.buffer)this.r.gl.deleteBuffer(mesh.buffer);if(mesh.vao)this.r.gl.deleteVertexArray(mesh.vao);}delete this.r.meshes[name];this.meshOwners.delete(name);}this.models.delete(id);this.r.dirtyShadow=true;}
 visible(name){if(!name.startsWith('ruin:'))return null;const entry=this.meshOwners.get(name);return !!entry&&this.world===this.r.world&&this.r.zoom>=AtlasSpace.TOWN_ZOOM&&(entry.part.role!=='roof'||this.r.continuousRoofs!==false);}
 cameraChanged(){clearTimeout(this.timer);if(!this.world||this.world!==this.r.world||this.r.zoom<AtlasSpace.TOWN_ZOOM)return;this.timer=setTimeout(()=>this.stream(),180);}
 async stream(){
  if(!this.world||this.world!==this.r.world||this.r.zoom<AtlasSpace.TOWN_ZOOM)return;
  const r=this.r,epoch=this.epoch,at=AtlasSpace.grid(r.target[0],r.target[2]),lod=r.zoom>=AtlasSpace.DETAIL_ZOOM?2:1;
  const near=[...this.sites.values()].map(site=>({site,d:Math.hypot(site.x-at[0],site.y-at[1])})).filter(v=>v.d<18).sort((a,b)=>a.d-b.d||String(a.site.id).localeCompare(String(b.site.id)));
  for(const {site} of near){if(epoch!==this.epoch||r.zoom<AtlasSpace.TOWN_ZOOM)return;const q=r.screen(site.x,site.y,0);if(q[0]<-120||q[0]>r.width+120||q[1]<-120||q[1]>r.height+120)continue;await this.ensure(site.id,{lod});}
 }
 async ensure(id,{lod=this.r.zoom>=AtlasSpace.DETAIL_ZOOM?2:1}={}){
  if(!this.world||this.world!==this.r.world)return null;const site=this.sites.get(id);if(!site)return null;
  this.cityLayer?.prepareLandscape?.();lod=lod>=2?2:1;const key=this.key(site,lod),old=this.models.get(id);
  if(old?.key===key){old.last=++this.sequence;return old;}if(this.failed.has(key))return null;
  if(this.pending.has(id)){await this.pending.get(id);return this.ensure(id,{lod});}
  const epoch=this.epoch;this.loading=true;
  const job=(async()=>{
   // Defer mesh work past the click that starts the camera flight. A world reset
   // during that handoff must never upload a model into the replacement world.
   await new Promise(resolve=>setTimeout(resolve,0));
   if(epoch!==this.epoch||this.world!==this.r.world||!this.sites.has(id))return null;
   try{
    const model=this.build(site,lod,key);
    if(epoch!==this.epoch||this.key(this.sites.get(id),lod)!==key)return null;
    this.remove(id);while(this.models.size>=this.maxModels){const first=[...this.models.values()].sort((a,b)=>a.last-b.last)[0];this.remove(first.id);}
    this.models.set(id,model);
    for(const part of model.parts){this.r.upload(part.meshName,part.geometry,true,part.role==='ornament'?.08:0,1);this.meshOwners.set(part.meshName,{model,part});}
    this.r.dirtyShadow=true;this.r.request?.();return model;
   }catch(error){if(epoch===this.epoch){if(this.models.get(id)?.key===key)this.remove(id);this.failed.set(key,error.message);}return null;}
  })();
  this.pending.set(id,job);this.onChange();
  try{return await job;}finally{if(this.pending.get(id)===job)this.pending.delete(id);this.loading=this.pending.size>0;this.onChange();}
 }
 build(site,lod,key){
  const source=LandmarkTemplates.build(site.recipe,{base:false,lod}),w=this.world,r=this.r,width=source.footprint?.[0]||36,cells=site.span||.72;
  const sx=cells/width*AtlasSpace.X,sz=cells/width*AtlasSpace.Z,scale=Math.sqrt(sx*sz),origin=AtlasSpace.point(w,site.x,site.y,r.relief),angle=site.angle||0,C=Math.cos(angle),S=Math.sin(angle);
  const at=(x,z)=>[site.x+(x*C-z*S)/width*cells,site.y+(x*S+z*C)/width*cells],ground=(x,z)=>AtlasSpace.surface(w,...at(x,z),r.relief),horizontal=(x,z)=>[origin[0]+(x*C-z*S)*sx,origin[2]+(x*S+z*C)*sz];
  const frame={origin,sx,sz,scale,angle,at,ground},groups=new Map(),parts=[];
  for(const part of source.parts){
   const id=part.mountGroup||part.id;if(groups.has(id))continue;
   const mount=part.mount;if(!mount)throw Error(`Ruin part ${part.id} has no ground support metadata`);
   const supports=(mount.supports||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.w>0&&p.d>0);
   if(!supports.length)throw Error(`Ruin group ${id} has no solid support footprint`);
   let top=-Infinity,low=Infinity;
   const samples=supports.map(p=>{
    const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0),nx=Math.max(2,Math.ceil(p.w*cells/width/.018)),nz=Math.max(2,Math.ceil(p.d*cells/width/.018)),points=[];
    for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){const u=(x/nx-.5)*p.w,v=(z/nz-.5)*p.d,px=p.x+u*c-v*s,pz=p.z+u*s+v*c,y=ground(px,pz),q=horizontal(px,pz);top=Math.max(top,y);low=Math.min(low,y);points.push([q[0],y,q[1]]);}
    return{...p,nx,nz,points};
   });
   // A tiny art-unit seam covers floating-point coincidence with the terrain.
   groups.set(id,{id,mount,groundY:mount.groundY??0,y:top+.006*scale,top,low,supports:samples});
  }
  const bounded=g=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let k=0;k<g.data.length;k+=9)for(let j=0;j<3;j++){min[j]=Math.min(min[j],g.data[k+j]);max[j]=Math.max(max[j],g.data[k+j]);}return{min,max};};
  const founded=new Set();
  for(const original of source.parts){
   const group=groups.get(original.mountGroup||original.id),g=new Geometry(),v=original.geometry.data;
   for(let k=0;k<v.length;k+=9){const nx=(v[k+3]*C-v[k+5]*S)/sx,ny=v[k+4]/scale,nz=(v[k+3]*S+v[k+5]*C)/sz,length=Math.hypot(nx,ny,nz)||1,q=horizontal(v[k],v[k+2]);g.data.push(q[0],group.y+(v[k+1]-group.groundY)*scale,q[1],nx/length,ny/length,nz/length,v[k+6],v[k+7],v[k+8]);}
   if(!founded.has(group.id)){
    founded.add(group.id);const color=v.length?[v[6]*.82,v[7]*.82,v[8]*.82]:rgb('#696655');
    for(const support of group.supports)this.footing(g,support,group.y,scale,color);
   }
   if(!g.data.length)continue;
   const bounds=bounded(g),part={...original,geometry:g,bounds,anchor:bounds.min.map((v,j)=>(v+bounds.max[j])/2),meshName:`ruin:${site.id}:${original.id}`};parts.push(part);
  }
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const p of parts)for(let j=0;j<3;j++){bounds.min[j]=Math.min(bounds.min[j],p.bounds.min[j]);bounds.max[j]=Math.max(bounds.max[j],p.bounds.max[j]);}
  if(!parts.length)throw Error('Ruin model has no geometry');
  return{id:site.id,site,recipe:site.recipe,lod,key,frame,groups,parts,bounds,meshNames:parts.map(p=>p.meshName),triangles:parts.reduce((n,p)=>n+p.geometry.data.length/27,0),last:++this.sequence};
 }
 footing(g,support,top,scale,color){
  const {nx,nz,points}=support,stride=nx+1,bottom=p=>[p[0],p[1]-.035*scale,p[2]],upper=p=>[p[0],top,p[2]];
  // The underside follows the same sampled ground as the side walls. No large
  // rectangular plinth crosses the spaces between separate columns or ribs.
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=points[z*stride+x],b=points[z*stride+x+1],c=points[(z+1)*stride+x+1],d=points[(z+1)*stride+x];g.quad(bottom(a),bottom(b),bottom(c),bottom(d),color);}
  const ring=[];for(let x=0;x<=nx;x++)ring.push(points[x]);for(let z=1;z<=nz;z++)ring.push(points[z*stride+nx]);for(let x=nx-1;x>=0;x--)ring.push(points[nz*stride+x]);for(let z=nz-1;z>0;z--)ring.push(points[z*stride]);
  const center=[ring.reduce((v,p)=>v+p[0],0)/ring.length,top,ring.reduce((v,p)=>v+p[2],0)/ring.length];
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];g.quad(bottom(a),upper(a),upper(b),bottom(b),color);g.tri(center,upper(b),upper(a),color);}
 }
 pick(sx,sy){
  if(!this.world||this.world!==this.r.world||this.r.zoom<AtlasSpace.TOWN_ZOOM)return null;
  const {origin,dir}=AtlasSpace.ray(this.r,sx,sy),ground=AtlasSpace.pickGround(this.r,sx,sy),groundT=ground?dot(sub(ground.point,origin),dir):Infinity;let best=null,distance=groundT+1e-5;
  for(const model of this.models.values()){
   if(AtlasSpace.hitBox(origin,dir,model.bounds.min,model.bounds.max)>distance)continue;
   for(const part of model.parts){if(!this.visible(part.meshName)||AtlasSpace.hitBox(origin,dir,part.bounds.min,part.bounds.max)>distance)continue;const v=part.geometry.data;
    for(let k=0;k<v.length;k+=27){const a=v.slice(k,k+3),b=v.slice(k+9,k+12),c=v.slice(k+18,k+21),e1=sub(b,a),e2=sub(c,a),h=cross(dir,e2),det=dot(e1,h);if(Math.abs(det)<1e-13)continue;
     const inv=1/det,s=sub(origin,a),u=dot(s,h)*inv;if(u<0||u>1)continue;const q=cross(s,e1),t=dot(e2,q)*inv,at=dot(dir,q)*inv;if(at<0||u+at>1||t<=0||t>=distance)continue;distance=t;best={model,part,distance,point:origin.map((v,j)=>v+dir[j]*t)};
    }
   }
  }return best;
 }
 view(model,part=null){
  if(!model)return null;const bounds=(typeof part==='string'?model.parts.find(p=>p.id===part):part)?.bounds||model.bounds,lo=bounds.min,hi=bounds.max,corners=[];
  for(const x of[lo[0],hi[0]])for(const y of[lo[1],hi[1]])for(const z of[lo[2],hi[2]])corners.push([x,y,z]);
  const target=lo.map((v,j)=>(v+hi[j])*.5),[gx,gy]=AtlasSpace.grid(target[0],target[2]),d=.08,r=this.r;
  const dx=(AtlasSpace.surface(this.world,gx+d,gy,r.relief)-AtlasSpace.surface(this.world,gx-d,gy,r.relief))/AtlasSpace.X,dz=(AtlasSpace.surface(this.world,gx,gy+d,r.relief)-AtlasSpace.surface(this.world,gx,gy-d,r.relief))/AtlasSpace.Z;
  const azimuth=Math.hypot(dx,dz)>.002?Math.atan2(-dx,-dz):-.45,elevation=.88,right=[Math.cos(azimuth),0,-Math.sin(azimuth)],up=[-Math.sin(azimuth)*Math.sin(elevation),Math.cos(elevation),-Math.cos(azimuth)*Math.sin(elevation)];
  let halfW=0,halfH=0;for(const p of corners){const v=sub(p,target);halfW=Math.max(halfW,Math.abs(dot(v,right)));halfH=Math.max(halfH,Math.abs(dot(v,up)));}
  const aspect=r.width/Math.max(1,r.height),base=Math.max(49,94/aspect),heightShare=clamp((r.height-250)/r.height,.35,.72),zoom=clamp(Math.min(base*aspect*.76/Math.max(.02,halfW),base*heightShare/Math.max(.02,halfH)),AtlasSpace.DETAIL_ZOOM,AtlasSpace.MAX_ZOOM);
  return{target,zoom,elevation,azimuth,bounds,corners};
 }
 report(){return{epoch:this.epoch,worldSeed:this.world?.params?.seed,loading:this.loading,models:[...this.models.values()].map(m=>({id:m.id,name:m.site.name,lod:m.lod,parts:m.parts.length,triangles:m.triangles,bounds:m.bounds,groups:m.groups.size})),failures:[...this.failed.values()],singleCanvas:this.r.canvas?.id};}
}
