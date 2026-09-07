/** Authored urban construction families, not a flat-image facade.
 * Meshes: roofs, masonry courses, fenestration, stairs, parapets and domestic yards.
 * Each complete town uses one construction language; people's mixtures are retained.
 */
const ArtisanCityKit=(()=>{
 const PALETTES={
  river:{wall:'#ddd6bf',trim:'#f1e7cc',roof:'#526777',metal:'#be9d62',wood:'#62513e',dark:'#384246',ground:'#aca68d',water:'#83b7bd',leaf:'#536d46',snow:'#eef4f7'},
  basilica:{wall:'#e0d8c4',trim:'#f3e9cf',roof:'#355870',metal:'#d0af5f',wood:'#6d4f3e',dark:'#424453',ground:'#b1ab98',water:'#819fb9',leaf:'#506b48',snow:'#eef4f7'},
  arcane:{wall:'#c9ced1',trim:'#e8e4d4',roof:'#465571',metal:'#c6ac66',wood:'#5b5267',dark:'#343a54',ground:'#979b96',water:'#86c5d9',leaf:'#4a7067',snow:'#eef4f7'},
  mountain:{wall:'#989995',trim:'#c9c6b6',roof:'#3f5b65',metal:'#b5a074',wood:'#65523f',dark:'#353d3e',ground:'#aaa18f',water:'#89abae',leaf:'#476959',snow:'#eef4f7'},
  forest:{wall:'#c4c9a5',trim:'#e2dabc',roof:'#387e75',metal:'#c3a966',wood:'#7a6244',dark:'#364f47',ground:'#83967a',water:'#8fc7b5',leaf:'#386b42',snow:'#eef4f7'},
  desert:{wall:'#c7a576',trim:'#ecce99',roof:'#348c88',metal:'#bf9551',wood:'#846342',dark:'#5d4c3e',ground:'#bdae8d',water:'#68bec2',leaf:'#728950',snow:'#eef4f7'},
  delta:{wall:'#baa775',trim:'#e5d3a0',roof:'#7c7b49',metal:'#adbc98',wood:'#725338',dark:'#374f47',ground:'#8b9575',water:'#7fbdb6',leaf:'#466d50',snow:'#eef4f7'},
  basalt:{wall:'#5e6268',trim:'#a7a497',roof:'#755e4d',metal:'#c49859',wood:'#51473b',dark:'#2b313c',ground:'#8a8981',water:'#8dabad',leaf:'#4c6555',snow:'#eef4f7'},
  fjord:{wall:'#abaeac',trim:'#d8dacd',roof:'#405669',metal:'#bbab7e',wood:'#685340',dark:'#303f4b',ground:'#a0a59b',water:'#7baebb',leaf:'#405f54',snow:'#eef4f7'},
  steppe:{wall:'#d3c49b',trim:'#eee1bd',roof:'#8b7650',metal:'#bda162',wood:'#7a6446',dark:'#4d483b',ground:'#b9b281',water:'#7fb0a6',leaf:'#8b9a5d',snow:'#eef4f7'},
  paddy:{wall:'#dad4bd',trim:'#efe9d1',roof:'#587757',metal:'#b9a46a',wood:'#6c5540',dark:'#3d4b43',ground:'#93a777',water:'#84c0b4',leaf:'#4b8253',snow:'#eef4f7'},
  delve:{wall:'#8b857f',trim:'#b8b0a2',roof:'#68594f',metal:'#c9a05c',wood:'#695948',dark:'#363438',ground:'#8d887e',water:'#7ba0a5',leaf:'#5c735f',snow:'#eef4f7'},
  lagoon:{wall:'#ded5c0',trim:'#f3ebd7',roof:'#3d888e',metal:'#c7ab63',wood:'#7a6450',dark:'#3e555c',ground:'#aeb391',water:'#6cc0c4',leaf:'#5d8868',snow:'#eef4f7'},
  taiga:{wall:'#a08a6c',trim:'#dcd7c6',roof:'#465a63',metal:'#a7a086',wood:'#6a5339',dark:'#31373a',ground:'#8e9a92',water:'#7aa4b0',leaf:'#3d6a63',snow:'#eef4f7'},
  monsoon:{wall:'#e5dec6',trim:'#f4eeda',roof:'#9a7943',metal:'#c0a45f',wood:'#5d4833',dark:'#38453e',ground:'#7d9367',water:'#6fbfb2',leaf:'#2f7146',snow:'#eef4f7'}
 };
 const hex2=v=>Math.round(clamp(v,0,1)*255).toString(16).padStart(2,'0');
 const hexOf=c=>'#'+c.map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('');
 function toHSV(c){const mx=Math.max(...c),mn=Math.min(...c),d=mx-mn;
  const h=d<1e-9?0:mx===c[0]?((c[1]-c[2])/d+6)%6:mx===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;
  return[h*60,mx?d/mx:0,mx];}
 function fromHSV(h,s,v){h=((h%360)+360)%360/60;const i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));
  return[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];}
 // Saturation moves proportionally AND absolutely: a grey-stone town starts at about
 // .09, and a pure multiplier leaves every one of its houses just as grey.
 const shift=(hex,[dh,ds,dv])=>{const[h,s,v]=toHSV(rgb(hex));return hexOf(fromHSV(h+dh,clamp(s*(1+ds)+ds*.10,0,.93),clamp(v*(1+dv),.05,.98)));};
 // Five building materials inside one construction language, as hue/saturation/value
 // moves off whatever that town builds in: the profile's own stock, a limewashed
 // version of it, a warmer fired earth, a colder weathered stone and a deeper tint of
 // the base. Before this a whole town was one hue — measured across five towns, walls
 // varied by 2-6 degrees and 8% in brightness, which is one house repeated, not a
 // quarter. This runs inside weather(), so it lands on the climate-toned palette and
 // a hot dry town's materials are five variations of ITS whitewash, not of the
 // tradition's generic stock.
 const WALL_STOCK=[[0,0,0],[7,-.36,.10],[-16,.44,-.07],[14,-.14,-.14],[-6,.18,.05]];
 const ROOF_STOCK=[[0,0,0],[-14,.32,-.06],[10,-.30,.09],[-5,.12,-.15]];
 /** One town keeps one construction language, but not one paint pot. Each block shifts its
  * masonry, roof and timber a little — a value change plus a warm/cool lean — so a quarter
  * reads as many separate houses instead of one asset stamped over and over. Drawn from its
  * own stream, so the shift never disturbs the mesh the seed already decided. */
 function weather(palette,seed){
  const r=LandmarkCatalog.rng(seed+'/paint'),out={...palette};
  // Pick the house's material first, then weather it. Both draws come off the paint
  // stream, so the mesh the seed already decided is untouched.
  if(out.wall)out.wall=shift(out.wall,WALL_STOCK[Math.floor(r()*WALL_STOCK.length)%WALL_STOCK.length]);
  if(out.roof)out.roof=shift(out.roof,ROOF_STOCK[Math.floor(r()*ROOF_STOCK.length)%ROOF_STOCK.length]);
  for(const [key,amount] of [['wall',.16],['trim',.11],['roof',.22],['wood',.15],['dark',.09],['metal',.10]]){
   if(!out[key])continue;
   const c=rgb(out[key]),v=1+(r()-.5)*amount*2,warm=1+(r()-.5)*amount;
   out[key]='#'+hex2(c[0]*v*warm)+hex2(c[1]*v)+hex2(c[2]*v/warm);
  }
  return out;
 }
 // A tradition supplies the construction language; the climate supplies the tone and
 // the weather response. Without one, every town of a family was painted from the
 // same nine hex values, so a -1 C and a +26 C town of one tradition were identical.
 const NEUTRAL={t:14,a:1,winter:14,cold:0,warm:0,frost:0,dry:0,humid:0,alpine:0,load:0,cover:0,wet:0};
 function climatePalette(p,cl){
  const toward=(hex,to,amount)=>{const a=rgb(hex),b=rgb(to);return hexOf(a.map((v,k)=>v+(b[k]-v)*clamp(amount)))};
  return {...p,
   // Whitewash against heat, weathered dark timber and stone against cold.
   wall:toward(toward(p.wall,'#f2ecda',cl.dry*cl.warm*.45),'#948d7e',cl.cold*.36),
   trim:toward(p.trim,'#cdc4ae',cl.cold*.28),
   // Wet slate and turf in the north, baked earth and tile in the dry south.
   roof:toward(toward(p.roof,'#3b4956',cl.load*.50),'#a96f3f',cl.warm*cl.dry*.30),
   leaf:hexOf(CityEnvironment.leafColor(cl.t,cl.a)),
   // Old settled snow is greyer and bluer than fresh; a light dusting reads warmer
   // because most of what the eye gets is still the roof underneath it.
   snow:toward('#eef4f7','#c3d3da',clamp(.55-cl.cover*.5)),
   ground:toward(toward(p.ground,'#cdc19e',cl.dry*.40),'#8b9591',cl.cold*.32)};
 }
 // The two shifts compose and are applied in that order: the climate decides what the
 // town is built and painted from, then each block weathers away from that. Reversing
 // them would let the per-block jitter be flattened back out by the climate tone.
 function kit(recipe,lod=1,cl=null){
  const k=new LandmarkKit(recipe,{base:false,lod});
  let palette=PALETTES[recipe.urbanStyle||recipe.style]||LandmarkCatalog.palettes[recipe.material];
  k.climate=cl||NEUTRAL;
  if(cl)palette=climatePalette(palette,k.climate);
  k.palette=weather(palette,recipe.seed);
  return k;
 }
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
 /* Snow lying on a surface, not a white repaint of it. `k.roof()` already knows the
  * gable/hip/northern/leaf shapes, so a slightly larger, slightly raised shell in
  * snow colour settles onto whatever roof the climate chose. Depth follows cover, so
  * a -1 C town carries a dusting and a -12 C one is buried. */
 function snowShell(k,x,y,z,w,d,ph,kind,cover){
  if(cover<.06)return;
  const t=clamp(cover);
  k.mark('lying-snow');
  // Inset from the eaves so a margin of the roof itself still shows. A full shell
  // buried the log, thatch and adobe work under one white lid, which trades one
  // kind of sameness for another; the sheet has to read as lying ON something.
  const inset=1-(1-t)*.34;
  k.using('roof',()=>{
   if(kind==='flat'){k.box(x,y+.02,z,w*.80*inset,.05+t*.16,d*.80*inset,'snow');return;}
   k.roof(x,y+.03,z,w*inset,d*inset,ph*inset,'snow',kind);
   if(k.lod<1)return;
   // The ridge cap and the eave rolls: where it actually piles, and what reads as
   // snow at town distance even when the sheet itself is small.
   k.box(x,y+ph*inset-.05,z,w*.26,.06+t*.14,d*.26,'snow');
   for(const s of[-1,1])k.box(x,y+.07,z+s*d*.44,w*.88*inset,.05+t*.12,.16+t*.14,'snow');
  });
 }
 function house(k,x,y,z,w,d,h,style,variant=0,angle=0){
  const cl=k.climate||NEUTRAL;
  const flatStyle=style==='desert';
  // The tradition proposes a roof; the weather disposes. Snow load steepens it and
  // forces a northern pitch whatever the family says; sustained heat with no rain
  // flattens it to a usable terrace. Neither overrides where the family is already
  // the right answer, so a fjord longhall stays a fjord longhall.
  const flat=flatStyle||(cl.warm*cl.dry>.42&&cl.load<.15);
  /* WHAT THE WALL IS MADE OF, not merely what colour it is painted. A tint alone
   * left a subarctic and a tropical house identical in construction, which is the
   * most legible difference of all. Each material is what the climate and the
   * ground actually supply: timber where forest grows and frost splits masonry,
   * earth where it is hot and dry and thermal mass is the whole point, light frame
   * and thatch where it is hot and wet and the wall only has to keep rain out. */
  const material=style==='taiga'||cl.cover>.34||(cl.cold>.52&&style!=='mountain'&&style!=='basalt')?'log'
   :style==='monsoon'||cl.warm*cl.humid>.40?'thatch'
   :cl.warm*cl.dry>.38?'adobe'
   :['fjord','delta','steppe','paddy'].includes(style)||(style==='river'&&variant%3===0)?'timber'
   :'masonry';
  const timber=material==='log'||material==='timber'||material==='thatch';
  let roof=material==='thatch'?'leaf'
   :style==='taiga'?'northern'
   :cl.load>.45?'northern'
   :style==='fjord'?'northern'
   :['forest','paddy'].includes(style)?'leaf'
   :flat?'flat'
   :['steppe','lagoon'].includes(style)?'hip':'gable';
  // Overhang is the rain response: a deep eave in the wet tropics, a tight verge
  // where it is cold and dry and the eave would only catch snow and wind.
  const eave=(material==='thatch'?.95:0)+clamp(cl.warm*cl.humid*1.5)*.85-cl.cold*.10,
   pitch=(style==='taiga'?1.35:1)*(1+cl.load*.62+cl.humid*.18-cl.dry*.22);
  // Stilts are structural in the two families built for standing water.
  const raised=style==='monsoon'||cl.wet>.55;
  k.transform(x,y,z,angle,1,()=>{
   k.mark(material+'-construction');
   // An earth wall stands on a stone plinth that keeps damp out of it; a log wall
   // stands on one that keeps the bottom course off the ground and out of the snow.
   const plinth=material==='adobe'?.34:material==='log'?.30+cl.cover*.22:.27;
   k.box(0,0,0,w+.2,plinth,d+.2,'wall');
   const wall=material==='log'||material==='timber'?'wood'
    :material==='thatch'?colorScale(k.color('wall'),1.04)
    :material==='adobe'?colorScale(k.color('wall'),.95+(variant%4)*.03)
    :colorScale(k.color('wall'),.89+(variant%4)*.047);
   // An earth wall is battered: thicker at the base than at the head.
   if(material==='adobe')k.box(0,plinth,0,w+.16,h*.45,d+.16,colorScale(k.color('wall'),.92));
   k.box(0,plinth,0,w,h,d,wall);k.box(0,plinth+h-.14,0,w+.14,.16,d+.14,'trim');
   const floors=Math.max(1,Math.min(3,Math.floor(h/1.8)));
   // Opening area is a climate cost: small deep-set lights where heating or shade
   // matters, generous glazing in the mild middle of the range.
   const openW=1-cl.cold*.34-cl.warm*cl.dry*.30,openH=1-cl.cold*.26-cl.warm*cl.dry*.20;
   for(let f=0;f<floors;f++)for(const side of[-1,1]){
    const yy=plinth+.33+f*1.6;for(const xx of[-.27,.27])windowN(k,xx*w,yy,side*(d/2+.018),.42*openW,.73*openH,side<0?Math.PI:0,!timber);
    windowN(k,side*(w/2+.018),yy,0,.38*openW,.7*openH,side<0?-Math.PI/2:Math.PI/2,!timber);
   }
   for(const s of[-1,1])for(const t of[-1,1]){
    if(k.lod<1)break;
    k.box(s*(w/2-.10),.22,t*(d/2+.035),.17,h+.05,.13,'trim');
    if(k.lod>=2)for(let j=0;j<Math.floor(h/.62);j++)k.box(s*(w/2-.16),j*.62+.25,t*(d/2+.045),.29,.18,.08,'trim');
   }
   if(k.lod>=1){
    // LOG: round courses stacked up the wall with the corner notching that holds them.
    if(material==='log'){
     for(let yy=.30;yy<h-.10;yy+=.40)for(const s of[-1,1]){
      k.beam([-w/2,plinth+yy,s*(d/2+.035)],[w/2,plinth+yy,s*(d/2+.035)],.15,yy%.80<.40?'wood':colorScale(k.color('wood'),1.14),5);
     }
     for(const s of[-1,1])for(const t of[-1,1])k.cylinder(s*(w/2+.03),plinth,t*(d/2+.03),.17,h,'wood',7);
    }
    // ADOBE: mud-brick banding and a rounded parapet; the wall is one mass, not courses.
    else if(material==='adobe'){
     for(let yy=.42;yy<h-.15;yy+=.58)for(const s of[-1,1])k.box(0,plinth+yy,s*(d/2+.02),w*.99,.05,.04,colorScale(k.color('wall'),.86));
     for(const s of[-1,1])k.box(s*(w/2+.02),plinth+h-.30,0,.05,.22,d*.99,colorScale(k.color('trim'),.96));
    }
    // THATCH / light frame: exposed posts and infill panels, no masonry at all.
    else if(material==='thatch'){
     for(const s of[-1,1])for(const t of[-1,1])k.box(s*(w/2-.06),plinth,t*(d/2-.06),.13,h,.13,'wood');
     for(const s of[-1,1])k.box(0,plinth+h*.52,s*(d/2+.03),w*.98,.09,.05,'wood');
    }
    else if(material==='timber')for(const sign of[-1,1]){
     k.box(0,h*.55,sign*(d/2+.08),w,.08,.08,'trim');
     k.beam([-w*.4,.35,sign*(d/2+.1)],[0,h*.55,sign*(d/2+.1)],.04,'trim',4);
     k.beam([0,h*.55,sign*(d/2+.1)],[w*.4,.35,sign*(d/2+.1)],.04,'trim',4);
    }
   }
   const ph=flat?.3:Math.min(w,d)*(style==='fjord'?.81:.56)*pitch;
   const roofTop=plinth+h+.03;
   slateRoof(k,0,roofTop,0,w+.14+eave,d+.15+eave,ph,roof,style==='arcane');
   // Snow settles on the roof it actually has. Driven by the model's cold-season
   // field, so it appears on every town whose winter freezes, not only on glaciers.
   snowShell(k,0,roofTop,0,w+.14+eave,d+.15+eave,ph,roof,cl.cover);
   k.box(0,plinth,d/2+.08,.6,1.0,.10,'dark');
   if(k.lod>=1){k.box(0,plinth+.03,d/2+.14,.44,.88,.05,'wood');k.box(0,plinth-.01,d/2+.39,1,.13,.54,'trim');}
   // A flue is heating, so it belongs where the model says heating is needed.
   const heated=cl.cold>.28||(!flat&&cl.warm<.55);
   if(!flat&&heated&&variant%3!==1&&k.lod>=1){
    const ch=.42+cl.cold*.30,top=plinth+h*.9+ph+.9+cl.cold*.9;
    k.box(w*.27,plinth+h*.63,-d*.20,ch,ph+1+cl.cold*.9,.5,'wall');
    k.box(w*.27,top,-d*.2,ch+.14,.15,.62,'trim');k.box(w*.27,top+.16,-d*.2,.32,.02,.34,'dark');
    // A cap of snow on the chimney head, where it always sits.
    if(cl.cover>.25)k.box(w*.27,top+.19,-d*.2,ch+.18,.05+cl.cover*.10,.66,'snow');
   }
   // Projecting dormers, not a painted roof texture.
   if(!flat&&w>2.2&&k.lod>=2){k.transform(-w*.35,plinth+h+.21,.35,0,1,()=>{k.box(0,0,0,.65,.63,.72,'wall');slateRoof(k,0,.63,0,.76,.81,.48,'gable');snowShell(k,0,.63,0,.76,.81,.48,'gable',cl.cover);windowN(k,0,.08,.40,.27,.43,0);});}
   if(k.lod<1)return;
   // Snow on the sills and ledges that catch it. The ground it stands on is tinted
   // by the town terrain instead, so the cover reads as landscape and not as a
   // rectangle of white under every house.
   if(cl.cover>.20)for(const s of[-1,1])k.box(0,plinth+.30,s*(d/2+.06),w*.86,.045+cl.cover*.06,.12,'snow');
   // A posted veranda under the deep eave: the hot-and-wet answer to the same wall.
   if(eave>.34){k.box(0,.24,d*.5+eave*.55,w+.3,.10,eave*1.05,'wood');for(const t of[-1,1])k.box(t*w*.36,.34,d*.5+eave*.85,.11,h*.60,.11,'wood');}
   // A raised floor keeps the ground damp out; wetness is a parent-world field.
   if(raised&&!flat)for(const t of[-1,1])for(const u of[-1,1])k.box(t*w*.40,-.30,u*d*.40,.16,.34,.16,'wood');
   // Screen walls, not glazing: louvred panels under the eave, and a work platform.
   if(style==='monsoon'){
    for(const s of[-1,1])for(let j=0;j<5;j++)k.box(s*(w/2+.03),.55+j*.30,0,.05,.19,d*.82,'trim');
    k.box(0,.16,d*.5+.85,w+.5,.11,1.0,'wood');
   }
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
  const square=['mountain','basalt','desert','delve','taiga'].includes(style),crown=style==='arcane'?'crystal':['desert','mountain','delve'].includes(style)?'battlement':['basilica','lagoon'].includes(style)?'dome':'spire';
  if(square){k.box(x,y,z,r*1.85,h,r*1.85,'wall');for(let j=1;j<h;j+=1.2)k.box(x,y+j,z,r*1.94,.13,r*1.94,'trim');k.parapet(x,y+h,z,r*1.9,r*1.9);windowN(k,x,y+h-1.35,z+r*.94,r*.4,1.0);}
  else k.tower(x,y,z,r,h,crown);
 }
 function greatHall(k,x,y,z,w,d,h,style,opts={}){
  k.hall(x,y,z,w,d,h,{roof:style==='desert'?'flat':['forest','monsoon'].includes(style)?'leaf':['fjord','taiga'].includes(style)?'northern':'gable',roofHeight:opts.roofHeight||Math.min(w,d)*.58,entrance:opts.entrance!==false});
  for(const side of[-1,1]){
   courses(k,x,y+.3,z+side*(d/2+.015),w,h-.65,side===1?0:Math.PI);
   courses(k,x+side*(w/2+.015),y+.3,z,d,h-.65,side===1?Math.PI/2:-Math.PI/2);
  }
  if(style!=='desert')slateRoof(k,x,y+h,z,w+.38,d+.38,opts.roofHeight||Math.min(w,d)*.58,['fjord','taiga'].includes(style)?'northern':style==='monsoon'?'leaf':'gable',true);
 }
 function precinct(recipe,options={}){
  const K=kit(recipe,options.lod??1,options.climate||null),id=recipe.urbanStyle||recipe.style,style=PALETTES[id]?id:'river';
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
  }else if(style==='taiga'){
   K.part('winterhold','The log moot-hall, stave tower and wood stores','architecture',()=>{
    K.terrace(0,.9,-3.2,17,12,1.1);
    greatHall(K,0,2.0,-5.4,9.0,7.4,5.6,style,{roofHeight:5.4});
    // The doubled pitch is the snow detail: a second roof laid over the first.
    K.using('roof',()=>{K.roof(0,7.6,-5.4,9.4,7.8,5.2,'trim','northern');K.roof(0,12.6,-5.4,5.0,4.6,2.1,'roof','northern')});
    for(const s of[-1,1]){
     K.tower(s*7.6,.9,2.6,1.35,9.4,'spire');
     // Fuel and grain lifted clear of the drift line, each under its own roof.
     K.box(s*8.6,2.4,-9.0,4.2,1.4,2.4,'wood');K.roof(s*8.6,3.8,-9.0,5.0,3.2,1.8,'roof','northern');
     for(const t of[-1,1])K.cylinder(s*8.6+t*1.7,.9,-9.0,.28,1.5,'wood',7);
     K.box(s*5.2,2.0,-1.0,1.3,6.2,1.4,'wall');
    }
    K.arch(0,.9,9.4,2.8,3.6,.9,'wall');
    // Split-log palisade rather than a masonry curtain: this is what grows here.
    for(const [x,z,len,along]of[[0,-11.6,20,1],[-10.4,0,20,0],[10.4,0,20,0]])
     for(let t=-len/2;t<len/2;t+=.66)K.cone(x+(along?t:0),.9,z+(along?0:t),.26,2.9,'wood',.18,6);
    K.emblem(0,6.4,-9.6,.65);flag(K,0,11.0,-5.4,2.6);
   });
  }else if(style==='monsoon'){
   K.part('rainpavilion','The raised assembly pavilion and plank walks','architecture',()=>{
    // The precinct floor is a deck on posts. There is no plinth, because the ground
    // under it is wet for part of every year.
    for(let x=-9;x<=9;x+=3)for(let z=-8;z<=8;z+=3)K.cylinder(x,.9,z,.30,2.5,'wood',7);
    K.box(0,3.4,0,21,.34,19,'wood');
    greatHall(K,0,3.74,-4.6,9.4,7.0,5.0,style,{roofHeight:5.6});
    // The eave is the building: carried well clear of the wall on posts.
    K.using('roof',()=>K.roof(0,7.2,-4.6,16.4,13.6,2.9,'roof','leaf'));
    for(const s of[-1,1])for(const z of[-8,-4.6,-1.2])K.cylinder(s*7.6,3.74,z,.28,3.0,'wood',7);
    for(const s of[-1,1]){
     greatHall(K,s*7.8,3.74,4.4,3.6,7.6,3.2,style,{entrance:false,roofHeight:3.4});
     K.using('roof',()=>K.roof(s*7.8,6.94,4.4,7.0,11.0,1.9,'roof','leaf'));
     // Louvred screens instead of windows: shade and through-draught.
     for(let j=0;j<6;j++)K.box(s*5.9,4.2+j*.34,-4.6,.06,.22,6.4,'trim');
    }
    K.rail(-10.2,9.2,10.2,9.2,3.74,'wood');K.box(0,3.3,9.6,5.6,.16,3.4,'wood');
    K.emblem(0,10.4,-4.6,.7);flag(K,0,9.4,-4.6,2.4);
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
 // The climate at THIS block's own cell, and the paint that follows from it. Both the
 // detailed mesh and the regional silhouette come through these, so a town cannot
 // change colour as you close in on it — the two would otherwise have to reproduce
 // the same climate-then-weather composition separately and stay in step by luck.
 const blockClimate=(c,b)=>{const seat=c.index(b.x,b.z);return{...CityEnvironment.localClimate(c.environment,seat),wet:c.wet?.[seat]||0}};
 const blockPaint=(c,b)=>weather(climatePalette(PALETTES[c.townProfile.id]||PALETTES.river,blockClimate(c,b)),c.townRecipe.seed+'/'+b.id);
 function compound(b,c,p,realm){
  const style=c.townProfile.id,faith=['sun','stars','grove','hearth','tide','secular'][cDominant(p.faith)]||'secular',recipe=LandmarkCatalog.recipe(c.townProfile.palace,c.townRecipe.seed+'/'+b.id,{urbanStyle:style,faith,geography:{freshwater:p.fresh||0,cold:c.siteEnvironment.temperature<4}});
  // Read the climate at THIS block's own cell, not the town centre's. A town with
  // relief spans several degrees between its lower and upper districts, and 67 of
  // the 96 towns in a default world span more than four.
  const cl=blockClimate(c,b);
  const K=kit(recipe,b.lod??2,cl),rng=K.random;
  if(b.type==='civic')return meshAt(precinct({...recipe,artisan:true},{climate:cl}),b);
  // The surveyed parcel is what gets built on. meshAt scales this model uniformly to fit
  // b.w x b.d, so a court authored square inside a long burgage plot would leave most of
  // that plot as bare ground AND make every block read the same. Match the parcel's aspect
  // at constant area, then lay out as many houses along each side as the shape wants.
  // meshAt seats this model with b.angle, a quarter turn snapped to the street it faces,
  // so a quarter-turned block presents its X extent along the parcel's depth. Author the
  // court in that rotated frame or exactly half the plots get their aspect inverted and
  // shrink to a sliver inside their own parcel.
  const turned=Math.abs(Math.sin(b.angle||0))>.5,pw=turned?b.d:b.w,pd=turned?b.w:b.d;
  const ar=Math.max(.2,Math.min(5,pw/Math.max(.001,pd))),CW=9.8*Math.sqrt(ar),CD=9.8/Math.sqrt(ar),sx=CW/9.8,sz=CD/9.8;
  let count=0;K.part('courtyard','The inhabited urban block','architecture',()=>{
   K.box(0,0,0,CW,.18,CD,colorScale(K.color('ground'),1.04));
   if(b.infill){house(K,0,.18,0,CW*.77,CD*.80,style==='desert'?5.8:7.6+rng()*2,style,Math.floor(rng()*5));count=1;return;}
   if(b.type==='well'){K.fountain(0,.18,0,Math.min(CW,CD)*.20);K.arcade(0,.18,-CD*.29,3,1.8,2.8);return}
   if(b.type==='granary'){house(K,0,.18,0,CW*.56,CD*.79,5,style,1);for(const x of[-1,1])K.cylinder(x*CW*.36,.18,CD*.26,.5,1.1,'wood',9);count=1;return;}
   // Row count follows the parcel: a narrow burgage strip becomes a row down its length,
   // a broad plot a row across its face, instead of one stamped 2x2 court everywhere.
   // Row counts follow the PARCEL, not the normalised court. Sizing them off the court gave
   // every plot the same four-house yard merely scaled down, which is why halving the plots
   // did not halve the buildings on screen.
   const cols=Math.max(1,Math.round(pw/2.7)),ranks=Math.max(1,Math.round(pd/2.7)),arrangement=b.moduleVariant??0;
   for(let r0=0;r0<ranks;r0++)for(let c0=0;c0<cols;c0++){
    const cw=CW/cols,cd=CD/ranks,x=(c0-(cols-1)/2)*cw,z=(r0-(ranks-1)/2)*cd;
    if(style==='forest'){
     const rad=Math.min(cw,cd)*.29,h=2.3+rng()*1.0;
     K.cylinder(x,.18,z,rad*1.20,1.0,'wood',10);K.cylinder(x,1.18,z,rad,h,'wall',10);
     K.using('roof',()=>K.cone(x,1.18+h,z,rad*1.44,h*1.25,'roof',0,12));
     K.beam([x,1.3,z],[0,1.3,0],.25,'wood');windowN(K,x,1.7,z+rad,.43,.9);
    }else house(K,x,.18,z,cw*(.74+rng()*.15),cd*(.74+rng()*.15),(style==='fjord'?3.5:style==='desert'?3.5:style==='taiga'?3.2:style==='monsoon'?3.8:4.6)+rng()*1.2,style,(count+arrangement)%5);
    count++;
   }
   if(style==='forest')K.tree(-CW*.36,.2,CD*.29,7,'broad');
   else if(style==='taiga'){K.tree(-CW*.38,.2,CD*.31,6,'conifer');K.tree(CW*.36,.2,-CD*.33,5,'conifer');
    // A covered wood store is a working part of the block in this climate.
    K.box(CW*.34,.2,CD*.30,1.7,.9,1.1,'wood');K.roof(CW*.34,1.1,CD*.30,2.1,1.5,.8,'roof','northern');}
   else if(style==='monsoon'){K.tree(-CW*.37,.2,CD*.30,7,'palm');K.tree(CW*.35,.2,-CD*.32,6.5,'rainforest');
    // The plank walk between raised houses is the street here.
    K.box(0,.34,CD*.30,CW*.86,.10,.9,'wood');}
   else if(style==='mountain'||style==='basalt')for(const x of[-1,1])K.box(x*CW*.46,.2,0,.45,2.4,CD*.87,'wall');
   if(K.lod<1)return;
   if(b.type==='workshop'||b.program==='market'||b.type==='market'){
    for(const x of[-1.1,1.1]){K.box(x*sx,.2,0,1.0,.65,1,'wood');K.box(x*sx,1.4,0,1.6,.09,1.65,x<0?'roof':'trim');for(const z of[-.7,.7])K.box(x*sx+.6,.2,z*sz,.07,1.2,.07,'wood');}
   }else if(style!=='forest'){K.cylinder(.2*sx,.2,.15*sz,.48,.55,'wall',10);K.cylinder(.2*sx,.75,.15*sz,.34,.04,'water',10);}
   if(K.lod>=2)for(let j=0;j<3;j++)K.cylinder(-CW*.42+j*.5,.19,CD*.41,.21,.5+(j%2)*.1,'wood',8);
   if(style==='arcane')K.ring(0,.21,0,Math.min(CW,CD)*.13,.05,'metal','xz',16);
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
   // Quay sections: lower and heavier than the curtain, with a coping instead of
   // crenellations. A harbour wall is a retaining wall that also defends.
   for(const q of D.quays||[]){const a=q.a,b=q.b,L=Math.hypot(b.x-a.x,b.z-a.z),angle=-Math.atan2(b.z-a.z,b.x-a.x),base=Math.min(a.y,b.y)-.55,h=q.height+Math.abs(a.y-b.y)+.25;
    K.transform((a.x+b.x)/2,base,(a.z+b.z)/2,-angle,1,()=>{
     if(D.kind==='timber'){
      for(let j=-L/2;j<L/2;j+=.42)K.cone(j,0,0,.16,h,'wood',.05,6);K.box(0,h*.62,0,L,.15,.5,'wood');
     }else{
      K.box(0,0,0,L+.07,h,q.width,'wall');K.box(0,h-.13,0,L+.16,.17,q.width+.26,'trim');
      courses(K,0,.25,q.width/2+.01,L,h-.5);courses(K,0,.25,-(q.width/2+.01),L,h-.5,Math.PI);
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
 return{palettes:PALETTES,paint:weather,blockPaint,blockClimate,precinct,compound,meshAt,fortificationMeshes,house,courses,slateRoof,snowShell,climatePalette,neutralClimate:NEUTRAL,version:1};
})();
