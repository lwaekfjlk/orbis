/** Individually authored wonder assemblies; shared construction vocabulary is injected by SacredCityKit. */
function createStoneWonders({TAU,palette,stair,statue,path,lancet,pointed,stoneRing}){
 // Closed masonry sectors have a soffit and inner reveal as well as a top surface.
 function sector(k,inner,outer,bottom,top,a,b,m='wall',steps=6){
  const P=(r,y,t)=>[Math.sin(t)*r,y,Math.cos(t)*r];
  for(let j=0;j<steps;j++){const u=a+(b-a)*j/steps,v=a+(b-a)*(j+1)/steps;
   k.quad(P(inner,top,u),P(outer,top,u),P(outer,top,v),P(inner,top,v),m);
   k.quad(P(inner,bottom,u),P(inner,bottom,v),P(outer,bottom,v),P(outer,bottom,u),m);
   k.quad(P(outer,bottom,u),P(outer,bottom,v),P(outer,top,v),P(outer,top,u),m);
   k.quad(P(inner,bottom,u),P(inner,top,u),P(inner,top,v),P(inner,bottom,v),m);
  }
  k.quad(P(inner,bottom,a),P(outer,bottom,a),P(outer,top,a),P(inner,top,a),m);
  k.quad(P(inner,bottom,b),P(inner,top,b),P(outer,top,b),P(outer,bottom,b),m);
 }
 function horn(k,points,r,m='dark'){
  k.mark('tapered-horn');const seg=7;
  // Every bend shares one cross-section with both neighbours. Segment-local
  // cylinders would leave cracks where the taper changes direction.
  const rings=points.map((p,j)=>{
   const n=norm(sub(points[Math.min(points.length-1,j+1)],points[Math.max(0,j-1)])),u=norm(cross(n,Math.abs(n[2])<.95?[0,0,1]:[1,0,0])),v=cross(n,u),rad=r*(1-j/(points.length-1));
   return Array.from({length:seg},(_,s)=>p.map((q,i)=>q+rad*(u[i]*Math.cos(s/seg*TAU)+v[i]*Math.sin(s/seg*TAU))));
  });
  for(let j=0;j<points.length-1;j++)for(let s=0;s<seg;s++){
   const next=(s+1)%seg;
   if(j===points.length-2)k.tri(rings[j][s],rings[j][next],points[j+1],m);
   else k.quad(rings[j][s],rings[j][next],rings[j+1][next],rings[j+1][s],m);
   if(j===0)k.tri(points[0],rings[0][next],rings[0][s],m);
  }
 }
 function dreadKeep(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#424951',trim:'#78808a',roof:'#242c35',metal:'#947653',wood:'#47352d',dark:'#151d26'};
  k.part('black-terraces','The battered terraces and fortified wall walk','foundation',()=>{
   k.terrace(0,0,0,36,34,2);k.terrace(0,2,-4,27,22,1.8);k.terrace(0,3.8,-7,19,14,1.6);
   stair(k,0,0,17,6,9,2/9,.42);stair(k,0,2,11.5,5,8,.225,.40);
   for(const [x,z,w,d]of[[0,-16,32,1.4],[-16,-2,1.4,28],[16,-2,1.4,28],[-11,15,10,1.4],[11,15,10,1.4]]){
    k.box(x,2,z,w,3.4,d,'wall');k.box(x,4.8,z,w+.45,.35,d+.45,'trim');k.parapet(x,5.15,z,w+.30,d+.30);
    const horizontal=w>d,n=Math.floor(Math.max(w,d)/2.4);for(let j=0;j<n;j++){
     const u=(j-(n-1)/2)*2.4;for(const sign of[-1,1])k.box(x+(horizontal?u:sign*.82),4.15,z+(horizontal?sign*.82:u),.38,.65,.38,'trim');
    }
   }
  });
  k.part('dread-spires','The buttressed keep and articulated horn crowns','architecture',()=>{
   k.hall(0,5.4,-8,13,11,15,{roof:'gable',roofHeight:5});
   for(const s of[-1,1]){
    for(const z of[-12,-8,-4]){k.box(s*6.9,5.4,z,1.2,10,1.3,'wall');k.box(s*7.05,5.4,z,1.7,.8,1.9,'trim');k.roof(s*6.9,15.4,z,1.4,1.5,1.4,'dark','hip');}
    k.tower(s*8.6,5.4,-8,2.1,23,'spire');k.tower(s*11.5,3.8,4,1.6,13,'spire');k.hall(s*12,2,-9,4.4,10,5.2,{roof:'gable',entrance:false});
    for(const t of[-1,1])horn(k,[[s*8.6,26.2,-8+t*.6],[s*10.3,28.1,-8+t*1.7],[s*12,31,-8+t*3.3],[s*12.5,33.6,-8+t*3.8]],.67);
    for(const z of[-9,-6])lancet(k,s*6.54,11.8,z,1.05,3.3,s<0?Math.PI/2:-Math.PI/2);
   }
   k.tower(0,5.4,-8,3,30,'spire');
   for(const s of[-1,1])horn(k,[[s*1.4,33,-8],[s*4.6,35,-8],[s*6.1,38.4,-8],[s*6.4,41,-8]],.80);
   k.using('roof',()=>k.cone(0,35.4,-8,3.4,5.2,'roof',0,8));
   // The great hall's entrance is scaled to its wall, with a sheltered landing.
   pointed(k,0,5.4,-1.5,3.6,6.2,1.4);k.box(0,5.4,-2.1,3.5,4.8,.18,'wood');
   for(const s of[-1,1])k.box(s*.92,7.8,-1.96,1.5,.15,.10,'metal');
   k.box(0,5.3,-.7,5.4,.25,3.4,'trim');stair(k,0,3.8,2.4,4.5,8,.20,.34);
  });
  k.part('gate-of-horns','The vaulted gatehouse and recessed iron grille','architecture',()=>{
   k.mark('recessed-fortress-gate');
   for(const s of[-1,1]){k.box(s*4.25,2,15.6,3.1,7.5,3.6,'wall');k.box(s*4.25,2,15.6,3.7,.5,4.2,'trim');
    k.window(s*4.25,6.9,17.43,.55,1.6);k.parapet(s*4.25,9.5,15.6,3.2,3.6);
    horn(k,[[s*4.25,10.1,15.6],[s*5.6,11.5,15.6],[s*6.2,13.4,15.6]],.48);
    k.banner(s*6.3,2,17,4.6);
   }
   pointed(k,0,2,17.15,4.5,6.5,1.25);pointed(k,0,2,14.35,4.5,6.5,.55);
   k.box(0,8.8,15.6,11.6,1.1,3.8,'wall');k.box(0,9.9,15.6,12,.3,4.1,'trim');
   for(let x=-2;x<=2;x+=.5)k.box(x,2.15,15.2,.09,4.2,.14,'metal');
   for(const y of[3,4.2,5.4,6.25])k.box(0,y,15.2,4.2,.10,.14,'metal');
   k.box(0,1.95,15.8,5.5,.25,4.6,'trim');k.emblem(0,9.05,17.68,.80);
  });
  k.part('brazier-court','The cressets and oath court','ornament',()=>{
   for(const s of[-1,1]){k.column(s*7,3.8,6,.48,2,'wall',8);k.lathe(s*7,5.8,6,[[0,0],[.9,0],[1.1,.55],[.8,.55],[.5,.18],[0,.18]],'metal',10);k.crystal(s*7,6,6,.5,1.1);}
   k.box(0,2.08,8,4.6,.10,6,'dark');for(let j=0;j<4;j++)k.box(0,2.19,5.8+j*1.4,4,.035,.08,'metal');
  });
  return k.finish();
 }
 function deepCity(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#817d77',trim:'#b5afa0',roof:'#516365',metal:'#b98450',wood:'#564631',dark:'#242a2e'};
  k.part('cut-face','The excavated mountain face and open tunnel','foundation',()=>{
   k.mark('excavated-mountain-portal');
   // The centre is absent up to the lintel. A back wall is nine units INTO the
   // mountain, so the portal now has a real floor, side reveals and dark depth.
   k.mark('faceted-excavated-rock-crown');
   // Chisel the mountain's outline itself: bevelled shoulders and a broken crown
   // are closed rock masses, not extra boulders placed above a rectangular slab.
   for(const side of[-1,1]){
    let outline=[[5.8,-18,28.0],[16.2,-18,26.5],[18,-15.6,24.5],[17.8,-10.2,23.8],[17.2,-8,24.8],[5.8,-8,28.8]].map(([x,z,y])=>[side*x,y,z]);
    if(side<0)outline.reverse();const centre=[side*11.7,29.4,-12.7],floor=[side*11.7,0,-12.7];
    for(let j=0;j<outline.length;j++){const a=outline[j],b=outline[(j+1)%outline.length],A=[a[0],0,a[2]],B=[b[0],0,b[2]];
     k.quad(A,a,b,B,j%2?colorScale(k.color('wall'),.94):'wall');k.tri(centre,b,a,colorScale(k.color('wall'),j%2?1.02:.9));k.tri(floor,A,B,'wall');
    }
   }
   k.box(0,18.4,-13,11.6,6.4,10,'wall');
   const crown=[[-5.8,24.8,-18],[5.8,24.8,-18],[5.8,24.8,-8],[-5.8,24.8,-8]],peaks=[[-3.2,28.7,-16],[3.9,29.5,-15.2],[3.0,27.6,-9],[-4.3,28.1,-9.4]];
   for(let j=0;j<4;j++){const n=(j+1)%4;k.quad(crown[j],peaks[j],peaks[n],crown[n],'wall');k.tri([0,29.1,-12.7],peaks[n],peaks[j],colorScale(k.color('wall'),j%2?.94:1.04));}
   k.quad(crown[0],crown[1],crown[2],crown[3],'wall');
   k.box(0,0,-17.65,11.6,18.4,.7,'dark');k.box(0,1.25,-11.6,11.6,.25,11.5,'trim');
   for(const side of[-1,1])for(let y=1.5;y<23;y+=3.1){k.box(side*11.5,y,-7.91,11.4,.15,.32,colorScale(k.color('wall'),.83));k.box(side*16.85,y,-7.85,.55,.52,.62,'trim');}
   // High ventilation cuts and a stone drip ledge terminate the worked galleries.
   for(const side of[-1,1])for(const x of[7.5,10.3]){k.window(side*x,23.1,-7.96,.75,2.1,0,'lattice');k.box(side*x,25.4,-7.78,1.5,.22,.66,'trim');}
   k.box(0,23.5,-7.76,10.7,.30,.75,'trim');for(const x of[-4.3,-2.15,0,2.15,4.3])k.box(x,22.75,-7.89,.36,.76,.46,'trim');
   k.terrace(0,0,2,34,22,1.4);k.terrace(0,1.4,6,26,12,1.2);
   // The approach descends to the portal rather than ending against an elevated slab.
   k.box(0,1.4,-3.5,10.8,.18,5.6,'trim');for(let j=0;j<6;j++)k.box(0,1.4,-.25-j*.42,8,1.2-j*.2,.44,'trim');stair(k,0,1.4,13,8,8,.15,.44);
  });
  k.part('deep-portal','The recessed gate and carved mountain wardens','architecture',()=>{
   k.arch(0,1.4,-7.45,10.1,15.5,2.1,'wall');k.arch(0,1.4,-10.6,9.1,14.1,.62,'trim');
   k.box(0,17.6,-7.3,14.5,1.0,2.9,'trim');k.box(0,18.6,-7.3,13.7,.35,2.65,'metal');
   for(const s of[-1,1]){
    k.box(s*8.7,1.4,-6.65,4.1,1,3.4,'trim');
    for(const dx of[-.65,.65]){k.box(s*8.7+dx,2.4,-6.5,1.1,6.3,2.3,'wall');k.box(s*8.7+dx,2.4,-5.8,1.25,.6,2.7,'trim');}
    k.cone(s*8.7,8.7,-6.65,2.4,5.8,'wall',1.7,4);k.box(s*8.7,14.5,-6.6,4.4,.8,3.0,'trim');
    k.box(s*8.7,15.3,-6.65,1.4,.55,1.4,'wall');k.box(s*8.7,15.8,-6.5,2.6,2.2,2.5,'wall');
    k.box(s*8.7,17.5,-6.6,3.1,.65,2.8,'metal');k.box(s*8.7,16.95,-5.2,2.25,.16,.22,'dark');
    k.box(s*8.7,15.65,-5.24,1.6,.8,.5,'trim');
    for(const hand of[-1,1]){k.beam([s*8.7+hand*1.5,14.1,-6.3],[s*8.7+hand*1.8,9.6,-5.2],.56,'wall',6,true);k.box(s*8.7+hand*1.8,9.2,-5.2,.9,.8,.9,'trim');}
    k.beam([s*8.7-s*1.9,2.6,-4.9],[s*8.7-s*1.9,12.6,-4.9],.15,'metal',6,true);
   }
   for(const z of[-9.5,-13.3])for(const s of[-1,1]){k.box(s*5.3,4.1,z,.22,2.6,.4,'metal');k.crystal(s*5.15,6.7,z,.29,.85);}
   k.emblem(0,20.2,-7.55,1.35);
  });
  k.part('gallery-terraces','Interrupted galleries cut around the entrance','architecture',()=>{
   k.mark('portal-clear-galleries');
   for(const s of[-1,1])for(let level=0;level<4;level++){
    const y=5.4+level*4.5,x=s*13.7;
    k.box(x,y,-7.6,7.1,.45,2.5,'trim');k.rail(x-3.45,-6.36,x+3.45,-6.36,y+.45,'metal');
    for(const dx of[-2.25,0,2.25])k.window(x+dx,y+.85,-7.92,1.15,2.2,0,'lattice');
    for(const dx of[-2.7,2.7])k.beam([x+dx,y-1.5,-7.9],[x+dx,y,-6.55],.18,'trim',4,true);
   }
   for(const s of[-1,1]){k.cylinder(s*13.5,1.4,4,1.5,11,'dark',10);for(const y of[2,5.8,9.6,12.4])k.cylinder(s*13.5,y,4,1.8,.36,'metal',10);
    k.hall(s*11,1.4,10,5.2,6.4,4.2,{roof:'gable',entrance:false});}
  });
  k.part('chasm-bridge','The stone approach bridge and lamp piers','ornament',()=>{
   k.box(0,1.4,14,5,.55,10,'trim');
   for(const s of[-1,1]){k.rail(s*2.5,9,s*2.5,19,1.95,'metal');for(const z of[10.5,14,17.5]){
    k.box(s*2.5,1.95,z,.52,.7,.52,'wall');k.column(s*2.5,2.65,z,.16,1.6,'metal',6);k.crystal(s*2.5,4.25,z,.30,.9);
   }}
   // A bridge needs an underside and abutments, not just a floating plate.
   for(const z of[9.4,18.6])k.box(0,0,z,5.7,1.4,1.4,'wall');
  });
  return k.finish();
 }
 function dragonCourt(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#b6a791',trim:'#dfc6a0',roof:'#485e59',metal:'#bb9651',wood:'#664832',dark:'#303737'};
  k.part('scaled-terraces','The scaled plinth and ceremonial stair','foundation',()=>{
   k.terrace(0,0,0,36,32,1.8);k.terrace(0,1.8,-5,31,20,1.6);stair(k,0,0,16,9,8,.225,.44);
   stair(k,0,1.8,7.4,6,8,1.7/8,.36);
   for(const s of[-1,1])for(let j=0;j<5;j++){const z=11.9-j*2.35;k.box(s*15,1.8,z,1.1,.35,1.9,'metal');}
  });
  k.part('long-hall','One continuous curved hall with joined radial roof bays','architecture',()=>{
   k.mark('continuous-coiling-hall');const n=14,r=13,inner=10.2,outer=15.8,base=3.4,eave=12.7;
   // Adjacent bays share their exact radial boundaries. There are no overlapping
   // rectangular halls, buried side windows or seven roofs fighting at the seams.
   k.transform(0,0,3.5,Math.PI,1,()=>{
    sector(k,inner,outer,base,eave,-1.13,1.13,'wall',n);
    sector(k,inner-.16,outer+.16,eave-.30,eave,-1.13,1.13,'trim',n);
    sector(k,inner-.25,outer+.25,base,base+.3,-1.13,1.13,'trim',n);
    k.using('roof',()=>{
     const P=(rad,y,t)=>[Math.sin(t)*rad,y,Math.cos(t)*rad],lo=inner-.6,hi=outer+.6,top=eave+3.1;
     for(let j=0;j<n;j++){
      const a=-1.13+j*2.26/n,b=-1.13+(j+1)*2.26/n;
      k.quad(P(lo,eave,a),P(r,top,a),P(r,top,b),P(lo,eave,b),'roof');
      k.quad(P(r,top,a),P(hi,eave,a),P(hi,eave,b),P(r,top,b),'roof');
      k.quad(P(lo,eave,a),P(lo,eave,b),P(hi,eave,b),P(hi,eave,a),colorScale(k.color('roof'),.7));
      k.beam(P(r,top+.07,a),P(r,top+.07,b),.13,'metal',6,true);
      if(j%2===0){k.beam(P(lo,eave+.04,a),P(r,top+.06,a),.09,'metal',5,true);k.beam(P(r,top+.06,a),P(hi,eave+.04,a),.09,'metal',5,true);}
     }
     for(const [t,reverse]of[[-1.13,false],[1.13,true]]){const p=[P(lo,eave,t),P(hi,eave,t),P(r,top,t)];if(reverse)p.reverse();k.tri(...p,'trim');}
     for(let j=0;j<=7;j++){const t=-1.13+j*2.26/7;k.cone(Math.sin(t)*r,top+.05,Math.cos(t)*r,.42,1.2+2.4*(1-Math.abs(t)/1.13),'metal',0,6);}
    });
    k.mark('articulated-dragon-end-bays');
    for(const side of[-1,1]){const t=side*1.13,angle=-side*Math.PI/2-t;
     k.transform(Math.sin(t)*r,base,Math.cos(t)*r,angle,1,()=>{
      for(const x of[-2.56,2.56]){k.box(x,0,.09,.40,eave-base,.42,'trim');k.box(x,0,.11,.65,.45,.64,'trim');k.box(x,eave-base-.45,.11,.64,.45,.62,'trim');}
      k.arch(0,0,.20,2.2,4.0,.40,'trim');k.box(0,0,.10,2.1,2.9,.14,'wood');k.box(0,1.8,.19,2.1,.12,.09,'metal');
      k.box(0,-.02,.67,3.6,.16,1.5,'trim');
      for(const x of[-1.35,1.35])lancet(k,x,5.2,.045,.85,2.65);
      k.box(0,4.65,.12,5.6,.16,.42,'trim');k.box(0,eave-base-.22,.13,5.9,.22,.48,'trim');
      k.using('roof',()=>{for(const sign of[-1,1])k.beam([sign*3.4,eave-base+.06,.12],[0,eave-base+3.16,.12],.13,'metal',5,true);});
     });
    }
    for(let j=0;j<=10;j++){
     const a=-1.02+j*2.04/10;
     for(const [rad,angle]of[[inner-.025,Math.PI-a],[outer+.025,-a]]){
      const x=Math.sin(a)*rad,z=Math.cos(a)*rad;lancet(k,x,6,z,1.05,4.4,angle);
     }
     k.transform(Math.sin(a)*(inner-.35),base,Math.cos(a)*(inner-.35),Math.PI-a,1,()=>{
      k.column(0,0,0,.30,eave-base-.5,'wall',8);k.beam([0,eave-base-2,0],[0,eave-base-.05,.8],.16,'wood',4,true);
     });
    }
   });
   // A lower entrance pavilion is joined into the inner curve at the centre.
   k.hall(0,3.4,-5,6,5,6.3,{roof:'hip',roofHeight:2.3,entrance:false});pointed(k,0,3.4,-2.4,3.2,5.1,.7);
   k.box(0,3.4,-2.63,3.05,3.7,.12,'wood');k.box(0,3.35,-1.8,4.8,.18,2,'trim');
  });
  k.part('wyrm-gate','The dragon gate with stone coils and carved heads','architecture',()=>{
   k.mark('carved-dragon-gate');k.arch(0,1.8,11,6.4,7.2,1.8,'wall');k.box(0,9.1,11,9.7,.65,2.5,'trim');
   for(const s of[-1,1]){
    k.column(s*5.1,1.8,11,1.05,8,'wall',10);
    const coil=[];for(let j=0;j<=12;j++){const a=j/12*Math.PI*2.8;coil.push([s*5.1+Math.cos(a)*1.15,3+j*.55,11+Math.sin(a)*1.15]);}path(k,coil,.36,'metal',6);
    horn(k,[[s*5.1,9.8,11],[s*5.9,11.6,11],[s*5.3,12.5,11.5],[s*3.65,12.7,12.1]],.85,'wall');
    k.box(s*3.9,12.15,12,1.8,.8,1.3,'wall');k.box(s*3.55,12.13,12.65,1.9,.16,.38,'dark');
    k.crystal(s*4.2,12.83,12.7,.16,.22);
    horn(k,[[s*5,12.8,11],[s*6,14.2,10.5],[s*6.25,15.4,10.3]],.30,'metal');
    for(const t of[-1,1])k.cone(s*3.65+t*.45,11.95,12.83,.13,.38,'trim',0,5);
   }
   k.box(0,1.78,11,7,.20,3.6,'trim');k.emblem(0,9.85,12.36,.85);
  });
  k.part('hoard-court','The sunken treasury basin and scaled court','ornament',()=>{
   // The basin is fully inside the upper plinth and above its 3.5-unit cap.
   k.pool(0,3.51,2,10,5);for(const s of[-1,1]){k.fountain(s*6,3.51,2,1.1);k.banner(s*9.5,1.8,9,4.4);}
   for(const s of[-1,1])for(const z of[1,4,7]){const y=z<5?3.51:1.91;k.box(s*8,y,z,1.4,.35,1.4,'trim');k.cone(s*8,y+.35,z,.65,.8,'metal',.38,6);}
  });
  return k.finish();
 }
 function forgeHollow(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#706b63',trim:'#ada293',roof:'#3e4648',metal:'#746c60',wood:'#60503b',dark:'#282e30'};
  k.part('quarried-bowl','Closed retaining terraces around a genuinely excavated floor','foundation',()=>{
   k.mark('closed-excavation-terraces');
   for(let level=0;level<5;level++){
    const outer=17-level*2.6,inner=outer-2.6,top=-level*1.9,gap=Math.asin(2.25/inner);
    sector(k,inner,outer,top-1.9,top,gap,TAU-gap,'wall',36);
    sector(k,inner,inner+.22,top-.18,top+.06,gap,TAU-gap,'trim',36);
    for(let j=0;j<12;j++){const a=gap+.18+(TAU-gap*2-.36)*j/11;
     if(j%2===0)k.window(Math.sin(a)*(inner-.02),top-1.6,Math.cos(a)*(inner-.02),.95,1.12,Math.PI-a,'lattice');
    }
   }
   // The excavated volume needs a bottom below its stair-side seams as well
   // as beneath the hearth. Match the outer opening facets, keeping minY -9.8.
   k.mark('closed-forge-bottom-shell');const edgeGap=Math.asin(2.25/14.4),boundary=Array.from({length:37},(_,j)=>{const a=edgeGap+(TAU-edgeGap*2)*j/36;return[Math.sin(a)*17,Math.cos(a)*17]});
   for(let j=0;j<boundary.length;j++){const a=boundary[j],b=boundary[(j+1)%boundary.length],A=[a[0],-9.8,a[1]],B=[b[0],-9.8,b[1]],C=[b[0],-9.6,b[1]],D=[a[0],-9.6,a[1]];
    k.tri([0,-9.6,0],D,C,'dark');k.tri([0,-9.8,0],B,A,'dark');k.quad(A,B,C,D,'wall');
   }
   k.cylinder(0,-9.8,0,4.25,.3,'dark',24);
  });
  k.part('great-forge','The furnace hearth, riveted hood and breathing stacks','architecture',()=>{
   k.mark('open-furnace-mouth');
   k.cylinder(0,-9.5,0,3.65,.5,'trim',14);
   // Build the front hearth around an opening, with glowing work set back inside.
   k.box(0,-9,-.65,5.5,3.7,3.1,'dark');for(const s of[-1,1])k.box(s*2.2,-9,1.2,1.2,3.7,1.5,'wall');
   k.arch(0,-9,1.75,3.0,3.5,.62,'trim');k.box(0,-8.8,.75,2.8,.25,1.5,'#ed9d4d');k.box(0,-9,2.7,4.2,.25,1.5,'metal');
   k.cone(0,-5.3,0,3.9,3.6,'metal',1.15,12);
   for(let j=0;j<12;j++){const a=j*TAU/12;k.beam([Math.sin(a)*3.85,-5.2,Math.cos(a)*3.85],[Math.sin(a)*1.16,-1.75,Math.cos(a)*1.16],.09,'dark',4,true);}
   k.cylinder(0,-1.7,0,1.35,12.2,'dark',12);
   for(const y of[-1.6,1.4,4.4,7.4,10.3])k.cylinder(0,y,0,1.62,.35,'metal',12);
   k.using('roof',()=>{k.cone(0,10.7,0,2.1,.5,'metal',1.7,12);k.cone(0,11.8,0,2.2,.9,'metal',.7,12);});
   for(let j=0;j<4;j++){const a=j*TAU/4;k.box(Math.sin(a)*1.4,11.2,Math.cos(a)*1.4,.17,.65,.17,'metal');}
   for(const s of[-1,1]){
    k.cylinder(s*7,-7.6,-1.7,1.6,4.6,'wall',10);for(const y of[-7.4,-5.1,-3.2])k.cylinder(s*7,y,-1.7,1.8,.25,'metal',10);
    k.beam([s*7,-3.1,-1.7],[s*2.55,-3.2,-.9],.46,'metal',8,true);
    k.box(s*5.8,-7.6,1.3,1.8,.55,2.2,'wood');k.box(s*5.8,-7.05,1.3,2,.18,2.4,'metal');
   }
  });
  k.part('gallery-rings','Walkable stair flights, landings and inward gallery rails','architecture',()=>{
   k.mark('walkable-forge-descent');
   for(let level=0;level<5;level++){
    const outer=17-level*2.6,inner=outer-2.6,top=-level*1.9,gap=Math.asin(2.25/inner);
    for(let j=0;j<10;j++)k.box(0,top-1.9,outer-(j+.5)*.26,3.6,1.9-j*.19,.275,'trim');
    // The radial cut is wider than the treads. Solid stepped shoulders bridge
    // that strip to the retaining stone; railing rods alone leave open sky below.
    k.mark('retained-forge-stair-shoulders');
    for(let j=0;j<10;j++)for(const side of[-1,1]){
     const front=outer-j*.26,back=front-.26,upper=top-j*.19,foot=-9.6;
     let plan=[[1.8,front],[front*Math.tan(gap)+.05,front],[back*Math.tan(gap)+.05,back],[1.8,back]].map(([x,z])=>[side*x,z]);if(side<0)plan.reverse();
     const up=plan.map(([x,z])=>[x,upper,z]),down=plan.map(([x,z])=>[x,foot,z]);k.quad(...up,'wall');k.quad(down[3],down[2],down[1],down[0],'wall');
     for(let q=0;q<4;q++){const n=(q+1)%4;k.quad(down[q],down[n],up[n],up[q],'wall');}
    }
    for(const s of[-1,1]){k.beam([s*1.9,top+.85,outer],[s*1.9,top-1.05,inner],.075,'metal',6,true);for(let j=0;j<=5;j++)k.box(s*1.9,top-j*.38,outer-j*.52,.09,.83,.09,'metal');}
    const rad=inner+.38,segments=24;
    for(let j=0;j<segments;j++){const a=gap+(TAU-gap*2)*j/segments,b=gap+(TAU-gap*2)*(j+1)/segments;
     k.beam([Math.sin(a)*rad,top+.85,Math.cos(a)*rad],[Math.sin(b)*rad,top+.85,Math.cos(b)*rad],.075,'metal',5,true);
     k.box(Math.sin(a)*rad,top,Math.cos(a)*rad,.09,.83,.09,'metal');
    }
   }
   // A crane is seated in the bedrock and reaches the working floor.
   k.column(-9,-3.8,-5,.48,8,'wall',8);k.beam([-9,4.2,-5],[-3.8,4.2,-1.5],.27,'wood',4,true);
   k.beam([-9,1.2,-5],[-4.5,4.2,-2],.18,'wood',4,true);k.beam([-3.8,4.2,-1.5],[-3.8,-5,-1.5],.06,'metal',6,true);k.ring(-3.8,-5,-1.5,.36,.09,'metal','xy',12);
  });
  k.part('lamp-rim','The masonry rim and industrial lamp standards','ornament',()=>{
   for(let j=1;j<16;j++){const a=j*TAU/16,x=Math.sin(a)*17.05,z=Math.cos(a)*17.05;
    k.box(x,-1.9,z,.7,2.05,.7,'wall');k.column(x,.15,z,.19,2.1,'metal',6);k.crystal(x,2.25,z,.30,.8);
   }
   for(const s of[-1,1]){k.box(s*2.9,-1.9,17,1.3,2.15,1.4,'wall');k.box(s*2.9,.25,17,1.55,.22,1.6,'trim');}
  });
  // Follow the actual outer retaining wall facets. The closing edge crosses the
  // level entrance tread, leaving every descending tread inside the excavation.
  const gap=Math.asin(2.25/14.4);
  return {...k.finish(),groundY:0,excavation:{
   outline:Array.from({length:37},(_,j)=>{const a=gap+(TAU-gap*2)*j/36;return[Math.sin(a)*17,Math.cos(a)*17]}).reverse(),floorY:-9.8,entrance:[0,17.13]
  }};
 }
 function gildedPalace(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#e3d8be',trim:'#f5e8c8',roof:'#587e79',metal:'#c8a14f',wood:'#76573c',dark:'#3d4d4c'};
  k.part('court-of-honour','The court of honour and paired ceremonial stair','foundation',()=>{
   k.terrace(0,0,0,36,34,1.5);k.terrace(0,1.5,-6,24,18,1.2);stair(k,0,0,16,10,7,1.5/7,.46);
   k.pool(0,1.6,8,11,6.5);for(const s of[-1,1]){k.garden(s*12,1.6,8,6,8);stair(k,s*5.5,1.5,2.8,3.3,6,.2,.38);}
  });
  k.part('gilded-ranges','A seated gold crown over articulated palace ranges','architecture',()=>{
   k.mark('seated-gilded-roof');
   // A single gold roof sits directly on the cornice. The previous second roof
   // hovered above a complete blue roof with no supporting attic or drum.
   k.hall(0,2.7,-11,17,8,11,{roof:'hip',roofHeight:4.6,roofMaterial:'metal',entrance:false});
   for(const s of[-1,1]){
    k.hall(s*12.5,1.5,-3,5.6,15,7.6,{roof:'hip',roofHeight:3.2,entrance:false});
    k.hall(s*12.5,1.5,4.8,6.5,4.5,9,{roof:'hip',roofHeight:2.7,roofMaterial:'metal',entrance:false});
    k.tower(s*8.4,2.7,-11,1.5,15,'dome');
    k.transform(s*9,1.5,-2,Math.PI/2,1,()=>{
     for(const z of[-.9,.9])for(let j=0;j<5;j++)k.column((j-2)*2.35,0,z,.20,3.3,'wall',8);
     k.box(0,3.3,0,10.7,.30,2.5,'trim');k.roof(0,3.6,0,10.7,2.5,1.1,'metal','hip');
    });
   }
   // Raised lantern: a solid drum, actual open windows and its own small crown.
   k.box(0,17.2,-11,3.2,2.7,3.2,'wall');k.box(0,19.7,-11,3.6,.3,3.6,'trim');
   for(let j=0;j<4;j++){const a=j*TAU/4;k.window(-Math.sin(a)*1.63,17.9,-11+Math.cos(a)*1.63,1.2,1.4,a);}
   k.using('roof',()=>{k.dome(0,20,-11,2.1,1.9,'metal');k.cone(0,22,-11,.3,1.5,'metal',0,8);});
  });
  k.part('gold-front','The double-height ceremonial loggia and balcony','architecture',()=>{
   k.mark('supported-palace-loggia');
   k.box(0,2.65,-4.85,15.7,.25,4.3,'trim');
   for(const x of[-6,-3,3,6]){k.column(x,2.9,-3.55,.47,5.4,'wall',12);k.column(x,2.9,-6.15,.36,5.4,'wall',10);}
   k.arch(0,2.9,-3.55,4.6,5.1,.55,'trim');
   k.box(0,8.3,-4.85,15.6,.38,4.0,'trim');k.box(0,8.68,-4.85,15.9,.18,4.25,'metal');
   for(const x of[-6,-3,0,3,6]){k.column(x,8.86,-3.6,.25,3.05,'wall',8);k.box(x,11.8,-4.9,.35,.3,2.8,'trim');}
   k.box(0,11.9,-4.85,15.4,.28,3.9,'trim');k.roof(0,12.18,-4.85,15.7,4.1,1.7,'metal','hip');
   for(const x of[-6.5,-4.8,-3.1,3.1,4.8,6.5])k.column(x,8.86,-2.76,.075,.90,'trim',6);
   for(const s of[-1,1])k.box(s*4.8,9.77,-2.76,4.6,.14,.24,'trim');
   pointed(k,0,2.9,-6.79,3.3,5.0,.65);k.box(0,2.9,-6.96,3.15,3.6,.12,'wood');
   for(const s of[-1,1])k.box(s*.20,4.4,-6.86,.06,.42,.07,'metal');
   k.window(0,9.05,-6.96,2.5,2.25);k.emblem(0,10.05,-2.71,.70);
  });
  k.part('processional','The sculpted processional walk and court railings','ornament',()=>{
   for(const s of[-1,1])for(const z of[4,9,13]){k.box(s*7.4,1.5,z,1.35,.36,1.35,'trim');statue(k,s*7.4,1.86,z,3.0);}
   for(const s of[-1,1]){k.banner(s*10,1.5,15,4.6);k.rail(s*16,5,s*16,13,1.6,'metal');}
   k.fountain(0,1.6,8,1.4);
  });
  return k.finish();
 }
 return {'dread-keep':dreadKeep,'deep-city':deepCity,'dragon-court':dragonCourt,'forge-hollow':forgeHollow,'gilded-palace':gildedPalace};
}
