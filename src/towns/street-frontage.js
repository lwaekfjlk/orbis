/** Street-facing fittings in the same unplaced art-space as ArtisanCityKit.
 * The survey, population, parcel count and house RNG remain untouched. A plan is
 * plain data: the caller records each finished house before building its fittings.
 */
const StreetFrontage=(()=>{
 const connectorCache=new WeakMap();
 function connection(list,id){
  if(!Array.isArray(list))return null;
  let cached=connectorCache.get(list);
  if(!cached||cached.length!==list.length||cached.first!==list[0]||cached.last!==list[list.length-1]){
   cached={length:list.length,first:list[0],last:list[list.length-1],byId:new Map(list.map((q,index)=>[q.blockId,{q,index}]))};connectorCache.set(list,cached);
  }
  const hit=cached.byId.get(id);
  // Existing objects can change their endpoints without invalidating this index.
  // Replacement of an indexed slot is repaired lazily; the generator otherwise
  // replaces the array, and history does not mutate its block identities.
  if(hit&&list[hit.index]!==hit.q){connectorCache.delete(list);return connection(list,id);}
  return hit?.q||null;
 }
 const bound=(v,a,b)=>Math.max(a,Math.min(b,v));
 const finite=(v,f=0)=>Number.isFinite(v)?v:f;
 const sides=[{side:'south',angle:0,n:[0,1]},{side:'west',angle:Math.PI/2,n:[-1,0]},{side:'north',angle:Math.PI,n:[0,-1]},{side:'east',angle:-Math.PI/2,n:[1,0]}];
 const hash=text=>{let h=2166136261;for(const s of String(text)){h^=s.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
 const at=(x,z,a,u,v)=>({x:x+u*Math.cos(a)-v*Math.sin(a),z:z+u*Math.sin(a)+v*Math.cos(a)});
 function plan(b,c,CW,CD,options={}){
  const angle=finite(b.angle),cs=Math.cos(angle),sn=Math.sin(angle),turned=Math.abs(sn)>.5,
   pw=turned?b.d:b.w,pd=turned?b.w:b.d,
   local=q=>{const x=q.x-b.x,z=q.z-b.z;return{x:(x*cs+z*sn)*CW/pw,z:(-x*sn+z*cs)*CD/pd};},
   connector=connection(c.connectors,b.id),socket=connector?.b||(b.streetSocket!=null&&typeof c.xy==='function'?c.xy(b.streetSocket):null),
   point=socket&&Number.isFinite(socket.x)&&Number.isFinite(socket.z)?local(socket):{x:0,z:CD},
   side=Math.abs(point.x)/CW>Math.abs(point.z)/CD?(point.x>0?3:1):(point.z<0?2:0),front={...sides[side]},
   along=front.n[0]?CD:CW,depth=front.n[0]?CW:CD,
   authored=connector?.a?local(connector.a):point,
   rawU=authored.x*Math.cos(front.angle)+authored.z*Math.sin(front.angle),
   gap=Math.min(along*.34,Math.max(.72,Math.min(1.35,along*.15))),
   entryU=bound(rawU,-along/2,along/2),entry=at(0,0,front.angle,entryU,depth/2),
   dense=!!b.denseInfill,cols=b.infill?1:Math.max(1,Math.floor(options.cols||Math.round(pw/2.7))),
   ranks=b.infill?1:Math.max(1,Math.floor(options.ranks||Math.round(pd/2.7))),
   commercial=b.type==='workshop'||b.type==='market'||b.program==='market',houses=[];
  Object.assign(front,{entry,entryU,gap,along,depth,source:connector?'connector':socket?'socket':'fallback'});
  for(let row=0;row<ranks;row++)for(let col=0;col<cols;col++){
   const streetFacing=side===0?row===ranks-1:side===2?row===0:side===1?col===0:col===cols-1;
   houses.push({index:houses.length,col,row,x:(col-(cols-1)/2)*CW/cols,z:(row-(ranks-1)/2)*CD/ranks,
    cellWidth:CW/cols,cellDepth:CD/ranks,cell:{x0:-CW/2+col*CW/cols,x1:-CW/2+(col+1)*CW/cols,z0:-CD/2+row*CD/ranks,z1:-CD/2+(row+1)*CD/ranks},angle:front.angle,streetFacing,shop:false});
  }
  // A shop is an inhabited house with a counter, never an extra market building.
  const shops=houses.filter(h=>h.streetFacing).sort((a,b)=>Math.hypot(a.x-entry.x,a.z-entry.z)-Math.hypot(b.x-entry.x,b.z-entry.z)||a.index-b.index);
  if(commercial)for(const h of shops.slice(0,dense?1:2))h.shop=true;
  return {version:1,enabled:!b.landmark&&!b.highRole&&!c.highCitadel&&!['civic','well','granary'].includes(b.type)&&CW>0&&CD>0,
   CW,CD,front,houses,cols,ranks,dense,lod:options.lod??b.lod??2,commercial,
   seed:hash((c.townRecipe?.seed||'street')+'/'+b.id),baseY:.18};
 }
 function build(k,p){
  if(!p?.enabled)return;
  const lod=Math.min(k.lod,p.lod),dense=p.dense;if(dense&&lod===0)return;
  const cl=k.climate||{},material=k.vocab?.material||'masonry',timber=['timber','log','thatch','felt'].includes(material),
   plinth=material==='adobe'?.34:material==='log'?.30+(cl.cover||0)*.22:.27,
   margin=.055,halfX=p.CW/2-margin,halfZ=p.CD/2-margin,front=p.front;
  const rect=(x,z,w,d,a=0)=>{const c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));return{x0:x-(c*w+s*d)/2,x1:x+(c*w+s*d)/2,z0:z-(s*w+c*d)/2,z1:z+(s*w+c*d)/2};};
  const intersects=(a,b)=>a.x0<b.x1-1e-6&&a.x1>b.x0+1e-6&&a.z0<b.z1-1e-6&&a.z1>b.z0+1e-6;
  const inside=r=>r.x0>=-halfX-1e-7&&r.x1<=halfX+1e-7&&r.z0>=-halfZ-1e-7&&r.z1<=halfZ+1e-7;
  // Reserve the approach at the surveyed edge, including off-centre and corner
  // sockets. Canopies may shade it only above walking height; no posts or stock.
  const gateDepth=Math.min(1.1,front.depth*.20),gateCentre=at(0,0,front.angle,front.entryU,front.depth/2-gateDepth/2),
   gate=rect(gateCentre.x,gateCentre.z,front.gap,gateDepth+.12,front.angle);
  const occupied=[];
  for(const h of p.houses){
   if(h.skip||!Number.isFinite(h.w)||!Number.isFinite(h.d))continue;
   occupied.push(rect(h.x,h.z,h.w+.20,h.d+.20,h.angle));
   for(const v of h.volumes||[])if(Number.isFinite(v.x)&&Number.isFinite(v.z)&&v.w>0&&v.d>0)occupied.push(rect(v.x,v.z,v.w,v.d,v.angle||0));
  }
  const box=(x,y,z,w,h,d,m,a=0,walk=false)=>{const r=rect(x,z,w,d,a);if(!inside(r)||(!walk&&y<1.65&&intersects(r,gate)))return false;k.box(x,y,z,w,h,d,m,a);return true;};
  for(const h of p.houses){
   if(h.skip||!(h.w>0&&h.d>0&&h.h>0))continue;
   const angle=finite(h.entrance?.angle,finite(h.angle)),base=finite(h.baseY,p.baseY),
    rise=finite(h.entrance?.baseY,base+finite(h.plinth,plinth))-base,
    stand=finite(h.frontStand,material==='log'?.20:material==='adobe'?.08:0),
    doorWidth=Math.min(h.entrance?.width||.76,h.w*.32),doorX=finite(h.doorX),
    door=h.entrance||at(h.x,h.z,angle,doorX,h.d/2+stand),
    n=[-Math.sin(angle),Math.cos(angle)],
    cell=h.cell||{x0:h.x-h.cellWidth/2,x1:h.x+h.cellWidth/2,z0:h.z-h.cellDepth/2,z1:h.z+h.cellDepth/2},
    // Reach stops inside this household's cell as well as the full parcel.
    clearance=Math.abs(n[0])>.5?(n[0]>0?Math.min(cell.x1,halfX)-door.x:door.x-Math.max(cell.x0,-halfX))-.035
     :(n[1]>0?Math.min(cell.z1,halfZ)-door.z:door.z-Math.max(cell.z0,-halfZ))-.035;
   if(clearance<.08)continue;
   const reach=Math.min(clearance,dense?.19:.52),stepW=Math.min(h.w*.48,doorWidth+.24),steps=lod>0&&!dense&&reach>.27?2:1;
   for(let i=0;i<steps;i++){
    const run=reach*(steps-i)/steps,q=at(door.x,door.z,angle,0,run/2);
    if(box(q.x,base+i*rise/steps,q.z,stepW,rise/steps,run,timber?'wood':'trim',angle,true))k.mark('street-doorstep');
   }
   if(!h.shop||!h.streetFacing||lod===0&&dense)continue;
   // The doorway remains between separate counter bays. No opaque rectangle is
   // laid across it and no fake extra stall occupies the middle of the court.
   const mainWidth=h.volumes?.[0]?.w||h.w,span=Math.min(mainWidth*.90,mainWidth-.16),doorGap=Math.max(doorWidth+.25,Math.min(.98,span*.40)),
    bayW=(span-doorGap)/2,tradeReach=Math.min(clearance,dense?.22:.30+(cl.humid||0)*.14),
    height=Math.min(2.10,Math.max(1.75,h.h*.43)),counterY=base+rise+.65;
   if(bayW<.24||tradeReach<.16)continue;
   let bays=0;
   for(const side of[-1,1]){
    if(dense&&side!==(p.seed%2?1:-1))continue;
    let width=bayW,u=side*(doorGap/2+bayW/2),q=at(door.x,door.z,angle,u,tradeReach/2),r=rect(q.x,q.z,width,tradeReach,angle);
    if(intersects(r,gate)){
     const gu=(front.entry.x-door.x)*Math.cos(angle)+(front.entry.z-door.z)*Math.sin(angle),
      low=u-width/2,high=u+width/2,left=Math.min(high,gu-front.gap/2-.035),right=Math.max(low,gu+front.gap/2+.035);
     if(left-low>high-right){width=left-low;u=(low+left)/2;}else{width=high-right;u=(right+high)/2;}
     q=at(door.x,door.z,angle,u,tradeReach/2);r=rect(q.x,q.z,width,tradeReach,angle);
    }
    if(width<.24||!inside(r)||intersects(r,gate))continue;
    k.mark('open-shop-counter');bays++;
    k.box(q.x,counterY,q.z,width,.10,tradeReach,'wood',angle);
    if(lod>0){
     for(const end of[-1,1]){const leg=at(q.x,q.z,angle,end*(width/2-.045),0);k.box(leg.x,base,leg.z,.08,counterY-base,.08,'wood',angle);}
     k.box(q.x,base+.14,q.z,width,.07,tradeReach*.78,'wood',angle);
    }
   }
   if(!bays||dense)continue;
   const canopyReach=Math.min(clearance,.34+(cl.humid||0)*.24-(cl.load||0)*.10),
    canopySpan=span+.03,canopyStart=door,
    cr=rect(canopyStart.x+n[0]*canopyReach/2,canopyStart.z+n[1]*canopyReach/2,canopySpan,canopyReach,angle);
   if(canopyReach<.16||!inside(cr))continue;
   const drop=.13+(cl.load||0)*.32,top=base+rise+height;
   k.transform(canopyStart.x,top,canopyStart.z,angle,1,()=>{
    k.using('roof',()=>{
     k.mark(cl.load>.35?'snow-pitched-shop-canopy':'street-shop-canopy');
     const W=canopySpan/2,R=canopyReach,T=.065,a=[-W,0,0],b=[W,0,0],c=[W,-drop,R],d=[-W,-drop,R],down=v=>[v[0],v[1]-T,v[2]],
      tone=cl.load>.35?'roof':k.vocab?.material==='felt'?'wall':'roof';
     k.quad(a,d,c,b,tone);k.quad(down(a),down(b),down(c),down(d),tone);
     for(const [v,w]of[[a,b],[b,c],[c,d],[d,a]])k.quad(v,w,down(w),down(v),'trim');
     if(lod>=2)for(const u of[-.25,.25])k.beam([canopySpan*u,.015,0],[canopySpan*u,-drop+.015,R],.023,'trim',4,true);
    });
   });
   if(lod>0)for(const side of[-1,1]){
    const u=side*(canopySpan/2-.055),q=at(canopyStart.x,canopyStart.z,angle,u,canopyReach-.05);
    if(box(q.x,base,q.z,.09,top-base-drop,.09,'wood',angle))k.mark('shop-canopy-post');
   }
  }
  if(dense)return;
  // Only the back and two short returns are enclosed. The entire street face is
  // open, and walls stop when a finished wing or the surveyed approach needs room.
  const thickness=timber?.11:.16,wallHeight=timber?.66:.82+(cl.dry||0)*.12,
   rear=-front.depth/2+margin+thickness/2,along=front.along-2*margin;
  const wall=(u,v,w,d)=>{
   const q=at(0,0,front.angle,u,v),r=rect(q.x,q.z,w,d,front.angle);
   if(!inside(r)||intersects(r,gate)||occupied.some(o=>intersects(r,o)))return;
   k.mark(timber?'backyard-timber-boundary':'backyard-masonry-boundary');
   k.box(q.x,p.baseY,q.z,w,wallHeight,d,timber?'wood':'wall',front.angle);
   if(lod>0)k.box(q.x,p.baseY+wallHeight,q.z,w,.075,d,timber?'wood':'trim',front.angle);
  };
  // Short modules allow a rear annex to displace only its own wall interval.
  const modules=Math.min(4,Math.max(1,Math.ceil(along/3)));
  for(let j=0;j<modules;j++)wall(-along/2+(j+.5)*along/modules,rear,along/modules,thickness);
  const returns=Math.min(front.depth*.18,1.10);
  for(const side of[-1,1])wall(side*(along/2-thickness/2),rear+returns/2,thickness,returns);
 }
 return {plan,build,version:1};
})();
