/** Close terrain materials, sampled continuously in parent-world coordinates. */
const LandscapeColor=(()=>{
 const cache=new WeakMap(),STRIDE=19;
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
 function prepare(w){
  const version=w.params?.landformVersion>=3?3:w.params?.landformVersion>=1?1:0,old=cache.get(w);if(old?.version===version)return old.data;
  const data=new Float32Array(GN*STRIDE),heights=new Float32Array(GN);
  for(let i=0;i<GN;i++){
   const o=i*STRIDE,b=w.biome[i],h=w.height[i],t=w.temp[i],a=w.arid[i];
   const cl=CityEnvironment.climate(t,a,h,w.ice?.[i]||0,b===1||b===16?1:0,w.seasonTemp?Math.min(w.seasonTemp[0][i],w.seasonTemp[1][i]):t);
   data[o]=h>0&&!(w.lake[i]>0)&&b!==17?1:0;
   data[o+1]=cl.cover;data[o+2]=clamp((.85-a)/.8);
   data[o+3]=clamp((a-.65)/1.9)*.8+clamp(w.wetness?.[i]||0)*.2;
   data[o+4]=clamp((t-7)/20);data[o+5]=cl.cold;data[o+6]=cl.alpine;
   data[o+7]=b===13?.85:b===3?.45:b===12?.22:.04;
   data[o+8]=b===4||b===14?1:0;
   // Interpolate each rock family separately, never the categorical ID. The
   // resulting weights stay continuous along a red/green or basalt/soil edge.
   const kind=w.params?.landformVersion>=1?w.landform?.[i]||0:0;
   if(data[o]&&b!==1&&b!==16&&!(w.ice?.[i]>25)&&kind>=1&&kind<=4)data[o+9+kind]=clamp(w.landformStrength?.[i]||0);
   data[o+14]=h;
   if(version===3){const cover=CityEnvironment.landCover(w,i);data[o+15]=cover.vegetation;data[o+16]=cover.rock;data[o+17]=cover.rugged;data[o+18]=cover.vegetation+cover.soil+cover.rock;}
   heights[i]=CityEnvironment.atlasHeight(w,i,1);
  }
  // A continuous fallback slope for consumers without terrain normals. Compute
  // it once, rather than resampling four height derivatives at every vertex.
  const X=MAP_X/(GW-1),Z=MAP_Z/(GH-1);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
   const i=y*GW+x,dx=(heights[y*GW+Math.min(GW-1,x+1)]-heights[y*GW+Math.max(0,x-1)])/(2*X),dz=(heights[Math.min(GH-1,y+1)*GW+x]-heights[Math.max(0,y-1)*GW+x])/(2*Z);
   data[i*STRIDE+9]=Math.hypot(dx,dz);
  }
  cache.set(w,{version,data});return data;
 }
 // The far color already contains the shared vegetation/soil/rock mixture. Close
 // detail adds variations to those materials, never a second altitude/slope rock
 // layer over the complete biome. Camera relief therefore cannot strip a forest.
 function coveredSample(w,x,y,baseRGB,field,{normal}={}){
  const land=field(0),cover=field(1),strength=(1-cover)*(1-cover),vegetation=field(15),rock=field(16),rugged=field(17),soil=Math.max(0,1-vegetation-rock);
  const seed=w.seed|0,broad=noise(x*.83+y*.19+11,y*.89-x*.23+37,seed+211),patch=noise(x*3.1+y*.73+41,y*2.93-x*.51+9,seed+223),fine=noise(x*13.7+y*4.1+17,y*12.9-x*3.3+23,seed+229);
  const materials=[field(10),field(11),field(12),field(13)],weight=materials.reduce((a,b)=>a+b,0),p=LandscapePatterns.sample(w,x,y);
  const strata=Math.sin(field(14)*.058+broad*.45)*.5,grain=(p.strata-.5)*.10+(p.scree-.5)*.065;
  const light=1+broad*.025+patch*.019+fine*.014,dune=field(8)*(1-cover)*(1-rock),duneLight=1+(p.dune-.5)*.17+(p.scree-.5)*.045;
  const pole=clamp((GH*.5-y)/20,-1,1),shade=normal&&Number.isFinite(normal[2])?clamp(.5-normal[2]*pole*.5):.5;
  const snow=cover*clamp(.76+shade*.30+(p.wind-.5)*.20-rugged*.57),snowTone=(p.wind-.5)*.065+(p.scree-.5)*.016;
  const iceTone=(p.wind-.5)*.035+(p.ridge-.5)*.055,crack=p.crevasse*(.54+rugged*.13);
  return baseRGB.map((base,k)=>{
   let band=grain*(1-weight);
   for(let j=0;j<4;j++)band+=materials[j]*(j===0?strata*(k===0?.20:k===1?.14:.065):(p.scree-.5)*(j===1?.065:.10));
   let value=base*light+rock*band;
   // Soil flecks are small and inherit the existing hue. Vegetated ground gets
   // green-brown grain, while a dry plateau retains its exposed earth palette.
   value+=(patch*.020+fine*.012)*(soil+vegetation*(k===1?.65:.40));
   value=lerp(base,value,strength)*lerp(1,duneLight,dune);
   value=lerp(value,(k===0?.89:k===1?.935:.965)+snowTone,snow);
   let ice=(k===0?.805:k===1?.89:.935)+iceTone;
   ice=lerp(ice,k===0?.26:k===1?.51:.66,crack);
   ice=lerp(ice,k===0?.95:k===1?.98:.995,p.ridge*.10*(1-p.crevasse));
   value=lerp(value,ice,p.glacier);
   return clamp(lerp(base,value,land));
  });
 }
 function sample(w,gx,gy,baseRGB,{slope,relief=1,normal}={}){
  const data=prepare(w),x=clamp(gx,0,GW-1),y=clamp(gy,0,GH-1),ax=Math.min(GW-2,Math.floor(x)),ay=Math.min(GH-2,Math.floor(y)),u=x-ax,v=y-ay;
  const a=(ay*GW+ax)*STRIDE,b=a+STRIDE,c=a+GW*STRIDE,d=c+STRIDE;
  const field=k=>lerp(lerp(data[a+k],data[b+k],u),lerp(data[c+k],data[d+k],u),v);
  const land=field(0),cover=field(1),strength=(1-cover)*(1-cover);
  if(land===0)return baseRGB.slice();
  const substrate=w.params?.landformVersion>=3?field(18):0;
  if(substrate===1)return coveredSample(w,x,y,baseRGB,field,{normal});
  const dry=field(2),wet=field(3),warm=field(4),cold=field(5),alpine=field(6),rock=field(7),rawSand=field(8),modern=w.params?.landformVersion>=1;
  const materials=modern?[field(10),field(11),field(12),field(13)]:null,materialWeight=materials?materials.reduce((a,b)=>a+b,0):0;
  const steep=smooth(.13,.95,Number.isFinite(slope)?Math.max(0,slope):field(9)*Math.max(0,relief));
  // A sandy biome can contain a sandstone cliff or a basalt rim. Dune hues
  // remain on its flat sand cover, while steep exposed faces show their rock.
  const sand=rawSand*(1-materialWeight*steep);
  // Three rotated, non-integer frequency bands avoid alignment with either
  // parent-cell boundaries or their former terrain diagonals. Small patches
  // carry exposed soil and stone; the broad band only modulates their moisture.
  const seed=w.seed|0,broad=noise(x*.83+y*.19+11,y*.89-x*.23+37,seed+211),patch=noise(x*3.1+y*.73+41,y*2.93-x*.51+9,seed+223),fine=noise(x*13.7+y*4.1+17,y*12.9-x*3.3+23,seed+229);
  const exposure=smooth(.30,.82,.5+patch*.36+fine*.19+broad*.13);
  const soil=exposure*(.25+dry*.45+warm*.48)*(1-cold*.48)*(1-steep*.35);
  const stone=clamp((steep*.83+alpine*.25*(modern?steep:1)+rock*.42)*(.37+smooth(-.55,.65,patch-fine*.24)*.63),0,.76);
  const moss=wet*(1-cold*.8)*(1-exposure)*(1-stone)*smooth(-.7,.5,broad)*.17;
  const damp=wet*(1-steep)*(1-alpine*.45)*smooth(.05,.72,-broad+patch*.2)*.19;
  const light=1+broad*.035+patch*.028+fine*.022;
  // Height and colour use the same warped bands, so an ice fissure is blue
  // where the surface actually dips and a dune's shading follows its crest.
  const p=LandscapePatterns.sample(w,x,y),mountain=(modern?Math.max(p.alpine*steep,rock*(.20+.80*steep)):Math.max(p.alpine,p.rock))*(1-sand);
  const mineralMix=mountain*(.35+steep*.5),mineralTone=(p.strata-.5)*.14+(p.scree-.5)*.085;
  // Sandstone bands follow the physical height of the same continuous patch,
  // rather than diagonal stripes painted across unrelated neighbouring slopes.
  const strata=Math.sin(field(14)*.058+broad*.45)*.5;
  const grit=cold*(1-cover)*(1-sand)*(1-mountain)*.28;
  const duneLight=1+(p.dune-.5)*.17+(p.scree-.5)*.045;
  // Pole-facing slopes retain more snow, but only if the climate supplies it.
  // The smooth latitude factor avoids switching the snow aspect at the equator.
  const pole=clamp((GH*.5-y)/20,-1,1),shade=normal&&Number.isFinite(normal[2])?clamp(.5-normal[2]*pole*.5):.5;
  const snow=cover*clamp(.76+shade*.30+(p.wind-.5)*.20-steep*.57);
  const snowTone=(p.wind-.5)*.065+(p.scree-.5)*.016;
  const iceTone=(p.wind-.5)*.035+(p.ridge-.5)*.055;
  const crack=p.crevasse*(.54+steep*.13);
  const result=new Array(3);
  for(let k=0;k<3;k++){
   const base=baseRGB[k];let value=base*light;
   let earth=k===0?.43+warm*.14:k===1?.42+warm*.005:.36-warm*.075;
   let mineral=k===0?.51+dry*.07-cold*.05:k===1?.50+dry*.035-cold*.015:.46+dry*.005+cold*.025;
   let rockColor=(k===0?.50+dry*.045:k===1?.51+dry*.020:.52-dry*.015)+mineralTone;
   if(materialWeight){
    let soilTone=0,rockTone=0;
    for(let j=0;j<4;j++)if(materials[j]){
     const palette=CityEnvironment.landformPalette(j+1),green=wet*(1-steep)*(j===1?.42:.24);
     soilTone+=materials[j]*lerp(palette.earth[k],palette.green[k],green);
     const band=j===0?strata*(k===0?.20:k===1?.14:.065):(p.scree-.5)*(j===1?.065:.10);
     rockTone+=materials[j]*(palette.mineral[k]+band);
    }
    earth=lerp(earth,soilTone/materialWeight,materialWeight);
    mineral=lerp(mineral,rockTone/materialWeight,materialWeight);
    rockColor=lerp(rockColor,rockTone/materialWeight,materialWeight);
   }
   // Sandy and saline ground retain their existing hue instead of acquiring
   // forest moss or a new soil palette merely because the camera is close.
   value=lerp(value,lerp(earth,base*.98,sand),soil);
   value=lerp(value,lerp(mineral,base*.92,sand),stone);
   value=lerp(value,k===0?.39:k===1?.44:.29,moss*(1-sand));
   value=lerp(value,k===0?.23:k===1?.29:.255,damp*(1-sand));
   value=lerp(base,value,strength);
   value=lerp(value,rockColor,mineralMix);
   value=lerp(value,value+(p.scree-.5)*.13+(p.strata-.5)*.055,grit);
   value*=lerp(1,duneLight,sand*(1-cover));
   value=lerp(value,(k===0?.89:k===1?.935:.965)+snowTone,snow);
   // Permanent land ice gets a complete cold mineral palette. Its deepest
   // fissures expose blue ice; they never reveal the grass/soil branch below.
   let ice=(k===0?.805:k===1?.89:.935)+iceTone;
   ice=lerp(ice,k===0?.26:k===1?.51:.66,crack);
   ice=lerp(ice,k===0?.95:k===1?.98:.995,p.ridge*.10*(1-p.crevasse));
   value=lerp(value,ice,p.glacier);
   result[k]=clamp(lerp(base,value,land));
  }
  // A mixed ice/soil cell approaches the untouched glacier palette continuously;
  // switching branches at the first nonzero soil weight would leave an ice seam.
  if(substrate>0){const covered=coveredSample(w,x,y,baseRGB,field,{normal});return result.map((v,k)=>lerp(v,covered[k],substrate));}
  return result;
 }
 return{sample};
})();
