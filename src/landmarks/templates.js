/** Authored compositions assembled from the reusable kit. Nine palace families + six landmarks. */
const LandmarkTemplates = (() => {
 function pavilion(k,x,y,z,r=2,h=3){k.mark('open-pavilion');k.cylinder(x,y,z,r*1.14,.3,'trim',8);for(let i=0;i<8;i++){const a=i*Math.PI/4;k.cylinder(x+Math.cos(a)*r*.83,y+.3,z+Math.sin(a)*r*.83,.11,h,'wall',6)}k.using('roof',()=>{k.lathe(x,y+h+.3,z,[[0,0],[r*1.3,0],[r*.92,.25],[r*.54,r*.6],[r*.2,r*1.15],[0,r*1.5]],'roof',8);k.cone(x,y+h+.3+r*1.5,z,.16,.65,'metal',0,6)})}
 function gate(k,x,y,z,w=7,h=7){k.mark('gatehouse');for(const s of[-1,1])k.tower(x+s*(w*.5+.6),y,z,1.2,h,'battlement');k.arch(x,y,z,w,h-1,1.5,'wall');k.box(x,y+h-.8,z,w,.6,1.8,'trim');k.using('ornament',()=>{k.emblem(x,y+h+1,z+.3,.7);k.cultureDetail(x,y,z+1.2)})}
 function stairsN(k,x,y,z,w,n,dy=.25,dz=.45){ // Compact forward-facing stair, no buried mega-blocks.
  k.mark('ceremonial-stair');for(let i=0;i<n;i++)k.box(x,y,z-i*dz,w,(i+1)*dy, dz+.02,'trim');
 }
 function stage(k){if(k.options.base===false)return;const id=k.recipe.style,r=k.random,p=k.palette;
 k.part('site','The inherited setting','site',()=>{
  const wet=['delta','fjord','river','lighthouse','bridge'].includes(id);const groundY=wet?-.65:-.12;
  k.box(0,-2.4,0,59,1.9,47,colorScale(k.color('ground'),.83));
  const n=20;for(let z=0;z<16;z++)for(let x=0;x<n;x++){const xx=(x-(n-1)/2)*2.95,zz=(z-7.5)*2.94;let mat=colorScale(k.color('ground'),.97+r()*.07);if(wet&&(id==='delta'||zz>11.8||id==='bridge'&&Math.abs(xx)<5))mat=colorScale(k.color('water'),.94+r()*.08);k.box(xx,groundY,zz,2.965,.21,2.96,mat)}
  if(id==='delta'){for(let i=0;i<18;i++){const x=(r()-.5)*52,z=(r()-.5)*42;if(Math.abs(x)<19&&Math.abs(z)<17)continue;k.rock(x,-.3,z,1.1+r()*2,.35,1.2,7,'ground');for(let a=0;a<3;a++)k.cone(x+(a-1)*.35,.05,z,.07,1.1+r(),'leaf',.03,4)}}
  if(['mountain','ice','fjord'].includes(id)){for(let i=0;i<8;i++){const x=(i-3.5)*6.3,z=-16-r()*3;const h=id==='mountain'?8+r()*8:4+r()*7;k.rock(x,-.1,z,5.4,h,5.6,9,'wall');if(id!=='mountain')k.rock(x,h*.6,z,3.1,h*.52,3.7,8,'trim')}}
  if(id==='basalt')for(let i=0;i<12;i++){const a=i/12*Math.PI*2;k.rock(Math.cos(a)*25,-.1,Math.sin(a)*20,2.5,2+r()*2.7,2.5,6,'wall')}
 },'Illustrative microterrain keyed to the site. This does not change the global height map or create a new water source.');
 k.part('landscape','Gardens and the outer precinct','landscape',()=>{
  if(k.lod===0)return;
  if(['desert','labyrinth'].includes(id)){
   if(k.recipe.geography.freshwater>.3)for(let i=0;i<9;i++){const a=i/9*Math.PI*2;k.tree(Math.cos(a)*24,0,Math.sin(a)*18,3.8+r()*1.5,'palm')}
   for(let a=0;a<12;a++){const x=(r()-.5)*52,z=18+r()*4;k.rock(x,-.35,z,1.4,.20,.35,8,'ground')}
  }else if(id!=='delta'){
   for(let i=0;i<22;i++){let a=i/22*Math.PI*2,x=Math.cos(a)*(25+r()*2),z=Math.sin(a)*(19+r()*1.8);if(['river','fjord','lighthouse','bridge'].includes(id)&&z>10)continue;if(id==='bridge'&&Math.abs(x)<6)continue;k.tree(x,0,z,2.5+r()*2.2,k.recipe.geography.cold||['mountain','basalt'].includes(id)?'pine':'broad')}
  }
  // Small buildings provide a scale cue; none are added to population statistics.
  if(!['mountain','ice','delta','grove','bridge','labyrinth'].includes(id))for(let i=0;i<7;i++){const x=i%2?-24:24,z=-9+Math.floor(i/2)*5;if(id==='forest')pavilion(k,x,0,z,1.2,1.3);else k.hall(x,0,z,2.6,3.3,1.8,{roof:k.recipe.geography.cold?'northern':k.recipe.geography.dry?'flat':'hip',entrance:false})}
 },'Small outer buildings and vegetation are scale cues, not additional simulated settlements.');
 }
 function river(k){const v=k.recipe.variant,wy=3.1;
  k.part('terraces','The royal terraces','foundation',()=>{k.terrace(0,0,-2,39,27,1.3);k.terrace(0,1.3,-7,29,16,1.8);stairsN(k,0,0,15,8,6,.21,.45);stairsN(k,0,1.35,3,6,7,.25,.43);k.box(0,1.32,4,3.8,.06,14,'trim')});
  k.part('royal-hall','The high audience hall','architecture',()=>{k.hall(0,wy,-11,13+v,7.5,6.2,{roof:'hip'});for(const s of[-1,1])k.tower(s*7.2,wy,-11,1.25,7.3+v*.25,'spire');k.box(0,wy+3.2,-7.18,3,.25,.7,'trim');k.arcade(0,wy,-6.8,5,1.8,3.2);k.using('ornament',()=>k.emblem(0,wy+8.8,-6.6,1))},'A ceremonial hall raised above the public court.');
  for(const s of[-1,1])k.part(s<0?'west-wing':'east-wing',s<0?'The garden gallery':'The diplomatic apartments','architecture',()=>{k.hall(s*14,1.35,-4,5.2,18-v,4.0,{roof:'hip'});k.tower(s*14,1.35,5,1.5,5.2,'spire');k.arcade(s*10.7,1.35,-3,7,1.8,2.4,Math.PI/2)});
  k.part('formal-court','Parterres and the water axis','garden',()=>{for(const s of[-1,1])k.garden(s*6.1,1.43,4,7.1,7.6);k.fountain(0,1.42,7,1.4);k.using('ornament',()=>k.cultureDetail(0,1.35,10.5))});
  k.part('entry','The riverward gate','architecture',()=>{gate(k,0,0,18,5,4.3);if(k.options.base!==false)k.bridge(0,-1.2,17.5,13,3.2,Math.PI/2)});
 }
 function basilica(k){const v=k.recipe.variant;
  k.part('plinth','The processional terraces','foundation',()=>{k.terrace(0,0,-1,37,33,1.2);k.terrace(0,1.2,-7,28,18,1.3);stairsN(k,0,-.15,17,13,7,.2,.5);k.box(0,1.24,8,7,.12,10,'trim')});
  k.part('nave','The basilica and transepts','architecture',()=>{k.hall(0,2.5,-5,9,20,7,{roof:'gable',roofHeight:3.5});k.hall(0,2.5,-8,23,7,6,{roof:'gable',roofHeight:2.5,angle:Math.PI/2,entrance:false});for(const s of[-1,1]){k.hall(s*8.7,2.5,-10,5.1,10,5,{roof:'hip',entrance:false});for(let z=-12;z<3;z+=3.2){k.box(s*5,2.5,z,.55,6.2,.75,'trim');k.beam([s*5,8.8,z],[s*8,4.6,z],.20,'trim')}}k.arch(0,2.5,5.15,3.4,5.1,.5,'trim');k.box(0,8.5,5.02,3.2,.18,.22,'trim')});
  k.part('dome','The great ribbed dome','architecture',()=>{k.cylinder(0,9.4,-8,4.45,2.9,'wall',20);for(let i=0;i<10;i++){const a=i*Math.PI/5;k.window(Math.sin(a)*4.5,10.0,-8+Math.cos(a)*4.5,.72,1.3,a)}k.dome(0,12.3,-8,4.9,5.1+v*.2,'metal');k.using('ornament',()=>k.emblem(0,18.8+v*.2,-8,.9))});
  for(const s of[-1,1])k.part(s<0?'west-campanile':'east-campanile','The '+(s<0?'western':'eastern')+' bell tower','architecture',()=>{k.hall(s*8.0,2.5,1,3.5,3.5,9.2,{roof:'flat'});k.cylinder(s*8,12,1,1.65,.3,'trim',8);for(let n=0;n<4;n++){const a=n*Math.PI/2;k.arch(s*8+Math.sin(a)*1.12,12.3,1+Math.cos(a)*1.12,1.2,2.5,.25,'wall',a)}k.dome(s*8,14.8,1,1.9,1.7);k.using('ornament',()=>k.emblem(s*8,17.2,1,.45))});
  k.part('cloisters','The paired cloisters','architecture',()=>{for(const s of[-1,1]){k.arcade(s*13,1.2,8,4,1.8,2.5);k.arcade(s*17,1.2,3,4,1.8,2.5,Math.PI/2);k.garden(s*12.5,1.25,4,5.5,5.5)}});
  k.part('square','The pilgrim square','garden',()=>{k.fountain(0,1.35,10,1.9);k.using('ornament',()=>k.cultureDetail(0,1.3,13))});
 }
 function arcane(k){const v=k.recipe.variant,r=11.2;
  k.part('disc','The geometric foundation','foundation',()=>{k.cylinder(0,0,0,18,1.1,'wall',12);k.cylinder(0,1.1,0,18.3,.25,'trim',12);k.cylinder(0,1.35,0,8.8,.3,'wall',20);k.ring(0,1.72,0,7,.10,'metal');k.ring(0,1.73,0,5.2,.07,'water');for(let i=0;i<8;i++){const a=i*Math.PI/4;k.beam([Math.cos(a)*5.2,1.75,Math.sin(a)*5.2],[Math.cos(a)*7.3,1.75,Math.sin(a)*7.3],.09,'metal')}stairsN(k,0,0,20,5,6,.22,.5)});
  k.part('resonator','The resonator and its court','architecture',()=>{k.cylinder(0,1.65,0,3,.7,'trim',12);k.cylinder(0,2.35,0,2.5,.25,'water',12);k.crystal(0,2.6,0,1.8,8+v);k.ring(0,7,0,3.5,.10,'metal');for(let a=0;a<6;a++){const t=a*Math.PI/3;k.crystal(Math.cos(t)*4.2,1.8,Math.sin(t)*4.2,.35,1.6)}},'A supported magical resonator; its energy is a fictional architectural premise.');
  for(let i=0;i<5;i++){const a=Math.PI+.30+i*(Math.PI*1.8)/5,x=Math.cos(a)*r,z=Math.sin(a)*r,h=11+(i%3)*2+v*.4;k.part('observatory-'+i,['The west archive','The lunar chair','The high observatory','The eastern chair','The scholar tower'][i],'architecture',()=>{k.tower(x,1.35,z,2.0,h,'crystal');k.cylinder(x,6.3,z,2.75,.4,'trim',12);for(let j=0;j<8;j++){const t=j*Math.PI/4;k.cylinder(x+Math.cos(t)*2.55,6.7,z+Math.sin(t)*2.55,.055,.8,'metal',4)}k.ring(x,7.5,z,2.55,.06,'metal')})}
  k.part('sky-galleries','The elevated scholar galleries','architecture',()=>{const points=[];for(let i=0;i<5;i++){const a=Math.PI+.30+i*(Math.PI*1.8)/5;points.push([Math.cos(a)*r,Math.sin(a)*r])}for(let i=1;i<points.length;i++){const[a,b]=[points[i-1],points[i]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);k.bridge((a[0]+b[0])/2,3.2,(a[1]+b[1])/2,len,1.5,Math.atan2(b[1]-a[1],b[0]-a[0]))}});
  k.part('entry','The open college gate','architecture',()=>{for(const s of[-1,1])k.tower(s*5.5,1.35,12.5,1.4,7.5,'spire');k.arch(0,1.35,12.5,8,7,.7,'trim');k.using('ornament',()=>{k.emblem(0,10.1,12.5,1.1);k.cultureDetail(0,1.35,15)})});
 }
 function forest(k){const v=k.recipe.variant;
  k.part('roots','The root terrace','foundation',()=>{k.cylinder(0,0,0,17,.55,'wall',12);k.cylinder(0,.55,0,16.8,.2,'ground',12);k.pool(0,.76,5,7,5)});
  k.part('trees','The great living supports','landscape',()=>{for(const[x,z,h]of[[-9,-7,18+v],[8,-9,21-v],[0,-13,23]]){k.tree(x,.5,z,h);for(let i=0;i<5;i++){const a=i*Math.PI*.4;k.beam([x,2.8,z],[x+Math.cos(a)*3.9,.65,z+Math.sin(a)*3.9],.30,'wood')}}},'Authored living-tree construction; trees are part of the precinct, not a biome edit.');
  k.part('court-hall','The leaf-roofed court','architecture',()=>{k.hall(0,1.0,-2,8,8,4.8,{roof:'leaf',roofHeight:4.7});k.arcade(0,1.0,2.5,4,1.5,3);pavilion(k,-6,4.5,-7,2.7,3.5);pavilion(k,7,6,-8,2.8,3.6);k.using('ornament',()=>k.emblem(0,11,1,.85))});
  k.part('canopy-walks','The canopy walks','architecture',()=>{k.bridge(-5,1.7,-6,9,1.5,-.30);k.bridge(6,3.2,-6,10,1.5,.38);for(const s of[-1,1]){pavilion(k,s*12,.8,3,2.5,3.8);k.bridge(s*7,0,3,8,1.6)}k.using('ornament',()=>k.cultureDetail(0,.8,11))});
  k.part('outer-court','The shaded approach','garden',()=>{stairsN(k,0,0,18,4,4,.2,.5);for(const s of[-1,1]){k.tree(s*10,0,12,6);pavilion(k,s*7,.6,12,1.8,2.3)}});
 }
 function mountain(k){const v=k.recipe.variant;
  k.part('citadel-terraces','The defended ascending terraces','foundation',()=>{k.terrace(0,0,0,33,28,2.5);k.terrace(0,2.5,-5,27,19,3);k.terrace(0,5.5,-10,21,12,3);stairsN(k,0,0,17,6,10,.25,.45);stairsN(k,0,2.5,5,5,12,.25,.45);stairsN(k,0,5.5,-5,4,12,.25,.3)});
  k.part('great-gate','The colossal Deepgate','architecture',()=>{k.hall(0,8.5,-10,15,6,8+v,{roof:'flat',entrance:false});k.box(0,8.7,-6.91,5,6.6,.14,'dark');k.arch(0,8.7,-6.7,5.2,7,.85,'trim');for(const s of[-1,1]){k.box(s*6.3,8.5,-6.2,1.1,10.5,.8,'trim');k.box(s*5.1,8.5,-6.4,.5,9,.6,'wall')}k.using('ornament',()=>k.emblem(0,18.8+v,-6,.95))});
  k.part('bastions','The massive forward bastions','architecture',()=>{for(const s of[-1,1]){k.hall(s*12,2.5,4,5.5,7,6,{roof:'flat'});k.hall(s*9.8,5.5,-4,4,5,6.5,{roof:'flat'});k.box(s*15.7,0,0,1,7,13,'wall');k.box(s*11,8.5,-12,3,3.5,3,'wall');k.using('ornament',()=>k.cultureDetail(s*11,2.5,8))}});
  k.part('approach','The guarded stone approach','architecture',()=>{if(k.options.base!==false)k.bridge(0,-.3,18.4,10.5,3.6,Math.PI/2);for(const s of[-1,1])k.tower(s*4,0,12,1.15,4,'battlement')});
 }
 function desert(k){const v=k.recipe.variant;
  k.part('walled-court','The enclosed oasis court','foundation',()=>{k.terrace(0,0,0,36,31,.7);for(const s of[-1,1])k.box(s*17.4,.7,0,.9,3.8,30,'wall');k.box(0,.7,-15,35,3.8,.9,'wall');for(const s of[-1,1])k.box(s*10,.7,15,14,3.1,.8,'wall');stairsN(k,0,0,17.5,6,4,.19,.45)});
  k.part('audience-hall','The shaded audience hall','architecture',()=>{k.hall(0,.7,-9,16,8,5.5,{roof:'flat'});k.cylinder(0,6.2,-9,3.3,1.6,'wall',16);k.dome(0,7.8,-9,3.75,3.5+v*.3,'roof');k.arcade(0,.8,-4.1,6,2.1,3.5);k.using('ornament',()=>k.emblem(0,12.6+v*.3,-9,.7))});
  k.part('arcades','The shaded side galleries','architecture',()=>{for(const s of[-1,1]){k.hall(s*13,.7,-.5,5.1,19,3.3,{roof:'flat',entrance:false});k.arcade(s*9.8,.75,0,7,2.1,2.6,Math.PI/2)}});
  k.part('wind-towers','Wind towers and roof terraces','architecture',()=>{for(const x of[-15,15])for(const z of[-12,11]){k.hall(x,.7,z,2.3,2.3,7.3,{roof:'flat',entrance:false});for(const side of[-1,1])for(let n=0;n<3;n++)k.box(x+side*1.17,6.0,z+(n-1)*.47,.055,1.65,.25,'dark');k.box(x,8.8,z,2.9,.22,2.9,'trim')}});
  k.part('water-court','The guarded water garden','garden',()=>{k.pool(0,.78,2,4.4,12);for(const s of[-1,1]){k.garden(s*5.8,.79,2,4.2,9);if(k.recipe.geography.freshwater>.3)for(const z of[-.5,6])k.tree(s*6,.9,z,4,'palm')}gate(k,0,.7,14.8,4.5,4.6)},'Pools become dry courts when freshwater access is insufficient. Ornament does not create water.');
 }
 function delta(k){
  k.part('pilings','The flood-raised structure','foundation',()=>{for(const [x,z,w,d]of[[0,-6,13,10],[-11,1,8,10],[11,1,8,10],[0,12,10,6]]){for(let xx=x-w/2;xx<=x+w/2;xx+=2.2)for(const zz of[z-d/2+.3,z+d/2-.3])k.cylinder(xx,-.5,zz,.14,3.7,'wood',6);k.box(x,3,z,w+.6,.35,d+.6,'wood');k.rail(x-w/2,z+d/2,x+w/2,z+d/2,3.4,'wood')}});
  k.part('assembly','The great reed-roofed assembly','architecture',()=>{k.hall(0,3.35,-6,11,9,4.1,{roof:'northern',roofHeight:3.3});k.roof(0,9.4,-6,7,6,2.3,'roof','northern');k.using('ornament',()=>k.emblem(0,12.8,-6,.75))});
  k.part('side-courts','The river councils','architecture',()=>{for(const s of[-1,1]){k.hall(s*11,3.35,1,6.4,8,2.7,{roof:'northern'});pavilion(k,s*16,.6,10,2,2.5);k.box(s*10,2.85,7,2,.28,8,'wood');for(const z of[7,11])k.cylinder(s*10,-.5,z,.12,3.6,'wood',6)}});
  k.part('walkways','Boardwalks and public landings','architecture',()=>{k.box(0,3.1,6,2,.3,11,'wood');k.box(0,3.1,3,23,.3,2,'wood');k.rail(-12,4,12,4,3.4,'wood');pavilion(k,0,3.35,12,2.6,3);for(const s of[-1,1]){k.box(s*5,.35,17,1.5,.25,10,'wood');for(let j=0;j<5;j++){k.cylinder(s*5+.65,-.4,13+j*2,.07,1.8,'wood',5);k.cylinder(s*5-.65,-.4,13+j*2,.07,1.8,'wood',5)}}});
  k.part('boats','The landing boats','landscape',()=>{if(k.options.base===false)return;for(const s of[-1,1]){k.transform(s*10,0,15,s*.3,1,()=>{k.lathe(0,0,0,[[0,0],[1,.15],[.65,.8],[0,.8]],'wood',8);k.box(0,.4,0,1.2,.25,4.8,'wood');k.beam([0,.6,0],[0,4,0],.055,'wood');k.tri([0,3.9,0],[0,1.2,0],[2.2,1.6,0],'trim')})}});
 }
 function basalt(k){const v=k.recipe.variant;
  k.part('black-terraces','The ancient basalt foundations','foundation',()=>{k.terrace(0,0,0,34,30,2);k.terrace(0,2,-7,27,17,2.2);k.terrace(0,4.2,-10,19,10,1.9);stairsN(k,0,0,17,6,8,.25,.44);stairsN(k,0,2,3,5,8,.26,.4)});
  k.part('high-keep','The copper-crowned high keep','architecture',()=>{k.hall(0,6.1,-10,11,8,8+v,{roof:'hip',roofHeight:3.3});for(const s of[-1,1]){k.tower(s*6.3,6.1,-10,1.4,10,'battlement');k.box(s*4.8,6.1,-5.6,.8,9,1.2,'trim')}k.using('ornament',()=>k.emblem(0,17+v,-5,.9))});
  k.part('defences','The stepped bastions','architecture',()=>{for(const s of[-1,1]){k.hall(s*13,2,3,5,10,5.5,{roof:'flat'});k.box(s*9,2,-3,1.2,7.8,1.2,'trim');k.tower(s*13,2,9,1.6,5.8,'battlement')}gate(k,0,2,12.5,5.5,6)});
  k.part('court','The geothermal forecourt','garden',()=>{k.pool(0,2.15,5,6,4);for(const s of[-1,1])k.banner(s*4,2,5,4);k.using('ornament',()=>k.cultureDetail(0,2,8.5))},'A small managed water court, not a field of erupting volcanoes.');
 }
 function fjord(k){
  k.part('cliff-platform','The stone quay and upper terrace','foundation',()=>{k.terrace(0,0,-2,33,25,2.4);k.terrace(0,2.4,-8,24,13,1.3);stairsN(k,0,0,13,6,9,.27,.5);k.box(0,0,17,30,.4,3,'wall');if(k.options.base!==false)for(const s of[-1,1]){k.box(s*10,-.3,19.5,2.2,.4,8,'wood');for(const z of[17,20,23])k.cylinder(s*10-.8,-1,z,.11,1.7,'wood',5)}});
  k.part('longhall','The high northern longhall','architecture',()=>{k.hall(0,3.7,-8,9,15,5.5,{roof:'northern',roofHeight:4.5});k.roof(0,11.6,-8,5,12,2.3,'roof','northern');if(k.recipe.geography.cold){k.using('roof',()=>{k.roof(0,9.25,-8,8.5,14.6,4.42,'trim','northern');k.roof(0,11.65,-8,4.65,11.7,2.28,'trim','northern')})}for(const s of[-1,1])for(const z of[-13,-9,-5,-1]){k.beam([s*4.6,4,z],[s*4.6,8.7,z],.13,'wood');k.beam([s*4.6,5,z],[s*4.6,8.4,z+2.1],.09,'wood')}k.using('ornament',()=>k.emblem(0,15,-8,.85))});
  k.part('watchtowers','The harbor watchtowers','architecture',()=>{for(const s of[-1,1]){k.tower(s*13,2.4,5,1.65,8,s<0?'spire':'battlement');k.hall(s*10,2.4,-5,5,12,3.2,{roof:'northern',roofHeight:3.0})}});
  k.part('gallery','The covered gathering gallery','architecture',()=>{k.arcade(0,2.4,4,7,1.8,2.9);k.roof(0,5.75,4,16,3,1.2,'roof','northern');k.using('ornament',()=>k.cultureDetail(0,2.4,7))});
 }
 function lighthouse(k){
  k.part('headland','The lantern terrace','foundation',()=>{k.cylinder(0,0,0,11,2,'wall',12);k.cylinder(0,2,0,11.25,.25,'trim',12);stairsN(k,0,0,14,5,9,.25,.45)});
  k.part('tower','The tiered navigation tower','architecture',()=>{k.cylinder(0,2.25,-2,4,1,'wall',8);k.lathe(0,3.25,-2,[[3.5,0],[3.2,6],[3.8,6.2],[3.6,6.6],[2.8,6.8],[2.3,14],[3,14.1],[3,14.6]],'wall',8);for(const y of[8.9,17.8])k.cylinder(0,y,-2,y>10?3:3.8,.3,'trim',8);for(const y of[5,9,13])for(let a=0;a<4;a++)k.window(Math.sin(a*Math.PI/2)*2.85,y,-2+Math.cos(a*Math.PI/2)*2.85,.8,1.7,a*Math.PI/2);for(let a=0;a<8;a++){const t=a*Math.PI/4;k.cylinder(Math.cos(t)*2.5,18.0,-2+Math.sin(t)*2.5,.13,3.1,'wall',6)}k.crystal(0,18.4,-2,.6,2.2);k.dome(0,21.1,-2,3.05,2.4,'metal');k.ring(0,18.6,-2,3,.07,'metal')});
  k.part('keepers','The keepers court','architecture',()=>{k.hall(-6,2.25,3,4,6,3,{roof:'hip'});k.hall(6,2.25,3,4,6,3,{roof:'hip'});k.arcade(0,2.25,7,4,1.5,2.4);k.using('ornament',()=>k.emblem(0,6,7,.7))});
 }
 function observatory(k){
  k.part('stairs','The astronomical terraces','foundation',()=>{k.cylinder(0,0,0,16,1,'wall',12);k.cylinder(0,1,0,13,1.4,'trim',12);k.cylinder(0,2.4,0,9.5,1.3,'wall',12);stairsN(k,0,0,18,5,14,.26,.4)});
  k.part('orrery','The great armillary sphere','architecture',()=>{k.cylinder(0,3.7,0,3,1.7,'trim',12);k.cylinder(0,5.4,0,1.2,2.7,'wall',12);k.ring(0,11,0,6.4,.22,'metal','xy',48);k.ring(0,11,0,6.4,.17,'metal','yz',48);k.ring(0,11,0,6.8,.18,'metal','xz',48);k.transform(0,11,0,.5,1,()=>{k.ring(0,0,0,5.3,.15,'trim','xy',40)});k.crystal(0,9,0,1.3,4.5);k.beam([0,5,0],[0,18,0],.10,'metal');for(let i=0;i<12;i++){const a=i*Math.PI/6;k.cone(Math.cos(a)*6.8,11,Math.sin(a)*6.8,.17,.6,'trim',0,6)}});
  k.part('archive','The curved star archive','architecture',()=>{for(let i=0;i<5;i++){const a=Math.PI+i*Math.PI/4;pavilion(k,Math.cos(a)*12,2.4,Math.sin(a)*12,2,3.8)}k.hall(0,1,12,7,4,3.2,{roof:'hip'});k.using('ornament',()=>k.emblem(0,6.7,14,.8))});
 }
 function labyrinth(k){
  k.part('excavation','The stepped excavation court','foundation',()=>{k.terrace(0,0,-5,32,24,1.2);for(const s of[-1,1]){k.box(s*10,1.2,3,10,2.2,12,'wall');k.box(s*13,3.4,-5,4,1.5,18,'wall')}k.box(0,1.22,0,10,.10,16,'dark');stairsN(k,0,1.25,11,7,9,.2,.5)});
  k.part('portal','The sealed subterranean threshold','architecture',()=>{k.hall(0,1.2,-10,18,7,9,{roof:'flat',entrance:false});k.box(0,1.3,-6.43,6.4,6.8,.12,'dark');k.arch(0,1.3,-6.2,6.7,7.5,1,'trim');for(const s of[-1,1]){k.box(s*7.5,1.2,-5.8,1.1,10,1.5,'wall');k.cone(s*7.5,11.2,-5.8,.95,1.7,'trim',0,4)}k.using('ornament',()=>k.emblem(0,11.7,-6.3,1.1))});
  k.part('survey-camp','The survey lodges and pylons','architecture',()=>{for(const s of[-1,1]){k.hall(s*13,1.2,8,3.8,5,2.4,{roof:'flat'});k.cylinder(s*7,1.2,12,1,5,'wall',4);k.using('ornament',()=>k.emblem(s*7,6.9,12,.5))}});
 }
 function bridge(k){
  k.part('span','The five-arched Crownspan','architecture',()=>{k.bridge(0,.3,0,39,4.5);for(const s of[-1,1]){k.terrace(s*21,0,0,8,12,3.5);k.hall(s*18,3.65,0,4.8,7,4.3,{roof:'hip'});k.arch(s*18,3.65,4,3.5,3.1,.5,'trim')}k.rail(-24,-2.7,24,-2.7,3.65);k.rail(-24,2.7,24,2.7,3.65)});
  k.part('shrine','The bridge chapel','architecture',()=>{k.terrace(2,3.6,-5,7,6,.3);pavilion(k,2,3.9,-5,2.7,4);k.using('ornament',()=>k.emblem(2,11,-5,.6))});
 }
 function ice(k){
  k.part('stone-ledge','The grounded archive terrace','foundation',()=>{k.terrace(0,0,0,29,24,1.5);k.terrace(0,1.5,-6,20,13,1.5);stairsN(k,0,0,14,6,6,.25,.5)});
  k.part('archive-hall','The insulated archive hall','architecture',()=>{k.hall(0,3,-7,12,9,5,{roof:'northern',roofHeight:4});k.using('roof',()=>k.roof(0,8.1,-7,12,9,4.0,'trim','northern'));for(const s of[-1,1])k.hall(s*9,1.5,0,4.2,9,3.2,{roof:'northern'});k.arcade(0,1.5,5,5,1.6,3.1)});
  k.part('signal','The glacial signal tower','architecture',()=>{k.tower(-10,1.5,-8,1.75,11,'crystal');k.using('ornament',()=>k.emblem(-10,17,-8,.8))});
 }
 function grove(k){
  k.part('ritual-ring','The open assembly ring','foundation',()=>{k.cylinder(0,0,0,11,.4,'wall',16);k.cylinder(0,.4,0,10.2,.15,'ground',16);k.ring(0,.65,3,5.5,.12,'trim');for(let i=0;i<9;i++){const a=i/9*Math.PI*2;k.cylinder(Math.cos(a)*8,.5,Math.sin(a)*8,.45,2+(i%3)*.4,'wall',5)}});
  k.part('old-tree','The ancient heart-tree','landscape',()=>{k.tree(0,.5,-3,25);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;k.beam([0,3,-3],[Math.cos(a)*5,.5,-3+Math.sin(a)*5],.45,'wood')}});
  k.part('shrine','The sheltered shrine','architecture',()=>{pavilion(k,0,.6,5,3.7,4);k.using('ornament',()=>k.emblem(0,10,5,1.2));k.bridge(0,-2.5,13,9,2.2,Math.PI/2)});
 }
 const builders={river,basilica,arcane,forest,mountain,desert,delta,basalt,fjord,lighthouse,observatory,labyrinth,bridge,ice,grove};
 function build(recipe,options={}){if(recipe.sacred&&typeof SacredCityKit!=='undefined')return SacredCityKit.build(recipe,options);if(recipe.artisan&&typeof ArtisanCityKit!=='undefined')return ArtisanCityKit.precinct(recipe,options);const r=LandmarkCatalog.validate(recipe),k=new LandmarkKit(r,options);stage(k);builders[r.style](k);return k.finish()}
 function transformGeometry(g,scale=1,offset=[0,0,0],angle=0){const out=new Geometry(),c=Math.cos(angle),s=Math.sin(angle);for(let i=0;i<g.data.length;i+=9){const a=g.data,x=a[i],z=a[i+2],nx=a[i+3],nz=a[i+5];out.data.push((x*c-z*s)*scale+offset[0],a[i+1]*scale+offset[1],(x*s+z*c)*scale+offset[2],nx*c-nz*s,a[i+4],nx*s+nz*c,a[i+6],a[i+7],a[i+8])}return out}
 function meshes(model){const m={};for(const p of model.parts)m[p.id]={vertices:new Float32Array(p.geometry.data)};return m}
 return {build,builders,transformGeometry,meshes};
})();
