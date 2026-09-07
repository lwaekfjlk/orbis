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
 // A pointed opening with a genuine hollow center, independent inner and outer voussoirs.
 function pointed(k,x,y,z,w,h,depth=.26,angle=0,material='trim',steps=12){
  k.mark('pointed-arch');k.transform(x,y,z,angle,1,()=>{
   const half=w/2,t=Math.max(.09,w*.085),spring=h*.55;
   for(const side of[-1,1]){
    k.box(side*(half+t/2),0,0,t,spring,depth,material);
    k.box(side*(half+t/2),0,0,t*1.6,.14,depth*1.3,material);
    k.box(side*(half+t/2),spring-.09,0,t*1.5,.17,depth*1.25,'metal');
    for(let a=0;a<steps;a++){
     const P=(j,out,Z)=>{const u=j/steps;return[side*(half*(1-Math.pow(u,1.65))+(out?t:0)*(1-u*.9)),spring+(h-spring)*u+(out?t*.60:0),Z]};
     const A=P(a,false,depth/2),B=P(a+1,false,depth/2),C=P(a+1,true,depth/2),D=P(a,true,depth/2);
     k.quad(A,B,C,D,material);k.quad(P(a,false,-depth/2),P(a,true,-depth/2),P(a+1,true,-depth/2),P(a+1,false,-depth/2),material);
     k.quad(A,P(a,false,-depth/2),P(a+1,false,-depth/2),B,material);k.quad(D,C,P(a+1,true,-depth/2),P(a,true,-depth/2),material);
    }
   }
  });
 }
 function lancet(k,x,y,z,w,h,angle=0){
  k.mark('traceried-window');k.transform(x,y,z,angle,1,()=>{
   const sill=h*.55,half=w/2;
   k.quad([-half,0,0],[half,0,0],[half,sill,0],[-half,sill,0],'dark');
   for(const side of[-1,1])for(let j=0;j<12;j++){
    const P=a=>[side*half*(1-Math.pow(a/12,1.65)),sill+(h-sill)*a/12,.011];
    k.tri([0,sill,.011],P(j),P(j+1),'glass');
   }
   for(const s of[-1,1])k.box(s*w*.24,.1,.013,w*.36,sill-.12,.022,'glass');
   pointed(k,0,0,.09,w,h,.18);
   for(const s of[-1,1])pointed(k,s*w*.24,.12,.19,w*.39,h*.70,.065,0,'metal',9);
   k.box(0,.05,.14,.07,h*.85,.065,'trim');k.box(0,h*.40,.14,w,.065,.065,'metal');
   k.ring(0,h*.80,.2,w*.17,.03,'metal','xy',16);
   k.box(0,-.11,.04,w+.3,.13,.43,'trim');
  });
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
  k.mark('open-belfry-tower');k.box(x,y,z,r*2.2,.5,r*2.2,'trim');
  k.box(x,y+.5,z,r*1.85,h*.65,r*1.85,'wall');
  for(let j=1;j<=4;j++){
   const level=h*j*.15;
   k.box(x,y+level,z,r*2,.16,r*2,'trim');
   for(let a=0;a<4;a++)k.transform(x,y+level+.25,z,a*Math.PI/2,1,()=>lancet(k,0,0,r*.935,r*.75,h*.11));
  }
  const stage=h*.68,bell=h*.30;
  for(let a=0;a<4;a++)k.transform(x,y+stage,z,a*Math.PI/2,1,()=>pointed(k,0,0,r*.83,r*1.25,bell,r*.26));
  k.box(x,y+h,z,r*2.1,.23,r*2.1,'trim');
  for(const a of[-1,1])for(const b of[-1,1])pinnacle(k,x+a*r*.92,y+h,z+b*r*.92,.22,2.4);
  const star=crown==='crystal';
  k.using('roof',()=>{
   if(crown==='battlement'){k.parapet(x,y+h+.25,z,r*1.9,r*1.9);}
   else if(crown==='dome'){k.dome(x,y+h+.25,z,r*1.1,r*2.15,'roof');}
   else{
    k.lathe(x,y+h+.25,z,[[0,0],[r*1.18,0],[r,.4],[r*.75,r*1.8],[r*.3,r*4.3],[0,r*5.7]],'roof',12);
    for(let a=0;a<8;a++){const A=a*Math.PI/4;path(k,[[x+r*1.17*Math.cos(A),y+h+.25,z+r*1.17*Math.sin(A)],[x+r*.75*Math.cos(A),y+h+.25+r*1.8,z+r*.75*Math.sin(A)],[x,y+h+.25+r*5.7,z]],.035,'metal');}
    if(star)k.crystal(x,y+h+r*5.6,z,r*.22,r*1.25);else k.emblem(x,y+h+r*5.9,z,r*.23);
   }
  });
 }
 function rose(k,x,y,z,r){
  k.mark('radial-stained-glass');const N=48;
  for(let j=0;j<N;j++){const a=j/N*TAU,b=(j+1)/N*TAU;
   const C=colorScale(k.color(j%3?'glass':'water'),.78+(j%5)*.055);
   k.tri([x,y,z],[x+r*Math.cos(a),y+r*Math.sin(a),z],[x+r*Math.cos(b),y+r*Math.sin(b),z],C);
  }
  for(const [rr,t,mat]of[[1,.18,'trim'],[.93,.06,'metal'],[.76,.065,'trim'],[.40,.09,'trim'],[.22,.09,'metal']])k.ring(x,y,z+.07,r*rr,t,mat,'xy',48);
  for(let a=0;a<12;a++){const A=a/12*TAU,ca=Math.cos(A),sa=Math.sin(A);k.beam([x+r*.22*ca,y+r*.22*sa,z+.10],[x+r*.96*ca,y+r*.96*sa,z+.10],.065,'trim');k.ring(x+r*.61*ca,y+r*.61*sa,z+.09,r*.16,.052,'metal','xy',20);}
  k.emblem(x,y,z+.24,r*.18);
 }
 function flying(k,side,z){
  const x=side*10.5;
  k.mark('double-flying-buttress');
  k.box(x,5.5,z,1,9.5,1.25,'wall');k.box(x,14.6,z,1.45,.25,1.65,'trim');pinnacle(k,x,14.9,z,.50,4.8);
  for(const [yy,top]of[[11,16.1],[14.7,21]]){
   const P=[];for(let j=0;j<=16;j++){const t=j/16;P.push([side*lerp(10.5,4.5,t),lerp(yy,top,t)+Math.sin(t*Math.PI)*.65,z]);}
   path(k,P,.20,'trim',5);path(k,P.map(a=>[a[0],a[1]+.36,a[2]]),.095,'metal',4);
   for(let j=2;j<15;j+=3)k.beam(P[j],P[j].map((v,i)=>i===1?v+.65:v),.055,'trim');
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
 /* THE OTHER WONDERS.
  * Only the pilgrimage towns ever raised anything above a citadel, so however far you
  * travelled every skyline resolved to the same cathedral or the same keep. A tradition
  * with the surplus to build now builds ITS OWN monument, and each is authored around the
  * thing that tradition actually has: living timber, suspended stone, black rock, a cliff.
  * All four are ordinary triangle geometry in the same kit, on the same reserved parcel.
  */
 function groveSanctuary(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'leaf'},options);k.palette=palette(recipe);
  k.part('root-court','The root court and still water','foundation',()=>{
   k.terrace(0,0,0,34,34,1.1);k.terrace(0,1.1,-2,26,24,.9);
   k.pool(0,2.0,7,17,11);stair(k,0,1.1,13,7,7,.157,.42);
   for(const s of[-1,1])for(const z of[-9,-2,5])k.hedge(s*12.5,2.0,z,2.4,5.2);
  });
  k.part('bearing-trees','The bearing trees and their halls','architecture',()=>{
   // Each hall is CARRIED: a trunk, a spreading collar, then the room. Nothing is a
   // pillar pretending to be a tree — the collar is what the floor rests on.
   for(const [x,z,h,r]of[[0,-8,17,2.5],[-10.5,1,13,2.0],[10.5,1,13,2.0],[-6,10,10,1.7],[6,10,10,1.7]]){
    k.cylinder(x,2.0,z,r,h,'wood',12);
    for(let j=0;j<6;j++){const a2=j*TAU/6+.3;k.beam([x+Math.cos(a2)*r*.8,2.0+h*.34,z+Math.sin(a2)*r*.8],[x+Math.cos(a2)*r*2.5,2.0+h*.08,z+Math.sin(a2)*r*2.5],r*.24,'wood',5);}
    k.cylinder(x,2.0+h,z,r*2.9,.5,'wood',14);
    k.cylinder(x,2.0+h+.5,z,r*2.3,r*1.9,'wall',12);
    k.rail(x-r*2.3,z+r*2.3,x+r*2.3,z+r*2.3,2.0+h+.5,'wood');
    for(let j=0;j<5;j++){const a2=j*TAU/5;k.window(x+Math.cos(a2)*r*2.32,2.0+h+1.1,z+Math.sin(a2)*r*2.32,r*.7,1.5,a2);}
    k.using('roof',()=>{k.cone(x,2.0+h+.5+r*1.9,z,r*3.0,r*3.4,'roof',0,14);k.cone(x,2.0+h+.5+r*1.9+r*3.4,z,.18,.9,'metal',0,6);});
   }
   // Canopy walks, so the halls read as one building rather than five towers.
   for(const [a2,b2]of[[[0,-8,17],[-10.5,1,13]],[[0,-8,17],[10.5,1,13]],[[-10.5,1,13],[-6,10,10]],[[10.5,1,13],[6,10,10]],[[-6,10,10],[6,10,10]]])
    k.beam([a2[0],2.0+a2[2]*.62,a2[1]],[b2[0],2.0+b2[2]*.62,b2[1]],.30,'wood',6);
  });
  k.part('leaf-crown','The living crown','ornament',()=>{
   k.tree(0,2.0,-8,26,'broad');for(const s of[-1,1])k.tree(s*14,2.0,-13,15,'broad');
   k.emblem(0,7.5,12.5,1.1);for(const s of[-1,1])k.banner(s*7,2.0,12.5,4.2);
  });
  return k.finish();
 }
 function skyCrystal(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette=palette(recipe);
  k.part('resonator-drum','The stepped resonator drum','foundation',()=>{
   for(let j=0;j<4;j++)k.lathe(0,j*1.5,0,[[0,0],[17-j*2.6,0],[17-j*2.6,1.5],[0,1.5]],'wall',24);
   k.ring(0,6.1,0,11.5,.16,'metal','xz',40);k.pool(0,6.05,0,9,9);stair(k,0,0,17,8,8,.19,.44);
  });
  k.part('suspension-ring','The buttresses and the suspension rings','architecture',()=>{
   // Eight raking buttresses carry two rings; the stone above them is what the rings hold.
   for(let j=0;j<8;j++){const a2=j*TAU/8+.2,x=Math.cos(a2)*10.5,z=Math.sin(a2)*10.5;
    k.beam([x,6.1,z],[Math.cos(a2)*3.4,20.5,Math.sin(a2)*3.4],.55,'wall',7);
    k.cylinder(x,6.1,z,.85,3.2,'wall',9);k.crystal(x,9.3,z,.42,2.1);
   }
   k.ring(0,20.5,0,4.2,.34,'metal','xz',36);k.ring(0,23.0,0,3.1,.26,'metal','xz',30);
   for(let j=0;j<6;j++){const a2=j*TAU/6;k.beam([Math.cos(a2)*4.2,20.5,Math.sin(a2)*4.2],[Math.cos(a2)*3.1,23.0,Math.sin(a2)*3.1],.14,'metal',4);}
  });
  k.part('suspended-stone','The suspended crystal','architecture',()=>{
   // Nothing touches it. The gap under the point is the whole claim of the building.
   k.crystal(0,26.2,0,4.6,15.5);
   k.lathe(0,26.2,0,[[0,0],[3.1,-1.9],[4.6,0]],'water',10);
   k.using('roof',()=>{for(let j=0;j<10;j++){const a2=j*TAU/10;k.beam([Math.cos(a2)*3.2,26.4,Math.sin(a2)*3.2],[Math.cos(a2)*1.1,24.0,Math.sin(a2)*1.1],.07,'metal',4);}});
   k.ring(0,31.5,0,2.4,.10,'metal','xy',26);k.ring(0,31.5,0,2.4,.10,'metal','yz',26);
  });
  k.part('observers','The instrument galleries','ornament',()=>{
   for(const s of[-1,1]){k.arcade(s*13,0,4,5,1.7,2.9,Math.PI/2);k.emblem(s*9,7.2,11,.8);}
   k.arch(0,0,17.5,3.6,4.6,.8,'trim');
  });
  return k.finish();
 }
 function dreadKeep(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette=palette(recipe);
  k.part('black-terraces','The scorched terraces and the barbed circuit','foundation',()=>{
   k.terrace(0,0,0,36,34,2.0);k.terrace(0,2.0,-4,27,22,1.8);k.terrace(0,3.8,-7,19,14,1.6);
   stair(k,0,0,17,6,9,.222,.42);stair(k,0,2.0,11.5,5,8,.225,.40);
   for(const [x,z,W,D]of[[0,-16,32,.9],[-16,-2,.9,28],[16,-2,.9,28],[-10,15,14,.9],[10,15,14,.9]]){k.box(x,0,z,W,4.2,D,'wall');k.parapet(x,4.2,z,W,D);}
   for(let j=-15;j<=15;j+=2.6)for(const z of[-16,15])k.cone(j,4.8,z,.20,1.5,'dark',0,4);
  });
  k.part('dread-spires','The keep and its horned spires','architecture',()=>{
   k.hall(0,5.4,-8,13,11,15,{roof:'gable',roofHeight:5.0});
   for(const s of[-1,1]){
    k.tower(s*8.6,5.4,-8,2.1,23,'spire');
    // Horns, not finials: they lean out over the court so the silhouette reads as menace.
    for(const t of[-1,1])k.beam([s*8.6,26.5,-8],[s*8.6+s*4.4,31.5,-8+t*3.6],.34,'dark',5);
    k.tower(s*11.5,3.8,4,1.6,13,'spire');k.hall(s*12,2.0,-9,4.4,10,5.2,{roof:'gable',entrance:false});
   }
   k.tower(0,5.4,-8,3.0,30,'spire');
   for(const t of[-1,1])k.beam([0,33.5,-8],[t*6.0,39.0,-8],.40,'dark',5);
   k.using('roof',()=>k.cone(0,35.4,-8,3.4,5.2,'roof',0,8));
  });
  k.part('gate-of-horns','The gate of horns and the brazier court','ornament',()=>{
   k.arch(0,0,16,4.4,5.6,1.4,'wall');
   for(const s of[-1,1]){k.tower(s*4.2,0,16,1.5,9,'spire');k.cone(s*4.2,9,16,.9,3.4,'dark',0,6);
    k.fountain(s*7,3.8,6,1.2);k.banner(s*6.5,3.8,10,4.6);}
   k.emblem(0,7.4,16.6,1.2);
  });
  return k.finish();
 }
 function deepCity(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette=palette(recipe);
  k.part('cut-face','The cut cliff face','foundation',()=>{
   // The mountain is the building. A wall of worked rock stands where the face was, and
   // everything else is carved back INTO it rather than stacked in front.
   k.box(0,0,-13,36,30,10,'wall');
   for(let y=1;y<28;y+=2.4)k.box(0,y,-7.9,36,.30,.5,colorScale(k.color('wall'),.82));
   k.terrace(0,0,2,34,22,1.4);k.terrace(0,1.4,6,26,12,1.2);stair(k,0,1.4,13,8,8,.15,.44);
  });
  k.part('deep-portal','The great portal and its wardens','architecture',()=>{
   k.arch(0,1.4,-7.6,11,15,2.2,'wall');
   k.box(0,16.6,-7.6,14.5,1.6,2.6,'trim');k.box(0,18.2,-7.6,11.5,.9,2.2,'dark');
   for(const s of[-1,1]){
    // Wardens cut from the same face, shoulders level with the lintel.
    k.box(s*8.2,1.4,-7.2,3.6,13.5,3.0,'wall');k.box(s*8.2,14.9,-7.2,4.4,1.1,3.6,'trim');
    k.cylinder(s*8.2,16.0,-7.2,1.5,3.2,'wall',10);k.box(s*8.2,19.2,-7.2,3.0,.8,3.0,'metal');
   }
   for(let j=0;j<5;j++)k.box(0,1.4+j*.22,-4.6+j*.44,10.5,.22,.5,'trim');
  });
  k.part('gallery-terraces','The worked galleries and forge stacks','architecture',()=>{
   for(let t=0;t<4;t++){const y=6.5+t*4.6,w=30-t*4.4;
    k.box(0,y,-8.6,w,.7,1.9,'trim');k.rail(-w/2,-7.7,w/2,-7.7,y+.7,'metal');
    for(let x=-w/2+2.4;x<w/2-1;x+=3.6)k.window(x,y+1.0,-7.55,1.1,2.0,0);
   }
   for(const s of[-1,1]){k.cylinder(s*13.5,1.4,4,1.5,11,'dark',10);k.cylinder(s*13.5,12.4,4,1.9,.8,'metal',10);
    k.hall(s*11,1.4,10,5.2,6.4,4.2,{roof:'gable',entrance:false});}
  });
  k.part('chasm-bridge','The chasm bridge and lamp posts','ornament',()=>{
   k.box(0,1.4,14,5.0,.55,10,'trim');
   for(const s of[-1,1]){k.rail(s*2.5,9,s*2.5,19,2.0,'metal');
    for(const z of[10.5,14,17.5]){k.cylinder(s*2.5,1.95,z,.16,2.1,'metal',6);k.crystal(s*2.5,4.05,z,.30,.9);}}
   k.emblem(0,20.4,-7.3,1.3);
  });
  return k.finish();
 }
 const WONDERS={'grove-sanctuary':groveSanctuary,'sky-crystal':skyCrystal,'dread-keep':dreadKeep,'deep-city':deepCity};
 function build(recipe,options={}){
  const other=WONDERS[recipe.wonder];
  if(other)return other(recipe,options);
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
   for(const s of[-1,1]){k.box(s*6.5,5.55,-5.1,4.2,7.8,18.8,'wall');k.box(s*6.5,13.2,-5.1,4.4,.24,19,'trim');}
   // Rear apse: radial chapels, not a rectangular end wall.
   k.lathe(0,5.55,-14.4,[[0,0],[4.4,0],[4.4,13.1],[0,13.1]],'wall',20);
   for(let j=0;j<5;j++){const a=Math.PI+j*Math.PI/4,x=Math.cos(a)*4.4,z=-14.4+Math.sin(a)*2.6;k.cylinder(x,5.6,z,1.5,7.2,'wall',12);k.dome(x,12.8,z,1.6,2.5,'roof');}
   for(const s of[-1,1]){
    for(let z=-12.5;z<4.1;z+=2.8){
     lancet(k,s*4.43,15.1,z,1.45,4.7,s<0?-Math.PI/2:Math.PI/2);
     lancet(k,s*8.62,6.3,z,1.65,5.7,s<0?-Math.PI/2:Math.PI/2);
     flying(k,s,z);pinnacle(k,s*4.45,21.2,z,.20,2.2);
    }
    lancet(k,s*11.02,7.2,-6,3.8,8.6,s<0?-Math.PI/2:Math.PI/2);
   }
   for(const s of[-1,1])masonry(k,s*8.62,5.7,-5,18.6,6.8,s<0?-Math.PI/2:Math.PI/2);
   k.using('roof',()=>{
    k.roof(0,21.15,-4.2,9.2,20.9,5.8,'roof','gable');k.roof(0,17.3,-5.9,6.5,22.2,4.1,'roof','gable',Math.PI/2);
    for(const s of[-1,1])k.roof(s*6.5,13.5,-5.1,4.5,19.2,2.8,'roof','gable');
    for(let row=1;row<11;row++)for(const s of[-1,1]){const t=row/11;k.beam([s*5.04*(1-t),21.19+5.8*t,-15.2],[s*5.04*(1-t),21.19+5.8*t,6.8],.025,'metal',3);}
   });
  },'Pointed clerestory windows, tall transepts, a radial apse, repeated chapels and two levels of flying buttresses.');
  k.part('west-front','The Rose Gate and processional facade','architecture',()=>{
   const z=6.2;
   k.box(0,5.55,z,9.2,16.7,.55,'wall');
   k.tri([-4.6,22.25,z+.29],[4.6,22.25,z+.29],[0,27.8,z+.29],'wall');
   path(k,[[-4.7,22.1,z+.4],[0,28.1,z+.4],[4.7,22.1,z+.4]],.16,'trim');
   for(const x of[-2.65,0,2.65]){
    const h=x===0?6.2:4.8,ww=x===0?2.2:1.7;
    k.box(x,5.55,z+.31,ww,h*.62,.06,'dark');
    pointed(k,x,5.55,z+.42,ww,h,.4);pointed(k,x,5.55,z+.66,ww*.82,h*.9,.18,0,'metal');
    for(const t of[-1,1])k.box(x+t*ww*.21,5.55,z+.5,ww*.37,h*.53,.10,'wood');
    for(const t of[-1,1])k.cylinder(x+t*ww*.13,7,z+.58,.065,.12,'metal',8);
    path(k,[[x-ww*.74,5.6+h,z+.8],[x,7+h,z+.8],[x+ww*.74,5.6+h,z+.8]],.12,'trim');
   }
   rose(k,0,18.9,z+.40,2.78);
   for(const x of[-4.30,-3.40,3.40,4.30]){
    k.box(x,5.65,z+.42,.20,16.75,.26,'trim');
    for(const yy of[10.4,14.4,22.5]){k.box(x,yy,z+.45,.36,.20,.35,'metal');}
    pinnacle(k,x,22.30,z+.45,.25,3.5);
   }
   for(const x of[-3.45,3.45])lancet(k,x,15.7,z+.39,.60,5.8);
   masonry(k,0,5.7,z+.31,8.6,6.0);
   for(const s of[-1,1])for(let j=0;j<4;j++){
    const x=s*(.75+j*.78);pointed(k,x,22.25,z+.43,.57,1.35,.13,0,'trim',8);
   }
   for(const s of[-1,1]){tower(k,s*5.8,5.55,5.2,2.12,mainHeight,crown);for(const yy of[8.5,12.6,23.0])statue(k,s*4.3,yy,z+.65,1.65);}
   for(let x=-3.4;x<=3.4;x+=.85){pointed(k,x,12.1,z+.41,.6,1.55,.15);}
   for(let j=-4;j<=4;j++)pinnacle(k,j,23.6+4*(1-Math.abs(j)/4),z+.4,.17,2.0);
   k.emblem(0,25.1,z+.5,1.0);
  },'Real three-dimensional stained-glass tracery, multiple nested portal arches, open belfries, niches and guardian figures.');
  k.part('crown-of-light','The Lantern of the Firmament','architecture',()=>{
   const x=0,z=-5.8;
   k.cylinder(x,22.8,z,3.9,5.6,'wall',12);k.cylinder(x,28.3,z,4.12,.34,'trim',12);
   for(let a=0;a<8;a++)k.transform(x,24,z,a*Math.PI/4,1,()=>lancet(k,0,0,3.74,1.40,3.8));
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
  const model=k.finish();model.signature=LandmarkCatalog.signature(recipe)+'/great-sanctuary-1';model.recipe={...recipe,sacred:true,sacredVersion:1};return model;
 }
 function miniature(recipe,b){return ArtisanCityKit.meshAt(build(recipe,{lod:1}),b);}
 function site(w,s,p){
  const r=TownCatalog.resolve(w,s,p);if(!wonderFor(r.style,p.detailSupport??p.urbanSupport))return null;
  let cache=siteCache.get(w);if(!cache){cache=new Map();siteCache.set(w,cache)}
  const key=p.id+'/'+TownCatalog.signature(r)+'/'+(p.detailSupport??p.urbanSupport);let entry=cache.get(key);
  if(entry===undefined){const c=generateCity(w,s,p.id),b=c.buildings.find(b=>b.sacred);entry=b?{townRecipe:c.townRecipe,townProfile:c.townProfile,buildings:[b]}:null;cache.set(key,entry)}
  if(!entry)return null;const recipe=TownCityBinding.resolve(w,s,p,entry,'temple');
  return{id:recipe.id,name:recipe.name,recipe,provinceId:p.id,i:p.i,x:p.x,y:p.y,priority:p.urbanPop*2.5,kind:(TOWN_WONDERS[r.style]?.name||'Wonder')+' · in-town 3D',building:entry.buildings[0]};
 }
 return{build,miniature,pointed,lancet,statue,rose,palette,site,version:1};
})();
