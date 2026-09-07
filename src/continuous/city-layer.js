/** A bounded streaming city layer inside the atlas renderer. Never opens a scene.
 * Terrain remains the same piecewise-linear height field at every zoom level.
 * Local building assemblies are rigidly seated on that field; no baked backdrops.
 */
class ContinuousCityLayer {
 constructor(r){this.r=r;this.world=null;this.sim=null;this.models=new Map();this.pending=new Set();this.failed=new Set();this.focusId=null;this.epoch=0;this.natural=false;this.loading=false;this.sequence=0;this.preparing=null;this.onChange=()=>{};this.maxModels=2;this.worker=null;this.workerId=0;this.workerJobs=new Map();this.workerWorld=null;}
 key(p){return `${p.id}/${TownCatalog.signature(TownCatalog.resolve(this.world,this.sim,p))}/${JSON.stringify(this.sim.cityState?.[p.id]||{})}/${JSON.stringify(this.sim.landmarkRecipes||{})}/${this.sim.realms[p.owner]?.id}`;}
 remove(id){const a=this.models.get(id);if(!a)return;for(const key of a.meshNames)this.drop(key);this.models.delete(id);}
 drop(key){const r=this.r,m=r.meshes[key];if(!m)return;if(r.gl){r.gl.deleteBuffer(m.buffer);r.gl.deleteVertexArray(m.vao);}delete r.meshes[key];r.dirtyShadow=true;}
 reset(w,s){this.epoch++;if(this.worker){this.worker.terminate();this.worker=null;for(const job of this.workerJobs.values())job.reject(new Error('World replaced'));this.workerJobs.clear();this.workerWorld=null;}for(const id of [...this.models.keys()])this.remove(id);this.pending.clear();this.failed.clear();this.focusId=null;this.preparing=null;this.world=w;this.sim=s;this.loading=false;this.natural=false;this.r.continuousModels=this.models;this.r.request();}
 bind(w,s){if(w!==this.world||(this.sim&&s!==this.sim))this.reset(w,s);else this.sim=s;}
 // This renders the whole world, not a circular/square platform beneath the town.
 buildTerrain(){const r=this.r,w=r.world;if(!w)return;const g=new Geometry(),near=this.natural,areas=[...this.models.values()].map(m=>m.p),cache=new Map();
  const color=(x,y)=>{const k=x+','+y;if(cache.has(k))return cache.get(k);const[ids,q]=AtlasSpace.weights(x,y);let c=[0,0,0];for(let n=0;n<3;n++){let a;if(near&&w.height[ids[n]]>0)a=CityEnvironment.cellColor(w,ids[n]);else a=r.palette(ids[n]);for(let j=0;j<3;j++)c[j]+=q[n]*a[j];}cache.set(k,c);return c;};
  const v=(x,y)=>AtlasSpace.point(w,x,y,r.relief);
  const tri=(a,b,c)=>{const col=[0,0,0];for(const q of[a,b,c]){const z=color(q[0],q[1]);for(let j=0;j<3;j++)col[j]+=z[j]/3;}g.tri(v(...a),v(...b),v(...c),col);};
  for(let y=0;y<GH-1;y++)for(let x=0;x<GW-1;x++){
   const n=near&&areas.some(p=>Math.abs(p.x-x)<9&&Math.abs(p.y-y)<8)?4:1;
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=[x+i/n,y+j/n],b=[x+(i+1)/n,y+j/n],c=[x+i/n,y+(j+1)/n],d=[x+(i+1)/n,y+(j+1)/n];if((x+y)%2){tri(a,c,b);tri(b,c,d);}else{tri(a,c,d);tri(a,d,b);}}
  }
  const c=rgb('#4d859e'),a=-MAP_X/2,b=MAP_X/2,n=-MAP_Z/2,s=MAP_Z/2,R=500;
  g.quad([-R,-.015,-R],[-R,-.015,n],[R,-.015,n],[R,-.015,-R],c);g.quad([-R,-.015,s],[-R,-.015,R],[R,-.015,R],[R,-.015,s],c);g.quad([-R,-.015,n],[-R,-.015,s],[a,-.015,s],[a,-.015,n],c);g.quad([b,-.015,n],[b,-.015,s],[R,-.015,s],[R,-.015,n],c);
  r.upload('terrain',g,true,near?0:r.layer==='relief'?0:.30);this.terrainTriangles=g.data.length/27;
 }
 build(p){const w=this.world,s=this.sim,c=generateCity(w,s,p.id),collector=createCityRenderer(null,()=>{},{collectOnly:true});collector.setCity(c,p,s.realms[p.owner],s.cityState?.[p.id]||{});
  const frame=AtlasSpace.cityFrame(w,p,c,this.r.relief),model={p,city:c,frame,key:this.key(p),meshNames:[],last:++this.sequence,heights:collector.landmarkHeights,triangles:0};
  const buckets=new Map();for(const anchor of frame.anchors.values()){const b=anchor.b;for(let z=Math.floor((b.z-b.d*.5-1)/5);z<=Math.floor((b.z+b.d*.5+1)/5);z++)for(let x=Math.floor((b.x-b.w*.5-1)/5);x<=Math.floor((b.x+b.w*.5+1)/5);x++){const k=x+','+z;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(anchor);}}
  const find=(x,z)=>{const options=buckets.get(Math.floor(x/5)+','+Math.floor(z/5));if(!options)return null;return options.find(a=>Math.abs(a.b.x-x)<=a.b.w*.5+.85&&Math.abs(a.b.z-z)<=a.b.d*.5+.85)||null;};
  const rigid=['buildings','roofs','details'];
  for(const[name,m]of Object.entries(collector.meshes)){
   if(!['buildings','roofs','details','streets','farms','cityWalls','trees'].includes(name))continue;
   const g=new Geometry(),data=m.vertices;
   for(let k=0;k<data.length;k+=27){const x=(data[k]+data[k+9]+data[k+18])/3,z=(data[k+2]+data[k+11]+data[k+20])/3,anchor=rigid.includes(name)?find(x,z):null,pts=[];
    for(let j=0;j<3;j++){const t=k+j*9;const q=frame.vertex(data[t],data[t+1],data[t+2],anchor);
     // Footings reach the actual slope instead of hovering below flat compounds.
     if(anchor&&data[t+1]<anchor.b.y-.015)q[1]=Math.min(q[1],frame.ground(data[t],data[t+2])-.006);
     pts.push(q);
    }g.tri(pts[0],pts[1],pts[2],[data[k+6],data[k+7],data[k+8]]);
   }
   const key=`cm:${p.id}:${name}`;this.r.upload(key,g,m.shadow,m.unlit,1);model.meshNames.push(key);model.triangles+=g.data.length/27;
  }
  // The city detail's inherited river centerlines remain attached to the atlas.
  const streams=new Geometry();for(const a of c.rivers){const n=18;for(let j=1;j<=n;j++){const t0=(j-1)/n,t1=j/n,x0=lerp(a.a.x,a.b.x,t0),z0=lerp(a.a.z,a.b.z,t0),x1=lerp(a.a.x,a.b.x,t1),z1=lerp(a.a.z,a.b.z,t1);const A=frame.vertex(x0,frame.localGround(x0,z0)+.16,z0),B=frame.vertex(x1,frame.localGround(x1,z1)+.16,z1);streams.line(A,B,a.width*frame.scale,CityEnvironment.waterColor(3));}}
  this.r.upload(`cm:${p.id}:streams`,streams,false,.35);model.meshNames.push(`cm:${p.id}:streams`);
  const vegetation=new Geometry();
  for(let dy=-9;dy<=9;dy+=.43)for(let dx=-11;dx<=11;dx+=.43){const gx=p.x+dx+noise(dx*3,dy*3,w.seed)*.10,gy=p.y+dy+noise(dx*3,dy*3,w.seed+6)*.10;if(gx<0||gx>=GW||gy<0||gy>=GH)continue;
   const e=CityEnvironment.sample(w,gx,gy);if(e.water||e.ice>12||hash2(Math.round(dx*100),Math.round(dy*100),w.seed+11)>e.treeDensity*.65)continue;
   const lx=dx*c.width/c.span,lz=dy*c.width/c.span;if(c.buildings.some(b=>Math.abs(b.x-lx)<b.w/2+2&&Math.abs(b.z-lz)<b.d/2+2))continue;
   const v=AtlasSpace.point(w,gx,gy,this.r.relief),h=.09+hash2(dx*100,dy*100,w.seed)*.055;
   vegetation.cone(v[0],v[1],v[2],.007,.005,h*.48,rgb('#776f51'),4);
   if(e.temperature<10)vegetation.cone(v[0],v[1]+h*.2,v[2],h*.32,0,h,rgb('#4a7568'),6);
   else vegetation.blob(v[0],v[1]+h*.66,v[2],h*.37,rgb('#5b8866'),1.2);
  }
  this.r.upload(`cm:${p.id}:vegetation`,vegetation,true);model.meshNames.push(`cm:${p.id}:vegetation`);
  // Screen-scale LOD: readable roofs at regional zoom; fine carved assemblies close up.
  const low=new Geometry();for(const b of c.buildings){const a=frame.anchors.get(b.id),h=(model.heights[b.id]||b.h)*frame.scale,wall=rgb('#d2ccb6'),roof=rgb(c.townProfile.id==='desert'?'#b99b77':'#586e78');
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
   const model={p,city:c,frame:AtlasSpace.cityFrame(this.world,p,c,this.r.relief),key:requestKey,heights:data.heights,triangles:data.triangles,last:++this.sequence,meshNames:[]};
   for(const[name,m]of Object.entries(data.meshes)){this.r.upload(name,{data:m.vertices},m.shadow,m.unlit,m.alpha);model.meshNames.push(name);}return model;
  });
 }
 async ensure(id){if(!this.world||!this.sim)return null;const p=this.sim.provinces[id];if(!p?.settled||p.urbanPop<650)return null;const key=this.key(p),old=this.models.get(id);if(old?.key===key){old.last=++this.sequence;return old;}if(this.failed.has(key))return null;
  if(this.pending.has(key)){while(this.pending.has(key))await new Promise(r=>setTimeout(r,25));return this.models.get(id)||null;}
  const epoch=this.epoch;this.pending.add(key);this.loading=true;this.preparing=p.name;this.onChange();
  await new Promise(resolve=>setTimeout(resolve,15));
  if(epoch!==this.epoch){this.pending.delete(key);return null;}
  try{this.remove(id);while(this.models.size>=this.maxModels){const entries=[...this.models.values()].sort((a,b)=>a.last-b.last),victim=entries.find(m=>m.p.id!==this.focusId)||entries[0];this.remove(victim.p.id);}
   const model=await this.workerBuild(p);if(epoch!==this.epoch)return null;this.models.set(id,model);while(this.models.size>this.maxModels){const victims=[...this.models.values()].filter(m=>m.p.id!==id).sort((a,b)=>a.last-b.last);this.remove((victims.find(m=>m.p.id!==this.focusId)||victims[0]).p.id);}this.r.continuousModels=this.models;this.r.buildTerrain();this.r.dirtyShadow=true;this.r.request();return model;
  }catch(error){if(epoch!==this.epoch)return null;this.failed.add(key);console.error('Atlas town detail',p.name,error);window.__continuousError=error.message;return null;}
  finally{this.pending.delete(key);this.loading=this.pending.size>0;this.preparing=null;this.onChange();}
 }
 visible(name){if(name.startsWith('cm:')){if(name==='cm:selection')return this.r.zoom>4.2;const type=name.split(':').at(-1);if(type==='silhouettes')return this.r.zoom>=4.8&&this.r.zoom<18;if(['buildings','roofs','details','cityWalls'].includes(type)&&this.r.zoom<18)return false;return this.r.zoom>=4.8&&(type!=='roofs'||this.r.continuousRoofs!==false)&&(!['trees','vegetation'].includes(type)||this.r.options.trees!==false)&&(type!=='streams'||this.r.options.rivers!==false);}
  if(this.r.zoom>=4.8){if(['settlements','trees','smoke','dunes','iceflow','icefloes','reeds'].includes(name))return false;if(name==='frontiers')return false;if(name==='rivers')return this.r.options.rivers!==false&&this.r.zoom<14;}
  return null;
 }
 cameraChanged(){if(!this.world||!this.sim||busy)return;const close=this.r.zoom>=4.8;if(close!==this.natural){this.natural=close;this.r.buildTerrain();this.r.request();}
  if(!close){this.onChange();return;}clearTimeout(this.timer);this.timer=setTimeout(()=>this.stream(),180);this.onChange();
 }
 async stream(){if(this.loading||!this.world||busy||this.r.zoom<4.8)return;const r=this.r,a=AtlasSpace.grid(r.target[0],r.target[2]);
  const candidates=this.sim.provinces.filter(p=>p.settled&&p.urbanPop>=650).map(p=>({p,d:Math.hypot(p.x-a[0],p.y-a[1])})).filter(q=>q.d<18).sort((a,b)=>a.d-b.d).slice(0,this.maxModels);
  for(const{p}of candidates){const [x,y]=r.screen(p.x,p.y,0);if(x< -120||x>r.width+120||y< -120||y>r.height+120)continue;if(this.models.get(p.id)?.key!==this.key(p)&&!this.failed.has(this.key(p))){await this.ensure(p.id);break;}}
 }
 pick(sx,sy){if(this.r.zoom<4.8)return null;const{origin,dir}=AtlasSpace.ray(this.r,sx,sy),surface=AtlasSpace.pickGround(this.r,sx,sy),floorT=surface?Math.hypot(...sub(surface.point,origin)):Infinity;let best=null,bestT=Infinity;
  for(const m of this.models.values())for(const a of m.frame.anchors.values()){const b=a.b,h=(m.heights[b.id]||b.h)*a.scale,t=AtlasSpace.hitBox(origin,dir,[a.x-b.w*m.frame.sx*.55,a.low,a.z-b.d*m.frame.sz*.55],[a.x+b.w*m.frame.sx*.55,a.y+h,a.z+b.d*m.frame.sz*.55]);if(t<bestT&&t<floorT+.012){bestT=t;best={model:m,building:b,anchor:a};}}
  return best;
 }
 select(hit){const g=new Geometry();if(hit){const{anchor:a,building:b,model:m}=hit,x=b.w*m.frame.sx*.55,z=b.d*m.frame.sz*.55,y=a.y+.013,pts=[[a.x-x,y,a.z-z],[a.x+x,y,a.z-z],[a.x+x,y,a.z+z],[a.x-x,y,a.z+z]];for(let i=0;i<4;i++)g.line(pts[i],pts[(i+1)%4],.008,rgb('#f6d987'));}this.r.upload('cm:selection',g,false,1);this.r.request();}
 report(){return{epoch:this.epoch,worldSeed:this.world?.params.seed,models:[...this.models.values()].map(m=>({id:m.p.id,name:m.p.name,buildings:m.city.buildings.length,triangles:m.triangles,setting:m.city.siteEnvironment.label,reference:AtlasSpace.matrixFor(m.frame)})),loading:this.loading,terrainTriangles:this.terrainTriangles,singleCanvas:this.r.canvas.id};}
}
