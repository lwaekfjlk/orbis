/** Reusable small urban compounds. Each placed module contains several structures
 * with a shared court/deck/terrace and a street-facing entrance. ALL ordinary town
 * buildings use this kit; monuments are optional urban anchors, not the whole city.
 */
const TownBuildingKit = (()=>{
 function build(b,c,p,realm){
  const localIndex=c.index(b.x,b.z),env=c.environment;
  // Local climate at THIS block's cell, not the town centre's. The whole town used
  // to respond to climate with one boolean, which is why a -1 C and a +26 C town of
  // the same tradition were built identically.
  const cl={...CityEnvironment.localClimate(env,localIndex),wet:c.wet?.[localIndex]||0};
  const localCold=cl.cold>.42;
  // Snow load steepens and re-pitches a roof; sustained heat with no rain flattens
  // it. The tradition still chooses the language everywhere in between.
  const roofFor=r=>cl.load>.45?'northern':(localCold&&r==='flat')?'northern':(cl.warm*cl.dry>.42&&cl.load<.15&&r!=='leaf')?'flat':r;
  const profile={...c.townProfile,roof:roofFor(c.townProfile.roof)},rng=LandmarkCatalog.rng(c.townRecipe.seed+'/'+b.id),v=b.moduleVariant??0;
  const faithKeys=['sun','stars','grove','hearth','tide','secular'];let f=0,t=rng();
  for(let i=0;i<(p.faith?.length||0);i++){t-=p.faith[i];if(t<=0){f=i;break}}
  const recipe=LandmarkCatalog.recipe(profile.palace,c.townRecipe.seed+'/'+b.id,{material:profile.material,faith:faithKeys[f]||'secular',complexity:0,roofLanguage:profile.roof,geography:{freshwater:p.fresh||0,cold:localCold}}),K=new LandmarkKit(recipe,{lod:0});let structures=0;
  K.climate=cl;
  K.palette={...K.palette,ground:'#'+Array.from(env.color.slice(localIndex*3,localIndex*3+3)).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')};
  // The tradition's palette, toned by the weather it stands in. ArtisanCityKit loads
  // after this module, so the shared tinting is resolved at call time when present.
  if(typeof ArtisanCityKit!=='undefined')K.palette={...ArtisanCityKit.climatePalette(K.palette,cl),ground:K.palette.ground};
  if(!K.palette.snow)K.palette={...K.palette,snow:'#eef4f7'};
  if(profile.id==='forest')K.palette={...K.palette,wall:'#e1dbc4',roof:'#80ad9f',trim:'#e9e4ce'};
  const hall=(x,z,w,d,h,roof=profile.roof,options={})=>{
   structures++;h*=.85+v*.17;
   // Snow load steepens the pitch, rain deepens the eave, drought tightens both.
   const pitch=1+cl.load*.62+cl.humid*.18-cl.dry*.22,eave=clamp(cl.warm*cl.humid*1.5)*.55;
   K.transform(x,options.y||.10,z,options.angle||0,1,()=>{
    // A raised floor answers wet ground; the traditions that always stilt still do.
    if(options.stilt||cl.wet>.6){for(const xx of[-.38,.38])for(const zz of[-.38,.38])K.box(xx*w,0,zz*d,.16,.85,.16,'wood');K.box(0,.75,0,w+.12,.18,d+.12,'wood')}
    const y=(options.stilt||cl.wet>.6)?.88:0,wall=(options.timber||cl.cold>.62)?'wood':'wall';
    K.box(0,y,0,w,h,d,wall);K.box(0,y+h-.12,0,w+.06,.12,d+.06,'trim');
    if(roof==='flat')K.using('roof',()=>{K.box(0,y+h,0,w+.16,.14,d+.16,'trim');for(const xx of[-1,1])K.box(xx*w/2,y+h,0,.14,.32,d,'wall');K.box(0,y+h,-d/2,w,.32,.14,'wall')});
    else{
     const rk=roof==='northern'?'northern':roof==='leaf'?'leaf':'gable',rh=Math.min(w,d)*(roof==='northern'?.80:roof==='leaf'?.70:.46)*pitch;
     K.roof(0,y+h,0,w+eave,d+eave,rh,'roof',rk);
     // Snow lies on this roof too. Same seasonal field as the artisan blocks, so a
     // town does not have snow on half its buildings and bare slate on the other half.
     if(typeof ArtisanCityKit!=='undefined')ArtisanCityKit.snowShell(K,0,y+h,0,w+eave,d+eave,rh,rk,cl.cover);
    }
    // Opening area is a climate cost: small deep-set lights at both extremes.
    const open=1-cl.cold*.34-cl.warm*cl.dry*.30;
    const rows=Math.max(1,Math.min(3,Math.floor(h/1.6)));for(let row=0;row<rows;row++)for(const x of[-.25,.25]){
      K.box(x*w,y+.65+row*1.4,d/2+.025,.27*open,.43,.045,'dark');K.box(x*w,y+.68+row*1.4,d/2+.052,.18*open,.29,.025,'water');
    }
    K.box(0,y+.01,d/2+.04,.42,.72,.05,'dark');
    if(options.timber||profile.id==='fjord'||cl.cold>.62){for(const xx of[-.43,.43])K.box(xx*w,y, d/2+.07,.10,h,.10,'trim');K.box(0,y+h*.55,d/2+.07,w,.08,.08,'trim');K.beam([-w*.44,y+.1,d/2+.08],[w*.44,y+h-.2,d/2+.08],.035,'trim')}
    // A flue is heating: it belongs where the model says heating is needed.
    if(options.chimney&&(cl.cold>.28||cl.warm<.55))K.box(w*.30,y+h*.8,-d*.2,.34,h*.5+.5+cl.cold*.7,.40,'wall');
    if(options.awning||eave>.28){K.box(0,y+1.28,d/2+.48,w*.95,.12,.85+eave,'roof');for(const xx of[-.40,.40])K.box(xx*w,y,d/2+.84+eave,.08,1.3,.08,'wood')}
   });
  };
  const stall=(x,z)=>{K.box(x,.12,z,1,.60,.72,'wood');K.box(x,.96,z,1.32,.10,1.12,v%2?'roof':'trim');for(const xx of[-.5,.5])K.box(x+xx,0,z+.42,.075,.97,.075,'wood')};
  // Planting follows the same canopy resolver the atlas and the town scene use.
  const tree=(x,z,h=3)=>K.tree(x,.12,z,h,CityEnvironment.treeKind(env,localIndex));
  const crest=(x,z,y=2)=>K.emblem(x,y,z,.35);
  const tinyTower=(x,z,h=4,rad=.45)=>{K.cylinder(x,.1,z,rad,h,'wall',8);K.cone(x,h+.1,z,rad*1.3,1.45,'roof',0,8)};
  K.part('block',b.name,'body',()=>K.transform(0,0,0,b.angle||0,1,()=>{
   const mat='ground';K.box(0,-.08,0,9.8,.10,9.8,mat);
   // Even a small settlement has houses and workplaces, not a field of palaces.
   if(b.type==='well'){K.pool(0,.15,0,3.5,3.5);K.arcade(0,.35,-2.2,2,1.3,2.3);crest(0,-2.1,3.1);return}
   if(b.type==='granary'){hall(0,-.8,5.5,6.0,3.3,profile.roof,{stilt:['delta','fjord','monsoon','taiga'].includes(profile.id)});for(const x of[-3.7,3.7]){K.cylinder(x,.1,-2,.6,2,'wood',8);K.cone(x,2.1,-2,.75,.7,'roof',0,8)}stall(0,3.2);return}
   if(b.type==='market'){for(const x of[-3.1,0,3.1])hall(x,-2.5,2.4,3.0,2.6,profile.roof,{awning:true});for(const x of[-3,-1,1,3])stall(x,2);K.box(0,.12,3.8,2,.1,1,'wood');return}
   if(b.type==='harbor'){hall(-2,-1,3.1,5.5,3.2,profile.roof,{timber:true});hall(2.2,-2,3.4,3,2.7,profile.roof,{timber:true});for(const x of[.6,2.2,3.6])K.cylinder(x,.1,2,.38,.65,'wood',8);K.beam([3,.1,4],[3,4.6,4],.13,'wood');K.beam([3,4.4,4],[.2,3.3,4],.10,'wood');K.beam([.2,3.3,4],[.2,1.1,4],.035,'metal');return}
   const id=profile.id;
   // A type is an urban palette and grammar, NOT one repeated miniature palace.
   // Mixed programs share its construction language but have distinct massing.
   const ordinary=['river','basilica','arcane','basalt'].includes(id);
   if(ordinary && (b.program==='home'||b.program==='market'||b.program==='garden'||(b.program==='civic'&&v!==0)||(b.program==='temple'&&v===2)||(b.program==='academy'&&v===1))){
    const pitched=id==='arcane'?'gable':profile.roof, awnings=b.program==='market',height=id==='basalt'?3.5:3.0;
    if(v===0){for(const x of[-2.8,.2,3.1])hall(x,-1.9,2.65,4.4,height+rng()*.8,pitched,{awning:awnings,chimney:true});hall(-2.8,2.5,2.65,2.8,2.3,pitched,{awning:awnings});if(!awnings)tree(2,2.9,2.1)}
    else if(v===1){hall(-2.3,0,3.1,7.1,height+.5,pitched,{awning:awnings,chimney:true});hall(2.0,-2.0,4.0,3.1,height-.3,pitched,{awning:awnings});hall(2.2,2.5,3.0,3.1,2.4,pitched,{awning:awnings});K.hedge(.1,.15,3.8,1.0,.25)}
    else{for(const x of[-2.5,2.5])for(const z of[-2.6,2.4])hall(x,z,3.5,3.8,height+(z<0?.6:-.3),pitched,{awning:awnings,chimney:z<0});}
    if(id==='arcane'){K.crystal(3.6,.2,3.9,.28,1.1);K.ring(0,.12,1,1.2,.035,'metal','xz',12)}
    if(awnings){stall(0,3.5);stall(0,1.7)}
    if(b.program==='temple')crest(0,-.2,2.6);
    return;
   }
   if(b.program==='workshop'&&v!==2&&ordinary){
     hall(0,-2.6,7.2,3.4,2.3,profile.roof,{chimney:true});hall(-2.8,1.4,2.6,3.5,3.1,profile.roof,{chimney:true});hall(2.9,1.9,2.6,3.5,2.2,profile.roof);
     for(const x of[-.6,.4,1.4])K.box(x,.15,.4,.65,.62,.85,'wood');K.cylinder(0,.1,3.1,.5,.7,'metal',8);crest(0,-.5,3.0);return;
   }
   if(id==='river'){
    for(const x of[-3,0,3])hall(x,-2.4,2.35,3.4,3.1+rng()*.8,'hip',{awning:b.type==='workshop',chimney:true});
    hall(-3,1.65,2.35,3.0,2.5,'hip',{timber:v===1});
    K.hedge(2.8,.12,1.4,2.1,.38);tree(2.8,2.9,2.5);stall(.2,3.1);crest(-3,3.25,2.5);
   }else if(id==='basilica'){
    hall(0,-3.1,6.7,2.6,3.4,'hip');hall(-3,0,2.1,3.4,2.7,'hip');hall(3,0,2.1,3.4,2.7,'hip');
    K.arcade(0,.1,-1.55,3,1.25,1.8);K.garden(0,.1,.5,3.3,2.8);hall(-2.8,3.4,2.2,1.7,2.0,'hip');
    if(v===0){tinyTower(2.9,3.25,4.4,.52);K.dome(2.9,4.6,3.25,.65,.60,'metal')}else K.arcade(1.5,.12,3.4,2,1.1,1.9);
    crest(0,-1.6,3.7);
   }else if(id==='arcane'){
    for(let j=0;j<3;j++){const a=j*2*Math.PI/3+.45,x=Math.cos(a)*3,z=Math.sin(a)*3;K.cylinder(x,.15,z,1.16,3.2+j*.55,'wall',8);K.using('roof',()=>K.cone(x,3.4+j*.55,z,1.48,2.1,'roof',0,8));K.crystal(x,5.5+j*.55,z,.24,1);structures++;K.box(x,1.2,z+1.16,.35,.85,.06,'water')}
    K.ring(0,.17,0,2.0,.05,'metal','xz',16);K.ring(0,.20,0,1.5,.04,'water','xz',16);hall(-2.2,-3.4,2.7,1.8,2.1,'gable');K.beam([-2.7,2.65,-2.1],[2.6,2.65,-1.7],.18,'trim');K.emblem(0,1.8,0,.55);
   }else if(id==='forest'){
    for(const [x,z,h]of[[-2.9,-2.5,3.1],[2.6,-1.8,2.7],[.2,2.7,2.5]]){K.cylinder(x,.1,z,1.5,.65,'wood',8);K.cylinder(x,.75,z,1.08,h*.55,'wall',8);K.using('roof',()=>K.cone(x,.75+h*.55,z,1.5,h*.80,'roof',0,8));K.rail(x-1.0,z+1.10,x+1,z+1.10,.73,'wood');structures++}
    K.beam([-2.8,.78,-2.0],[.2,.78,2.6],.27,'wood');K.beam([.2,.78,2.6],[2.6,.78,-1.8],.25,'wood');tree(-3.8,2.2,4.6);tree(3,-3.1,5.6);crest(.2,2.7,3.6);
   }else if(id==='mountain'){
    K.terrace(0,.0,-.4,8.5,7.8,.6);K.terrace(0,.6,-2.1,7.2,4.2,.9);hall(0,-2.5,6.2,3,3.0,'gable',{y:1.5,chimney:true});
    hall(-2.65,1.6,2.65,3.2,2.7,'gable',{y:.6});hall(2.65,1.6,2.65,3.2,2.7,'gable',{y:.6,chimney:true});K.stairs(0,0,4,1.9,3,.2,.3);K.arch(0,.65,1.9,1.5,2.1,.40);crest(0,-.7,4.0);
   }else if(id==='desert'){
    hall(0,-3.1,7.5,2.25,2.8,'flat');hall(-3.25,.3,2.1,4.6,2.4,'flat');hall(3.25,.3,2.1,4.6,2.5,'flat');hall(-1.75,3.1,3.3,2,2.1,'flat');
    K.arch(.7,0,3.65,1.8,1.95,.25);K.pool(.2,.12,.0,1.55,1.8);K.arcade(0,0,-1.65,3,1.15,1.65);tree(-1.3,1.35,2.6);
    K.box(3.2,2.6,-1.5,1.1,1.9,1.1,'wall');K.box(3.2,3.5,-.92,.7,.60,.06,'dark');K.box(3.2,4.5,-1.5,1.3,.14,1.3,'trim');crest(.7,3.65,2.2);
   }else if(id==='delta'){
    K.box(0,.70,0,8.7,.16,8.5,'wood');for(const x of[-3.9,0,3.9])for(const z of[-3.7,0,3.7])K.box(x,0,z,.17,.70,.17,'wood');
    for(const [x,z,h]of[[-2.3,-2.3,2.0],[2.2,-2.0,2.1],[-1.8,2.3,1.7]])hall(x,z,3.1,2.7,h,'hip',{y:.75,timber:true});
    K.rail(4,-4,4,4,.86,'wood');K.rail(-4,-4,4,-4,.86,'wood');stall(2.1,2.4);crest(2,2.4,2.1);
   }else if(id==='basalt'){
    K.box(0,.0,0,9,.30,9,'wall');hall(0,-2.9,6.8,2.8,3.3,'hip',{y:.3,chimney:true});hall(-2.9,.5,2.4,3.7,2.4,'hip',{y:.3,chimney:true});hall(2.8,.5,2.4,3.7,2.6,'hip',{y:.3});
    for(const x of[-3.5,3.5]){K.box(x,.3,3.6,.9,3,.9,'wall');K.parapet(x,3.3,3.6,1,1)}K.arch(0,.3,3.7,2.5,2.4,.6,'wall');K.box(0,.30,.2,1.1,.65,1.1,'metal');crest(0,3.7,3.1);
   }else if(id==='steppe'){
    // Felted halls behind windbreak screens; the pasture between them stays open.
    for(const [x,z,h]of[[-2.7,-2.2,2.6],[2.5,-2.4,2.4],[-.4,2.4,2.2]])hall(x,z,3.2,2.9,h,'hip',{timber:true});
    for(const x of[-4.4,4.4])K.box(x,.1,0,.16,1.9,7.4,'wood');
    K.rail(-4.2,3.6,4.2,3.6,.9,'wood');K.cylinder(3.4,.1,2.6,.22,4.2,'wood',6);K.banner(3.4,3.1,2.6,1.5);
    K.hedge(1.4,.12,1.2,2.2,.4);crest(-.4,2.4,3.0);
   }else if(id==='paddy'){
    K.terrace(0,0,-1.2,8.6,4.6,.5);K.pool(0,.05,3.4,7.8,2.6);
    for(const [x,z,h]of[[-2.6,-2.3,2.5],[2.5,-2.3,2.3],[0,.9,2.1]])hall(x,z,3.0,2.7,h,'leaf',{y:z<0?.5:0,timber:true});
    // The veranda deck is what this family is for; it runs the width of the block.
    K.box(0,.62,-.6,7.6,.09,.9,'trim');for(const x of[-2.6,2.5])K.box(x,.5,-.55,3.4,.10,.8,'wood');
    K.rail(-3.9,3.4,3.9,3.4,.5,'wood');tree(3.5,-3.6,3.4);crest(0,.9,2.9);
   }else if(id==='delve'){
    hall(-2.4,-2.4,3.6,3.4,3.2,'gable',{chimney:true});hall(-2.6,1.9,3.0,3.0,2.4,'gable');
    // A working headframe over the shaft, roped back to the winding shed.
    const hx=2.6,hz=1.1;K.box(hx,.1,hz,2.5,.22,2.5,'dark');
    for(const a2 of[-1,1])for(const b2 of[-1,1])K.beam([hx+a2*1.0,.3,hz+b2*1.0],[hx+a2*.28,4.6,hz+b2*.28],.10,'wood',4);
    K.box(hx,4.6,hz,1.2,.55,1.2,'wood');K.ring(hx,4.9,hz,.55,.07,'metal','yz',12);K.beam([hx,4.3,hz],[-2.4,3.0,-2.4],.055,'metal',4);
    for(const x of[-.2,1.0])K.box(x,.12,-3.4,1.0,.5,1.4,'wood');K.rock(3.7,.1,-3.2,1.5,.9,1.4,7,'ground');crest(-2.4,3.4,3.4);
   }else if(id==='lagoon'){
    K.pool(0,.05,3.5,8.4,2.4);
    hall(0,-3.0,7.0,2.6,3.4,'hip');hall(-3.0,.4,2.4,3.9,2.9,'hip');hall(3.0,.4,2.4,3.9,2.7,'hip');
    K.arcade(0,.1,-1.4,3,1.3,2.0);K.arch(0,.1,1.9,1.6,2.2,.35);
    // Mooring posts and a quay edge: the block is entered from the water.
    for(const x of[-2.6,0,2.6])K.cylinder(x,.05,4.3,.20,1.1,'wood',7);
    K.box(0,.12,2.5,7.2,.12,1.1,'wood');K.rail(-3.6,2.5,3.6,2.5,.6,'metal');crest(0,-1.4,3.6);
   }else if(id==='taiga'){
    // Log dwellings banked against the drift line, around a swept winter yard.
    hall(-2.5,-2.6,3.4,3.2,3.0,'northern',{timber:true,chimney:true});hall(2.6,-2.4,3.0,3.0,2.6,'northern',{timber:true,chimney:true});
    hall(-2.2,2.4,3.2,2.8,2.3,'northern',{timber:true});
    // Grain and fuel stand on posts, clear of the snow, each under its own roof.
    K.box(2.8,1.5,2.2,2.2,1.1,1.9,'wood');K.roof(2.8,2.6,2.2,2.8,2.5,1.5,'roof','northern');
    for(const x of[-.9,.9])for(const z of[-.75,.75])K.cylinder(2.8+x,.1,2.2+z,.19,1.4,'wood',7);
    // A split-log run rather than a masonry wall.
    for(let t=-4.4;t<4.4;t+=.66)K.cone(t,.1,4.5,.22,2.3,'wood',.15,6);
    tree(-4.2,-4.2,4.2);tree(4.2,4.0,3.6);crest(-2.2,2.4,3.1);
   }else if(id==='monsoon'){
    // Everything stands on posts: the ground floods for part of every year.
    for(let x=-4;x<=4;x+=2.7)for(let z=-4;z<=4;z+=2.7)K.box(x,0,z,.16,1.05,.16,'wood');
    K.box(0,1.05,0,9.4,.20,9.2,'wood');
    for(const [x,z,h] of [[-2.6,-2.4,2.4],[2.5,-2.3,2.2],[-1.0,2.6,2.1]])hall(x,z,3.0,2.8,h,'leaf',{y:1.15,timber:true});
    // The eave is the point: carried out on posts well clear of every wall.
    for(const [x,z] of [[-2.6,-2.4],[2.5,-2.3],[-1.0,2.6]]){K.box(x,1.15+2.9,z,4.3,.10,4.1,'roof');for(const t of[-1,1])K.cylinder(x+t*1.9,1.25,z+1.8,.13,2.8,'wood',6)}
    K.rail(-4.5,4.4,4.5,4.4,1.25,'wood');K.box(0,1.10,4.0,8.6,.12,1.0,'wood');
    tree(4.0,-4.1,5.2);tree(-4.3,3.9,4.6);crest(-1.0,2.6,3.0);
   }else if(id==='fjord'){
    hall(-1.6,-1.2,3.5,6.4,3,'northern',{timber:true,chimney:true});hall(2.4,-2.6,2.4,3.3,1.9,'northern',{timber:true,stilt:true});hall(2.4,2.1,2.4,3.0,1.8,'northern',{timber:true});
    K.rail(-3.8,3.1,-.4,3.1,.12,'wood');K.cylinder(-2.9,.1,3.8,.26,1.1,'wood',8);crest(-.8,3.8,2.8);
    if(CityEnvironment.roofSnow(env,localIndex)){K.box(-1.6,3.07,-1.2,.24,.12,6.7,'trim');K.box(2.4,2.88,-2.6,.14,.10,3.5,'trim')}
   }
  }));
  const model=K.finish(),lo=model.bounds.min,hi=model.bounds.max;
  const scale=Math.min(b.w/(hi[0]-lo[0]),b.d/(hi[2]-lo[2]))*.95;
  const meshes={body:new Geometry(),roof:new Geometry()},offset=[b.x-(hi[0]+lo[0])*.5*scale,b.y-lo[1]*scale,b.z-(hi[2]+lo[2])*.5*scale];
  for(const part of model.parts){const g=LandmarkTemplates.transformGeometry(part.geometry,scale,offset),dst=part.role==='roof'?meshes.roof:meshes.body;for(const n of g.data)dst.data.push(n)}
  return {...meshes,height:(hi[1]-lo[1])*scale,structures,recipe,module:b.module};
 }
 return {build};
})();

/** Whole-town recipe wins for the architectural family. Individual site edits can
 * still change compatible parts; they do not replace the town's streets. */
const TownCityBinding = (()=>{
 function resolve(w,s,p,c,kind){
  const base=LandmarkBinding.resolve(w,s,p,kind),f=c.townProfile;
  /* A seat of government belonged to its CLIMATE and nothing else: style was simply
   * the town tradition's palace, so two towns of different nations and different
   * religions came out with the same hall whenever they shared a landscape. The realm
   * now chooses the massing, the province's faith the crown and ornament, and the
   * town's own tradition still supplies material and roof so the building keeps
   * belonging to its landscape. */
  const realm=s.realms?.[p.owner];
  const BY_ARCHETYPE={forest:'forest',maritime:'lagoon',granary:'river',forge:'delve',arcane:'arcane',lake:'delta',frontier:'basalt'};
  const BY_GOV={1:'basilica',2:'arcane'};
  let style=kind==='academy'?'arcane'
   :kind==='civic'?(BY_GOV[realm?.gov]||BY_ARCHETYPE[realm?.archetype]||f.palace)
   :f.id==='forest'?'grove'
   :['desert','mountain','delta','fjord','basalt','steppe','paddy','delve','lagoon','taiga','monsoon'].includes(f.id)?f.id:'basilica';
  // The crown is belief, and it reads from a long way off.
  const faithKey=['sun','stars','grove','hearth','tide','secular'][cDominant(p.faith)]||'secular';
  const faithCrown=typeof TownVocabulary!=='undefined'?(TownVocabulary.ORNAMENT[faithKey]||{}).crown:null;
  const saved=s.landmarkRecipes?.[base.id];
  const sacred=kind==='temple'&&c.buildings.some(b=>b.sacred&&b.type===kind);
  return LandmarkCatalog.recipe(style,`${c.townRecipe.seed}/${kind}`,{...base,...(sacred?{sacred:true,sacredVersion:1,name:p.name+' · Grand Sanctuary',material:'ivory'}:{}),style,material:sacred?'ivory':f.material,roofLanguage:saved?.roofLanguage||f.roof,crown:saved?.crown||faithCrown||'native',seed:`${c.townRecipe.seed}/${kind}`,townRecipe:c.townRecipe,artisan:kind==='civic',urbanStyle:f.id,provenance:base.provenance+' The urban ensemble supplies the material and roof family.'});
 }
 function miniature(recipe,b){
  if(recipe.sacred&&typeof SacredCityKit!=='undefined')return SacredCityKit.miniature(recipe,b);
  if(recipe.artisan&&typeof ArtisanCityKit!=="undefined")return ArtisanCityKit.meshAt(ArtisanCityKit.precinct(recipe,{lod:1}),b);
  const m=recipe.artisan&&typeof ArtisanCityKit!=='undefined'?ArtisanCityKit.precinct(recipe,{lod:1}):LandmarkTemplates.build({...recipe,complexity:1},{base:false,lod:1}),lo=m.bounds.min,hi=m.bounds.max,sc=Math.min(b.w/(hi[0]-lo[0]),b.d/(hi[2]-lo[2]))*.95,offset=[b.x-(lo[0]+hi[0])*.5*sc,b.y-lo[1]*sc,b.z-(lo[2]+hi[2])*.5*sc],body=new Geometry(),roof=new Geometry();
  for(const part of m.parts){const g=LandmarkTemplates.transformGeometry(part.geometry,sc,offset),target=part.role==='roof'?roof:body;for(const x of g.data)target.data.push(x)}
  return {body,roof,height:(hi[1]-lo[1])*sc};
 }
 return {resolve,miniature};
})();
