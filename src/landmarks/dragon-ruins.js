/** Ancient dragon sites: read-only geography queries and original stone geometry.
 * No settlement, population, province, water or height field is written here. */
const DragonRuins=(()=>{
 const version=1,footprint=Object.freeze([36,30]),span=.72;
 const variants=[
  {id:'aerie',name:'Dragon Aerie Ruins',noun:'Aerie',description:'A shattered stone ring encloses an ancient dragon nesting bowl and split shells. Broken spine arches rise above the abandoned clutch.'},
  {id:'spine',name:'Dragon Spine Ruins',noun:'Spine',description:'Colossal dragon-spine arches survive within a fractured ceremonial ring. Fallen ribs and claw-marked stones trace the old approach.'},
  {id:'maw',name:'Dragon Gate Ruins',noun:'Maw',description:'Two fractured, horned jaws guard an ancient dragon court. Beyond them lie a cracked nesting rim and the scattered stones of its outer circle.'}
 ];
 const words=['Ashen','Cinder','Flint','Storm','Sable','Ember','Pale','Obsidian'];
 const cache=new WeakMap();
 function survey(w,x,y){
  let min=Infinity,max=-Infinity;
  // The rotated 36 x 30 structure fits inside this conservative square.
  for(let v=0;v<=8;v++)for(let u=0;u<=8;u++){
   const xx=x+(u/8-.5)*1.04,yy=y+(v/8-.5)*1.04,s=CityEnvironment.sampleSite(w,xx,yy),i=Math.round(yy)*GW+Math.round(xx);
   if(s.water||s.ice>8||s.snow>.12||s.wetness>.28||w.height[i]<=0||w.lake[i]>0||w.flow[i]>w.riverThreshold*.8)return null;
   min=Math.min(min,s.surface);max=Math.max(max,s.surface);
  }
  if(max-min>70)return null;
  const dx=CityEnvironment.atlasSurface(w,x+.2,y)-CityEnvironment.atlasSurface(w,x-.2,y),dz=CityEnvironment.atlasSurface(w,x,y+.2)-CityEnvironment.atlasSurface(w,x,y-.2);
  return{minElevation:min,maxElevation:max,relief:max-min,angle:Math.atan2(dx,-dz),radius:.52};
 }
 function sites(w,s){
  if(!w?.height||!s?.provinces||!w.params)return[];
  // All potential town centres are excluded, not just today's inhabited ones.
  // Ancient sites therefore stay put when a village grows or a realm changes.
  const centres=s.provinces.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>[p.x,p.y]);
  const key=JSON.stringify([w.params.seed,centres]),prior=cache.get(w);
  if(prior?.key===key)return prior.sites;
  const candidates=[];
  for(let y=3;y<GH-3;y++)for(let x=3;x<GW-3;x++){
   const i=y*GW+x;
   if(w.height[i]<800||w.height[i]>4200||w.lake[i]>0||w.ice[i]>8||![2,3,4,5,6,12,13].includes(w.biome[i])||w.arid[i]>1.6)continue;
   if(centres.some(([a,b])=>Math.hypot(x-a,y-b)<3.2))continue;
   const shape=survey(w,x,y);if(!shape)continue;
   candidates.push({i,x,y,shape,rank:LandmarkCatalog.hash(w.params.seed+'/dragon-ruins/'+i)});
  }
  candidates.sort((a,b)=>b.rank-a.rank||a.i-b.i);
  const out=[];
  for(const p of candidates){
   if(out.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<18))continue;
   const variant=variants[out.length],name='The '+words[LandmarkCatalog.hash(w.params.seed+'/'+p.i+'/name')%words.length]+' '+variant.noun,id='dragon-ruins-'+p.i;
   const dragonRuins={version,variant:variant.id},geography={freshwater:0,coast:false,lake:false,cold:w.temp[p.i]<3,dry:w.arid[p.i]<.65,forest:false,elevation:w.height[p.i],sourceCell:p.i,setting:BIOME[w.biome[p.i]][0]};
   const recipe=LandmarkCatalog.recipe('dragon-ruins',w.params.seed+'/dragon-ruins/'+p.i,{id,name,variant:out.length,provinceId:null,kind:'dragon-ruins',dragonRuins,geography,provenance:variant.description+' Weathered stone survives here in '+geography.setting.toLowerCase()+', '+Math.round(geography.elevation).toLocaleString('en-US')+' m above sea level.'});
   out.push({id,name,kind:variant.name,shortName:variant.noun,type:'dragon-ruins',dragonRuins,recipe,provinceId:null,i:p.i,x:p.x,y:p.y,span,angle:p.shape.angle,footprint:[...footprint],survey:p.shape,priority:95000-out.length,keywords:['dragon','drake','ruins','dragon ruins','ancient dragon','龙族遗迹','龙之遗迹','龙遗迹',variant.id]});
   if(out.length===variants.length)break;
  }
  cache.set(w,{key,sites:out});return out;
 }
 function mounted(k,id,name,role,supports,fn,note){
  const start=k.parts.length,p=k.part(id,name,role,fn,note),x=supports.reduce((a,s)=>a+s.x,0)/supports.length,z=supports.reduce((a,s)=>a+s.z,0)/supports.length;
  const mount={x,z,groundY:0,footprint:[Math.max(...supports.map(s=>Math.abs(s.x-x)+s.w/2))*2,Math.max(...supports.map(s=>Math.abs(s.z-z)+s.d/2))*2],supports,support:'stone'};
  for(const part of k.parts.slice(start)){part.mountGroup=id;part.mount=mount;}
  return p;
 }
 // A chamfered, fully closed stone with uneven fracture heights. Its silhouette
 // is fixed by position/seed; adding close detail cannot move the coarse blocks.
 function slab(k,x,z,w,d,h,angle=0,m='wall',y=-.1){
  const random=LandmarkCatalog.rng(k.recipe.seed+'/slab/'+[x,z,w,d,h]),c=Math.min(w,d)*.18;
  const outline=[[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]],heights=outline.map(()=>h*(.88+random()*.12));
  k.transform(x,y,z,angle,1,()=>{
   const p=(i,level)=>[outline[i][0]*(level===2?.84:1),level===0?0:level===1?heights[i]*.77:heights[i],outline[i][1]*(level===2?.84:1)];
   for(let i=0;i<8;i++){const j=(i+1)%8;for(let level=0;level<2;level++)k.quad(p(i,level),p(i,level+1),p(j,level+1),p(j,level),level?colorScale(k.color(m),1.10):m);k.tri([0,h*.94,0],p(j,2),p(i,2),m);k.tri([0,0,0],p(i,0),p(j,0),m);}
  });
 }
 function sector(k,inner,outer,a,b,h,y=-.1,cx=0,cz=0,m='wall'){
  const n=k.lod>0?3:2,P=(r,t,Y)=>[cx+Math.cos(t)*r,Y,cz+Math.sin(t)*r];
  for(let j=0;j<n;j++){const A=a+(b-a)*j/n,B=a+(b-a)*(j+1)/n,top=y+h;
   k.quad(P(inner,A,top),P(inner,B,top),P(outer,B,top),P(outer,A,top),'trim');k.quad(P(inner,A,y),P(outer,A,y),P(outer,B,y),P(inner,B,y),m);
   k.quad(P(outer,A,y),P(outer,A,top),P(outer,B,top),P(outer,B,y),m);k.quad(P(inner,A,y),P(inner,B,y),P(inner,B,top),P(inner,A,top),m);
  }
  k.quad(P(inner,a,y),P(inner,a,y+h),P(outer,a,y+h),P(outer,a,y),m);k.quad(P(inner,b,y),P(outer,b,y),P(outer,b,y+h),P(inner,b,y+h),m);
 }
 function taper(k,points,radii,m='trim',seg=k.lod>0?7:5){
  const rings=points.map((p,i)=>{const n=norm(sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)])),u=norm(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0])),v=cross(n,u);return Array.from({length:seg},(_,j)=>{const a=j/seg*Math.PI*2;return p.map((q,t)=>q+(Math.cos(a)*u[t]+Math.sin(a)*v[t])*radii[i]);});});
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<seg;j++){const next=(j+1)%seg;k.quad(rings[i][j],rings[i][next],rings[i+1][next],rings[i+1][j],m);}
  for(let j=0;j<seg;j++){const next=(j+1)%seg;k.tri(points[0],rings[0][next],rings[0][j],m);k.tri(points.at(-1),rings.at(-1)[j],rings.at(-1)[next],m);}
 }
 function clawRune(k,x,y,z,angle,size=1){
  k.transform(x,y,z,angle,1,()=>{for(const s of[-1,0,1])k.beam([s*.28*size,0,.04],[s*.45*size,.55*size,.04],.035*size,'dark',4,true);k.beam([-.5*size,.13*size,.04],[.5*size,.13*size,.04],.035*size,'dark',4,true);});
 }
 function compose(k){
  const variant=k.recipe.variant%3,radius=12.8;
  // Six surviving arcs and broad missing sections keep the ground visibly open.
  for(let group=0;group<6;group++){
   const sectors=[group*4,group*4+1,group*4+2].filter(j=>![2,9,14,18,23].includes((j+variant*2)%24)),supports=sectors.map(j=>{const a=(j+.5)*Math.PI/12;return{x:Math.cos(a)*radius,z:Math.sin(a)*radius,w:2.4,d:2.6,angle:a};});
   if(!supports.length)continue;
   mounted(k,'ring-'+group,'Fractured cyclopean ring '+(group+1),'foundation',supports,()=>{
    k.mark('broken-dragon-ring');
    for(const j of sectors){const a=j*Math.PI/12+.022,b=(j+1)*Math.PI/12-.022,h=.65+(LandmarkCatalog.hash(k.recipe.seed+'/ring/'+j)%100)/110;
     sector(k,11.25,14.35,a,b,h);
     if(k.lod>0){sector(k,14.34,14.43,a+.02,b-.02,.13,h*.46);const t=(a+b)/2;clawRune(k,Math.cos(t)*14.45,.1,Math.sin(t)*14.45,t-Math.PI/2,.75);}
    }
   },'Deep breaches divide the weathered ring, leaving scattered arc stones along its former circumference.');
  }
  // The nest is a broken rim, never a full plinth or an artificial excavation.
  const nestZ=variant===1?2:-1.5,nestR=variant===2?3.4:4.5;
  const nestSupports=Array.from({length:6},(_,j)=>{const a=j*Math.PI/3;return{x:Math.cos(a)*(nestR+.6),z:nestZ+Math.sin(a)*(nestR+.6),w:1.2,d:1.3,angle:a};});
  const floorSlabs=[[-2,nestZ-1,2.7,1.6],[1.5,nestZ-.8,2.3,1.5],[-.8,nestZ+1.4,2.4,1.6]];
  for(const [x,z,w,d]of floorSlabs)nestSupports.push({x,z,w,d,angle:.15});
  mounted(k,'nest','The cracked nesting bowl','architecture',nestSupports,()=>{
   k.mark('ancient-dragon-nest');
   for(let j=0;j<12;j++){if(j===2||j===3||j===8)continue;const a=j*Math.PI/6+.03,b=(j+1)*Math.PI/6-.03;sector(k,nestR-.75,nestR+.75,a,b,.65+(j%3)*.34,-.1,0,nestZ);if(k.lod>0)sector(k,nestR-.8,nestR+.83,a+.018,b-.018,.17,.72+(j%3)*.34,0,nestZ);}
   for(const [x,z,w,d]of floorSlabs)slab(k,x,z,w,d,.29,.15,'dark',.01);
   if(variant!==1){
    // Two open half-shells suggest a long-abandoned clutch, with real thickness.
    for(const [x,z,a]of[[-1.3,nestZ-.5,.35],[1.4,nestZ+.4,3.8]]){k.transform(x,.25,z,a,1,()=>{for(let j=0;j<6;j++){const A=j/6*Math.PI*1.35,B=(j+1)/6*Math.PI*1.35,P=(t,r,h)=>[Math.cos(t)*r,h,Math.sin(t)*r];k.quad(P(A,1.15,0),P(A,.8,1.55),P(B,.8,1.55),P(B,1.15,0),'trim');k.quad(P(A,1.0,.08),P(B,1.0,.08),P(B,.65,1.55),P(A,.65,1.55),'dark');k.quad(P(A,.65,1.55),P(B,.65,1.55),P(B,.8,1.55),P(A,.8,1.55),'trim');k.quad(P(A,1.15,0),P(B,1.15,0),P(B,1,.08),P(A,1,.08),'trim');if(j===0)k.quad(P(A,1.15,0),P(A,1,.08),P(A,.65,1.55),P(A,.8,1.55),'trim');if(j===5)k.quad(P(B,1.15,0),P(B,.8,1.55),P(B,.65,1.55),P(B,1,.08),'trim');}});}
   }
  },'Traces of a shattered clutch rest within the weathered, open nesting bowl.');
  const count=variant===1?4:3;
  for(let row=0;row<count;row++)for(const side of[-1,1]){
   const x=side*(variant===1?4.2:6.7-row*.35),z=-8.5+row*(variant===1?4.7:4.2),h=(variant===1?8.8-row*.6:10.0-row*1.1)*(side===1&&row===1?.48:1);
   mounted(k,'spine-'+row+'-'+(side<0?'west':'east'),'Dragon-spine arch '+(row+1)+(side<0?' west':' east'),'architecture',[{x,z,w:2.5,d:2.8}],()=>{
    k.mark('dragon-spine-arch');slab(k,x,z,2.8,3.1,.95,.05*side);
    const points=[[x,.45,z],[x-side*.25,h*.28,z-.10],[x-side*.9,h*.62,z-.45],[x-side*2.2,h*.88,z-.90],[x-side*3.4,h,z-1.5]];
    taper(k,points,[.88,.83,.65,.42,.10],'trim');
    // Broader basal plates tie the soaring rib to its surviving masonry foot.
    taper(k,[[x+side*.95,.3,z+.4],[x+side*.62,2.1,z+.12],[x-side*.2,3.4,z-.10]],[.42,.35,.08],'wall',5);
    if(k.lod>0){clawRune(k,x,.9,z+1.13,0,.85);for(let n=1;n<3;n++){const p=points[n];slab(k,p[0],p[2],1.15,1.1,.24,side*.15,'wall',p[1]-.10);}}
   },'A towering carved rib tapers into a broken crown, with old claw marks cut into its broad stone foot.');
  }
  for(const side of[-1,1]){
   const x=side*6.2,z=10.25,h=side<0?5.5:variant===2?7.2:3.9;
   mounted(k,'maw-'+(side<0?'west':'east'),'The broken horned gateway '+(side<0?'west':'east'),'architecture',[{x,z,w:2.9,d:3.1}],()=>{
    k.mark('horned-dragon-gateway');slab(k,x,z,3.2,3.5,1.0);slab(k,x,z,2.5,2.7,h,side*.05);
    taper(k,[[x,h*.70,z],[x+side*.65,h+.5,z-.15],[x+side*1.3,h+2,z-.75],[x+side*1.15,h+2.6,z-1.2]],[.60,.46,.25,.03],'trim');
    taper(k,[[x,h*.77,z+.05],[x-side*1.4,h*.94,z+.10],[x-side*3.1,h*.89,z+.3]],[.7,.65,.3],'wall');
    if(k.lod>0){clawRune(k,x,1.35,z+1.4,0,1.45);for(let tooth=0;tooth<3;tooth++)taper(k,[[x-side*(1.0+tooth*.65),h*.77,z+.30],[x-side*(1.10+tooth*.65),h*.77-.6,z+.4]],[.18,.035],'trim',5);}
   },'Two worn stone jaws frame the ancient approach beneath unequal, fractured horns.');
  }
  for(let group=0;group<3;group++){
   const x=group===0?-14.8:group===1?14.9:2.0,z=group===0?-7:group===1?7:11.9,supports=[{x,z,w:3.0,d:2.5},{x:x-1,z:z+1.35,w:2.0,d:1.5}];
   mounted(k,'fallen-'+group,'Fallen carved fragments '+(group+1),'landscape',supports,()=>{
    k.mark('fallen-dragon-masonry');slab(k,x,z,3.1,2.4,1.0,.35+group*.4);slab(k,x-1,z+1.35,2.0,1.5,.46,-.4);
    taper(k,[[x-1.5,.6,z],[x-.8,1.2,z-.6],[x+.5,1.45,z-.4],[x+1.8,1.0,z+.1]],[.55,.6,.4,.08],'trim');
    if(k.lod>0)clawRune(k,x,.15,z+1.2,0,.55);
   },'Claw-carved ashlar and fallen ribs lie where the outer circle collapsed.');
  }
 }
 return{version,span,footprint,variants,sites,survey,compose};
})();
