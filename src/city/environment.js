/** Read-only bridge between world geography and every town detail layer.
 * Continuous quantities are interpolated; biome IDs are NEVER averaged. Ground
 * colors use the same biome palette as the world, independent of town recipes.
 * Ice is inherited from the cryosphere, not invented from altitude or a style.
 *
 * `climate()` is the ONE place that turns the physical fields into the factors
 * that colour, vegetation and architecture all read, so the map and the town can
 * never disagree about what kind of place this is. Biome IDs are categorical;
 * temperature and aridity are continuous, and a biome spans most of its own
 * range, so a category alone cannot say whether a forest is boreal or tropical.
 */
const CityEnvironment = (() => {
 const version=4, cityFootprint=.30, cached=new WeakMap(), profiles=new WeakMap();
 const rgbHex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 const colors=BIOME.map(b=>rgbHex(b[1]));
 const frozen=rgbHex('#d9eff0');
 /* Break points are the measured spread of a generated world, not guesses. Over
  * land: temperature p10 -15.0, p25 -6.7, p50 6.2, p75 18.7, p90 24.4 C;
  * aridity p10 .08, p25 .19, p50 .55, p75 1.35, p90 2.36; bedrock p75 1200 m,
  * p90 2061 m. A factor reads 0 at the ordinary end and 1 at the world's own
  * extreme, so nothing saturates across the whole map. */
 function climate(t,a,bed=0,ice=0,snow=0,winter=null){
  const cold=clamp((12-t)/24),warm=clamp((t-10)/16),frost=clamp((8-t)/16),
   dry=clamp((.55-a)/.42),humid=clamp((a-1.35)/1.3),alpine=clamp((bed-1200)/1800);
  // Seasonal snow, from the model's own two-season temperature fields rather than
  // from the annual mean. The `snow` flag alone is the permanent-snow biome, which
  // is 5,996 land cells; 11,794 have a season below freezing. A place whose winter
  // reaches -9 C lies under snow for part of every year even though its annual mean
  // is only -1.3, and drawing it bare was the reason cold towns read as mild ones.
  const w=winter==null?t:winter;
  // Starts just below freezing and saturates near -10: a winter that dips to -1.4
  // carries a dusting, one that reaches -9 is properly under snow. Scaled by moisture,
  // because a cold DRY interior gets far less of it than a cold wet coast.
  const seasonal=clamp((1-w)/11)*clamp(.35+.65*clamp(a/1.1));
  // How much settles and stays: permanent ice and the snow biomes on top of it.
  const cover=clamp(Math.max(seasonal,snow,clamp(ice/45)));
  // Load is what shapes a roof — accumulation, not merely cold.
  const load=clamp(cover*.85+clamp(ice/60)*.35+snow*.35);
  return {t,a,winter:w,cold,warm,frost,dry,humid,alpine,load,cover,
   thermal:clamp((t+18)/46),moisture:clamp(a/2.4),band:band(t,a)};
 }
 /* One thermal vocabulary, and it has to be the SAME numbers the biome classifier
  * uses or the two halves of a description contradict each other: a cell was reading
  * "Warm temperate · humid" beside a biome name of its own that said subtropical.
  * 16.5 and 21 are the classifier's own boundaries. Height is optional and only adds
  * the qualifier — a subtropical highland is a real and distinct place to be, and
  * without it a 3,800 m plateau at 20 degrees of latitude read as plain subtropics. */
 function band(t,a,h=0){
  const thermal=t<-8?'Polar':t<0?'Subpolar':t<8?'Boreal':t<12?'Cool temperate':t<16.5?'Warm temperate':t<21?'Subtropical':'Tropical';
  const moisture=a<.2?'arid':a<.7?'semi-arid':a<1.4?'subhumid':a<2.2?'humid':'perhumid';
  return `${thermal}${h>2200?' highland':''} · ${moisture}`;
 }
 /* Woody cover fraction per biome. Values above .3 count as forest in profile(),
  * which town-tradition routing reads, so every open-country biome is deliberately
  * kept below that line: a steppe now shows scattered scrub instead of nothing, but
  * it is still not a forest. */
 const baseDensity={7:.46,8:.52,9:.67,10:.42,11:.74,6:.28,20:.14,5:.22,2:.16,12:.14,19:.34,18:.11,13:.04,4:.02,3:.05,21:.62,22:.26};
 /* Canopy form and density from the biome AND where the cell sits inside that
  * biome's own climate range. The old table was a flat per-biome constant, so a
  * boreal and a tropical forest grew the same trees, and savanna, steppe, tundra
  * and alpine meadow grew none at all. Density stays 0 where the world has no
  * woody cover; callers still test `treeDensity > 0` before planting. */
 function canopy(biome,t,a){
  let density=baseDensity[biome]||0;
  if(!density)return {density:0,form:'none'};
  // The treeline is a temperature, not an altitude: w.temp already carries the
  // lapse rate, so the same test zones a mountainside and a latitude band.
  if(t<-4)return {density:0,form:'none'};
  if(t<2)density*=clamp((t+4)/6)*.55;
  else if(t<6)density*=.55+.45*clamp((t-2)/4);
  if(a<.35)density*=clamp(a/.35);
  const form=t<-1?'cushion'
   :biome===19?'mangrove'
   :t<6?(density<.14?'cushion':'conifer')
   :biome===8||biome===12?'conifer'
   :t<11?'conifer'
   :biome===11&&a>1.6?'rainforest'
   // The subtropics keep their own two silhouettes. Before they existed, everything
   // humid from 11 to 21 C came out of the same generic broadleaf branch, so the warm
   // half of the temperate world and the whole subtropical band grew one tree.
   :biome===21?'laurel'
   :biome===22?'hardleaf'
   // Open country reads by biome first. A generic warm-and-dry test placed ahead of
   // this turned every steppe into savanna and lost the distinction entirely.
   :biome===6?'acacia'
   :biome===5||biome===2||biome===3||biome===13||biome===4?'scrub'
   :a<.75&&t>=18?'acacia'
   :t>=22&&a>1.2?'palm'
   :'broadleaf';
  return {density:clamp(density),form};
 }
 // Foliage colour follows the same factors, so a stand of trees agrees with the
 // ground it stands on instead of being one hardcoded green at every latitude.
 function leafColor(t,a){
  const c=climate(t,a);
  let col=rgbHex('#5f8a5e');
  const mix=(hex,amount)=>{const z=rgbHex(hex);col=col.map((v,k)=>v+(z[k]-v)*clamp(amount))};
  mix('#3f6a64',c.cold*.85);          // boreal blue-green
  mix('#2f7146',c.warm*c.humid*.80);  // tropical deep green
  mix('#8a9159',c.dry*.65);           // dry olive
  return col;
 }
 // Project the inherited corner heights into one shared continuous patch. Near
 // terrain adds samples of this curved surface; layout and meshes use it too.
 function atlasHeight(w,i,relief=1){const h=w.lake[i]>0?w.lake[i]:w.height[i]>0?w.height[i]+(w.ice?.[i]||0):0;return h>0?.14+Math.pow(h/1000,.98)*relief:0;}
 // Legacy triangular weights remain available for coarse atlas consumers.
 function atlasWeights(x,y){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=Math.min(GW-2,Math.floor(x)),b=Math.min(GH-2,Math.floor(y)),u=x-a,v=y-b,i=b*GW+a;
  if((a+b)%2)return u+v<=1?[[i,i+1,i+GW],[1-u-v,u,v]]:[[i+1,i+GW,i+GW+1],[1-v,1-u,u+v-1]];
  return v>=u?[[i,i+GW,i+GW+1],[1-v,v-u,u]]:[[i,i+GW+1,i+1],[1-u,v,u-v]];
 }
 function atlasSurface(w,x,y,relief=1){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=Math.min(GW-2,Math.floor(x)),b=Math.min(GH-2,Math.floor(y)),u=x-a,v=y-b,i=b*GW+a;
  const top=lerp(atlasHeight(w,i,relief),atlasHeight(w,i+1,relief),u),bottom=lerp(atlasHeight(w,i+GW,relief),atlasHeight(w,i+GW+1,relief),u);
  return lerp(top,bottom,v);
 }
 function atlasGrade(w,x,y,relief=1){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=Math.min(GW-2,Math.floor(x)),b=Math.min(GH-2,Math.floor(y)),u=x-a,v=y-b,i=b*GW+a;
  const h00=atlasHeight(w,i,relief),h10=atlasHeight(w,i+1,relief),h01=atlasHeight(w,i+GW,relief),h11=atlasHeight(w,i+GW+1,relief);
  // Differentiate the same bilinear patch, including its cross term. Reusing a
  // triangle's constant grade would route streets against a different hillside.
  return Math.hypot(lerp(h10-h00,h11-h01,v)/(MAP_X/(GW-1)),lerp(h01-h00,h11-h10,u)/(MAP_Z/(GH-1)));
 }
 // Each bilinear patch reaches its extrema at the corners of a rectangular
 // clipping. Include all parcel/grid intersections to cover patches whose peaks
 // lie between the usual nine footprint samples; diagonal samples are unnecessary.
 function atlasBounds(w,x0,y0,x1,y1,relief=1){
  x0=clamp(x0,0,GW-1);x1=clamp(x1,0,GW-1);y0=clamp(y0,0,GH-1);y1=clamp(y1,0,GH-1);
  let low=Infinity,top=-Infinity;const sample=(x,y)=>{const h=atlasSurface(w,x,y,relief);low=Math.min(low,h);top=Math.max(top,h);};
  for(const x of[x0,x1])for(const y of[y0,y1])sample(x,y);
  for(let x=Math.ceil(x0);x<=Math.floor(x1);x++){sample(x,y0);sample(x,y1);for(let y=Math.ceil(y0);y<=Math.floor(y1);y++)sample(x,y);}
  for(let y=Math.ceil(y0);y<=Math.floor(y1);y++){sample(x0,y);sample(x1,y);}
  return{low,top};
 }
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
  const cl=climate(w.temp[i],w.arid[i],h,w.ice[i]);
  // Canopy shading used to be one khaki at 40% over all five forest biomes,
  // which collapsed boreal and tropical forest onto nearly the same colour.
  // Interpolate a cold canopy into a warm one instead, continuously: a forest
  // reads its own temperature rather than which of five categories it fell in.
  if([7,8,9,10,11,19,21,22].includes(b)){
   const cool=rgbHex('#6f9a94'),warmLeaf=rgbHex('#83a855'),m=clamp((cl.t-2)/22);
   blend(cool.map((v,k)=>v+(warmLeaf[k]-v)*m),.30);
  }
  // Continuous grading INSIDE the biome. Capped so the category still reads:
  // this separates the two ends of a biome's range, it does not repaint it.
  blend(rgbHex('#8aa2b0'),cl.cold*cl.cold*.40); // cold ground goes blue-slate
  blend(rgbHex('#bb9d5c'),cl.warm*.18);         // warm ground goes ochre
  // Dry ground pales, but toward different things: a cold desert is grey-tan gravel
  // and a hot one is bright sand. One shared target left them near-identical, and
  // left the two ends of a single desert biome 12 C apart looking the same.
  {const cool=rgbHex('#b6b0a1'),hot=rgbHex('#e8c47f');blend(cool.map((v,k)=>v+(hot[k]-v)*cl.warm),cl.dry*.34);}
  blend(rgbHex('#3f7551'),cl.humid*.24);        // wet ground deepens and saturates
  // Bare rock and scree above the local treeline. Gated on elevation as well as
  // cold: a cold LOW plain is tundra and keeps its own colour, while a cold HIGH
  // slope loses its cover. Temperature already carries the lapse rate, so this
  // zones by real elevation without a fixed metre constant.
  if(b!==1&&b!==16)blend(rgbHex(b===13||cl.dry>.5?'#b59e86':'#939589'),cl.alpine*(.30+.45*clamp((cl.frost-.45)*1.8)));
  // Stored ice below the glacier threshold is real world data, not invented
  // snow: show it as faint frost rather than discarding it entirely.
  if(w.ice[i]>0&&w.ice[i]<=25)blend(frozen,clamp(w.ice[i]/25)*.30);
  return c;
 }
 function sample(w,x,y){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=prepare(w),xx=Math.floor(x),yy=Math.floor(y),u=x-xx,v=y-yy;
  const ids=[yy*GW+xx,yy*GW+Math.min(GW-1,xx+1),Math.min(GH-1,yy+1)*GW+xx,Math.min(GH-1,yy+1)*GW+Math.min(GW-1,xx+1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  const s={parentIndex:Math.round(y)*GW+Math.round(x),worldX:x,worldY:y,bed:0,surface:0,temperature:0,aridity:0,rain:0,ice:0,snow:0,wetness:0,farm:0,treeDensity:0,winter:0,water:0,waterKind:0,color:[0,0,0]};
  let waterWeight=0,lakeWeight=0,landWeight=0,bestWeight=-1;
  for(let k=0;k<4;k++){
   const i=ids[k],t=weights[k],b=w.biome[i],land=!a.water[i];
   s.bed+=t*w.height[i];s.surface+=t*a.surface[i];s.temperature+=t*w.temp[i];s.winter+=t*(w.seasonTemp?Math.min(w.seasonTemp[0][i],w.seasonTemp[1][i]):w.temp[i]);s.aridity+=t*w.arid[i];s.rain+=t*w.rain[i];s.ice+=t*(w.ice?.[i]||0);s.wetness+=t*(w.wetness?.[i]||0);s.farm+=t*(w.human?.farm?.[i]||0);
   waterWeight+=t*a.water[i];if(a.kind[i]===2)lakeWeight+=t;
   if(land){
    landWeight+=t;if(t>bestWeight){s.biome=b;bestWeight=t;}
    const snow=b===16||b===1?1:0;s.snow+=t*snow;
    s.treeDensity+=t*(snow?0:canopy(b,w.temp[i],w.arid[i]).density);
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
   const h=w.height[i];if(h>max){max=h;peak={x,y,height:h};}min=Math.min(min,h);land++;biomes.add(w.biome[i]);if(canopy(w.biome[i],w.temp[i],w.arid[i]).density>.3)forest++;
   if(w.ice[i]>25||w.biome[i]===1)nearestGlacier=Math.min(nearestGlacier,Math.hypot(dx,dy));
  }
  const mountainous=max>1800&&max-min>1200,glacialFoothills=mountainous&&nearestGlacier<=6.5;
  const cl=climate(core.temperature,core.aridity,core.bed,core.ice,core.snow);
  const label=glacialFoothills?`${BIOME[core.biome][0]} · glacial foothills`:mountainous?`${BIOME[core.biome][0]} · mountain slopes`:BIOME[core.biome][0];
  const out={...core,version,label,climate:cl,climateBand:cl.band,maxElevation:max,minElevation:min,relief:max-min,peak,nearestGlacier:Number.isFinite(nearestGlacier)?nearestGlacier:null,glacialFoothills,mountainous,forestFraction:land?forest/land:0,biomes:[...biomes]};
  m.set(p.i,out);return out;
 }
 function createGrid(n){const grid={n};for(const key of ['bed','surface','temperature','aridity','rain','ice','snow','wetness','farm','treeDensity','winter'])grid[key]=new Float32Array(n*n);grid.parentIndex=new Int32Array(n*n);grid.biome=new Uint8Array(n*n);grid.color=new Float32Array(n*n*3);return grid;}
 const GRID_KEYS=['bed','surface','temperature','aridity','rain','ice','snow','wetness','farm','treeDensity','winter','parentIndex','biome'];
 /** Copy one already-sampled cell between two grids of the same pitch. */
 function copyCell(dst,k,src,j){for(const key of GRID_KEYS)dst[key][k]=src[key][j];dst.color.set(src.color.subarray(j*3,j*3+3),k*3);}
 function write(grid,k,s){for(const key of ['bed','surface','temperature','aridity','rain','ice','snow','wetness','farm','treeDensity','winter','parentIndex','biome'])grid[key][k]=s[key];grid.color.set(s.color,k*3);}
 function hash(grid){let h=2166136261;for(const key of ['bed','surface','biome','temperature','aridity','rain','ice','snow','winter','color']){const a=grid[key],bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);for(const byte of bytes){h^=byte;h=Math.imul(h,16777619);}}return(h>>>0).toString(16).padStart(8,'0');}
 function context(w,p,city,elevate){
  const span=city.terrainSpan??city.span;
  // A read-only wider ring. Same sample pitch and exact inner boundary as the town.
  const n=city.n*2-1,g=createGrid(n),count=n*n,context={...g,width:city.width*2,depth:city.depth*2,height:new Float32Array(count),water:new Uint8Array(count),waterKind:new Uint8Array(count),innerStart:(city.n-1)/2,innerEnd:(city.n-1)*1.5};
  // The inner block sits on the town's own coordinates at the town's own pitch — that is
  // exactly what the seam assertion in tests/environment.test.mjs pins. Re-sampling it cost
  // a quarter of the whole context build and could only reproduce numbers already in hand,
  // so it is copied. Everything outside the town is still sampled from the parent world.
  const inner=context.innerStart;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const k=y*n+x,cx=x-inner,cy=y-inner;
   if(cx>=0&&cx<city.n&&cy>=0&&cy<city.n){
    const j=cy*city.n+cx;
    copyCell(context,k,city.environment,j);
    context.water[k]=city.water[j];context.waterKind[k]=city.waterKind[j];context.height[k]=city.height[j];
    continue;
   }
   const gx=p.x+(x/(n-1)-.5)*span*2,gy=p.y+(y/(n-1)-.5)*span*2*city.depth/city.width,s=sample(w,gx,gy);
   write(context,k,s);context.water[k]=s.water;context.waterKind[k]=s.waterKind;context.height[k]=elevate(s.surface);
  }
  context.xy=k=>({x:(k%n/(n-1)-.5)*context.width,z:(Math.floor(k/n)/(n-1)-.5)*context.depth});
  context.signature=hash(context);return context;
 }
 function refineContextRivers(w,p,city){
  const span=city.terrainSpan??city.span,g=city.context,n=g.n,range=Math.ceil(span)+2;
  const distance=(q,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1));return Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);};
  for(let yy=Math.max(0,p.y-range);yy<=Math.min(GH-1,p.y+range);yy++)for(let xx=Math.max(0,p.x-range);xx<=Math.min(GW-1,p.x+range);xx++){
   const i=yy*GW+xx,j=w.down[i];if(j<0||w.height[i]<=0||w.lake[i]>0||w.flow[i]<w.riverThreshold*.6)continue;
   const a={x:(xx-p.x)/span*city.width,z:(yy-p.y)/span*city.width},b={x:(j%GW-p.x)/span*city.width,z:(Math.floor(j/GW)-p.y)/span*city.width},width=clamp(Math.log1p(w.flow[i]/w.riverThreshold)*.8,.45,2);
   const ix=x=>clamp(Math.round((x/g.width+.5)*(n-1)),0,n-1),iz=z=>clamp(Math.round((z/g.depth+.5)*(n-1)),0,n-1);
   for(let y=iz(Math.min(a.z,b.z)-width);y<=iz(Math.max(a.z,b.z)+width);y++)for(let x=ix(Math.min(a.x,b.x)-width);x<=ix(Math.max(a.x,b.x)+width);x++){
    const k=y*n+x;if(g.water[k]||distance(g.xy(k),a,b)>=width)continue;g.water[k]=1;g.waterKind[k]=3;g.height[k]-=.32;
   }
  }
 }
 // The town-grid form of the same resolvers, so a placed tree and the ground
 // under it were decided by one rule.
 function treeKind(g,k){return canopy(g.biome[k],g.temperature[k],g.aridity[k]).form;}
 function localClimate(g,k){return climate(g.temperature[k],g.aridity[k],g.bed[k],g.ice[k],g.snow[k],g.winter?.[k]);}
 // Snow that actually lies on a roof. The old test was the permanent-snow biome
 // AND stored ice, which no ordinary town ever satisfies, so no town was ever drawn
 // under snow. Seasonal cover comes from the model's own cold-season field.
 function snowCover(g,k){return localClimate(g,k).cover;}
 // Seasonal cover for a parent-world cell, for the near-zoom ground.
 function cellCover(w,i){
  const winter=w.seasonTemp?Math.min(w.seasonTemp[0][i],w.seasonTemp[1][i]):w.temp[i];
  return climate(w.temp[i],w.arid[i],w.height[i],w.ice?.[i]||0,w.biome[i]===16||w.biome[i]===1?1:0,winter).cover;
 }
 function roofSnow(g,k){return snowCover(g,k)>.3;}
 return {version,cityFootprint,atlasHeight,atlasWeights,atlasSurface,atlasGrade,atlasBounds,cellColor,refineContextRivers,sample,profile,createGrid,write,context,hash,waterColor,treeKind,roofSnow,snowCover,cellCover,climate,localClimate,canopy,leafColor,band};
})();
