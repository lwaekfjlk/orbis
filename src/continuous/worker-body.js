/* Appended to the trusted engine by scripts/build.mjs. No user code is executed. */
self.window=self;self.requestAnimationFrame=()=>0;
let loadedWorld=null,indexedSim=null,indexToken=null;
const pack=value=>typeof value==='function'?undefined:ArrayBuffer.isView(value)?value:Array.isArray(value)?value.map(pack):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,pack(v)])):value;
self.onmessage=async e=>{const{id,world:w,sim:s,pid,relief,kind,token,key}=e.data;
 if(kind==='world-build'){
  let payload;
  try{
   const world=await generateWorld(e.data.params,async text=>self.postMessage({id,kind,progress:text}));
   self.postMessage({id,kind,progress:'08 / Founding towns and trade routes'});
   payload={world,sim:createCivilization(world,e.data.options)};
  }catch(error){self.postMessage({id,kind,error:error.message,stack:error.stack,failure:'generation'});return;}
  try{
   // This worker is disposable. Transfer only its newly generated buffers;
   // existing parent worlds and saves are never sent here or detached.
   const buffers=new Set(),seen=new Set();
   function visit(v){if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);if(ArrayBuffer.isView(v))buffers.add(v.buffer);else if(v instanceof ArrayBuffer)buffers.add(v);else Object.values(v).forEach(visit);}
   visit(payload);self.postMessage({id,kind,payload},[...buffers]);
  }catch(error){self.postMessage({id,kind,error:error.message,stack:error.stack,failure:'transport'});}
  return;
 }
 try{
 if(kind==='landmark-index'){
  if(w){loadedWorld=w;indexedSim=s;indexToken=token;}
  const p=indexedSim?.provinces[pid];
  if(!loadedWorld||indexToken!==token||!p||SacredCityKit.siteKey(loadedWorld,indexedSim,p)!==key)throw Error('Stale landmark index request.');
  self.world=loadedWorld;self.sim=indexedSim;
  const result=generateCityLandmark(loadedWorld,indexedSim,pid);
  self.postMessage({id,kind,token,pid,key,payload:result.buildings.length?pack(result):null});return;
 }
 if(w)loadedWorld=w;if(!loadedWorld)throw Error('Missing parent geography in mesh worker.');self.world=loadedWorld;self.sim=s;
 const meshes={};const r={relief,upload(name,g,shadow=true,unlit=0,alpha=1){meshes[name]={vertices:new Float32Array(g.data),count:g.data.length/9,shadow,unlit,alpha};}};
 const layer=new ContinuousCityLayer(r);layer.world=loadedWorld;layer.sim=s;
 const m=layer.build(s.provinces[pid]);const payload={city:pack(m.city),heights:m.heights,excavations:m.excavations,triangles:m.triangles,meshes};
 const buffers=new Set();function visit(v){if(ArrayBuffer.isView(v))buffers.add(v.buffer);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);}visit(payload);
 self.postMessage({id,payload},[...buffers]);
 }catch(error){self.postMessage({id,error:error.message,stack:error.stack});}};
