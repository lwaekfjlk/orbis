/** One georeference, one surface, one camera. No invented city backdrop.
 * Distances are the inherited exaggerated atlas units, NOT metres.
 */
const AtlasSpace = (() => {
 const X=MAP_X/(GW-1), Z=MAP_Z/(GH-1);
 function height(w,i,relief=1){const h=w.lake[i]>0?w.lake[i]:w.height[i]>0?w.height[i]+(w.ice?.[i]||0):0;return h>0?.14+Math.pow(h/1000,.98)*relief:0;}
 function weights(x,y){
  x=clamp(x,0,GW-1);y=clamp(y,0,GH-1);
  const a=Math.min(GW-2,Math.floor(x)),b=Math.min(GH-2,Math.floor(y)),u=x-a,v=y-b,i=b*GW+a;
  if((a+b)%2)return u+v<=1?[[i,i+1,i+GW],[1-u-v,u,v]]:[[i+1,i+GW,i+GW+1],[1-v,1-u,u+v-1]];
  return v>=u?[[i,i+GW,i+GW+1],[1-v,v-u,u]]:[[i,i+GW+1,i+1],[1-u,v,u-v]];
 }
 function surface(w,x,y,relief=1){const[ids,q]=weights(x,y);let h=0;for(let k=0;k<3;k++)h+=height(w,ids[k],relief)*q[k];return h;}
 function point(w,x,y,relief=1){return[(x/(GW-1)-.5)*MAP_X,surface(w,x,y,relief),(y/(GH-1)-.5)*MAP_Z];}
 function grid(x,z){return[(x/MAP_X+.5)*(GW-1),(z/MAP_Z+.5)*(GH-1)];}
 function cityFrame(w,p,c,relief=1){
  const sx=c.span/c.width*X,sz=c.span/c.width*Z,scale=Math.sqrt(sx*sz),origin=point(w,p.x,p.y,relief);
  const at=(x,z)=>[p.x+x/c.width*c.span,p.y+z/c.width*c.span];
  const ground=(x,z)=>{const a=at(x,z);return surface(w,a[0],a[1],relief);};
  const localGround=(x,z)=>{const xx=clamp((x/c.width+.5)*(c.n-1),0,c.n-1),zz=clamp((z/c.depth+.5)*(c.n-1),0,c.n-1),a=Math.floor(xx),b=Math.floor(zz),u=xx-a,v=zz-b,read=(i,j)=>c.height[Math.min(c.n-1,j)*c.n+Math.min(c.n-1,i)];return lerp(lerp(read(a,b),read(a+1,b),u),lerp(read(a,b+1),read(a+1,b+1),u),v);};
  const anchors=new Map();
  // The atlas reads elevation almost linearly while the town grid compresses it through
  // asinh, so a slope the generator judged mild can render as a tall skirt here. Seat the
  // block a quarter of the way up its own fall: the uphill side buries into the bank and
  // only the downhill quarter shows as masonry. A citadel keeps its full podium.
  for(const b of c.buildings){let top=-Infinity,low=Infinity;for(const dx of[-.5,0,.5])for(const dz of[-.5,0,.5]){const y=ground(b.x+dx*b.w,b.z+dz*b.d);top=Math.max(top,y);low=Math.min(low,y);}const seat=low+(top-low)*(b.precinct?.6:.25);anchors.set(b.id,{x:origin[0]+b.x*sx,z:origin[2]+b.z*sz,y:seat+.006,low,top,b,scale});}
  function vertex(x,y,z,anchor=null){return[origin[0]+x*sx,anchor?anchor.y+(y-anchor.b.y)*scale:ground(x,z)+(y-localGround(x,z))*scale+.003,origin[2]+z*sz];}
  return{origin,sx,sz,scale,at,ground,localGround,anchors,vertex};
 }
 function ray(r,sx,sy){r.updateCamera();const nx=(sx/r.width*2-1)*r.halfW,ny=(1-sy/r.height*2)*r.halfH,origin=r.target.map((v,i)=>v+r.right[i]*nx+r.up[i]*ny-r.dir[i]*180);return{origin,dir:r.dir};}
 function pickGround(r,sx,sy){if(!r.world)return null;const{origin,dir}=ray(r,sx,sy);let last=null;const start=(24-origin[1])/dir[1],end=(-.1-origin[1])/dir[1];for(let k=0;k<=96;k++){const t=lerp(start,end,k/96),p=origin.map((v,j)=>v+dir[j]*t),g=grid(p[0],p[2]),d=p[1]-surface(r.world,g[0],g[1],r.relief);if(d<=0&&last){let lo=last.t,hi=t;for(let it=0;it<22;it++){const m=(lo+hi)/2,q=origin.map((v,j)=>v+dir[j]*m),a=grid(q[0],q[2]);if(q[1]>surface(r.world,a[0],a[1],r.relief))lo=m;else hi=m;}const t2=(lo+hi)/2,q=origin.map((v,j)=>v+dir[j]*t2),a=grid(q[0],q[2]);if(a[0]<0||a[0]>GW-1||a[1]<0||a[1]>GH-1)return null;return{point:q,x:a[0],y:a[1],i:cell(Math.round(a[0]),Math.round(a[1]))};}last={t,d};}return null;}
 function hitBox(origin,dir,lo,hi){let t0=0,t1=Infinity;for(let k=0;k<3;k++){if(Math.abs(dir[k])<1e-10){if(origin[k]<lo[k]||origin[k]>hi[k])return Infinity;continue;}const a=(lo[k]-origin[k])/dir[k],b=(hi[k]-origin[k])/dir[k];t0=Math.max(t0,Math.min(a,b));t1=Math.min(t1,Math.max(a,b));}return t0<=t1?t0:Infinity;}
 function matrixFor(frame){return{origin:frame.origin.slice(),horizontalScale:[frame.sx,frame.sz],verticalScale:frame.scale,crs:'TELLURIC_RECTANGULAR_ATLAS'};}
 return{X,Z,height,weights,surface,point,grid,cityFrame,ray,pickGround,hitBox,matrixFor};
})();
