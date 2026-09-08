/** One georeference, one surface, one camera. No invented city backdrop.
 * Distances are the inherited exaggerated atlas units, NOT metres.
 */
const AtlasSpace = (() => {
 const X=MAP_X/(GW-1), Z=MAP_Z/(GH-1);
 // Layout surveying and mesh placement share one footprint. The broader site
 // profile still reads the surrounding valley independently of the built area.
 const CITY_FOOTPRINT=CityEnvironment.cityFootprint, TOWN_ZOOM=16, DETAIL_ZOOM=60, MAX_ZOOM=620, BUILDING_LIFT=.02;
 // Town art grows with its surveyed footprint, so this unit is independent of
 // population, camera zoom and whether a city has finished streaming.
 const TOWN_UNIT=CityEnvironment.cityDimensions.span*CITY_FOOTPRINT/CityEnvironment.cityDimensions.width*Math.sqrt(X*Z);
 const height=CityEnvironment.atlasHeight,weights=CityEnvironment.atlasWeights;
 // Visual microrelief shares one surface with roads, rivers, plants and picking.
 // The city survey keeps its original bilinear surface inside protected parcels.
 function surface(w,x,y,relief=1){return CityEnvironment.atlasSurface(w,x,y,relief)+(typeof LandscapeRelief==='undefined'?0:LandscapeRelief.offset(w,x,y,relief));}
 // World-scale map symbols are built against the original two coarse faces.
 // Detail uses the curved patch; rebuild overlays when that view changes over.
 function coarseSurface(w,x,y,relief=1){const[ids,q]=weights(x,y);return ids.reduce((h,i,k)=>h+height(w,i,relief)*q[k],0);}
 function point(w,x,y,relief=1){return[(x/(GW-1)-.5)*MAP_X,surface(w,x,y,relief),(y/(GH-1)-.5)*MAP_Z];}
 function grid(x,z){return[(x/MAP_X+.5)*(GW-1),(z/MAP_Z+.5)*(GH-1)];}
 function cityFrame(w,p,c,relief=1){
  // Parent cells covered by both the surveyed parcels and their mounted meshes.
  const cells=c.terrainSpan??c.span*CITY_FOOTPRINT;
  const sx=cells/c.width*X,sz=cells/c.width*Z,scale=Math.sqrt(sx*sz),origin=point(w,p.x,p.y,relief);
  const at=(x,z)=>[p.x+x/c.width*cells,p.y+z/c.width*cells];
  const ground=(x,z)=>{const a=at(x,z);return surface(w,a[0],a[1],relief);};
  const localGround=(x,z)=>{const xx=clamp((x/c.width+.5)*(c.n-1),0,c.n-1),zz=clamp((z/c.depth+.5)*(c.n-1),0,c.n-1),a=Math.floor(xx),b=Math.floor(zz),u=xx-a,v=zz-b,read=(i,j)=>c.height[Math.min(c.n-1,j)*c.n+Math.min(c.n-1,i)];return lerp(lerp(read(a,b),read(a+1,b),u),lerp(read(a,b+1),read(a+1,b+1),u),v);};
  const anchors=new Map();
  // The parcel survey limits its fall; seat the whole rigid compound above its
  // highest point. Lowering the anchor into a bank buried uphill walls and roofs.
  // A rendering seam is measured in the building's units. A fixed atlas offset
  // added most of a storey beneath small houses, even on level ground.
  for(const b of c.buildings){const a=at(b.x-b.w/2,b.z-b.d/2),z=at(b.x+b.w/2,b.z+b.d/2),{top,low}=CityEnvironment.atlasBounds(w,a[0],a[1],z[0],z[1],relief);anchors.set(b.id,{x:origin[0]+b.x*sx,z:origin[2]+b.z*sz,y:top+BUILDING_LIFT*scale,low,top,b,scale});}
  function vertex(x,y,z,anchor=null,footing=null){
   // Only the support profile follows the rendered parcel fall. Its intermediate
   // retaining steps remain level; the house above keeps its original rigid pose.
   const rise=anchor&&footing?(y-anchor.b.y)/footing.depth*((anchor.y-anchor.low)+.04*scale):anchor?(y-anchor.b.y)*scale:0;
   return[origin[0]+x*sx,anchor?anchor.y+rise:ground(x,z)+(y-localGround(x,z)+BUILDING_LIFT)*scale,origin[2]+z*sz];
  }
  return{origin,sx,sz,scale,cells,at,ground,localGround,anchors,vertex};
 }
 function ray(r,sx,sy){r.updateCamera();const nx=(sx/r.width*2-1)*r.halfW,ny=(1-sy/r.height*2)*r.halfH,origin=r.target.map((v,i)=>v+r.right[i]*nx+r.up[i]*ny-r.dir[i]*180);return{origin,dir:r.dir};}
 function pickGround(r,sx,sy){
  if(!r.world)return null;
  const sample=r.ground?.bind(r)||((x,y)=>surface(r.world,x,y,r.relief)),{origin,dir}=ray(r,sx,sy);
  const start=(24-origin[1])/dir[1],end=(Math.min(-.1,r.continuousLayer?.lowestFloor??-.1)-.01-origin[1])/dir[1];
  // A narrow shaft can fit between the regular samples. Visit its rim crossings
  // and floor explicitly, so the height-field discontinuity cannot skip a wall.
  const steps=Array.from({length:97},(_,k)=>lerp(start,end,k/96));
  steps.push(...(r.continuousLayer?.groundBreakpoints?.(origin,dir,start,end)||[]));steps.sort((a,b)=>a-b);
  let last=null;
  for(const t of steps){const p=origin.map((v,j)=>v+dir[j]*t),g=grid(p[0],p[2]),d=p[1]-sample(g[0],g[1]);
   if(d<=0&&last){let lo=last.t,hi=t;
    for(let it=0;it<22;it++){const m=(lo+hi)/2,q=origin.map((v,j)=>v+dir[j]*m),a=grid(q[0],q[2]);if(q[1]>sample(a[0],a[1]))lo=m;else hi=m;}
    const t2=(lo+hi)/2,q=origin.map((v,j)=>v+dir[j]*t2),a=grid(q[0],q[2]);
    if(a[0]<0||a[0]>GW-1||a[1]<0||a[1]>GH-1)return null;
    return{point:q,x:a[0],y:a[1],i:cell(Math.round(a[0]),Math.round(a[1]))};
   }last={t};
  }return null;
 }
 function hitBox(origin,dir,lo,hi){let t0=0,t1=Infinity;for(let k=0;k<3;k++){if(Math.abs(dir[k])<1e-10){if(origin[k]<lo[k]||origin[k]>hi[k])return Infinity;continue;}const a=(lo[k]-origin[k])/dir[k],b=(hi[k]-origin[k])/dir[k];t0=Math.max(t0,Math.min(a,b));t1=Math.min(t1,Math.max(a,b));}return t0<=t1?t0:Infinity;}
 function matrixFor(frame){return{origin:frame.origin.slice(),horizontalScale:[frame.sx,frame.sz],verticalScale:frame.scale,crs:'TELLURIC_RECTANGULAR_ATLAS'};}
 return{X,Z,CITY_FOOTPRINT,TOWN_ZOOM,DETAIL_ZOOM,MAX_ZOOM,TOWN_UNIT,BUILDING_LIFT,height,weights,surface,coarseSurface,point,grid,cityFrame,ray,pickGround,hitBox,matrixFor};
})();
