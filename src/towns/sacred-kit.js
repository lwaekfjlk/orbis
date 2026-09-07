/** Great Sanctuaries — actual, reusable triangle geometry embedded in the town.
 * No bitmap facade, replacement geography, or external resource. Art units.
 * A city-scale precinct and its architectural inspector use the SAME model.
 */
const SacredCityKit = (() => {
 const TAU=Math.PI*2;
 const siteCache=new WeakMap();
 const THEMES={
  sun:{wall:'#e2dfce',trim:'#fff1d5',roof:'#24496b',metal:'#cfaa50',wood:'#615449',dark:'#2c3745',glass:'#ffc26b',ground:'#b5b2a1',leaf:'#506b48',water:'#71b4bf'},
  stars:{wall:'#d4dce0',trim:'#f1e7d8',roof:'#354467',metal:'#b6bad1',wood:'#5b5267',dark:'#263346',glass:'#7ed9ec',ground:'#9fa8a6',leaf:'#477d70',water:'#8ed9e8'},
  hearth:{wall:'#bbb6aa',trim:'#e9d9b5',roof:'#375568',metal:'#c39556',wood:'#65533c',dark:'#313539',glass:'#f4a85b',ground:'#95978c',leaf:'#4a6452',water:'#82b6bc'},
  grove:{wall:'#c8d2bd',trim:'#e8e9cc',roof:'#3c756d',metal:'#bfa468',wood:'#795e47',dark:'#304a43',glass:'#ace3b6',ground:'#96a78d',leaf:'#376950',water:'#7fc1bd'}
 };
 function palette(recipe){return {...(THEMES[recipe.faith]||THEMES.sun)};}
 function path(k,points,r,m='trim',seg=5){for(let j=1;j<points.length;j++)k.beam(points[j-1],points[j],r,m,seg);}
 // Two-centred arches meet at an actual apex. Inner and outer circles share their
 // spring centre, so jambs, archivolts and their reveals join without a pinched tip.
 function archPoint(w,h,u,side=1,out=0){
  const half=w/2,spring=h*.55,rise=h-spring,R=(half*half+rise*rise)/(2*half),cx=half-R,rr=R+out;
  const a=u*Math.acos(-cx/rr);return[side*(cx+rr*Math.cos(a)),spring+rr*Math.sin(a)];
 }
 // A pointed opening with a genuine hollow center, independent inner and outer voussoirs.
 function pointed(k,x,y,z,w,h,depth=.26,angle=0,material='trim',steps=12){
  k.mark('pointed-arch');k.transform(x,y,z,angle,1,()=>{
   const half=w/2,t=Math.max(.09,w*.085),spring=h*.55;
   for(const side of[-1,1]){
    const face=(a,b,c,d,m)=>side>0?k.quad(d,c,b,a,m):k.quad(a,b,c,d,m);
    k.box(side*(half+t/2),0,0,t,spring,depth,material);
    k.box(side*(half+t/2),0,0,t*1.6,.14,depth*1.3,material);
    k.box(side*(half+t/2),spring-.09,0,t*1.5,.17,depth*1.25,'metal');
    for(let a=0;a<steps;a++){
     const P=(j,out,Z)=>[...archPoint(w,h,j/steps,side,out?t:0),Z];
     const A=P(a,false,depth/2),B=P(a+1,false,depth/2),C=P(a+1,true,depth/2),D=P(a,true,depth/2);
     const stone=colorScale(k.color(material),a%3===0?.96:1);
     face(A,B,C,D,stone);face(P(a,false,-depth/2),P(a,true,-depth/2),P(a+1,true,-depth/2),P(a+1,false,-depth/2),stone);
     face(A,P(a,false,-depth/2),P(a+1,false,-depth/2),B,material);face(D,C,P(a+1,true,-depth/2),P(a,true,-depth/2),material);
    }
   }
  });
 }
 function lancet(k,x,y,z,w,h,angle=0){
  k.mark('traceried-window');k.transform(x,y,z,angle,1,()=>{
   const sill=h*.55,half=w/2,steps=k.lod>1?12:8;
   k.mark('splayed-window-reveal');
   k.quad([-half,0,.012],[half,0,.012],[half,sill,.012],[-half,sill,.012],'dark');
   for(const side of[-1,1])for(let j=0;j<steps;j++){
    const P=a=>[...archPoint(w,h,a/steps,side),.022];
    k.tri([0,sill,.022],P(side<0?j+1:j),P(side<0?j:j+1),'glass');
   }
   for(const s of[-1,1]){
    k.box(s*w*.245,.12,.027,w*.37,sill-.20,.035,'glass');
    const reveal=[[s*half,0,.03],[s*(half+.09),0,.31],[s*(half+.09),sill,.31],[s*half,sill,.03]];
    if(s<0)reveal.reverse();k.quad(...reveal,'trim');
   }
   pointed(k,0,0,.25,w,h,.35,0,'trim',steps);
   for(const s of[-1,1])pointed(k,s*w*.24,.14,.12,w*.39,h*.70,.075,0,'trim',6);
   k.box(0,.09,.15,.095,h*.75,.11,'trim');k.box(0,h*.40,.12,w,.08,.075,'metal');
   stoneRing(k,0,h*.79,.14,w*.17,.04,.095,'trim',16);
   k.box(0,-.16,.19,w+.38,.17,.70,'trim');
   k.box(0,-.25,.10,w+.20,.09,.46,'wall');
   if(k.lod>1)for(const s of[-1,1])for(let j=1;j<4;j++)k.box(s*w*.245,sill*j/4,.057,w*.37,.025,.025,'metal');
  });
 }
 // A radial stone course, with flat voussoir faces and a continuous inner reveal.
 // Unlike a stack of wire rings it has substantial front/back surfaces and thickness.
 function stoneRing(k,x,y,z,r,t,depth,m='trim',steps=32){
  for(let j=0;j<steps;j++){
   const a=j/steps*TAU,b=(j+1)/steps*TAU,P=(v,rr,zz)=>[x+rr*Math.cos(v),y+rr*Math.sin(v),z+zz];
   const tint=colorScale(k.color(m),j%4===0?.965:1),front=depth/2,back=-front;
   k.quad(P(a,r,front),P(a,r+t,front),P(b,r+t,front),P(b,r,front),tint);
   k.quad(P(a,r,back),P(b,r,back),P(b,r+t,back),P(a,r+t,back),m);
   k.quad(P(a,r,front),P(b,r,front),P(b,r,back),P(a,r,back),m);
   k.quad(P(a,r+t,front),P(a,r+t,back),P(b,r+t,back),P(b,r+t,front),m);
  }
 }
 function masonry(k,x,y,z,w,h,angle=0){
  // Individual shallow blocks, joints and quoin alternation; depth is real mesh.
  k.transform(x,y,z,angle,1,()=>{
   for(let row=0;row<Math.floor(h/.72);row++){
    k.box(0,.18+row*.72,.03,w,.023,.06,colorScale(k.color('wall'),.71));
    for(let col=-w/2+.45+(row%2)*.50;col<w/2-.2;col+=1.35){
     k.box(col,.19+row*.72,.04,.025,.68,.045,colorScale(k.color('wall'),.77));
    }
   }
  });
 }
 function pinnacle(k,x,y,z,r=.3,h=3){
  k.mark('crocketed-pinnacle');
  k.lathe(x,y,z,[[0,0],[r*1.30,0],[r*1.30,.17],[r,.23],[r,h*.30],[r*1.2,h*.32],[r*.7,h*.36],[r*.1,h*.90],[0,h]],'trim',8);
  k.using('roof',()=>{k.cone(x,y+h*.36,z,r*.80,h*.57,'roof',0,8);k.cone(x,y+h*.92,z,.065,.44,'metal',0,6);});
  for(let j=0;j<3;j++)for(const s of[-1,1])k.cone(x+s*r*(.60-j*.15),y+h*(.45+j*.13),z,.095,.2,'metal',0,5);
 }
 function tower(k,x,y,z,r,h,crown='spire'){
  k.mark('open-belfry-tower');k.mark('buttressed-bell-chamber');
  k.box(x,y,z,r*2.2,.36,r*2.2,'trim');k.box(x,y+.36,z,r*2.03,.28,r*2.03,'wall');
  k.box(x,y+.64,z,r*1.78,h*.65-.64,r*1.78,'wall');
  // Engaged corner buttresses continue into the open stage, carrying its cornice.
  const stage=h*.68,bell=h*.30;
  for(const a of[-1,1])for(const b of[-1,1]){
   k.box(x+a*r*.83,y+.36,z+b*r*.83,r*.38,h*.68-.36,r*.38,'trim');
   k.box(x+a*r*.81,y+stage,z+b*r*.81,r*.35,bell,r*.35,'wall');
   k.box(x+a*r*.81,y+stage+bell*.58,z+b*r*.81,r*.46,.20,r*.46,'trim');
   if(k.lod>0)k.cylinder(x+a*r*.85,y+stage+.18,z+b*r*.85,r*.09,bell*.53,'trim',6);
  }
  for(const f of[.10,.29,.48]){
   const level=h*f;
   k.box(x,y+level-.20,z,r*1.98,.20,r*1.98,'trim');
   for(let a=0;a<4;a++)k.transform(x,y+level+.20,z,a*Math.PI/2,1,()=>lancet(k,0,0,r*.90,r*.80,h*.13));
  }
  k.box(x,y+stage-.38,z,r*2.04,.22,r*2.04,'trim');
  k.box(x,y+stage-.16,z,r*1.91,.16,r*1.91,'dark');
  for(let a=0;a<4;a++)k.transform(x,y+stage,z,a*Math.PI/2,1,()=>{
   pointed(k,0,0,r*.81,r*1.22,bell*.92,r*.34,0,'trim',10);
   // The sound opening remains open all the way through; a low sill frames the bell.
   k.box(0,0,r*.81,r*1.30,.19,r*.44,'trim');
   for(const s of[-1,1])k.box(s*r*.37,.19,r*.82,r*.08,bell*.14,r*.11,'trim');
   k.box(0,bell*.14,r*.82,r*1.30,.10,r*.13,'trim');
  });
  k.mark('hanging-bronze-bell');
  k.beam([x-r*.75,y+h-.6,z],[x+r*.75,y+h-.6,z],r*.12,'wood',6);
  k.beam([x,y+h-.6,z],[x,y+stage+bell*.57,z],r*.065,'metal',6);
  k.lathe(x,y+stage+bell*.20,z,[[0,0],[r*.55,0],[r*.54,bell*.07],[r*.34,bell*.20],[r*.24,bell*.36],[0,bell*.40]],'metal',12);
  k.beam([x,y+stage+bell*.25,z],[x,y+stage+bell*.12,z],r*.07,'dark',6);
  k.box(x,y+h-.12,z,r*1.99,.24,r*1.99,'trim');k.box(x,y+h+.12,z,r*2.17,.22,r*2.17,'trim');
  for(const a of[-1,1])for(const b of[-1,1])pinnacle(k,x+a*r*.92,y+h+.32,z+b*r*.92,.22,2.4);
  const star=crown==='crystal';
  k.using('roof',()=>{
   if(crown==='battlement'){k.parapet(x,y+h+.34,z,r*1.9,r*1.9);}
   else if(crown==='dome'){k.dome(x,y+h+.34,z,r*1.1,r*2.15,'roof');}
   else{
    k.lathe(x,y+h+.34,z,[[0,0],[r*1.18,0],[r,.4],[r*.75,r*1.8],[r*.3,r*4.3],[0,r*5.7]],'roof',12);
    for(let a=0;a<8;a++){const A=a*Math.PI/4;path(k,[[x+r*1.17*Math.cos(A),y+h+.34,z+r*1.17*Math.sin(A)],[x+r*.75*Math.cos(A),y+h+.34+r*1.8,z+r*.75*Math.sin(A)],[x,y+h+.34+r*5.7,z]],.035,'metal');}
    if(star)k.crystal(x,y+h+r*5.6,z,r*.22,r*1.25);else k.emblem(x,y+h+r*5.9,z,r*.23);
   }
  });
 }
 function rose(k,x,y,z,r){
  k.mark('radial-stained-glass');k.mark('recessed-rose-tracery');
  const N=k.lod>1?48:32;
  // The glass is a half-unit behind the outer stone course, with an unbroken dark
  // recess between the individual petals. Radial tracery divides panes, not paint.
  for(let j=0;j<N;j++){const a=j/N*TAU,b=(j+1)/N*TAU;
   k.tri([x,y,z-.23],[x+r*Math.cos(a),y+r*Math.sin(a),z-.23],[x+r*Math.cos(b),y+r*Math.sin(b),z-.23],'dark');
  }
  stoneRing(k,x,y,z,r,.25,.62,'trim',N);
  stoneRing(k,x,y,z+.25,r+.24,.11,.18,'trim',N);
  stoneRing(k,x,y,z-.05,r*.90,.09,.24,'metal',N);
  stoneRing(k,x,y,z+.08,r*.27,.12,.23,'trim',24);
  for(let j=0;j<12;j++){
   const A=j/12*TAU,ca=Math.cos(A),sa=Math.sin(A),P=(rad,tan,zz)=>[x+ca*rad-sa*tan,y+sa*rad+ca*tan,z+zz];
   const petal=[[r*.34,0],[r*.49,-r*.115],[r*.74,-r*.14],[r*.87,0],[r*.74,r*.14],[r*.49,r*.115]];
   const C=colorScale(k.color(j%3===0?'water':'glass'),j%2?.88:1.04);
   for(let q=0;q<petal.length;q++){
    const a=petal[q],b=petal[(q+1)%petal.length];
    k.tri(P(r*.61,0,-.16),P(a[0],a[1],-.16),P(b[0],b[1],-.16),C);
    k.beam(P(a[0],a[1],.09),P(b[0],b[1],.09),.05,'trim',4);
   }
   k.beam(P(r*.32,0,.06),P(r*.92,0,.06),.045,'metal',4);
  }
  for(let j=0;j<12;j++){const a=j/12*TAU,b=(j+1)/12*TAU;
   k.tri([x,y,z-.13],[x+r*.25*Math.cos(a),y+r*.25*Math.sin(a),z-.13],[x+r*.25*Math.cos(b),y+r*.25*Math.sin(b),z-.13],j%2?'glass':'water');
  }
  stoneRing(k,x,y,z+.10,r*.075,.045,.16,'metal',16);
 }
 function flying(k,side,z){
  const x=side*10.5;
  k.mark('double-flying-buttress');k.mark('stepped-buttress-pier');
  k.box(x,5.5,z,1.75,.38,1.95,'trim');
  for(const [yy,hh,w,d]of[[5.88,4.7,1.42,1.58],[10.58,3.8,1.12,1.35],[14.38,1.5,.89,1.13]]){
   k.box(x,yy,z,w,hh,d,'wall');k.box(x,yy+hh-.16,z,w+.23,.21,d+.23,'trim');
  }
  pinnacle(k,x,15.95,z,.50,4.3);
  for(const [yy,top]of[[11,16.1],[14.7,21]]){
   const P=t=>[side*lerp(10.5,4.43,t),lerp(yy,top,t)+Math.sin(t*Math.PI)*.86,z],steps=10,depth=.62;
   const face=(a,b,c,d,m)=>side<0?k.quad(d,c,b,a,m):k.quad(a,b,c,d,m);
   for(let j=0;j<steps;j++){
    const A=P(j/steps),B=P((j+1)/steps),Q=(p,dy,dz)=>[p[0],p[1]+dy,p[2]+dz];
    const mat=colorScale(k.color('trim'),j%3===0?.94:1);
    // Wedge-shaped stones make a continuous compression arch, including its soffit.
    face(Q(A,0,depth/2),Q(B,0,depth/2),Q(B,-.60,depth/2),Q(A,-.60,depth/2),mat);
    face(Q(A,0,-depth/2),Q(A,-.60,-depth/2),Q(B,-.60,-depth/2),Q(B,0,-depth/2),mat);
    face(Q(A,0,depth/2),Q(A,0,-depth/2),Q(B,0,-depth/2),Q(B,0,depth/2),'trim');
    face(Q(A,-.60,depth/2),Q(B,-.60,depth/2),Q(B,-.60,-depth/2),Q(A,-.60,-depth/2),'wall');
   }
   k.box(side*4.43,top-.9,z,.50,1.1,.92,'trim');
  }
 }
 function statue(k,x,y,z,h=3.4,angle=0){
  k.mark('guardian-sculpture');k.transform(x,y,z,angle,1,()=>{
   k.box(0,0,0,.85,.55,.85,'wall');k.box(0,.5,0,1.05,.13,1.05,'trim');
   k.lathe(0,.63,0,[[.43,0],[.29,h*.40],[.36,h*.60],[.17,h*.71],[0,h*.74]],'trim',10);
   k.rock(0,h*.88,0,.23,.40,.21,10,'trim',true);
   for(const s of[-1,1]){
    k.beam([s*.22,h*.66,0],[s*.63,h*.44,.28],.11,'trim',7);
    k.beam([s*.63,h*.44,.28],[s*.72,h*.73,.38],.09,'trim',7);
    for(let j=0;j<6;j++){
     const b=[s*.15,h*.69,-.13],a=[s*(.6+j*.16),h*(.94+j*.027),-.4-j*.035],c=[s*(.7+j*.15),h*(.61+j*.025),-.32];
     k.tri(b,c,a,colorScale(k.color('trim'),.92+j*.012));k.beam(c,a,.04,'trim',4);
    }
   }
   k.ring(0,h*1.10,.03,.33,.028,'metal','xy',18);
  });
 }
 function stair(k,x,y,z,w,count,rise=.19,run=.35){
  k.mark('connected-grand-stair');
  for(let j=0;j<count;j++){k.box(x,y+j*rise,z-j*run,w,rise,run+.04,'trim');for(const s of[-1,1])k.box(x+s*(w/2+.18),y+j*rise,z-j*run,.28,.6,run+.05,'wall');}
 }
 function portal(k,x,y,z,w,h,bayW,bayH){
  k.mark('deep-processional-portal');
  const opening=w+.44,oh=h+.36,spring=oh*.55,depth=.70,front=z+.5,back=front-depth;
  // Build around the opening instead of placing a black rectangle on a solid wall.
  for(const side of[-1,1]){
   k.box(x+side*(bayW+opening)/4,y,z+.15,(bayW-opening)/2,spring,depth,'wall');
   for(let j=0;j<12;j++){
    const a=archPoint(opening,oh,j/12,side),b=archPoint(opening,oh,(j+1)/12,side),outer=side*bayW/2;
    for(const zz of[front,back]){
     const face=[[x+a[0],y+a[1],zz],[x+b[0],y+b[1],zz],[x+outer,y+b[1],zz],[x+outer,y+a[1],zz]];
     if((side>0)===(zz===front))face.reverse();k.quad(...face,'wall');
    }
    const reveal=[[x+a[0],y+a[1],front],[x+a[0],y+a[1],back],[x+b[0],y+b[1],back],[x+b[0],y+b[1],front]];
    if(side>0)reveal.reverse();k.quad(...reveal,'trim');
   }
  }
  k.box(x,y+oh,z+.15,bayW,bayH-oh,depth,'wall');
  // Dark reveal and timber leaves sit behind three progressively wider stone orders.
  const glassZ=z-.16;
  k.quad([x-w/2,y,glassZ],[x+w/2,y,glassZ],[x+w/2,y+h*.55,glassZ],[x-w/2,y+h*.55,glassZ],'dark');
  for(const side of[-1,1])for(let j=0;j<10;j++){
   const a=archPoint(w,h,j/10,side),b=archPoint(w,h,(j+1)/10,side);
   const A=[x+a[0],y+a[1],glassZ],B=[x+b[0],y+b[1],glassZ];
   k.tri([x,y+h*.55,glassZ],side<0?B:A,side<0?A:B,'dark');
  }
  for(let j=0;j<3;j++)pointed(k,x,y,z+.25+j*.28,w+j*.22,h+j*.18,.28,0,j===1?'wall':'trim',12);
  for(const side of[-1,1]){
   k.box(x+side*w*.24,y+.12,z-.06,w*.46,h*.51,.13,'wood');
   for(const yy of[.20,.40])k.box(x+side*w*.24,y+h*yy,z+.02,w*.41,.09,.06,'metal');
   if(k.lod>0)for(let j=1;j<4;j++)k.box(x+side*w*(.03+j*.105),y+.15,z+.018,.018,h*.49,.025,'dark');
   k.ring(x+side*w*.13,y+h*.25,z+.085,w*.055,.022,'metal','xy',10);
   for(let order=0;order<2;order++){
    const xx=x+side*(w/2+.20+order*.16),zz=z+.54+order*.22,height=h*.55-.18;
    k.lathe(xx,y+.08,zz,[[0,0],[.16,0],[.16,.18],[.095,.25],[.095,height-.18],[.17,height-.12],[.17,height],[0,height]],'trim',8);
   }
  }
  k.box(x,y,z+.30,w+.74,.13,1.24,'trim');
  stoneRing(k,x,y+h*.73,z-.01,w*.18,.055,.10,'metal',16);
  // The porch roof is a closed triangular stone canopy, with a proper underside.
  k.using('roof',()=>{
   k.mark('gabled-portal-canopy');
   const half=w*.70,base=y+h+.46,apex=base+w*.56,zf=z+1.04,zb=z+.29;
   k.tri([x-half,base,zf],[x+half,base,zf],[x,apex,zf],'wall');
   k.tri([x+half,base,zb],[x-half,base,zb],[x,apex,zb],'wall');
   k.quad([x-half,base,zf],[x,apex,zf],[x,apex,zb],[x-half,base,zb],'trim');
   k.quad([x,apex,zf],[x+half,base,zf],[x+half,base,zb],[x,apex,zb],'trim');
   k.quad([x-half,base,zf],[x-half,base,zb],[x+half,base,zb],[x+half,base,zf],'trim');
   path(k,[[x-half,base,zf+.02],[x,apex,zf+.02],[x+half,base,zf+.02]],.10,'trim',5);
  });
 }
 function roseWall(k,x,y,z,r,w,bottom,top,depth){
  k.mark('pierced-rose-wall');
  const angles=Array.from({length:48},(_,j)=>j/48*TAU);
  // Include the four rectangle corners so the boundary never clips across a corner.
  for(const sx of[-1,1])for(const yy of[bottom,top])angles.push((Math.atan2(yy,sx*w/2)+TAU)%TAU);
  angles.sort((a,b)=>a-b);
  const P=(a,rr,zz)=>[x+Math.cos(a)*rr,y+Math.sin(a)*rr,z+zz];
  const edge=a=>Math.min(w/2/Math.max(.00001,Math.abs(Math.cos(a))),(Math.sin(a)<0?-bottom:top)/Math.max(.00001,Math.abs(Math.sin(a))));
  for(let j=0;j<angles.length;j++){
   const a=angles[j],b=angles[(j+1)%angles.length],ea=edge(a),eb=edge(b);
   k.quad(P(a,r,-depth/2),P(b,r,-depth/2),P(b,eb,-depth/2),P(a,ea,-depth/2),'wall');
   k.quad(P(a,r,depth/2),P(a,ea,depth/2),P(b,eb,depth/2),P(b,r,depth/2),'wall');
   k.quad(P(a,r,-depth/2),P(a,r,depth/2),P(b,r,depth/2),P(b,r,-depth/2),'trim');
   k.quad(P(a,ea,-depth/2),P(b,eb,-depth/2),P(b,eb,depth/2),P(a,ea,depth/2),'wall');
  }
 }
 // Each wonder has its own assembly. Factories share the construction vocabulary,
 // while authored structure and access remain local to the individual building.
 const wonderKit={TAU,palette,stair,statue,path,lancet,pointed,stoneRing};
 const WONDERS={...createWoodlandWonders(wonderKit),...createStoneWonders(wonderKit),...createArcaneWonders(wonderKit)};
 function build(recipe,options={}){
  const other=WONDERS[recipe.wonder];
  if(other){const model=other(recipe,options);model.signature+='/wonder-detail-1/'+recipe.wonder;return model;}
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette=palette(recipe);
  const stellar=recipe.faith==='stars',crown=recipe.crown&&recipe.crown!=='native'?recipe.crown:(stellar?'crystal':'spire');
  const tier=recipe.variant||0,mainHeight=29+tier*.6;
  k.part('sacred-acropolis','Three-level sacred acropolis','foundation',()=>{
   for(const [x,y,z,w,h,d]of[[0,0,0,37,.8,41],[0,.8,-2,33,1.4,33],[0,2.2,-3.6,29,1.7,26],[0,3.9,-5.2,25,1.65,22]]){
    k.box(x,y,z,w,h,d,'wall');k.box(x,y+h-.05,z,w+.24,.15,d+.24,'trim');
    for(let j=-w/2+1;j<w/2;j+=1.75){k.box(j,y+.12,z+d/2+.04,.9,h*.74,.07,'dark');pointed(k,j,y+.12,z+d/2+.1,.86,h*.78,.13,0,'trim',7);}
   }
   stair(k,0,.8,18,7,8,.175,.41);stair(k,0,2.2,13.8,6.4,9,1.7/9,.39);stair(k,0,3.9,10.1,5.5,9,1.65/9,.39);
   for(const s of[-1,1]){
    for(const [xx,zz,yy]of[[14.4,13.5,.8],[12.5,8.8,2.2],[10.8,5.5,3.9]])statue(k,s*xx,yy,zz,3.0+(14.4-xx)*.13);
    k.rail(s*4.2,18,s*16.5,18,.8);k.rail(s*3.9,13.8,s*14,13.8,2.2);
   }
   for(let j=-15;j<=15;j+=3)if(Math.abs(j)>4){k.box(j,.82,18,1.8,.16,1.8,'ground');k.cylinder(j,.98,18,.55,.08,'metal',12);}
  },'Terraced masonry above the existing dry parcel. The parent heightfield is never flattened or replaced.');
  k.part('great-nave','The immense vaulted sanctuary','architecture',()=>{
   k.box(0,5.55,-4.3,8.8,15.6,20.6,'wall');k.box(0,5.55,-5.9,22,11.7,5.8,'wall');
   for(const side of[-1,1]){
    k.box(side*6.5,5.55,-5.1,4.2,7.8,18.8,'wall');
    k.box(side*6.5,5.55,-5.1,4.48,.35,19.08,'trim');
    k.box(side*6.5,12.9,-5.1,4.38,.24,19,'wall');
    k.box(side*6.5,13.14,-5.1,4.58,.28,19.16,'trim');
    // Pilasters and flyers sit BETWEEN the window bays, so the lower arch never
    // drives through a stained-glass light. The transept occupies the middle bays.
    for(let j=0;j<=6;j++){
     const zz=-13.95+j*3.1;
     k.box(side*4.45,13.4,zz,.42,7.78,.56,'trim');
     if(j!==2&&j!==3){
      k.box(side*8.62,5.7,zz,.55,7.8,.68,'trim');
      flying(k,side,zz);pinnacle(k,side*4.45,21.3,zz,.20,2.2);
     }
    }
    const angle=side<0?Math.PI/2:-Math.PI/2;
    for(let j=0;j<6;j++){
     const zz=-12.4+j*3.1;
     lancet(k,side*4.43,15.1,zz,1.55,4.8,angle);
     if(j!==2&&j!==3)lancet(k,side*8.62,6.3,zz,1.78,5.7,angle);
    }
    // Transept ends have their own tall piers, door and pair of clerestory lights.
    for(const zz of[-8.9,-2.9]){
     k.box(side*11.03,5.55,zz,.68,11.65,.82,'trim');
     k.box(side*11.03,16.9,zz,.92,.32,1.06,'trim');pinnacle(k,side*11.03,17.3,zz,.26,3.2);
    }
    lancet(k,side*11.03,7.0,-5.9,3.2,8.6,angle);
    // Courses belong to the solid piers only; a continuous seam across this face
    // would be in front of the recessed glass and draw a grid over every window.
    for(let j=0;j<=6;j++)if(j!==2&&j!==3)masonry(k,side*8.64,5.7,-13.95+j*3.1,.80,6.8,angle);
    k.box(side*4.45,20.65,-4.3,.40,.23,20.9,'wall');
    k.box(side*4.49,20.88,-4.3,.53,.27,21.05,'trim');
   }
   // Rear chancel and radial chapels meet a continuous eave and a half-conical roof.
   k.mark('radial-chancel-roof');
   k.lathe(0,5.55,-14.4,[[0,0],[4.4,0],[4.4,12.65],[4.57,12.8],[4.57,13.1],[0,13.1]],'wall',20);
   for(let j=0;j<5;j++){
    const a=Math.PI+j*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a),x=dx*4.4,z=-14.4+dz*2.6;
    k.lathe(x,5.55,z,[[0,0],[1.66,0],[1.66,.28],[1.5,.42],[1.5,6.95],[1.67,7.12],[1.67,7.4],[0,7.4]],'wall',12);
    lancet(k,x+dx*1.52,6.15,z+dz*1.52,1.02,4.85,Math.atan2(-dx,dz));
    k.using('roof',()=>{
     k.cone(x,12.95,z,1.78,2.65,'roof',.12,12);k.cone(x,15.6,z,.12,.5,'metal',0,6);
    });
   }
   k.mark('chancel-clerestory');
   for(const yy of[13.50,18.30])k.lathe(0,yy,-14.4,[[4.40,0],[4.57,0],[4.57,.19],[4.40,.19],[4.40,0]],'trim',20);
   for(let j=0;j<=5;j++){
    const a=Math.PI+j*Math.PI/5;
    k.cylinder(Math.cos(a)*4.47,13.69,-14.4+Math.sin(a)*4.47,.15,4.61,'trim',6);
    if(j<5){const angle=a+Math.PI/10;
     lancet(k,Math.cos(angle)*4.43,14.15,-14.4+Math.sin(angle)*4.43,1.22,3.86,angle-Math.PI/2);
    }
   }
   k.using('roof',()=>{
    k.mark('apsidal-roof-shell');
    const center=[0,23.05,-14.4],N=16;
    for(let j=0;j<N;j++){
     const a=Math.PI+j/N*Math.PI,b=Math.PI+(j+1)/N*Math.PI;
     const P=(t,y,r)=>[Math.cos(t)*r,y,-14.4+Math.sin(t)*r];
     k.tri(P(a,18.72,4.78),center,P(b,18.72,4.78),'roof');
     k.quad(P(a,18.52,4.78),P(a,18.72,4.78),P(b,18.72,4.78),P(b,18.52,4.78),'trim');
     if(j%4===0)k.beam(P(a,18.77,4.78),[0,23.09,-14.4],.045,'metal',4);
    }
    k.roof(0,21.15,-4.55,8.75,19.6,5.8,'roof','gable');k.roof(0,17.3,-5.9,6.5,22.2,4.1,'roof','gable',Math.PI/2);
    for(const side of[-1,1])k.roof(side*6.5,13.5,-5.1,4.5,19.2,2.8,'roof','gable');
    k.mark('coped-sanctuary-ridge');
    k.box(0,26.91,-4.55,.22,.19,21.56,'trim');
    for(const zz of[-15.35,6.24]){
     path(k,[[-4.81,21.22,zz],[0,27.04,zz],[4.81,21.22,zz]],.11,'trim',5);
    }
    for(let row=1;row<9;row++)for(const side of[-1,1]){const t=row/9;k.beam([side*4.81*(1-t),21.19+5.8*t,-15.3],[side*4.81*(1-t),21.19+5.8*t,6.20],.025,'metal',3);}
   });
  },'Recessed clerestory lights alternate with grounded stone flyers; the radial chapels join a continuous chancel eave and a coped roof.');
  k.part('west-front','The Rose Gate and processional facade','architecture',()=>{
   const z=6.2;
   portal(k,0,5.55,z,2.10,6.2,2.9,7.1);
   for(const side of[-1,1])portal(k,side*2.95,5.55,z,1.55,4.8,3.0,7.1);
   k.box(0,12.65,z+.15,9.2,2.5,.70,'wall');
   roseWall(k,0,18.9,z+.15,2.78,9.2,-3.75,3.35,.70);
   // The gable is solid masonry with thickness and sloped coping, rather than a plane.
   k.tri([-4.6,22.25,z+.50],[4.6,22.25,z+.50],[0,27.8,z+.50],'wall');
   k.tri([4.6,22.25,z-.20],[-4.6,22.25,z-.20],[0,27.8,z-.20],'wall');
   for(const side of[-1,1]){
    const coping=[[side*4.6,22.25,z-.20],[0,27.8,z-.20],[0,27.8,z+.50],[side*4.6,22.25,z+.50]];
    if(side<0)coping.reverse();k.quad(...coping,'trim');
   }
   path(k,[[-4.7,22.1,z+.58],[0,28.1,z+.58],[4.7,22.1,z+.58]],.16,'trim');
   rose(k,0,18.9,z+.48,2.67);
   // Major string courses and a recessed sculpture gallery give the facade a clear
   // lower portal storey, middle gallery and upper rose, tied into the corner piers.
   k.mark('processional-gallery');
   k.box(0,12.6,z+.45,9.45,.22,1.05,'trim');
   k.box(0,12.82,z+.30,8.7,1.68,.08,'dark');
   for(let j=-4;j<=4;j++){
    pointed(k,j*.93,12.85,z+.65,.71,1.57,.32,0,'trim',7);
    if(j%2===0)statue(k,j*.93,12.91,z+.39,1.05);
   }
   k.box(0,14.44,z+.47,9.4,.20,1.02,'trim');k.box(0,14.64,z+.34,9.18,.14,.70,'wall');
   for(const x of[-4.30,-3.70,3.70,4.30]){
    k.box(x,5.55,z+.38,.28,16.8,.55,'trim');
    for(const yy of[5.65,10.4,14.4,22.1])k.box(x,yy,z+.46,.46,.22,.72,'trim');
    pinnacle(k,x,22.30,z+.45,.25,3.5);
   }
   for(const x of[-3.50,3.50])lancet(k,x,16.1,z+.52,.52,4.9);
   for(const side of[-1,1])for(let j=0;j<4;j++){
    const x=side*(.75+j*.78);pointed(k,x,22.45,z+.55,.57,1.35,.18,0,'trim',7);
   }
   for(const side of[-1,1]){
    tower(k,side*5.8,5.55,5.2,2.12,mainHeight,crown);
    for(const yy of[8.5,18.4,23.0])statue(k,side*4.1,yy,z+.77,1.65);
   }
   for(let j=-4;j<=4;j++)pinnacle(k,j,23.6+4*(1-Math.abs(j)/4),z+.55,.17,2.0);
   k.emblem(0,25.1,z+.7,1.0);
  },'Three deep stone porches, a pierced rose wall with recessed petal glazing, a sculpture gallery and continuously supported bell chambers.');
  k.part('crown-of-light','The Lantern of the Firmament','architecture',()=>{
   const x=0,z=-5.8;
   k.cylinder(x,22.8,z,3.9,5.6,'wall',12);k.cylinder(x,28.3,z,4.12,.34,'trim',12);
   for(let a=0;a<8;a++)k.transform(x,24,z,a*Math.PI/4,1,()=>lancet(k,0,0,3.94,1.40,3.8));
   k.using('roof',()=>k.dome(x,28.7,z,4.4,5.6,'roof'));
   for(let a=0;a<8;a++){const A=a*Math.PI/4;pinnacle(k,Math.cos(A)*3.6,28.6,z+Math.sin(A)*3.6,.38,5.0);}
   tower(k,0,33.5,z,1.40,12.2,stellar?'crystal':'spire');
   if(stellar){k.ring(0,43,z,5.2,.10,'metal','xy',64);k.ring(0,43,z,5.2,.10,'metal','yz',64);}
  },'The central lantern is deliberately much taller than the homes. Its vertical scale is an authored high-fantasy design choice.');
  k.part('chapter-cloisters','Chapter halls and enclosed colonnades','architecture',()=>{
   for(const s of[-1,1]){
    const x=s*13;
    tower(k,s*12.6,5.5,-14.3,1.0,13+tier*.3,stellar?'crystal':'spire');
    k.hall(x,2.2,-7,5,14,5.8,{roof:'gable',roofHeight:2.6,entrance:false});
    k.transform(s*10.7,2.2,-6,Math.PI/2,1,()=>{for(let j=-3;j<=3;j++)pointed(k,j*1.8,0,0,1.5,3.8,.35);});
    k.cylinder(s*13,8.1,-6.5,2.35,2.3,'wall',16);k.using('roof',()=>k.dome(s*13,10.4,-6.5,2.6,3.8,'roof'));
    for(let j=-3;j<=2;j++)pinnacle(k,s*15.5,8.1,j*2.1-7,.21,2.7);
    k.hall(s*13,2.2,4.3,5.4,5.8,4.7,{roof:'gable',roofHeight:2.7});
    statue(k,s*13,7.1,6.1,2.3);
   }
   for(const s of[-1,1])for(let j=0;j<4;j++){const x=s*(5.3+j*2.4);pointed(k,x,.85,17.8,1.9,3.2,.45);pinnacle(k,x,4.2,17.8,.2,1.8);}
  });
  k.part('pilgrim-courts','Sacred forecourts, gardens and offerings','ornament',()=>{
   for(const s of[-1,1]){
    k.garden(s*9,.82,14.3,8.2,4.1);k.garden(s*7.9,2.25,10.1,5.6,3.8);
    for(const z of[12.5,15.8])k.tree(s*16,.86,z,3.4,'pine');
    for(let j=0;j<3;j++){k.banner(s*(4.8+j*4.9),.85,19,3.4);}
    // Water is conditional on the inherited supply; no decorative waterfall source.
    if(recipe.geography.freshwater>.3)k.fountain(s*7.6,2.24,10,1.0);
   }
   k.ring(0,.82,16.7,1.05,.035,'metal','xz',32);
   for(let j=0;j<8;j++){const a=j*Math.PI/4;k.beam([Math.cos(a)*.3,.86,16.7+Math.sin(a)*.3],[Math.cos(a)*1,.86,16.7+Math.sin(a)],.03,'metal',4);}
  });
  const model=k.finish();model.signature=LandmarkCatalog.signature(recipe)+'/great-sanctuary-2';model.recipe={...recipe,sacred:true,sacredVersion:1};return model;
 }
 function miniature(recipe,b){return ArtisanCityKit.meshAt(build(recipe,{lod:1}),b);}
 function site(w,s,p){
  const r=TownCatalog.resolve(w,s,p);if(!wonderFor(r.style,p.detailSupport??p.urbanSupport,p))return null;
  let cache=siteCache.get(w);if(!cache){cache=new Map();siteCache.set(w,cache)}
  const key=p.id+'/'+TownCatalog.signature(r)+'/'+(p.detailSupport??p.urbanSupport);let entry=cache.get(key);
  if(entry===undefined){const c=generateCity(w,s,p.id),b=c.buildings.find(b=>b.sacred);entry=b?{townRecipe:c.townRecipe,townProfile:c.townProfile,buildings:[b]}:null;cache.set(key,entry)}
  if(!entry)return null;const recipe=TownCityBinding.resolve(w,s,p,entry,'temple');
  return{id:recipe.id,name:recipe.name,recipe,provinceId:p.id,i:p.i,x:p.x,y:p.y,priority:p.urbanPop*2.5,kind:(wonderFor(r.style,p.detailSupport??p.urbanSupport,p)?.name||'Wonder')+' · in-town 3D',building:entry.buildings[0]};
 }
 return{build,miniature,pointed,lancet,statue,rose,palette,site,wonderIds:Object.freeze(['cathedral',...Object.keys(WONDERS)]),version:3};
})();
