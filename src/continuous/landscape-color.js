/** Close terrain materials, sampled continuously in parent-world coordinates. */
const LandscapeColor=(()=>{
 const cache=new WeakMap(),STRIDE=10;
 const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
 function prepare(w){
  let data=cache.get(w);if(data)return data;
  data=new Float32Array(GN*STRIDE);const heights=new Float32Array(GN);
  for(let i=0;i<GN;i++){
   const o=i*STRIDE,b=w.biome[i],h=w.height[i],t=w.temp[i],a=w.arid[i];
   const cl=CityEnvironment.climate(t,a,h,w.ice?.[i]||0,b===1||b===16?1:0,w.seasonTemp?Math.min(w.seasonTemp[0][i],w.seasonTemp[1][i]):t);
   data[o]=h>0&&!(w.lake[i]>0)?1:0;
   data[o+1]=cl.cover;data[o+2]=clamp((.85-a)/.8);
   data[o+3]=clamp((a-.65)/1.9)*.8+clamp(w.wetness?.[i]||0)*.2;
   data[o+4]=clamp((t-7)/20);data[o+5]=cl.cold;data[o+6]=cl.alpine;
   data[o+7]=b===13?.85:b===3?.45:b===12?.22:.04;
   data[o+8]=b===4||b===14?1:0;
   heights[i]=CityEnvironment.atlasHeight(w,i,1);
  }
  // A continuous fallback slope for consumers without terrain normals. Compute
  // it once, rather than resampling four height derivatives at every vertex.
  const X=MAP_X/(GW-1),Z=MAP_Z/(GH-1);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
   const i=y*GW+x,dx=(heights[y*GW+Math.min(GW-1,x+1)]-heights[y*GW+Math.max(0,x-1)])/(2*X),dz=(heights[Math.min(GH-1,y+1)*GW+x]-heights[Math.max(0,y-1)*GW+x])/(2*Z);
   data[i*STRIDE+9]=Math.hypot(dx,dz);
  }
  cache.set(w,data);return data;
 }
 function sample(w,gx,gy,baseRGB,{slope,relief=1}={}){
  const data=prepare(w),x=clamp(gx,0,GW-1),y=clamp(gy,0,GH-1),ax=Math.min(GW-2,Math.floor(x)),ay=Math.min(GH-2,Math.floor(y)),u=x-ax,v=y-ay;
  const a=(ay*GW+ax)*STRIDE,b=a+STRIDE,c=a+GW*STRIDE,d=c+STRIDE;
  const field=k=>lerp(lerp(data[a+k],data[b+k],u),lerp(data[c+k],data[d+k],u),v);
  const land=field(0),cover=field(1),strength=land*(1-cover)*(1-cover);
  if(strength<1e-6)return baseRGB.slice();
  const dry=field(2),wet=field(3),warm=field(4),cold=field(5),alpine=field(6),rock=field(7),sand=field(8);
  const steep=smooth(.13,.95,Number.isFinite(slope)?Math.max(0,slope):field(9)*Math.max(0,relief));
  // Three rotated, non-integer frequency bands avoid alignment with either
  // parent-cell boundaries or their former terrain diagonals. Small patches
  // carry exposed soil and stone; the broad band only modulates their moisture.
  const seed=w.seed|0,broad=noise(x*.83+y*.19+11,y*.89-x*.23+37,seed+211),patch=noise(x*3.1+y*.73+41,y*2.93-x*.51+9,seed+223),fine=noise(x*13.7+y*4.1+17,y*12.9-x*3.3+23,seed+229);
  const exposure=smooth(.30,.82,.5+patch*.36+fine*.19+broad*.13);
  const soil=exposure*(.25+dry*.45+warm*.48)*(1-cold*.48)*(1-steep*.35);
  const stone=clamp((steep*.83+alpine*.25+rock*.42)*(.37+smooth(-.55,.65,patch-fine*.24)*.63),0,.76);
  const moss=wet*(1-cold*.8)*(1-exposure)*(1-stone)*smooth(-.7,.5,broad)*.17;
  const damp=wet*(1-steep)*(1-alpine*.45)*smooth(.05,.72,-broad+patch*.2)*.19;
  const light=1+broad*.035+patch*.028+fine*.022;
  const result=new Array(3);
  for(let k=0;k<3;k++){
   const base=baseRGB[k];let value=base*light;
   const earth=k===0?.43+warm*.14:k===1?.42+warm*.005:.36-warm*.075;
   const mineral=k===0?.51+dry*.07-cold*.05:k===1?.50+dry*.035-cold*.015:.46+dry*.005+cold*.025;
   // Sandy and saline ground retain their existing hue instead of acquiring
   // forest moss or a new soil palette merely because the camera is close.
   value=lerp(value,lerp(earth,base*.98,sand),soil);
   value=lerp(value,lerp(mineral,base*.92,sand),stone);
   value=lerp(value,k===0?.39:k===1?.44:.29,moss*(1-sand));
   value=lerp(value,k===0?.23:k===1?.29:.255,damp*(1-sand));
   result[k]=clamp(lerp(base,value,strength));
  }
  return result;
 }
 return{sample};
})();
