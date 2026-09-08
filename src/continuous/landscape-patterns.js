/** Shared material patterns and their height derivatives in parent-grid space.
 * These describe surface detail, never replace the world's physical heights. */
const LandscapePatterns=(()=>{
 const cache=new WeakMap(),STRIDE=5,TAU=Math.PI*2;
 function prepare(w){let state=cache.get(w);if(state)return state;
  const fields=new Float64Array(GN*STRIDE);
  for(let i=0;i<GN;i++){
   const h=w.height[i],b=w.biome?.[i];if(h<=0||w.lake?.[i]>0||b===17)continue;
   const ice=w.ice?.[i]||0,t=w.temp?.[i]??12,a=w.arid?.[i]??1;
   const winter=w.seasonTemp?Math.min(w.seasonTemp[0][i],w.seasonTemp[1][i]):t;
   const cl=CityEnvironment.climate(t,a,h,ice,b===1||b===16?1:0,winter),o=i*STRIDE;
   fields[o]=b===16?1:clamp((ice-1)/44);
   fields[o+1]=cl.cover;
   fields[o+2]=cl.alpine;
   fields[o+3]=Math.max(cl.alpine,b===13?.85:b===3?.28:b===12?.32:0);
   fields[o+4]=b===4?1:b===14?.55:0;
  }
  state={fields,last:null};cache.set(w,state);return state;
 }
 // Value noise with analytic derivatives. The ordinary grass bands retain the
 // original amplitudes and coordinates from the first landscape update.
 function band(x,y,seed,frequency,ox,oy){x=x*frequency+ox;y=y*frequency+oy;
  const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,sx=u*u*(3-2*u),sy=v*v*(3-2*v);
  const A=hash2(a,b,seed),B=hash2(a+1,b,seed),C=hash2(a,b+1,seed),D=hash2(a+1,b+1,seed);
  return [lerp(lerp(A,B,sx),lerp(C,D,sx),sy)*2-1,lerp(B-A,D-C,sy)*12*u*(1-u)*frequency,lerp(C-A,D-B,sx)*12*v*(1-v)*frequency];
 }
 function wave(x,y,ax,ay,warp,amount,phase=0){const p=TAU*(x*ax+y*ay)+warp[0]*amount+phase,c=Math.cos(p)*.5;
  return [.5+Math.sin(p)*.5,c*(TAU*ax+warp[1]*amount),c*(TAU*ay+warp[2]*amount)];
 }
 function blend(a,b,t){return[lerp(a[0],b[0],t[0]),lerp(a[1],b[1],t[0])+(b[0]-a[0])*t[1],lerp(a[2],b[2],t[0])+(b[0]-a[0])*t[2]];}
 function sample(w,gx,gy){const state=prepare(w);if(state.last?.x===gx&&state.last.y===gy)return state.last.value;
  const x=clamp(gx,0,GW-1),y=clamp(gy,0,GH-1),ax=Math.min(GW-2,Math.floor(x)),ay=Math.min(GH-2,Math.floor(y)),u=x-ax,v=y-ay;
  const a=(ay*GW+ax)*STRIDE,b=a+STRIDE,c=a+GW*STRIDE,d=c+STRIDE,F=state.fields;
  const field=k=>[lerp(lerp(F[a+k],F[b+k],u),lerp(F[c+k],F[d+k],u),v),lerp(F[b+k]-F[a+k],F[d+k]-F[c+k],v),lerp(F[c+k]-F[a+k],F[d+k]-F[b+k],u)];
  const glacier=field(0),snow=field(1),alpine=field(2),rock=field(3),sand=field(4),seed=w.seed|0;
  const A=band(x,y,seed+101,1.3,12.7,-8.3),B=band(x,y,seed+307,2.6,-5.1,9.6),grass=A.map((a,k)=>a*.78+B[k]*.22);
  const warp=band(x,y,seed+421,.73,7.2,19.3),grain=band(x,y,seed+433,5.9,31.2,-6.1);
  const slit=wave(x,y,1.65,.51,warp,1.15),ridge=wave(x,y,1.65,.51,warp,1.15,.9),wind=wave(x,y,.42,1.8,warp,1.3);
  const strata=wave(x,y,.78,1.91,warp,1.75),dune=wave(x,y,.58,1.37,warp,2.4);
  const crack=Math.pow(slit[0],10),crackD=10*Math.pow(slit[0],9);
  const iceHeight=[.009*(ridge[0]*2-1)-.010*crack+.006*grass[0],.018*ridge[1]-.010*crackD*slit[1]+.006*grass[1],.018*ridge[2]-.010*crackD*slit[2]+.006*grass[2]];
  const snowHeight=[.012*(wind[0]*2-1)+.004*grass[0],.024*wind[1]+.004*grass[1],.024*wind[2]+.004*grass[2]];
  const rockHeight=[.013*(strata[0]*2-1)+.008*grain[0],.026*strata[1]+.008*grain[1],.026*strata[2]+.008*grain[2]];
  // A second harmonic steepens one side of each dune while keeping a smooth
  // derivative and an unbroken periodic crest.
  const dp=TAU*(x*.58+y*1.37)+warp[0]*2.4,ds=.0135*(Math.cos(dp)+.5*Math.cos(2*dp));
  const sandHeight=[.0135*(Math.sin(dp)+.25*Math.sin(2*dp)),ds*(TAU*.58+warp[1]*2.4),ds*(TAU*1.37+warp[2]*2.4)];
  let h=blend(grass.map(n=>n*.011),rockHeight,rock);h=blend(h,sandHeight,sand);h=blend(h,snowHeight,snow);h=blend(h,iceHeight,glacier);
  const value={height:h[0],dx:h[1],dy:h[2],glacier:glacier[0],snow:snow[0],alpine:alpine[0],rock:rock[0],sand:sand[0],crevasse:crack,ridge:ridge[0],strata:strata[0],wind:wind[0],scree:grain[0]*.5+.5,dune:dune[0]};
  state.last={x:gx,y:gy,value};return value;
 }
 return{sample};
})();
