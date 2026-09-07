/** Authored urban construction families, not a flat-image facade.
 * Meshes: roofs, masonry courses, fenestration, stairs, parapets and domestic yards.
 * Each complete town uses one construction language; people's mixtures are retained.
 */
const ArtisanCityKit=(()=>{
 const PALETTES={
  river:{wall:'#ddd6bf',trim:'#f1e7cc',roof:'#526777',metal:'#be9d62',wood:'#62513e',dark:'#384246',ground:'#aca68d',water:'#83b7bd',leaf:'#536d46'},
  basilica:{wall:'#e0d8c4',trim:'#f3e9cf',roof:'#355870',metal:'#d0af5f',wood:'#6d4f3e',dark:'#424453',ground:'#b1ab98',water:'#819fb9',leaf:'#506b48'},
  arcane:{wall:'#c9ced1',trim:'#e8e4d4',roof:'#465571',metal:'#c6ac66',wood:'#5b5267',dark:'#343a54',ground:'#979b96',water:'#86c5d9',leaf:'#4a7067'},
  mountain:{wall:'#989995',trim:'#c9c6b6',roof:'#3f5b65',metal:'#b5a074',wood:'#65523f',dark:'#353d3e',ground:'#aaa18f',water:'#89abae',leaf:'#476959'},
  forest:{wall:'#c4c9a5',trim:'#e2dabc',roof:'#387e75',metal:'#c3a966',wood:'#7a6244',dark:'#364f47',ground:'#83967a',water:'#8fc7b5',leaf:'#386b42'},
  desert:{wall:'#c7a576',trim:'#ecce99',roof:'#348c88',metal:'#bf9551',wood:'#846342',dark:'#5d4c3e',ground:'#bdae8d',water:'#68bec2',leaf:'#728950'},
  delta:{wall:'#baa775',trim:'#e5d3a0',roof:'#7c7b49',metal:'#adbc98',wood:'#725338',dark:'#374f47',ground:'#8b9575',water:'#7fbdb6',leaf:'#466d50'},
  basalt:{wall:'#5e6268',trim:'#a7a497',roof:'#755e4d',metal:'#c49859',wood:'#51473b',dark:'#2b313c',ground:'#8a8981',water:'#8dabad',leaf:'#4c6555'},
  fjord:{wall:'#abaeac',trim:'#d8dacd',roof:'#405669',metal:'#bbab7e',wood:'#685340',dark:'#303f4b',ground:'#a0a59b',water:'#7baebb',leaf:'#405f54'},
  steppe:{wall:'#d3c49b',trim:'#eee1bd',roof:'#8b7650',metal:'#bda162',wood:'#7a6446',dark:'#4d483b',ground:'#b9b281',water:'#7fb0a6',leaf:'#8b9a5d'},
  paddy:{wall:'#dad4bd',trim:'#efe9d1',roof:'#587757',metal:'#b9a46a',wood:'#6c5540',dark:'#3d4b43',ground:'#93a777',water:'#84c0b4',leaf:'#4b8253'},
  delve:{wall:'#8b857f',trim:'#b8b0a2',roof:'#68594f',metal:'#c9a05c',wood:'#695948',dark:'#363438',ground:'#8d887e',water:'#7ba0a5',leaf:'#5c735f'},
  lagoon:{wall:'#ded5c0',trim:'#f3ebd7',roof:'#3d888e',metal:'#c7ab63',wood:'#7a6450',dark:'#3e555c',ground:'#aeb391',water:'#6cc0c4',leaf:'#5d8868'}
 };
 function kit(recipe,lod=1){const k=new LandmarkKit(recipe,{base:false,lod});k.palette={...(PALETTES[recipe.urbanStyle||recipe.style]||LandmarkCatalog.palettes[recipe.material])};return k}
 function append(dst,src){for(const n of src.data)dst.data.push(n)}
 // Openings are the single largest triangle cost in a town, so they carry the LOD split:
 // nothing on the outskirts, a recessed panel mid-town, full joinery in the core.
 function windowN(k,x,y,z,w=.55,h=.9,angle=0,stone=true){if(k.lod<1)return;k.transform(x,y,z,angle,1,()=>{
  k.box(0,0,0,w,h,.07,'dark');k.box(0,.08,.042,w*.66,h*.79,.025,stone?'water':'metal');
  if(k.lod<2)return;
  k.box(0,-.08,.08,w+.19,.08,.19,'trim');k.box(0,h-.04,.02,w+.12,.07,.1,'trim');k.box(0,.06,.06,.045,h-.09,.04,'trim');k.box(0,h*.48,.06,w*.9,.04,.04,'trim');
  if(!stone)for(const s of[-1,1])k.box(s*(w*.66),0,.035,w*.24,h,.09,'wood');
 })}
 function courses(k,x,y,z,w,h,angle=0){if(k.lod<1)return;k.transform(x,y,z,angle,1,()=>{
  for(let row=0;row<Math.floor(h/.52);row++){
   const yy=row*.52+.1;k.box(0,yy,.018,w,.018,.025,colorScale(k.color('wall'),.76));
   const unit=1.06;for(let col=-w/2+.35+(row%2)*.45;col<w/2-.15;col+=unit){
    k.box(col,yy,.024,.018,.49,.026,colorScale(k.color('wall'),.78));
    if((row+Math.round(col*3))%5===0)k.box(col+.35,yy+.03,.028,.65,.43,.018,colorScale(k.color('wall'),.91));
   }
  }
 })}
 function slateRoof(k,x,y,z,w,d,h,kind='gable',ornate=false){
  if(kind==='flat'){k.using('roof',()=>{k.box(x,y,z,w+.22,.19,d+.22,'trim');k.parapet(x,y+.15,z,w,d);});return;}
  k.roof(x,y,z,w,d,h,'roof',kind);
  k.using('roof',()=>{
   const D=d*.55,W=w*.55,hip=kind!=='gable';
   for(let row=1;row<8;row+=k.lod<2?7:1)for(const side of[-1,1]){
    const t=row/8,xx=W*(1-t)*side,yy=y+h*t+.025,span=hip?D-(W*.65)*t:D;
    k.beam([x+xx,yy,z-span],[x+xx,yy,z+span],.024,colorScale(k.color('roof'),.76),3);
   }
   k.beam([x,y+h+.05,z-D*.7],[x,y+h+.05,z+D*.7],.07,'metal',5);
   if(ornate)for(const sign of[-1,1])k.cone(x,y+h,z+sign*D*.72,.11,.60,'metal',0,6);
  });
 }
 function house(k,x,y,z,w,d,h,style,variant=0,angle=0){
  const flat=style==='desert',timber=['fjord','delta','steppe','paddy'].includes(style)||(style==='river'&&variant%3===0),
   roof=style==='fjord'?'northern':['forest','paddy'].includes(style)?'leaf':flat?'flat':['steppe','lagoon'].includes(style)?'hip':'gable';
  k.transform(x,y,z,angle,1,()=>{
   k.mark('inhabited-masonry');k.box(0,0,0,w+.2,.27,d+.2,'wall');
   const wall=timber?'wood':colorScale(k.color('wall'),.89+(variant%4)*.047);
   k.box(0,.27,0,w,h,d,wall);k.box(0,h+.13,0,w+.14,.16,d+.14,'trim');
   const floors=Math.max(1,Math.min(3,Math.floor(h/1.8)));
   for(let f=0;f<floors;f++)for(const side of[-1,1]){
    const yy=.6+f*1.6;for(const xx of[-.27,.27])windowN(k,xx*w,yy,side*(d/2+.018),.42,.73,side<0?Math.PI:0,!timber);
    windowN(k,side*(w/2+.018),yy,0,.38,.7,side<0?-Math.PI/2:Math.PI/2,!timber);
   }
   for(const s of[-1,1])for(const t of[-1,1]){
    if(k.lod<1)break;
    k.box(s*(w/2-.10),.22,t*(d/2+.035),.17,h+.05,.13,'trim');
    if(k.lod>=2)for(let j=0;j<Math.floor(h/.62);j++)k.box(s*(w/2-.16),j*.62+.25,t*(d/2+.045),.29,.18,.08,'trim');
   }
   if(timber&&k.lod>=1){for(const sign of[-1,1]){
    k.box(0,h*.55,sign*(d/2+.08),w,.08,.08,'trim');
    k.beam([-w*.4,.35,sign*(d/2+.1)],[0,h*.55,sign*(d/2+.1)],.04,'trim',4);
    k.beam([0,h*.55,sign*(d/2+.1)],[w*.4,.35,sign*(d/2+.1)],.04,'trim',4);
   }}
   const ph=flat?.3:Math.min(w,d)*(style==='fjord'?.81:.56);
   slateRoof(k,0,h+.30,0,w+.14,d+.15,ph,roof,style==='arcane');
   k.box(0,.27,d/2+.08,.6,1.0,.10,'dark');
   if(k.lod>=1){k.box(0,.3,d/2+.14,.44,.88,.05,'wood');k.box(0,.26,d/2+.39,1,.13,.54,'trim');}
   if(!flat&&variant%3!==1&&k.lod>=1){k.box(w*.27,h*.9,-d*.20,.42,ph+1,.5,'wall');k.box(w*.27,h*.9+ph+.9,-d*.2,.56,.15,.62,'trim');k.box(w*.27,h*.9+ph+1.06,-d*.2,.32,.02,.34,'dark');}
   // Projecting dormers, not a painted roof texture.
   if(!flat&&w>2.2&&k.lod>=2){k.transform(-w*.35,h+.48,.35,0,1,()=>{k.box(0,0,0,.65,.63,.72,'wall');slateRoof(k,0,.63,0,.76,.81,.48,'gable');windowN(k,0,.08,.40,.27,.43,0);});}
   if(k.lod<1)return;
   if(style==='desert'){
    if(variant%3===0){k.box(w*.27,h, -d*.26,.68,1.40,.7,'wall');for(const sign of[-1,1])k.box(w*.27+sign*.36,h+.5,-d*.26,.025,.63,.38,'dark');k.box(w*.27,h+1.4,-d*.26,.92,.12,.92,'trim')}
    if(variant%3===1)k.dome(0,h+.35,-d*.1,w*.26,w*.29,'roof');
   }
   if(style==='basilica'){
    for(const s of[-1,1]){k.box(s*(w*.4),.3,d/2+.13,.10,h*.95,.22,'trim');}
    if(variant%3===1){k.box(0,h*.54,d/2+.36,w*.65,.13,.7,'trim');k.rail(-w*.32,d/2+.64,w*.32,d/2+.64,h*.54,'metal');}
    k.arch(0,.27,d/2+.20,.65,1.30,.15,'trim');
    if(variant%4===0){k.ring(0,h*.73,d/2+.055,.27,.035,'metal','xy',16);}
   }
   if(style==='arcane'&&variant%3===0){k.crystal(w*.36,h+1.6,-d*.24,.18,.9);}
   // Felted windbreak screens on the exposed sides, not a decorative fence.
   if(style==='steppe'){for(const t of[-1,1])k.box(t*(w*.5+.30),.27,0,.12,h*.72,d*.86,'wood');if(variant%3===0)k.box(0,h+.34,0,.30,1.5,.30,'wood');}
   // A raised veranda under a deep eave is the whole point of this family.
   if(style==='paddy'){k.box(0,.20,d*.5+.55,w+.5,.14,1.1,'wood');for(const t of[-1,1])k.box(t*w*.36,.34,d*.5+.95,.12,h*.62,.12,'wood');k.box(0,h*.62+.34,d*.5+.95,w+.6,.11,1.2,'trim');}
   if(style==='delve'&&variant%3!==2){k.box(w*.34,.27,-d*.42,.55,h*.55,.55,'dark');k.beam([w*.34,h*.55,-d*.42],[w*.34,h+.9,-d*.05],.07,'wood',4);}
   if(style==='lagoon'){k.arch(0,.27,d/2+.22,.72,1.45,.16,'trim');if(variant%3===1)k.box(0,h*.52,d/2+.34,w*.7,.12,.66,'trim');}
  });
 }
 function flag(k,x,y,z,h=2.4){k.banner(x,y,z,h)}
 function bastion(k,x,y,z,r,h,style){
  const square=['mountain','basalt','desert','delve'].includes(style),crown=style==='arcane'?'crystal':['desert','mountain','delve'].includes(style)?'battlement':['basilica','lagoon'].includes(style)?'dome':'spire';
  if(square){k.box(x,y,z,r*1.85,h,r*1.85,'wall');for(let j=1;j<h;j+=1.2)k.box(x,y+j,z,r*1.94,.13,r*1.94,'trim');k.parapet(x,y+h,z,r*1.9,r*1.9);windowN(k,x,y+h-1.35,z+r*.94,r*.4,1.0);}
  else k.tower(x,y,z,r,h,crown);
 }
 function greatHall(k,x,y,z,w,d,h,style,opts={}){
  k.hall(x,y,z,w,d,h,{roof:style==='desert'?'flat':style==='forest'?'leaf':style==='fjord'?'northern':'gable',roofHeight:opts.roofHeight||Math.min(w,d)*.58,entrance:opts.entrance!==false});
  for(const side of[-1,1]){
   courses(k,x,y+.3,z+side*(d/2+.015),w,h-.65,side===1?0:Math.PI);
   courses(k,x+side*(w/2+.015),y+.3,z,d,h-.65,side===1?Math.PI/2:-Math.PI/2);
  }
  if(style!=='desert')slateRoof(k,x,y+h,z,w+.38,d+.38,opts.roofHeight||Math.min(w,d)*.58,style==='fjord'?'northern':'gable',true);
 }
 function precinct(recipe,options={}){
  const K=kit(recipe,options.lod??1),id=recipe.urbanStyle||recipe.style,style=PALETTES[id]?id:'river';
  const foundation=()=>{K.box(0,0,0,23,.75,23,'wall');K.box(0,.70,0,23.5,.18,23.5,'trim');K.box(0,.89,2.8,19,.05,11,colorScale(K.color('ground'),1.15));};
  K.part('precinct-base','The terraced civic precinct','foundation',foundation,'Architectural foundations above the inherited ground; not newly generated mountain terrain.');
  if(style==='forest'){
   K.part('living-court','The canopy council and tree halls','architecture',()=>{
    K.tree(0,.88,-2.8,16,'broad');for(const [x,z,y]of[[-6,-3,3],[6,-2,5],[0,6,2]]){
     K.cylinder(x,.88,z,.9,y,'wood',9);K.cylinder(x,y+.88,z,3.2,.45,'wood',12);K.cylinder(x,y+1.3,z,2.25,2.4,'wall',10);K.using('roof',()=>K.cone(x,y+3.7,z,3.1,3.6,'roof',0,12));K.rail(x-2.4,z+2,x+2.4,z+2,y+1.3,'wood');
     K.beam([x,y+1.4,z],[0,6,-2],.28,'wood');
    }
    K.arcade(0,.9,9,4,2.0,2.7);K.emblem(0,4.3,9.3,.9);
   });
  }else if(style==='arcane'){
   K.part('star-citadel','The high observatory and collegiate spires','architecture',()=>{
    K.cylinder(0,.9,-2,5.4,1.2,'wall',12);greatHall(K,0,2.1,-3.5,7.5,7,8,style);
    for(const [x,z,h]of[[-7,-7,10],[7,-7,13],[-7,3,7],[7,3,8]]){K.tower(x,.9,z,1.55,h,'crystal');K.beam([x,5.8,z],[0,6.2,-3.5],.28,'trim');}
    K.ring(0,14,-3.5,2.8,.12,'metal','xy',30);K.ring(0,14,-3.5,2.8,.1,'metal','yz',30);K.crystal(0,12.8,-3.5,.5,2.4);
    K.ring(0,1.0,5.7,2.5,.05,'metal','xz',28);K.fountain(0,.9,5.7,1.1);
   });
  }else if(style==='basilica'){
   K.part('cathedral','The vaulted sanctuary and cloister','architecture',()=>{
    greatHall(K,0,.9,-2.8,7.5,13,8.1,style);for(const s of[-1,1]){
     K.tower(s*4.5,.9,3.9,1.6,11.5,'spire');greatHall(K,s*8.5,.9,-3.0,3.4,11,3.2,style,{entrance:false});
     for(let z=-8;z<3;z+=2.8){K.box(s*5.3,.9,z,.6,3,.8,'trim');K.beam([s*3.9,7.7,z],[s*5.3,3.6,z],.15,'trim');}
    }
    K.dome(0,9.1,-6,3.4,4.1,'metal');K.ring(0,7.4,3.88,1.55,.15,'trim','xy',24);for(let j=0;j<8;j++){const a=j*Math.PI/4;K.beam([0,7.4,3.9],[Math.cos(a)*1.45,7.4+Math.sin(a)*1.45,3.9],.05,'metal',4)}K.arch(0,.9,4.0,2.4,3.6,.45,'trim');
    K.arcade(0,.9,8.6,5,1.6,2.5);K.fountain(0,.9,6.7,1.1);
   });
  }else if(style==='desert'){
   K.part('oasis-courts','The wind-tower kasbah and garden courts','architecture',()=>{
    greatHall(K,0,1.0,-6.2,14,6,5.2,style);for(const s of[-1,1]){greatHall(K,s*8,.9,-.7,4,10,3.6,style);K.arcade(s*5.8,.9,-1,5,1.55,2.2,Math.PI/2);bastion(K,s*9,.9,8.7,1.1,5.9,style);K.box(s*5.5,6.2,-6.2,1.5,3.3,1.5,'wall');for(const t of[-1,1])K.box(s*5.5+t*.77,7.1,-6.2,.06,1.5,1,'dark');K.box(s*5.5,9.5,-6.2,1.9,.16,1.9,'trim');}
    K.dome(0,6.2,-6.2,2.8,3.4,'roof');K.pool(0,.91,1.1,2.6,5.9);K.arch(0,.9,9.2,3,3.8,.6,'wall');for(const s of[-1,1]){K.garden(s*3.4,.9,3.8,3.4,4.2);if(recipe.geography.freshwater>.3)K.tree(s*3.8,.9,6.8,4,'palm');}
   });
  }else if(style==='steppe'){
   K.part('standard-court','The mast court, felt halls and stock pens','architecture',()=>{
    K.terrace(0,.9,0,19,17,.55);
    // A ring of low halls guyed back to one standing mast, not a walled keep.
    for(let k=0;k<6;k++){const a=k/6*Math.PI*2,x=Math.cos(a)*7.1,z=Math.sin(a)*6.3;
     greatHall(K,x,1.45,z,5.0,3.7,3.0,style,{entrance:k===0,roofHeight:2.1});
     K.beam([x,4.2,z],[0,9.2,0],.14,'wood');}
    K.cylinder(0,1.45,0,.52,10.2,'wood',10);flag(K,0,10.4,0,3.2);
    for(const t of[-1,1]){K.rail(t*10.6,-9.2,t*10.6,9.2,.95,'wood');K.rail(-10.6,t*9.2,10.6,t*9.2,.95,'wood');}
    K.emblem(0,3.0,9.4,.7);
   });
  }else if(style==='paddy'){
   K.part('sluice-courts','The veranda prefecture and its water stair','architecture',()=>{
    for(let t=0;t<3;t++)K.terrace(0,.9+t*1.15,-2.4-t*3.2,18-t*3.4,7.2,1.15);
    greatHall(K,0,4.35,-8.8,8.6,5.8,5.2,style,{roofHeight:4.0});
    for(const t of[-1,1]){greatHall(K,t*7.0,2.05,-2.2,3.5,8.0,3.1,style,{entrance:false});
     K.arcade(t*4.1,1.45,3.3,4,1.6,2.4,Math.PI/2);}
    // Basins are irrigation, not ornament: they step with the terraces.
    K.pool(0,.92,6.2,8.6,5.0);K.pool(0,.92,-.4,6.6,2.4);
    for(let j=0;j<7;j++)K.box(0,.9+j*.25,3.4-j*.40,4.2,.25,.48,'trim');
    K.arch(0,.9,10.1,2.7,3.5,.5,'trim');K.emblem(0,6.4,-5.9,.6);
   });
  }else if(style==='delve'){
   K.part('pithead','The headframe, counting hall and spoil terraces','architecture',()=>{
    K.terrace(0,.9,-3.0,16.5,11.5,1.2);
    greatHall(K,-5.2,2.1,-4.2,6.8,7.2,5.4,style);
    // A timber winding frame over the shaft mouth, braced back to the counting hall.
    const hx=5.4,hz=-2.9;K.box(hx,2.1,hz,4.4,.5,4.4,'dark');
    for(const a of[-1,1])for(const b of[-1,1])K.beam([hx+a*1.8,2.5,hz+b*1.8],[hx+a*.5,11.8,hz+b*.5],.22,'wood',5);
    K.box(hx,11.8,hz,2.3,1.1,2.3,'wood');K.ring(hx,12.5,hz,1.1,.14,'metal','yz',18);
    K.beam([hx,11.1,hz],[-5.2,7.2,-4.2],.13,'metal',5);
    for(let t=0;t<4;t++)K.terrace(0,.9,6.6+t*1.5,14-t*2.4,1.5,.5);
    for(const t of[-1,1])bastion(K,t*8.4,.9,-9.1,1.1,6.2,style);
    K.arch(0,.9,-9.6,2.6,3.4,.9,'wall');K.emblem(0,5.2,-8.4,.6);flag(K,-5.2,8.0,-4.2,2.4);
   });
  }else if(style==='lagoon'){
   K.part('tidewater-chancery','The chancery ranges and walled basin','architecture',()=>{
    K.terrace(0,.9,-4.4,19,9.6,.9);
    greatHall(K,0,1.8,-6.2,10.6,6.2,6.6,style);
    for(const t of[-1,1]){greatHall(K,t*8.2,.9,.6,3.7,9.6,4.1,style,{entrance:false});
     K.arcade(t*5.3,.9,.4,5,1.7,2.5,Math.PI/2);}
    // The basin is the approach: mooring steps and posts, not a processional stair.
    K.pool(0,.9,6.0,10.6,6.8);
    for(const t of[-1,1])for(let j=0;j<4;j++)K.box(t*6.0,.9-j*.2,3.3+j*.52,3.2,.2,.52,'trim');
    for(const t of[-1,1]){K.cylinder(t*4.5,.9,10.1,.28,2.5,'wood',8);K.cylinder(t*1.9,.9,10.6,.24,2.1,'wood',8);}
    K.dome(0,8.4,-6.2,2.9,3.3,'metal');K.arch(0,.9,-.6,2.7,3.7,.6,'trim');
    K.emblem(0,5.7,-9.9,.65);flag(K,0,10.7,-6.2,2.6);
   });
  }else if(style==='delta'){
   K.part('tidal-hall','The stilted civic halls','architecture',()=>{for(const x of[-8,-4,0,4,8])for(const z of[-8,-4,0,4,8])K.box(x,.9,z,.25,2,.25,'wood');K.box(0,2.6,0,21,.3,20,'wood');greatHall(K,0,2.9,-3,8,12,5,style);for(const s of[-1,1])greatHall(K,s*7,2.9,2,4,10,3,style);K.rail(-10,10,10,10,2.9,'wood');K.rail(-10,-10,-10,10,2.9,'wood');});
  }else{
   K.part('citadel','The inner keep and tiered curtain walls','architecture',()=>{
    const north=style==='fjord',mount=style==='mountain',basalt=style==='basalt';
    K.terrace(0,.9,-4.1,16.5,13,1.25);K.terrace(0,2.15,-6.5,12.5,8.1,1.0);
    greatHall(K,0,3.15,-6.2,north?8.7:8.5,north?6:6.8,north?5.1:mount?7.3:8.7,style);
    for(const s of[-1,1]){
     greatHall(K,s*8.2,.9,-.9,4.1,11,north?3.0:4.1,style,{entrance:false});
     bastion(K,s*5.1,3.15,-8.7,north?.9:1.2,north?6.7:mount?8.9:11.5,style);
     bastion(K,s*9.8,.9,-9.5,1.0,north?4.4:6.2,style);
     bastion(K,s*9.8,.9,9.1,1.1,north?4.4:5.8,style);
     K.arcade(s*5.8,.9,-1.6,5,1.75,2.5,Math.PI/2);
     if(!mount&&!basalt)K.garden(s*3.5,.9,4.8,4,4.6);
    }
    K.arch(0,.9,9.7,3.4,4.0,1.1,'wall');K.box(0,4.65,9.7,4.0,.34,1.6,'trim');K.parapet(0,4.99,9.7,4,1.5);
    for(const s of[-1,1])bastion(K,s*3.1,.9,9.7,.95,6.2,style);
    for(const [x,z,W,D]of[[0,-10,20,.55],[-10,0,.55,19],[10,0,.55,19],[-6.8,9.7,6,.55],[6.8,9.7,6,.55]]){K.box(x,.9,z,W,3,D,'wall');K.parapet(x,3.9,z,W,D);}
    for(let j=0;j<8;j++)K.box(0,.9+j*.28,5.2-j*.42,3.7,.28,.48,'trim');
    K.fountain(0,.92,6.7,.92);K.emblem(0,6.0,10.7,.65);flag(K,0,14.5,-6.2,2.7);
   });
  }
  K.part('inhabited-detail','Standards, stair approaches and stonework','ornament',()=>{
   for(const s of[-1,1]){flag(K,s*8.5,1.1,9.7,3.2);K.emblem(s*7.2,1.9,9.7,.4);}
   courses(K,0,.10,11.51,23,.62);for(let j=0;j<4;j++)K.box(0,j*.22,12.6-j*.3,4.2,.22,.33,'trim');
  });
  return K.finish();
 }
 function meshAt(model,b){
  const lo=model.bounds.min,hi=model.bounds.max,angle=b.angle||0,cs=Math.cos(angle),sn=Math.sin(angle),W=hi[0]-lo[0],D=hi[2]-lo[2];
  const scale=Math.min(b.w/(Math.abs(cs)*W+Math.abs(sn)*D),b.d/(Math.abs(sn)*W+Math.abs(cs)*D))*.985;
  const cx=(lo[0]+hi[0])/2,cz=(lo[2]+hi[2])/2,offset=[b.x-(cx*cs-cz*sn)*scale,b.y-lo[1]*scale,b.z-(cx*sn+cz*cs)*scale];
  const body=new Geometry(),roof=new Geometry();for(const p of model.parts)append(p.role==='roof'?roof:body,LandmarkTemplates.transformGeometry(p.geometry,scale,offset,angle));
  return{body,roof,height:(hi[1]-lo[1])*scale,model};
 }
 function compound(b,c,p,realm){
  const style=c.townProfile.id,faith=['sun','stars','grove','hearth','tide','secular'][cDominant(p.faith)]||'secular',recipe=LandmarkCatalog.recipe(c.townProfile.palace,c.townRecipe.seed+'/'+b.id,{urbanStyle:style,faith,geography:{freshwater:p.fresh||0,cold:c.siteEnvironment.temperature<4}}),K=kit(recipe,b.lod??2),rng=K.random;
  if(b.type==='civic')return meshAt(precinct({...recipe,artisan:true}),b);
  let count=0;K.part('courtyard','The inhabited urban block','architecture',()=>{
   K.box(0,0,0,9.8,.18,9.8,colorScale(K.color('ground'),1.04));
   if(b.infill){house(K,0,.18,0,7.5,7.8,style==='desert'?5.8:7.6+rng()*2,style,Math.floor(rng()*5));count=1;return;}
   if(b.type==='well'){K.fountain(0,.18,0,2);K.arcade(0,.18,-2.8,3,1.8,2.8);return}
   if(b.type==='granary'){house(K,0,.18,0,5.5,7.7,5,style,1);for(const x of[-3.5,3.5])K.cylinder(x,.18,2.5,.5,1.1,'wood',9);count=1;return;}
   if(style==='forest'){
    for(const [x,z,v]of[[-2.7,-2.8,0],[2.5,-2,1],[.3,2.8,2]]){K.cylinder(x,.18,z,1.5,1.0,'wood',10);K.cylinder(x,1.18,z,1.25,2.7,'wall',10);K.using('roof',()=>K.cone(x,3.88,z,1.8,3.3,'roof',0,12));K.beam([x,1.3,z],[0,1.3,0],.25,'wood');windowN(K,x,1.7,z+1.25,.43,.9);count++;}K.tree(-3.5,.2,2.8,7,'broad');
   }else{
    const arrangement=b.moduleVariant??0,entries=arrangement===0?[[-2.7,-2.3,3.9,4.6],[1.8,-2.6,3.9,4.0],[-2.9,2.2,3.4,3.2],[2.0,2.1,4.1,3.5]]:arrangement===1?[[-2.9,-.3,3.4,8.1],[1.35,-2.75,4.7,3.3],[2.45,2.45,3.0,4.0]]:[[-2.55,-2.65,4.0,3.9],[2.2,-2.5,3.8,4.0],[-2.5,2.5,4.0,3.8],[2.4,2.3,3.7,3.9]];
    for(const [x,z,w,d]of entries){const h=(style==='fjord'?3.5:style==='desert'?3.5:4.6)+rng()*1.2;house(K,x,.18,z,w,d,h,style,(count+arrangement)%5);count++;}
    if(style==='mountain'||style==='basalt'){for(const x of[-4.5,4.5])K.box(x,.2,0,.45,2.4,8.5,'wall');}
   }
   if(K.lod<1)return;
   if(b.type==='workshop'||b.program==='market'||b.type==='market'){
    for(const x of[-1.1,1.1]){K.box(x,.2,0,1.0,.65,1,'wood');K.box(x,1.4,0,1.6,.09,1.65,x<0?'roof':'trim');for(const z of[-.7,.7])K.box(x+.6,.2,z,.07,1.2,.07,'wood');}
   }else if(style!=='forest'){K.cylinder(.2,.2,.15,.48,.55,'wall',10);K.cylinder(.2,.75,.15,.34,.04,'water',10);}
   if(K.lod>=2)for(let j=0;j<3;j++)K.cylinder(-4.15+j*.5,.19,4,.21,.5+(j%2)*.1,'wood',8);
   if(style==='arcane')K.ring(0,.21,0,1.25,.05,'metal','xz',16);
  });
  const result=meshAt(K.finish(),b);result.structures=count;return result;
 }
 function fortificationMeshes(c,p){
  const profile=c.townProfile,recipe=LandmarkCatalog.recipe(profile.palace,c.townRecipe.seed+'/defenses',{urbanStyle:profile.id,geography:{freshwater:p.fresh||0}}),K=kit(recipe,1),D=c.defenses;
  if(!D)return {body:new Geometry(),roof:new Geometry()};
  K.part('defenses','Connected curtain walls and gatehouses','architecture',()=>{
   for(const w of D.walls){const a=w.a,b=w.b,L=Math.hypot(b.x-a.x,b.z-a.z),angle=-Math.atan2(b.z-a.z,b.x-a.x),base=Math.min(a.y,b.y)-.3,h=w.height+Math.abs(a.y-b.y);
    K.transform((a.x+b.x)/2,base,(a.z+b.z)/2,-angle,1,()=>{
     if(D.kind==='timber'){
      for(let j=-L/2;j<L/2;j+=.32)K.cone(j,0,0,.13,h,'wood',.04,6);K.box(0,h*.58,0,L,.13,.35,'wood');
     }else{
      K.box(0,0,0,L+.07,h,.82,'wall');K.box(0,h-.16,0,L+.18,.19,1.12,'trim');
      for(const side of[-1,1])K.box(0,h,side*.45,L,.56,.2,'wall');
      for(let j=-L/2+.2;j<L/2;j+=.8)for(const side of[-1,1])K.box(j,h+.56,side*.44,.41,.38,.30,'trim');
      courses(K,0,.25,.421,L,h-.7);courses(K,0,.25,-.421,L,h-.7,Math.PI);
     }
    });
   }
   for(const t of D.towers){if(D.kind==='timber'){K.box(t.x,t.y,t.z,1.5,t.h,1.5,'wood');K.roof(t.x,t.y+t.h,t.z,2,2,1.6,'roof','northern');}else{bastion(K,t.x,t.y-.3,t.z,t.r,t.h,profile.id);}}
   for(const g of D.gates){const a=g.a,b=g.b,L=Math.hypot(a.x-b.x,a.z-b.z),x=(a.x+b.x)/2,z=(a.z+b.z)/2,y=Math.max(a.y,b.y),angle=Math.atan2(b.z-a.z,b.x-a.x);K.transform(x,y,z,angle,1,()=>{
    // The street remains an actual open span underneath the gateway.
    K.arch(0,0,0,Math.max(1.8,L-1),4.2,1.4,'wall');K.box(0,4.2,0,L+.3,.5,1.8,'trim');
    for(const s of[-1,1]){bastion(K,s*(L/2+.2),-.1,0,.8,5.8,profile.id);flag(K,s*(L/2+.2),5.7,0,2.0);}
   });}
  });
  const m=K.finish(),body=new Geometry(),roof=new Geometry();for(const p of m.parts)append(p.role==='roof'?roof:body,p.geometry);return{body,roof};
 }
 return{palettes:PALETTES,precinct,compound,meshAt,fortificationMeshes,house,courses,slateRoof,version:1};
})();
