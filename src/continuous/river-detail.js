/** One river surface for a close atlas view, including inherited town tributaries. */
const RiverDetail=(()=>{
 const COLOR=rgb('#558f95'),MAX_TRIANGLES=180000,PIXELS=12,worldIds=new WeakMap();let serial=0;
 // Use the surveyed channel width near towns; atlas map symbols deliberately
 // exaggerate width and height so drainage is readable from the whole world.
 const dimensions=CityEnvironment.cityDimensions,riverScale=dimensions.span*CityEnvironment.cityFootprint/dimensions.width*Math.sqrt(AtlasSpace.X*AtlasSpace.Z);
 const pow2=(x,lo,hi)=>clamp(2**Math.ceil(Math.log2(Math.max(1,x))),lo,hi);
 const point=i=>[(i%GW/(GW-1)-.5)*MAP_X,((i/GW|0)/(GH-1)-.5)*MAP_Z];
 function sources(layer){const w=layer.r.world||layer.world,result=new Map();if(!w?.flow||!w.height)return[];
  const down=w.riverDown||w.down;
  for(let i=0;i<GN;i++){const d=down?.[i],threshold=w.channelThreshold?.[i]||w.riverThreshold;
   if(!(w.height[i]>0&&w.flow[i]>threshold&&d>=0&&w.lake[i]<0&&w.biome[i]!==14&&w.ice[i]<25)||Math.abs(i%GW-d%GW)>2)continue;
   result.set(i,{id:i,to:d,a:point(i),b:point(d),width:CityEnvironment.riverWidth(w,i)*riverScale,mapWidth:clamp(.025+Math.sqrt(w.flow[i]/threshold)*.028,.03,.16),flow:w.flow[i],town:false});
  }
  // Town surveying also resolves small tributaries below the atlas threshold.
  // A parent source cell is drawn once, even when two loaded towns share it.
  if(w===layer.world)for(const m of layer.models.values())for(const stream of m.city?.rivers||[]){
   const a=m.frame.vertex(stream.a.x,m.frame.localGround(stream.a.x,stream.a.z),stream.a.z),b=m.frame.vertex(stream.b.x,m.frame.localGround(stream.b.x,stream.b.z),stream.b.z),ga=AtlasSpace.grid(a[0],a[2]),gb=AtlasSpace.grid(b[0],b[2]),i=Math.round(ga[1])*GW+Math.round(ga[0]),d=Math.round(gb[1])*GW+Math.round(gb[0]);
   if(i<0||i>=GN||d<0||d>=GN||result.has(i)||Math.abs(i%GW-d%GW)>2)continue;
   result.set(i,{id:i,to:d,a:point(i),b:point(d),width:stream.width*m.frame.scale,flow:w.flow[i]||0,town:true});
  }
  const nodes=new Map(),node=i=>{if(!nodes.has(i))nodes.set(i,{width:0,incoming:null,outgoing:null});return nodes.get(i);};
  for(const s of result.values()){const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],length=Math.hypot(dx,dz);if(length<1e-10)continue;s.direction=[dx/length,dz/length];
   const a=node(s.id),b=node(s.to);a.width=Math.max(a.width,s.width);b.width=Math.max(b.width,s.width);a.outgoing=s;
   if(!b.incoming||s.flow>b.incoming.flow)b.incoming=s;
  }
  for(const n of nodes.values()){const a=(n.incoming||n.outgoing).direction,b=(n.outgoing||n.incoming).direction,na=[-a[1],a[0]],nb=[-b[1],b[0]],sum=[na[0]+nb[0],na[1]+nb[1]],length=Math.hypot(...sum),normal=length>1e-8?sum.map(x=>x/length):nb;
   const size=n.width/Math.max(.5,normal[0]*nb[0]+normal[1]*nb[1]);n.cross=normal.map(x=>x*size);
  }
  return[...result.values()].filter(s=>s.direction).map(s=>({...s,crossA:nodes.get(s.id).cross,crossB:nodes.get(s.to).cross}));
 }
 function key(layer){const r=layer.r,w=r.world||layer.world;if(!w)return'none';if(!worldIds.has(w))worldIds.set(w,++serial);
  if(!layer.natural)return'far/'+worldIds.get(w)+'/'+r.relief;
  r.updateCamera();const pixel=2*r.halfH/r.height,b=layer.viewBox();
  return[worldIds.get(w),r.relief,Math.round(Math.log2(pixel)*8),r.width,r.height,...[b.x0,b.x1,b.y0,b.y1].map(x=>Math.floor(x*4)),Math.round(r.target[1]*100),Math.round(r.azimuth*50),Math.round(r.elevation*50),...[...layer.models.values()].map(m=>m.key??m.p.id)].join('/');
 }
 function plan(layer,segments=sources(layer)){
  const r=layer.r,w=r.world||layer.world;r.updateCamera();const pixel=2*r.halfH/r.height,box=layer.viewBox(),sample=(x,z)=>{const p=AtlasSpace.grid(x,z);return AtlasSpace.surface(w,p[0],p[1],r.relief);};
  let longestCross=0;const near=[],far=[];
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],sample(...a)-sample(...b));
  for(const s of segments){const a=AtlasSpace.grid(...s.a),b=AtlasSpace.grid(...s.b),pad=Math.max(Math.hypot(...s.crossA),Math.hypot(...s.crossB))/Math.min(AtlasSpace.X,AtlasSpace.Z);
   if(Math.max(a[0],b[0])+pad<box.x0||Math.min(a[0],b[0])-pad>box.x1||Math.max(a[1],b[1])+pad<box.y0||Math.min(a[1],b[1])-pad>box.y1){far.push(s);continue;}
   let length=0,prev=null;for(let j=0;j<=8;j++){const t=j/8,p=s.a.map((x,k)=>lerp(x,s.b[k],t));if(prev)length+=distance(prev,p);prev=p;
    const cross=s.crossA.map((x,k)=>lerp(x,s.crossB[k],t)),left=p.map((x,k)=>x+cross[k]),right=p.map((x,k)=>x-cross[k]);longestCross=Math.max(longestCross,distance(left,p)+distance(p,right));
   }near.push({...s,length});
  }
  let target=PIXELS,across,triangles,items;
  do{across=pow2(longestCross/(pixel*target),2,128);items=near.map(s=>({...s,steps:pow2(s.length/(pixel*target),4,512),across}));triangles=items.reduce((n,s)=>n+2*s.steps*across,0);
   if(triangles<=MAX_TRIANGLES||target>2048)break;target*=Math.max(1.1,Math.sqrt(triangles/MAX_TRIANGLES));
  }while(true);
  return{items,far,across,pixel,target,triangles,sample,lift:Math.min(.004,pixel*.7)};
 }
 function townMesh(layer,model){
  const frame=model.frame,city=model.city,lo=frame.at(-city.width*.65,-city.depth*.65),hi=frame.at(city.width*.65,city.depth*.65),box={x0:lo[0],x1:hi[0],y0:lo[1],y1:hi[1]};
  // Exports use a fixed detail view, independent of the live camera or window.
  const r=Object.assign(Object.create(layer.r),{zoom:240,width:1440,height:900,selected:-1,target:frame.origin});
  const view={r,world:layer.world,models:layer.models,viewBox:()=>box},p=plan(view),g=new Geometry();
  for(const s of p.items)RiverMesh.ribbon(g,{...s,sample:p.sample,color:COLOR,lift:p.lift});
  return{vertices:new Float32Array(g.data)};
 }
 function build(layer){const r=layer.r;if(!r.world)return;const p=plan(layer),g=new Geometry();
  for(const s of p.items)RiverMesh.ribbon(g,{...s,sample:p.sample,color:COLOR,lift:p.lift});
  // The padded neighbourhood gets the fine mesh; distant drainage stays cheap.
  // It is outside the visible refinement window, but survives quick camera pans.
  for(const s of p.far){let previous=null;for(let j=0;j<=4;j++){const t=j/4,x=lerp(s.a[0],s.b[0],t),z=lerp(s.a[1],s.b[1],t),v=[x,p.sample(x,z)+.095,z];if(previous)g.line(previous,v,s.mapWidth??s.width,COLOR);previous=v;}}
  r.upload('rivers',g,false,.2);layer.lastRiverKey=key(layer);layer.riverStats={segments:p.items.length,triangles:g.data.length/27,detailTriangles:p.triangles,across:p.across,maxSteps:Math.max(0,...p.items.map(s=>s.steps)),targetPixels:p.target,lift:p.lift};
  return layer.riverStats;
 }
 return{sources,key,plan,build,townMesh,MAX_TRIANGLES};
})();
