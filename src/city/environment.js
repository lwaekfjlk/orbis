/** Read-only bridge between world geography and every town detail layer.
 * Continuous quantities are interpolated; biome IDs are NEVER averaged. Ground
 * colors use the same biome palette as the world, independent of town recipes.
 * Ice is inherited from the cryosphere, not invented from altitude or a style.
 */
const CityEnvironment = (() => {
 const version=1, cached=new WeakMap(), profiles=new WeakMap();
 const rgbHex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 const colors=BIOME.map(b=>rgbHex(b[1]));
 const frozen=rgbHex('#d9eff0');
 const forestDensity={7:.46,8:.52,9:.67,10:.42,11:.74,6:.07,20:.04};
 function prepare(w){
  let a=cached.get(w);if(a)return a;
  a={water:new Uint8Array(GN),kind:new Uint8Array(GN),surface:new Float32Array(GN)};
  for(let i=0;i<GN;i++){
   const lake=w.lake[i]>0,sea=w.height[i]<=0;
   a.water[i]=lake||sea?1:0;a.kind[i]=lake?2:sea?1:0;
   a.surface[i]=lake?w.lake[i]:sea?0:w.height[i]+(w.ice?.[i]||0);
  }
  cached.set(w,a);return a;
 }
 function cellColor(w,i){
  const b=w.biome[i],h=w.height[i];
  if(w.lake[i]>0)return waterColor(2);
  if(h<=0)return waterColor(1);
  if(w.ice[i]>25){const f=clamp(w.ice[i]/900),a=rgbHex('#a1d5df'),z=rgbHex('#eef3ee');return a.map((v,k)=>v+(z[k]-v)*f);}
  let c=(colors[b]||colors[3]).slice();
  const blend=(z,t)=>{c=c.map((v,k)=>v+(z[k]-v)*clamp(t));};
  if([7,8,9,10,11].includes(b))blend(rgbHex('#a6b486'),.40);
  if(h>2300&&b!==1&&b!==16)blend(rgbHex(b===13?'#b59e86':'#939589'),(h-2300)/1500);
  // No altitude-only snow or warm-arid beach tint. Snow/ice come from the world.
  return c;
 }
 function sample(w,x,y){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=prepare(w),xx=Math.floor(x),yy=Math.floor(y),u=x-xx,v=y-yy;
  const ids=[yy*GW+xx,yy*GW+Math.min(GW-1,xx+1),Math.min(GH-1,yy+1)*GW+xx,Math.min(GH-1,yy+1)*GW+Math.min(GW-1,xx+1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  const s={parentIndex:Math.round(y)*GW+Math.round(x),worldX:x,worldY:y,bed:0,surface:0,temperature:0,aridity:0,rain:0,ice:0,snow:0,wetness:0,farm:0,treeDensity:0,water:0,waterKind:0,color:[0,0,0]};
  let waterWeight=0,lakeWeight=0,landWeight=0,bestWeight=-1;
  for(let k=0;k<4;k++){
   const i=ids[k],t=weights[k],b=w.biome[i],land=!a.water[i];
   s.bed+=t*w.height[i];s.surface+=t*a.surface[i];s.temperature+=t*w.temp[i];s.aridity+=t*w.arid[i];s.rain+=t*w.rain[i];s.ice+=t*(w.ice?.[i]||0);s.wetness+=t*(w.wetness?.[i]||0);s.farm+=t*(w.human?.farm?.[i]||0);
   waterWeight+=t*a.water[i];if(a.kind[i]===2)lakeWeight+=t;
   if(land){
    landWeight+=t;if(t>bestWeight){s.biome=b;bestWeight=t;}
    const snow=b===16||b===1?1:0;s.snow+=t*snow;
    s.treeDensity+=t*(snow?0:(forestDensity[b]||0));
    const col=cellColor(w,i);for(let c=0;c<3;c++)s.color[c]+=t*col[c];
   }
  }
  s.water=waterWeight>.5?1:0;s.waterKind=s.water?(lakeWeight>waterWeight*.5?2:1):0;
  if(s.water){s.biome=s.waterKind===2?15:0;s.color=waterColor(s.waterKind);s.treeDensity=0;s.farm=0;s.snow=0;}
  else if(landWeight>0){for(let c=0;c<3;c++)s.color[c]/=landWeight;s.snow/=landWeight;s.treeDensity/=landWeight;}
  else{s.biome=w.biome[s.parentIndex];s.color=colors[s.biome].slice();}
  return s;
 }
 function waterColor(kind){return rgbHex(kind===1?'#6cabb8':kind===2?'#7ab5b7':'#6fabb9');}
 function profile(w,p){
  let m=profiles.get(w);if(!m){m=new Map();profiles.set(w,m);}if(m.has(p.i))return m.get(p.i);
  const core=sample(w,p.x,p.y);let max=core.bed,min=core.bed,peak={x:p.x,y:p.y,height:core.bed},nearestGlacier=Infinity,forest=0,land=0,biomes=new Set();
  // Read neighborhood context; do not use province averages as local climate.
  for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
   const x=p.x+dx,y=p.y+dy;if(x<0||x>=GW||y<0||y>=GH)continue;const i=y*GW+x;
   if(w.height[i]<=0||w.lake[i]>0)continue;
   const h=w.height[i];if(h>max){max=h;peak={x,y,height:h};}min=Math.min(min,h);land++;biomes.add(w.biome[i]);if(forestDensity[w.biome[i]]>.3)forest++;
   if(w.ice[i]>25||w.biome[i]===1)nearestGlacier=Math.min(nearestGlacier,Math.hypot(dx,dy));
  }
  const mountainous=max>1800&&max-min>1200,glacialFoothills=mountainous&&nearestGlacier<=6.5;
  const label=glacialFoothills?`${BIOME[core.biome][0]} · glacial foothills`:mountainous?`${BIOME[core.biome][0]} · mountain slopes`:BIOME[core.biome][0];
  const out={...core,version,label,maxElevation:max,minElevation:min,relief:max-min,peak,nearestGlacier:Number.isFinite(nearestGlacier)?nearestGlacier:null,glacialFoothills,mountainous,forestFraction:land?forest/land:0,biomes:[...biomes]};
  m.set(p.i,out);return out;
 }
 function createGrid(n){const grid={n};for(const key of ['bed','surface','temperature','aridity','rain','ice','snow','wetness','farm','treeDensity'])grid[key]=new Float32Array(n*n);grid.parentIndex=new Int32Array(n*n);grid.biome=new Uint8Array(n*n);grid.color=new Float32Array(n*n*3);return grid;}
 function write(grid,k,s){for(const key of ['bed','surface','temperature','aridity','rain','ice','snow','wetness','farm','treeDensity','parentIndex','biome'])grid[key][k]=s[key];grid.color.set(s.color,k*3);}
 function hash(grid){let h=2166136261;for(const key of ['bed','surface','biome','temperature','aridity','rain','ice','snow','color']){const a=grid[key],bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const byte of bytes){h^=byte;h=Math.imul(h,16777619);}}return(h>>>0).toString(16).padStart(8,'0');}
 function context(w,p,city,elevate){
  // A read-only wider ring. Same sample pitch and exact inner boundary as the town.
  const n=city.n*2-1,g=createGrid(n),count=n*n,context={...g,width:city.width*2,depth:city.depth*2,height:new Float32Array(count),water:new Uint8Array(count),waterKind:new Uint8Array(count),innerStart:(city.n-1)/2,innerEnd:(city.n-1)*1.5};
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const k=y*n+x,gx=p.x+(x/(n-1)-.5)*city.span*2,gy=p.y+(y/(n-1)-.5)*city.span*2*city.depth/city.width,s=sample(w,gx,gy);
   write(context,k,s);context.water[k]=s.water;context.waterKind[k]=s.waterKind;context.height[k]=elevate(s.surface);
  }
  context.xy=k=>({x:(k%n/(n-1)-.5)*context.width,z:(Math.floor(k/n)/(n-1)-.5)*context.depth});
  context.signature=hash(context);return context;
 }
 function refineContextRivers(w,p,city){
  const g=city.context,n=g.n,range=Math.ceil(city.span)+2;
  const distance=(q,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1));return Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);};
  for(let yy=Math.max(0,p.y-range);yy<=Math.min(GH-1,p.y+range);yy++)for(let xx=Math.max(0,p.x-range);xx<=Math.min(GW-1,p.x+range);xx++){
   const i=yy*GW+xx,j=w.down[i];if(j<0||w.height[i]<=0||w.lake[i]>0||w.flow[i]<w.riverThreshold*.6)continue;
   const a={x:(xx-p.x)/city.span*city.width,z:(yy-p.y)/city.span*city.width},b={x:(j%GW-p.x)/city.span*city.width,z:(Math.floor(j/GW)-p.y)/city.span*city.width},width=clamp(Math.log1p(w.flow[i]/w.riverThreshold)*.8,.45,2);
   const ix=x=>clamp(Math.round((x/g.width+.5)*(n-1)),0,n-1),iz=z=>clamp(Math.round((z/g.depth+.5)*(n-1)),0,n-1);
   for(let y=iz(Math.min(a.z,b.z)-width);y<=iz(Math.max(a.z,b.z)+width);y++)for(let x=ix(Math.min(a.x,b.x)-width);x<=ix(Math.max(a.x,b.x)+width);x++){
    const k=y*n+x;if(g.water[k]||distance(g.xy(k),a,b)>=width)continue;g.water[k]=1;g.waterKind[k]=3;g.height[k]-=.32;
   }
  }
 }
 function treeKind(g,k){return g.temperature[k]<10||g.biome[k]===8?'pine':'broadleaf';}
 function roofSnow(g,k){return g.snow[k]>.5&&g.ice[k]>0;}
 return {version,cellColor,refineContextRivers,sample,profile,createGrid,write,context,hash,waterColor,treeKind,roofSnow};
})();
