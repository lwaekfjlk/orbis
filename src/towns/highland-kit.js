/** Small, inhabited summit settlements. Each parcel owns ONE rigid building;
 * the city layout supplies its surveyed height and separate retaining foundation. */
const HighlandCityKit=(()=>{
 const PALETTES={
  dragon:{wall:'#63656b',trim:'#bbb49f',roof:'#614a49',metal:'#ca975e',wood:'#55443a',dark:'#242d35',water:'#70a5a5',leaf:'#566951',ground:'#85827a',snow:'#e6eef0',glass:'#dba96b'},
  holy:{wall:'#d9d5c6',trim:'#f0e5ca',roof:'#365568',metal:'#c9aa65',wood:'#716052',dark:'#35414a',water:'#81b9c3',leaf:'#65725c',ground:'#a19f92',snow:'#edf2f0',glass:'#a8d4dc'}
 };
 const ROLES={dragon:['keep','gate','watch','roost','forge','lodge','store'],holy:['sanctuary','gate','bell','chapel','hospice','scriptorium','store']};
 function climate(c,b){return c.environment&&c.index?ArtisanCityKit.blockClimate(c,b):{...ArtisanCityKit.neutralClimate,cold:.7,load:.4,cover:0};}
 function paint(c,b){const kind=c.highCitadel?.kind==='holy'?'holy':'dragon';return ArtisanCityKit.paint(ArtisanCityKit.climatePalette(PALETTES[kind],climate(c,b)),(c.townRecipe?.seed||'summit')+'/'+b.id+'/highland');}
 function footing(k,w,d){k.mark('individual-stone-seat');k.box(0,0,0,w,.14,d,'wall');k.box(0,.14,0,w*.97,.13,d*.97,'trim');}
 function crest(k,x,y,z,size=.75){
  k.mark('segmented-dragon-crown');
  for(const side of[-1,1])for(let j=0;j<5;j++){
   const p=t=>[x+side*size*(.13+t*.96),y+size*(.10+t*.37+t*t*.72),z+size*Math.sin(t*Math.PI)*.12];
   k.beam(p(j/5),p((j+1)/5),size*(.115-.073*j/5),'metal',5,true);
  }
  k.cone(x,y,z,size*.16,size*.40,'metal',0,6);
 }
 function badge(k,x,y,z,size=.5){
  k.mark('summit-sun-finial');
  k.ring(x,y,z,size*.55,size*.07,'metal','xy',k.lod>0?16:10);
  for(const [dx,dy]of[[0,1],[1,0],[0,-1],[-1,0]])k.beam([x+dx*size*.64,y+dy*size*.64,z],[x+dx*size*.94,y+dy*size*.94,z],size*.06,'metal',4,true);
 }
 function door(k,x,y,z,w=1,h=1.9,kind='dragon'){
  k.mark('sheltered-summit-door');
  k.box(x,y,z+.035,w,h*.86,.08,'dark');
  if(k.lod>0){
   k.box(x,y+.05,z+.092,w*.80,h*.77,.08,'wood');
   for(const side of[-1,1])k.box(x+side*(w*.5+.07),y,z+.16,.14,h*.89,.31,'trim');
   for(const yy of[.27,.65])k.box(x,y+h*yy,z+.145,w*.78,.065,.045,'metal');
   if(kind==='holy')SacredCityKit.pointed(k,x,y,z+.21,w,h,.32,0,'trim',8);
   else{k.box(x,y+h*.87,z+.17,w+.38,.20,.38,'trim');k.box(x,y+h*.87+.2,z+.10,w+.18,.13,.25,'wall');}
  }
  k.box(x,y-.03,z+.24,w+.45,.10,.69,'trim');
 }
 function window(k,x,y,z,w=.55,h=1.1,angle=0,holy=false){
  if(k.lod===0)return;
  if(holy)SacredCityKit.lancet(k,x,y,z,w,h,angle);else k.window(x,y,z,w,h,angle,'lattice');
 }
 function band(k,x,y,z,w,d){
  k.box(x,y,z,w+.15,.12,d+.15,'trim');
  if(k.lod>0)for(const side of[-1,1])for(let j=0;j<Math.max(2,Math.floor(w/.7));j++){
   const xx=x+(j-(Math.max(2,Math.floor(w/.7))-1)/2)*.70;
   k.box(xx,y-.17,z+side*d*.49,.16,.17,.25,'wall');
  }
 }
 function roof(k,x,y,z,w,d,h,kind,cover=0){
  k.using('roof',()=>{
   const form=kind==='dragon'?'upturned':'northern';
   k.roof(x,y,z,w,d,h,'roof',form);
   // Roof snow inherits the actual summit climate; the wall and metal remain visible.
   if(cover>.06)ArtisanCityKit.snowShell(k,x,y,z,w,d,h,form,cover*.76);
   if(kind==='dragon')for(const sign of[-1,1])crest(k,x,y+h-.04,z+sign*d*.31,Math.min(w*.17,.68));
   else{
    k.beam([x,y+h+.025,z-d*.38],[x,y+h+.025,z+d*.38],.075,'trim',5,true);
    badge(k,x,y+h+.38,z+d*.34,.34);
   }
  });
 }
 function lodge(k,kind,role,cover){
  const scholarly=role==='scriptorium',storage=role==='store',w=scholarly?4.9:3.7,d=storage?4.8:5.0,h=scholarly?3.5:storage?3.1:3.0;
  k.part('inhabited-house',kind==='holy'?'The sheltered pilgrim house':'The summit household','architecture',()=>{
   footing(k,w+.36,d+.45);k.box(0,.27,0,w,h,d,'wall');band(k,0,h+.18,0,w,d);
   for(const side of[-1,1]){
    for(const z of[-d*.36,d*.36])k.box(side*(w*.5-.12),.28,z,.29,h,.31,'trim');
    window(k,side*w*.5,1.1,-d*.19,.65,1.20,-side*Math.PI/2,kind==='holy'&&scholarly);
    window(k,side*w*.5,1.1,d*.19,.65,1.20,-side*Math.PI/2,kind==='holy'&&scholarly);
   }
   door(k,0,.29,d*.5,.96,1.94,kind);
   for(const side of[-1,1])window(k,side*w*.30,1.04,d*.5,.53,1.02,0,kind==='holy');
   if(scholarly){
    k.mark('scriptorium-bay');k.box(0,1.04,d*.5+.31,1.8,.18,.8,'trim');
    for(const x of[-.66,0,.66])window(k,x,1.22,d*.5+.67,.44,1.20,0,true);
   }
   if(k.lod>0){
    k.box(-w*.29,.29,-d*.51,.95,.77,.30,'wood');
    for(let j=0;j<3;j++)k.cylinder(-w*.32+j*.24,.29,-d*.57,.085,.78,'wood',6);
    if(storage)for(const side of[-1,1])k.box(side*.60,.29,d*.39,.64,.83,.62,'wood');
   }
   if(!storage){k.box(w*.26,h-.2,-d*.28,.46,1.47,.51,'wall');k.box(w*.26,h+1.17,-d*.28,.66,.15,.71,'trim');}
   roof(k,0,h+.3,0,w+.23,d+.18,kind==='holy'?2.2:1.8,kind,cover);
  });
 }
 function watch(k,kind,role,cover){
  const holy=kind==='holy',r=1.15,h=holy?5.2:4.7;
  k.part('summit-watch',holy?'The open bell chamber':'The narrow ridge watch','architecture',()=>{
   footing(k,2.72,2.72);k.box(0,.27,0,2.22,h,2.22,'wall');
   for(const x of[-1,1])for(const z of[-1,1])k.box(x*.98,.27,z*.98,.28,h,.28,'trim');
   for(const y of[1.25,3.05])for(let a=0;a<4;a++)k.transform(0,y,0,a*Math.PI/2,1,()=>window(k,0,0,1.12,.53,1.1,0,holy));
   band(k,0,h+.17,0,2.32,2.32);
   const stage=h+.29,bellHeight=2.35;
   k.mark(holy?'open-pilgrimage-belfry':'open-dragon-watch');
   for(const x of[-1,1])for(const z of[-1,1])k.column(x*.94,stage,z*.94,.18,bellHeight,'trim',8);
   for(let a=0;a<4;a++)k.transform(0,stage,0,a*Math.PI/2,1,()=>{
    if(holy)SacredCityKit.pointed(k,0,0,.94,1.46,bellHeight-.08,.30,0,'trim',k.lod>0?8:5);
    else{k.box(0,bellHeight-.23,.94,2.08,.25,.40,'trim');k.box(0,.1,.94,1.56,.40,.18,'wall');}
   });
   if(holy){
    k.mark('suspended-bell');k.beam([-.88,stage+bellHeight-.36,0],[.88,stage+bellHeight-.36,0],.13,'wood',6,true);
    k.beam([0,stage+bellHeight-.36,0],[0,stage+.93,0],.05,'metal',5,true);
    k.lathe(0,stage+.48,0,[[0,0],[.56,0],[.55,.13],[.33,.47],[.20,.86],[0,.93]],'metal',k.lod>0?12:8);
   }
   k.box(0,stage+bellHeight,0,2.65,.20,2.65,'trim');
   roof(k,0,stage+bellHeight+.2,0,2.65,2.65,holy?2.10:1.50,kind,cover);
  });
 }
 function gate(k,kind,cover){
  k.part('mountain-gate','The sheltered mountain gate','architecture',()=>{
   footing(k,5.25,3.8);
   for(const side of[-1,1]){
    k.box(side*1.75,.27,0,1.5,3.2,3.2,'wall');
    k.box(side*2.34,.27,1.3,.30,3.3,.45,'trim');
    window(k,side*1.75,1.35,1.62,.55,1.2,0,kind==='holy');
   }
   k.mark('through-passage');
   if(kind==='holy')SacredCityKit.pointed(k,0,.27,1.34,1.78,2.85,.57,0,'trim',k.lod>0?10:6);
   else k.arch(0,.27,1.34,1.80,2.60,.62,'trim');
   k.box(0,3.38,0,5.16,.30,3.54,'trim');
   k.box(0,3.68,-.2,3.10,1.62,2.80,'wall');
   if(kind==='holy')badge(k,0,4.48,1.23,.55);else if(k.lod>0){
    for(const side of[-1,1])k.beam([side*.21,4.5,1.23],[side*.90,4.22,1.25],.10,'metal',5,true);
   }
   roof(k,0,5.30,-.2,3.28,3.0,1.85,kind,cover);
  });
 }
 function roost(k,cover){
  k.part('dragon-roost','The buttressed dragon landing','architecture',()=>{
   k.mark('supported-roost');footing(k,4.7,5.4);
   k.box(0,.27,-1.35,2.20,3.3,2.3,'wall');
   for(const side of[-1,1]){
    k.box(side*1.0,.27,-1.3,.40,3.5,2.5,'trim');
    k.beam([side*.7,.40,-1.1],[side*1.7,3.45,1.4],.25,'wall',6,true);
    k.beam([side*.7,1.0,-1.6],[side*1.9,3.45,.35],.21,'trim',5,true);
   }
   k.lathe(0,3.45,.60,[[0,0],[2.25,0],[2.25,.27],[2.08,.40],[0,.40]],'trim',12);
   k.ring(0,3.87,.60,1.62,.085,'metal','xz',20);
   // The landing edge stays open; only the back is protected from the wind.
   for(const side of[-1,1]){k.box(side*1.52,3.84,-.59,.18,.85,1.90,'wall');crest(k,side*1.50,4.67,-1.32,.45);}
   door(k,0,.29,-.18,.78,1.8,'dragon');
   if(k.lod>0)for(const side of[-1,1])k.ring(side*1.46,4.11,1.56,.19,.04,'metal','xy',12);
   roof(k,0,3.64,-1.36,2.45,2.42,1.6,'dragon',cover*.6);
  });
 }
 function forge(k,cover){
  k.part('high-forge','The sheltered crown forge','architecture',()=>{
   footing(k,5.4,4.6);k.box(-1.55,.27,-.35,2.10,3.0,3.3,'wall');
   door(k,-1.55,.29,1.30,.85,1.88,'dragon');window(k,-2.61,1.2,-.45,.56,1.1,Math.PI/2);
   for(const z of[-1.35,1.18])k.column(2.0,.27,z,.14,2.55,'wood',7);
   k.box(.99,.27,-.15,1.30,.75,1.20,'wall');k.box(.99,1.02,-.15,1.07,.18,.98,'dark');
   k.box(.99,1.2,-.40,.78,.30,.55,'metal');
   k.box(.90,1.05,-1.28,1.00,3.75,.88,'wall');k.box(.90,4.80,-1.28,1.20,.18,1.1,'trim');
   k.using('roof',()=>k.roof(.95,2.88,-.1,2.55,3.15,1.0,'roof','gable'));
   if(k.lod>0){k.box(.95,.28,1.25,.85,.88,.68,'wood');for(let j=0;j<3;j++)k.cylinder(.10+j*.25,.27,-1.8,.11,.8,'wood',6);}
   roof(k,-1.55,3.27,-.35,2.35,3.52,1.60,'dragon',cover);
  });
 }
 function keep(k,cover){
  k.part('crown-keep','The Dragon King’s crown hall','architecture',()=>{
   k.mark('dragon-king-hall');footing(k,7.8,7.3);
   k.box(0,.27,-.45,6.20,4.1,5.8,'wall');
   for(const side of[-1,1]){
    k.box(side*2.98,.27,-.42,.54,4.2,5.65,'trim');
    for(const z of[-2.35,1.60]){k.box(side*3.10,.28,z,1.12,5.5,1.27,'wall');band(k,side*3.10,5.54,z,1.18,1.32);roof(k,side*3.10,5.67,z,1.32,1.48,1.18,'dragon',cover);}
    for(const z of[-1.25,.45])window(k,side*3.12,1.42,z,.78,1.45,-side*Math.PI/2);
   }
   band(k,0,4.27,-.45,6.25,5.9);
   // A narrower upper hall leaves a real terrace over the lower load-bearing hall.
   k.box(0,4.43,-.95,4.12,2.72,4.18,'wall');
   for(const side of[-1,1])k.box(side*2.48,4.45,1.7,1.2,.64,.25,'trim');
   for(const x of[-1.2,0,1.2])window(k,x,5.10,1.16,.72,1.23,0);
   for(const side of[-1,1])window(k,side*2.08,5.15,-1.12,.77,1.25,-side*Math.PI/2);
   band(k,0,7.04,-.95,4.20,4.25);
   k.mark('deep-crown-porch');
   for(const side of[-1,1])k.column(side*1.14,.28,2.50,.27,2.6,'trim',8);
   k.box(0,2.88,2.49,2.85,.28,1.42,'trim');
   door(k,0,.30,2.47,1.52,2.62,'dragon');
   if(k.lod>0)for(let j=-3;j<=3;j++){
    const x=j*.52;k.tri([x-.22,4.14,2.52],[x,3.75,2.56],[x+.22,4.14,2.52],'metal');
   }
   roof(k,0,3.16,2.5,3.15,1.58,1.24,'dragon',cover);
   roof(k,0,7.20,-.95,4.58,4.57,2.68,'dragon',cover);
  });
 }
 function chapel(k,cover,grand=false){
  const w=grand?3.80:3.1,d=grand?7.1:5.05,h=grand?5.10:3.65;
  k.part(grand?'summit-sanctuary':'ridge-chapel',grand?'The high pilgrimage sanctuary':'The ridge chapel','architecture',()=>{
   k.mark(grand?'high-pilgrimage-sanctuary':'apsidal-ridge-chapel');footing(k,w+1.6,d+1.7);
   k.box(0,.27,-.20,w,h,d,'wall');
   const apseZ=-d*.5,apseR=w*.43;
   k.lathe(0,.27,apseZ,[[0,0],[apseR,0],[apseR,h*.81],[apseR+.13,h*.84],[0,h*.84]],'wall',12);
   for(const side of[-1,1]){
    for(const z of[-d*.34,0,d*.30]){
     k.box(side*(w*.5+.13),.27,z,.38,h*.88,.54,'trim');
     k.box(side*(w*.5+.13),h*.88+.20,z,.56,.14,.72,'trim');
    }
    for(const z of[-d*.18,d*.16])window(k,side*w*.5,1.22,z,.74,grand?2.62:1.88,-side*Math.PI/2,true);
   }
   const front=d*.5-.20;
   door(k,0,.29,front,grand?1.40:1.05,grand?2.75:2.10,'holy');
   if(grand&&k.lod>0)SacredCityKit.rose(k,0,4.30,front+.39,.88);
   else if(k.lod>0)badge(k,0,3.08,front+.29,.44);
   band(k,0,h+.14,-.20,w+.13,d+.14);
   roof(k,0,h+.29,-.2,w+.30,d+.15,grand?2.86:2.0,'holy',cover);
   k.using('roof',()=>k.cone(0,.27+h*.84,apseZ,apseR+.24,grand?2.4:1.8,'roof',0,12));
   // The porch is narrower than the nave and carries its own little snow roof.
   for(const side of[-1,1])k.column(side*(grand?1.08:.86),.28,front+.52,.15,grand?2.75:2.18,'trim',8);
   roof(k,0,grand?3.08:2.48,front+.52,grand?2.55:2.05,1.50,.94,'holy',cover);
   if(grand){
    // A compact, asymmetrical bell turret is part of the sanctuary itself; the
    // surrounding settlement still receives separate chapel and bell parcels.
    const tx=-2.43,tz=1.52;k.box(tx,.27,tz,1.38,6.38,1.65,'wall');
    for(const side of[-1,1])k.box(tx+side*.60,.27,tz+.69,.18,6.38,.21,'trim');
    window(k,tx,2.90,tz+.84,.60,1.47,0,true);
    const stage=6.66;
    for(const x of[-1,1])for(const z of[-1,1])k.column(tx+x*.56,stage,tz+z*.60,.10,1.38,'trim',6);
    for(let a=0;a<4;a++)k.transform(tx,stage,tz,a*Math.PI/2,1,()=>SacredCityKit.pointed(k,0,0,.58,.88,1.31,.22,0,'trim',6));
    k.box(tx,8.05,tz,1.58,.18,1.7,'trim');roof(k,tx,8.23,tz,1.67,1.79,1.6,'holy',cover);
   }
  });
 }
 function build(kind,role,seed,options={}){
  kind=kind==='holy'?'holy':'dragon';role=ROLES[kind].includes(role)?role:kind==='holy'?'hospice':'lodge';
  const cl=options.climate||ArtisanCityKit.neutralClimate,lod=options.lod??1;
  const recipe=LandmarkCatalog.recipe(kind==='holy'?'basilica':'mountain',seed,{material:kind==='holy'?'ivory':'granite',faith:kind==='holy'?'sun':'hearth',complexity:lod,roofLanguage:'native',geography:{freshwater:0,cold:cl.cold>.4},highCitadel:{kind,role}});
  const k=new LandmarkKit(recipe,{lod});k.palette=options.palette||ArtisanCityKit.climatePalette(PALETTES[kind],cl);k.climate=cl;
  const cover=cl.cover||0;
  if(role==='keep')keep(k,cover);else if(role==='sanctuary')chapel(k,cover,true);else if(role==='chapel')chapel(k,cover);
  else if(role==='watch'||role==='bell')watch(k,kind,role,cover);else if(role==='gate')gate(k,kind,cover);
  else if(role==='roost')roost(k,cover);else if(role==='forge')forge(k,cover);else lodge(k,kind,role,cover);
  const model=k.finish();model.groundY=0;model.signature+='/highland-'+kind+'-'+role+'-1';return model;
 }
 function compound(b,c,p,realm,options={}){
  const kind=c.highCitadel?.kind==='holy'?'holy':'dragon',role=b.highRole||(kind==='holy'?'hospice':'lodge');
  const cl=climate(c,b),palette=paint(c,b),seed=(c.townRecipe?.seed||'summit')+'/'+b.id+'/highland';
  const model=build(kind,role,seed,{lod:options.lod??b.lod??1,climate:cl,palette});
  const placed=ArtisanCityKit.meshAt(model,b);return{...placed,structures:1,palette,highRole:role};
 }
 return{build,compound,paint,palettes:PALETTES,roles:ROLES,version:1};
})();
