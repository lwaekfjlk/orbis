/* Appended to the trusted engine by scripts/build.mjs. No user code is executed. */
self.window=self;self.requestAnimationFrame=()=>0;
let loadedWorld=null;
const pack=value=>typeof value==='function'?undefined:ArrayBuffer.isView(value)?value:Array.isArray(value)?value.map(pack):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,pack(v)])):value;
self.onmessage=e=>{const{id,world:w,sim:s,pid,relief}=e.data;try{
 if(w)loadedWorld=w;if(!loadedWorld)throw Error('Missing parent geography in mesh worker.');self.world=loadedWorld;self.sim=s;
 const meshes={};const r={relief,upload(name,g,shadow=true,unlit=0,alpha=1){meshes[name]={vertices:new Float32Array(g.data),count:g.data.length/9,shadow,unlit,alpha};}};
 const layer=new ContinuousCityLayer(r);layer.world=loadedWorld;layer.sim=s;
 const m=layer.build(s.provinces[pid]);const payload={city:pack(m.city),heights:m.heights,excavations:m.excavations,triangles:m.triangles,meshes};
 const buffers=new Set();function visit(v){if(ArrayBuffer.isView(v))buffers.add(v.buffer);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);}visit(payload);
 self.postMessage({id,payload},[...buffers]);
 }catch(error){self.postMessage({id,error:error.message,stack:error.stack});}};
