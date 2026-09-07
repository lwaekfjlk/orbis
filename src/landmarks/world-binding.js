/** Read-only resolution from existing cities/geography to reusable landmark recipes. */
const LandmarkBinding = (()=>{
 const cache=new Map();
 function resolve(w,s,p,kind='civic'){
  const base=LandmarkCatalog.fromProvince(w,s,p,kind),saved=s.landmarkRecipes?.[base.id];
  if(saved){try{return LandmarkCatalog.validate({...saved,provinceId:p.id,id:base.id,realm:base.realm,geography:base.geography,provenance:base.provenance})}catch(_){/* Old or malformed optional design: retain a valid derived recipe. */}}
  return base;
 }
 function miniature(w,s,p,b){
  if(!['civic','temple','academy','harbor'].includes(b.type))return null;
  const recipe=resolve(w,s,p,b.type),key=LandmarkCatalog.signature(recipe)+'/mini';let model=cache.get(key);
  if(!model){model=LandmarkTemplates.build({...recipe,complexity:0},{base:false,lod:0});cache.set(key,model);while(cache.size>24)cache.delete(cache.keys().next().value)}
  if(model.excavation&&typeof ArtisanCityKit!=='undefined'){const placed=ArtisanCityKit.meshAt(model,b),geometry=new Geometry();for(const part of[placed.body,placed.roof])for(const v of part.data)geometry.data.push(v);return{geometry,recipe,height:placed.height,depth:placed.depth,excavation:placed.excavation};}
  const lo=model.bounds.min,hi=model.bounds.max,groundY=model.groundY??lo[1],sc=Math.min(b.w/(hi[0]-lo[0]),b.d/(hi[2]-lo[2]))*.94;
  const g=new Geometry();for(const part of model.parts){const t=LandmarkTemplates.transformGeometry(part.geometry,sc,[b.x-(lo[0]+hi[0])*.5*sc,b.y-groundY*sc,b.z-(lo[2]+hi[2])*.5*sc]);for(const v of t.data)g.data.push(v)}
  return {geometry:g,recipe,height:(hi[1]-groundY)*sc};
 }
 function worldSymbol(g,w,s,p,x,y,z,sc){
  const r=resolve(w,s,p),style=r.style,wall=rgb(LandmarkCatalog.palettes[r.material].wall),roof=rgb(LandmarkCatalog.palettes[r.material].roof),trim=rgb(LandmarkCatalog.palettes[r.material].trim);
  const box=(dx,dz,rx,rz,h,dy=0,col=wall)=>g.box(x+dx*sc,y+dy*sc,z+dz*sc,rx*sc,rz*sc,h*sc,col),tower=(dx,dz,h,rr=.18)=>{g.cone(x+dx*sc,y,z+dz*sc,rr*sc,rr*.9*sc,h*sc,wall,6);g.cone(x+dx*sc,y+h*sc,z+dz*sc,rr*1.25*sc,0,.6*sc,roof,6)};
  if(style==='arcane'){for(const[a,b,h]of[[0,0,2.8],[-.7,-.4,1.8],[.7,-.4,2.2]]){tower(a,b,h);g.blob(x+a*sc,y+(h+.9)*sc,z+b*sc,.20*sc,trim,2)}}
  else if(style==='basilica'){box(0,0,.4,.72,.85);g.blob(x,y+1.4*sc,z,.5*sc,rgb('#c3a355'),1);tower(-.6,.48,1.8);tower(.6,.48,1.8)}
  else if(style==='mountain'||style==='basalt'){box(0,0,.8,.65,.6);box(0,-.2,.62,.44,.6,.6);box(0,-.4,.4,.3,1,1.2);tower(-.63,.5,1.3,.23);tower(.63,.5,1.3,.23)}
  else if(style==='forest'){for(const xx of[-.5,.5]){g.cone(x+xx*sc,y,z-.3*sc,.12*sc,.06*sc,1.7*sc,rgb('#846b52'),6);g.blob(x+xx*sc,y+1.75*sc,z-.3*sc,.72*sc,rgb('#659175'),.55)}box(0,.3,.42,.3,.7);g.cone(x,y+.7*sc,z+.3*sc,.6*sc,0,1*sc,roof,6)}
  else if(style==='delta'){for(const[a,b]of[[-.5,0],[.5,0],[0,-.6]]){box(a,b,.29,.4,.5,.4);g.cone(x+a*sc,y+.9*sc,z+b*sc,.5*sc,0,.55*sc,roof,4,.78)}}
  else if(style==='desert'){box(0,0,.7,.6,.8);g.blob(x,y+1.08*sc,z,.35*sc,roof,.7);for(const dx of[-.7,.7])for(const dz of[-.6,.6])box(dx,dz,.13,.13,1.5)}
  else if(style==='fjord'){box(0,0,.48,.7,.8);g.cone(x,y+.8*sc,z,.75*sc,0,1.2*sc,roof,4,.78);tower(-.65,.35,1.3);tower(.65,.35,1.3)}
  else {box(0,-.3,.6,.3,1);box(-.55,.28,.17,.55,.6);box(.55,.28,.17,.55,.6);tower(-.65,-.4,1.5);tower(.65,-.4,1.5);g.cone(x,y+1*sc,z-.3*sc,.65*sc,0,.7*sc,roof,4,.78)}
  return true;
 }
 function inventory(w,s){if(!w||!s)return[];const cap=new Set(s.realms.filter(c=>c.alive).map(c=>c.capital)),out=[];
  for(const p of s.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop)){
   if(cap.has(p.id))out.push({id:resolve(w,s,p).id,name:resolve(w,s,p).name,recipe:resolve(w,s,p),i:p.i,x:p.x,y:p.y,provinceId:p.id,priority:p.urbanPop*2,kind:'Civic palace'});
   if(p.harbor>.28&&p.urbanPop>8000){const r=resolve(w,s,p,'harbor');out.push({id:r.id,name:r.name,recipe:r,i:p.i,x:p.x,y:p.y,provinceId:p.id,priority:p.urbanPop*.6,kind:'Harbor landmark'})}
   if(s.realms[p.owner]?.gov===2){const r=resolve(w,s,p,'academy');out.push({id:r.id,name:r.name,recipe:r,i:p.i,x:p.x,y:p.y,provinceId:p.id,priority:p.urbanPop,kind:'Arcane college'})}
   const sacred=typeof SacredCityKit!=='undefined'?SacredCityKit.site(w,s,p):null;if(sacred)out.push(sacred);
   if(!sacred&&s.realms[p.owner]?.gov===1){const r=resolve(w,s,p,'temple');out.push({id:r.id,name:r.name,recipe:r,i:p.i,x:p.x,y:p.y,provinceId:p.id,priority:p.urbanPop,kind:'Great sanctuary'})}
  }
  const tests=[['grove','Rootbound Sanctuary',i=>[7,9,11].includes(w.biome[i])&&w.ice[i]<10],['labyrinth','The Ninth Stair',i=>[4,13].includes(w.biome[i])&&w.height[i]>0],['ice','The Pale Archive',i=>w.height[i]>0&&w.ice[i]<30&&Math.abs(w.lat[i])>50],['observatory','The Meridian Orrery',i=>w.height[i]>1600&&w.height[i]<3600&&w.ice[i]<10],['bridge','The Crownspan',i=>w.height[i]>0&&w.lake[i]<=0&&w.flow[i]>w.riverThreshold*2]];
  for(const [style,name,test]of tests){let chosen=-1,best=-1;for(const p of s.provinces.filter(p=>p.settled)){if(test(p.i)){const val=LandmarkCatalog.hash(w.params.seed+'/'+style+'/'+p.i);if(val>best){best=val;chosen=p.i}}}if(chosen<0)continue;const p=s.provinces[w.provinceId[chosen]],base=LandmarkCatalog.fromProvince(w,s,p),r=LandmarkCatalog.recipe(style,w.params.seed+'/regional/'+style,{id:'regional-'+style,name,provinceId:p.id,realm:s.realms[p.owner]?.name||'Local communities',geography:base.geography,provenance:`A fictional regional landmark assigned near the existing settlement ${p.name}. Detailed microterrain is illustrative; it neither excavates global terrain nor invents a city.`});const saved=s.landmarkRecipes?.[r.id];let recipe=saved?LandmarkCatalog.validate({...saved,geography:r.geography,provenance:r.provenance}):r;out.push({id:r.id,name:r.name,recipe,i:chosen,x:chosen%GW,y:Math.floor(chosen/GW),provinceId:p.id,priority:30000,kind:'Regional landmark'})}
  return out.sort((a,b)=>b.priority-a.priority);
 }
 return {resolve,miniature,worldSymbol,inventory,clearCache(){cache.clear()}};
})();
