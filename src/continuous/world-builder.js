/** Generate the atlas away from the UI, using the same bundled offline engine. */
const WorldBuilder=(()=>{
 let sequence=0;
 async function direct(params,options,progress){
  const world=await generateWorld(params,progress);
  await progress('08 / Founding towns and trade routes');
  return{world,sim:createCivilization(world,options)};
 }
 async function generate(params,options={},progress=async()=>{}){
  if(typeof window==='undefined'||!window.Worker||!window.TELLURIC_TOWN_WORKER||typeof Blob==='undefined'||typeof URL==='undefined'||typeof URL.createObjectURL!=='function')return direct(params,options,progress);
  const id=++sequence;
  const result=await new Promise((resolve,reject)=>{
   let worker=null,url=null,timer=null,finished=false,discardProgress=false,progressQueue=Promise.resolve();
   function cleanup(){
    clearTimeout(timer);
    if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;try{worker.terminate();}catch{}}
    if(url!==null){try{URL.revokeObjectURL(url);}catch{}url=null;}
   }
   function finish(kind,value){
    if(finished)return;finished=true;discardProgress=kind==='fallback';cleanup();
    // A progress callback can itself paint asynchronously. Do not attach the
    // completed world or begin a fallback until the current paint has finished.
    progressQueue.then(()=>kind==='error'?reject(value):resolve(kind==='fallback'?null:value),reject);
   }
   function arm(){clearTimeout(timer);timer=setTimeout(()=>finish('fallback'),180000);}
   try{
    url=URL.createObjectURL(new Blob([window.TELLURIC_TOWN_WORKER],{type:'application/javascript'}));
    worker=new window.Worker(url);
    worker.onmessage=event=>{
     const data=event.data;
     if(finished||data?.id!==id||data.kind!=='world-build')return;
     arm();
     if(typeof data.progress==='string'){
      progressQueue=progressQueue.then(()=>discardProgress?undefined:progress(data.progress));
      progressQueue.catch(error=>finish('error',error));return;
     }
     if(data.error){
      if(data.failure!=='generation'){finish('fallback');return;}
      const error=new Error(data.error);if(data.stack)error.stack=data.stack;finish('error',error);return;
     }
     if(!ArrayBuffer.isView(data.payload?.world?.height)||!Array.isArray(data.payload?.sim?.provinces)){finish('fallback');return;}
     finish('complete',data.payload);
    };
    worker.onerror=event=>{event?.preventDefault?.();finish('fallback');};
    worker.onmessageerror=()=>finish('fallback');
    arm();worker.postMessage({id,kind:'world-build',params,options});
   }catch{finish('fallback');}
  });
  return result||direct(params,options,progress);
 }
 return{generate};
})();
