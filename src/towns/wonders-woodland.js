/** Individually authored wonder assemblies; shared construction vocabulary is injected by SacredCityKit. */
function createWoodlandWonders({TAU,palette,stair,statue,path,lancet,pointed,stoneRing}){
 // A walk is a closed, load-bearing deck, with rails following the same slope.
 function canopyWalk(k,a,b,width=1.5){
  const dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2;
  const A=[a[0]+nx,a[1],a[2]+nz],B=[b[0]+nx,b[1],b[2]+nz],C=[b[0]-nx,b[1],b[2]-nz],D=[a[0]-nx,a[1],a[2]-nz],down=p=>[p[0],p[1]-.24,p[2]];
  k.quad(A,B,C,D,'wood');k.quad(down(D),down(C),down(B),down(A),'wood');
  for(const [p,q]of[[A,B],[B,C],[C,D],[D,A]])k.quad(p,down(p),down(q),q,'wood');
  for(const [p,q]of[[A,B],[D,C]]){k.beam([p[0],p[1]+.88,p[2]],[q[0],q[1]+.88,q[2]],.065,'wood',5,true);k.beam([p[0],p[1]-.15,p[2]],[q[0],q[1]-.15,q[2]],.14,'wood',6,true);
   const n=Math.ceil(len/.8);for(let j=0;j<=n;j++){const t=j/n,P=p.map((v,i)=>v+(q[i]-v)*t);k.beam(P,[P[0],P[1]+.88,P[2]],.045,'wood',4,true);}}
  if(k.lod>0)for(let j=1;j<Math.ceil(len/.6);j++){const t=j/Math.ceil(len/.6),P=A.map((v,i)=>v+(B[i]-v)*t),Q=D.map((v,i)=>v+(C[i]-v)*t);k.beam([P[0],P[1]+.018,P[2]],[Q[0],Q[1]+.018,Q[2]],.018,'trim',4,true);}
 }
 function timberBay(k,x,y,z,w,h,angle=0){k.transform(x,y,z,angle,1,()=>{
  for(const s of[-1,1]){k.box(s*w/2,0,0,.26,h,.28,'wood');k.box(s*w/2,h-.14,0,.44,.20,.38,'trim');k.beam([s*w/2,h-1.2,0],[s*(w/2-.8),h,0],.12,'wood',5,true);}
  k.box(0,h,0,w+.45,.22,.36,'wood');
 });}
 function roundRail(k,x,y,z,r,seg=16,gaps=[]){for(let j=0;j<seg;j++){const a=j/seg*TAU,b=(j+1)/seg*TAU,mid=(a+b)/2;
  if(gaps.some(g=>Math.abs(Math.atan2(Math.sin(mid-g),Math.cos(mid-g)))<Math.asin(Math.min(.95,1.05/r))+Math.PI/seg*.5))continue;
  k.beam([x+Math.cos(a)*r,y+.8,z+Math.sin(a)*r],[x+Math.cos(b)*r,y+.8,z+Math.sin(b)*r],.055,'wood',4,true);k.cylinder(x+Math.cos(a)*r,y,z+Math.sin(a)*r,.045,.8,'wood',5);}}
 function groveSanctuary(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'leaf'},options);k.palette={...palette(recipe),wall:'#cbd1ae',trim:'#d9c99d',roof:'#3d7461',wood:'#765339',leaf:'#466d49'};
  const halls=[[0,-8,17,2.5],[-10.5,1,13,2.0],[10.5,1,13,2.0],[-6,10,10,1.7],[6,10,10,1.7]];
  const walks=[],openings=halls.map(()=>[Math.PI/2]);
  const crossing=(hall,A,B)=>{const dx=B[0]-A[0],dz=B[2]-A[2],x=A[0]-hall[0],z=A[2]-hall[1],r=hall[3]*2.75-.08,a=dx*dx+dz*dz,b=2*(x*dx+z*dz),c=x*x+z*z-r*r,t=(-b+Math.sqrt(Math.max(0,b*b-4*a*c)))/(2*a);return Math.atan2(z+dz*t,x+dx*t);};
  for(const [ia,ib]of[[0,1],[0,2],[1,3],[2,4],[3,4]]){const a=halls[ia],b=halls[ib],L=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/L,uz=(b[1]-a[1])/L,ar=a[3]*2.4,br=b[3]*2.4;
   const A=[a[0]+ux*ar,2.5+a[2],a[1]+uz*ar],B=[b[0]-ux*br,2.5+b[2],b[1]-uz*br],M=Math.abs(A[1]-B[1])>1?[(A[0]+B[0])/2-uz*4,(A[1]+B[1])/2,(A[2]+B[2])/2+ux*4]:null;
   walks.push(M?[A,M,B]:[A,B]);openings[ia].push(crossing(a,A,M||B));openings[ib].push(crossing(b,B,M||A));
  }
  k.part('root-court','The root court and still water','foundation',()=>{
   k.terrace(0,0,0,34,34,1.1);k.terrace(0,1.1,-2,26,24,.9);k.pool(0,2,7,17,11);stair(k,0,1.1,13,7,7,.157,.42);
   for(const s of[-1,1])for(const z of[-9,-2,5])k.hedge(s*12.5,2,z,2.4,5.2);
  });
  k.part('bearing-trees','Branch collars carrying the canopy halls','architecture',()=>{
   k.mark('branch-supported-canopy-hall');
   for(const [hallIndex,[x,z,h,r]]of halls.entries()){
    const floor=2+h+.5,room=r*2.15,deck=r*2.75;
    k.lathe(x,2,z,[[0,0],[r*1.25,0],[r,h*.2],[r*.80,h*.7],[r*.68,h],[0,h]],'wood',12);
    for(let j=0;j<8;j++){const a=j*TAU/8+.15,dir=d=>[x+Math.cos(a)*d,z+Math.sin(a)*d];
     const root=dir(r*2.1),base=dir(r*.85),tip=dir(deck*.93);
     k.beam([root[0],2.05,root[1]],[base[0],2+h*.24,base[1]],r*.22,'wood',6,true);
     k.beam([base[0],2+h*.64,base[1]],[tip[0],floor-.30,tip[1]],r*.18,'wood',6,true);
    }
    k.cylinder(x,floor-.5,z,deck,.5,'wood',16);k.cylinder(x,floor,z,room,r*1.9,'wall',16);
    k.lathe(x,floor-.12,z,[[deck-.10,0],[deck+.10,0],[deck+.10,.18],[deck-.10,.18],[deck-.10,0]],'trim',16);
    roundRail(k,x,floor,z,deck-.08,24,openings[hallIndex]);
    for(let j=0;j<8;j++){const a=j*TAU/8,xx=x+Math.cos(a)*(room+.03),zz=z+Math.sin(a)*(room+.03);
     k.window(xx,floor+.7,zz,r*.70,r*1.15,a-Math.PI/2,'lattice');
     const post=a+TAU/16;k.beam([x+Math.cos(post)*room,floor,z+Math.sin(post)*room],[x+Math.cos(post)*room,floor+r*1.9,z+Math.sin(post)*room],.13,'wood',6,true);
    }
    k.mark('layered-leaf-canopy');k.using('roof',()=>{
     const base=floor+r*1.9,roofH=r*3.0,rr=r*3.05;
     k.lathe(x,base,z,[[0,-.12],[rr,-.12],[rr,.05],[rr*.83,roofH*.20],[rr*.66,roofH*.58],[rr*.28,roofH*.90],[0,roofH]],'roof',16);
     for(let tier=1;tier<=2;tier++){const yy=roofH*(tier===1?.2:.58),rad=rr*(tier===1?.83:.66);k.lathe(x,base+yy,z,[[rad-.09,0],[rad+.14,0],[rad+.14,.15],[rad-.09,.15],[rad-.09,0]],'wood',16);}
     for(let j=0;j<8;j++){const a=j*TAU/8;path(k,[[x+Math.cos(a)*rr,base+.06,z+Math.sin(a)*rr],[x+Math.cos(a)*rr*.83,base+roofH*.20+.07,z+Math.sin(a)*rr*.83],[x+Math.cos(a)*rr*.66,base+roofH*.58+.07,z+Math.sin(a)*rr*.66],[x,base+roofH,z]],.065,'trim',4);}
     k.cone(x,base+roofH,z,.20,1.1,'metal',0,6);
    });
   }
  });
  k.part('canopy-circulation','Railed canopy walks and a winding tree stair','architecture',()=>{
   k.mark('floor-level-canopy-walk');
   for(const walk of walks){if(walk.length===3){const M=walk[1];k.box(M[0],M[1]-.24,M[2],1.75,.24,1.75,'wood');}for(let j=1;j<walk.length;j++)canopyWalk(k,walk[j-1],walk[j]);}
   k.mark('trunk-carried-spiral-stair');
   const n=42,r=4.2,step=17.5/n;let prior=null;
   for(let j=0;j<n;j++){const a=-Math.PI/2+j*TAU*1.5/(n-1),x=Math.cos(a)*r,z=-8+Math.sin(a)*r,y=2+(j+1)*step;
    k.box(x,y-step,z,1.5,step,1.30,'wood',a);k.beam([Math.cos(a)*1.8,y-.22,-8+Math.sin(a)*1.8],[x,y-.22,z],.09,'wood',5,true);
    const P=[Math.cos(a)*(r+.72),y+.8,-8+Math.sin(a)*(r+.72)];k.beam([P[0],y,P[2]],P,.05,'wood',4,true);if(prior)k.beam(prior,P,.055,'wood',4,true);prior=P;
   }
  });
  k.part('leaf-crown','The living grove behind the halls','ornament',()=>{
   for(const s of[-1,1])k.tree(s*14,2,-13,15,'broad');k.emblem(0,7.5,12.5,1.1);for(const s of[-1,1])k.banner(s*7,2,12.5,4.2);
  });return k.finish();
 }
 function reedThrone(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'northern'},options);k.palette={...palette(recipe),wall:'#ccb991',trim:'#e1c799',roof:'#998152',wood:'#71543c'};
  k.part('piling-field','Braced piling field and joined plank deck','foundation',()=>{
   k.mark('cross-braced-tidal-pilings');
   for(let x=-15;x<=15;x+=3)for(let z=-12;z<=12;z+=4)k.cylinder(x,-2.5,z,.24,5.2,'wood',8);
   for(const z of[-12,12])for(let x=-15;x<15;x+=3){k.beam([x,-1.7,z],[x+3,2.4,z],.12,'wood',5,true);k.beam([x+3,-1.7,z],[x,2.4,z],.12,'wood',5,true);}
   for(const s of[-1,1])for(let z=-12;z<12;z+=4)k.beam([s*15,-1.5,z],[s*15,2.4,z+4],.13,'wood',5,true);
   for(const z of[-12,-4,4,12])k.box(0,2.4,z,31,.3,.45,'wood');k.box(0,2.7,0,32,.5,28,'wood');
   if(k.lod>0)for(let x=-15.2;x<16;x+=.8)k.box(x,3.205,0,.025,.025,27.6,'trim');
   k.rail(-15,13.5,-3.2,13.5,3.2,'wood');k.rail(3.2,13.5,15,13.5,3.2,'wood');k.rail(-15,-13.5,15,-13.5,3.2,'wood');
   for(const s of[-1,1])k.rail(s*15,-13.5,s*15,1,3.2,'wood');
  });
  k.part('reed-hall','Framed reed hall and seated roof lantern','architecture',()=>{
   k.mark('timber-reed-screen-hall');
   k.box(0,3.2,-5,15.4,.25,12.4,'wood');k.box(0,3.45,-5,15,6.95,12,'wall');k.box(0,10.18,-5,15.5,.22,12.5,'wood');
   for(const s of[-1,1]){
    for(const z of[-9,-5,-1]){k.window(s*7.53,4.3,z,2.45,3.3,s>0?-Math.PI/2:Math.PI/2,'lattice');k.window(s*7.53,8.5,z,2.45,1.10,s>0?-Math.PI/2:Math.PI/2,'lattice');}
    k.box(s*7.55,8.15,-5,.18,.20,12,'wood');
    for(const x of[-5,-2.5,2.5,5])k.window(x,8.5,-5+s*6.035,1.6,1.10,s>0?0:Math.PI,'lattice');
    for(const x of[-5,5])k.window(x,4.25,-5+s*6.035,2.55,3.4,s>0?0:Math.PI,'lattice');
    for(const x of[-7.25,-3.3,3.3,7.25])k.box(x,3.45,-5+s*6.08,.27,6.75,.28,'wood');
    k.box(0,8.15,-5+s*6.08,15,.20,.28,'wood');
   }
   k.box(0,3.45,1.10,3.35,4.6,.14,'dark');for(const s of[-1,1]){k.box(s*1.62,3.45,1.23,.22,4.65,.32,'wood');k.box(s*.8,3.45,1.23,1.46,4.30,.14,'wood');}
   k.box(0,8.10,1.22,3.7,.25,.38,'wood');k.box(0,3.35,1.45,3.9,.17,.85,'wood');k.box(0,3.45,1.32,.09,4.35,.10,'metal');
   if(k.lod>0)for(const s of[-1,1])for(const z of[-9,-5,-1])for(let q=0;q<5;q++)k.box(s*7.58,4.55+q*.55,z,.09,.045,2.45,'wood');
   const ridge=10.4+7.8*k.recipe.roofPitch,seat=ridge+.3;k.roof(0,10.4,-5,15.4,12.4,ridge-10.4,'roof','northern');k.mark('reed-hall-knee-braced-bays');
   for(const s of[-1,1])for(const z of[-10,-6,-2]){timberBay(k,s*7.60,3.45,z,3.6,6.6,Math.PI/2);k.box(s*7.6,3.2,z,.65,.45,.75,'trim');}
   for(const s of[-1,1]){k.box(s*6.3,3.2,1.15,.38,7.2,.42,'wood');k.beam([s*6.3,10.4,1.15],[0,ridge,1.15],.19,'wood',6,true);k.beam([s*6.3,10.4,1.15],[0,13.2,1.15],.13,'wood',5,true);}
   k.mark('seated-reed-roof-lantern');k.using('roof',()=>{k.box(0,ridge-2.1,-5,5.1,2.4,4.6,'wood');k.box(0,seat-.20,-5,5.6,.20,5.0,'trim');
   for(const x of[-2.35,2.35])for(const z of[-6.9,-3.1])k.column(x,seat,z,.18,2.2,'wood',8);
   for(const z of[-7.0,-3.0]){k.box(0,seat+2.15,z,5.6,.25,.30,'wood');k.rail(-2.35,z,2.35,z,seat,'wood');}
   k.roof(0,seat+2.4,-5,6.2,5.2,3.4,'roof','northern');k.using('roof',()=>k.cone(0,seat+5.8,-5,.48,1.8,'metal',0,8));});
  });
  k.part('landing-wings','Covered entry landing and boat wings','architecture',()=>{
   k.mark('covered-reed-landing');
   for(const s of[-1,1]){k.hall(s*11,3.2,5,5.4,10,4.2,{roof:'northern',roofHeight:3.2,entrance:false});
    k.box(s*15.5,2.8,7,3.4,.4,12,'wood');for(const z of[3,8,13]){k.cylinder(s*16.8,-2.5,z,.23,5.7,'wood',8);k.box(s*16.8,3.2,z,.45,.18,.45,'trim');}
    k.rail(s*16.8,2,s*16.8,13,3.2,'wood');
   }
   k.box(0,2.7,11.4,5.4,.5,6,'wood');
   for(const z of[8.6,13.7]){timberBay(k,0,3.2,z,4.5,4.0);for(const s of[-1,1])k.cylinder(s*2.25,-2.5,z,.22,5.7,'wood',8);}
   k.roof(0,7.42,11.4,5.5,6.1,2.7,'roof','northern');
   stair(k,0,-.5,17.4,4.6,9,3.7/9,.34);k.box(0,3.12,14,4.6,.08,.75,'wood');
  });
  k.part('reed-crown','Bundled reed screens and hall standard','ornament',()=>{
   k.mark('woven-reed-wind-screens');
   for(const s of[-1,1])for(const z of[2,5,8]){for(let j=0;j<7;j++)k.cylinder(s*13.84,3.65,z+(j-3)*.23,.045,2.4+(j%3)*.18,'wood',5);for(const y of[4.1,5.25])k.box(s*13.84,y,z,.13,.11,1.7,'trim');}
   k.emblem(0,12.4,1.4,1.1);for(const s of[-1,1])k.banner(s*6,3.2,12,4);
  });return k.finish();
 }
 function whaleMoot(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'northern'},options);k.palette={...palette(recipe),wall:'#a7aaa3',trim:'#e1dcc1',roof:'#54696b',wood:'#6d6458'};
  const vaultPoint=(z,t)=>{const taper=1-Math.abs(z+1.2)/14*.17;return[Math.sin(t)*8.6*taper,1.95+Math.cos(t)*12.4*taper,z];};
  k.part('shore-terrace','The shore terrace and supported slipway','foundation',()=>{
   k.terrace(0,0,-4,34,22,1.6);stair(k,0,0,10,9,7,.229,.5);k.mark('pile-supported-moot-slipway');
   k.box(0,-.4,15,9,.4,14,'wood');for(const s of[-1,1])for(const z of[10,15,20]){k.cylinder(s*3.8,-2,z,.25,2.6,'wood',8);k.box(s*3.8,0,z,.45,.3,.45,'wood');}
   for(const s of[-1,1]){k.beam([s*3.8,-1.8,10],[s*3.8,-.2,15],.14,'wood',5,true);k.beam([s*3.8,-1.8,15],[s*3.8,-.2,20],.14,'wood',5,true);k.rail(s*4.1,11,s*4.1,21,.05,'wood');}
  });
  k.part('rib-vault','Curved whale ribs and a continuous hull roof','architecture',()=>{
   k.mark('curved-whalebone-rib-vault');
   const n=k.lod>0?16:10;
   for(let j=0;j<9;j++){const z=-12+j*2.7,pts=[];for(let u=0;u<=n;u++)pts.push(vaultPoint(z,-Math.PI/2+u*Math.PI/n));path(k,pts,.29,'trim',6);
    for(const s of[-1,1]){const P=vaultPoint(z,s*Math.PI/2);k.box(P[0],1.6,z,.95,.65,.85,'trim');k.box(P[0],2.08,z,.68,.18,.64,'wood');}
   }
   k.mark('weatherproof-hull-shell');k.using('roof',()=>{
    // Open eaves expose the bone ribs; the curved shell is closed with an inner soffit.
    const sections=12;
    for(let j=0;j<8;j++){const za=-12+j*2.7,zb=za+2.7;for(let u=0;u<sections;u++){
     const ta=-1.38+u*2.76/sections,tb=ta+2.76/sections,P=(z,t,offset)=>{const p=vaultPoint(z,t);return[p[0]+Math.sin(t)*offset,p[1]+Math.cos(t)*offset,p[2]];};
     k.quad(P(za,ta,.12),P(zb,ta,.12),P(zb,tb,.12),P(za,tb,.12),'roof');k.quad(P(za,tb,-.09),P(zb,tb,-.09),P(zb,ta,-.09),P(za,ta,-.09),'wood');
     if(j===0)k.quad(P(za,ta,-.09),P(za,ta,.12),P(za,tb,.12),P(za,tb,-.09),'wood');
     if(j===7)k.quad(P(zb,tb,-.09),P(zb,tb,.12),P(zb,ta,.12),P(zb,ta,-.09),'wood');
     if(u===0)k.quad(P(za,ta,-.09),P(zb,ta,-.09),P(zb,ta,.12),P(za,ta,.12),'wood');
     if(u===sections-1)k.quad(P(za,tb,.12),P(zb,tb,.12),P(zb,tb,-.09),P(za,tb,-.09),'wood');
    }}
    for(const t of[-1.34,-.82,0,.82,1.34]){const pts=[];for(let j=0;j<9;j++){const p=vaultPoint(-12+j*2.7,t);pts.push([p[0]+Math.sin(t)*.2,p[1]+Math.cos(t)*.2,p[2]]);}path(k,pts,t===0?.17:.075,'wood',5);}
   });
  });
  k.part('moot-floor','Sheltered moot dais and tiered benches','architecture',()=>{
   k.mark('tiered-moot-assembly');k.box(0,1.6,-1,14,.2,21,'wood');k.terrace(0,1.8,-8,8,5,.5);
   k.box(0,2.3,-9,2,.65,1.8,'wood');k.box(0,2.95,-9.7,2,1.8,.30,'wood');k.emblem(0,4.2,-9.49,.7);
   k.pool(0,1.82,1,2.5,3.0);k.lathe(0,2.13,1,[[0,0],[.85,0],[1.0,.35],[.85,.6],[0,.6]],'metal',12);
   for(const s of[-1,1])for(let row=0;row<2;row++){const x=s*(3.5+row*1.7);for(const z of[-3.5,0,3.5]){k.box(x,1.8,z,1.25,.35+row*.25,2.7,'wood');k.box(x+s*.55,2.12+row*.25,z,.13,.7,2.7,'wood');}}
   for(const s of[-1,1])k.hall(s*11.5,1.6,0,4.2,9,3.4,{roof:'northern',entrance:false});
  });
  k.part('prow-portal','Carved whale-prow portal and screen','architecture',()=>{
   k.mark('carved-whale-prow-portal');
   const z=9.75;for(const s of[-1,1]){path(k,[[s*7.1,1.6,z],[s*5.7,6.4,z],[s*2.5,11.1,z],[0,12.85,z]],.36,'wood',7);k.column(s*2.2,1.8,z,.22,5.1,'wood',8);k.beam([s*2.2,6.7,z],[0,9.1,z],.20,'wood',6,true);}
   k.box(0,6.7,z,4.9,.28,.45,'wood');stoneRing(k,0,10.1,z+.15,.72,.20,.28,'trim',16);
   k.using('roof',()=>{path(k,[[0,12.9,z],[0,14.5,z+.8],[0,16.8,z+1.6],[0,18.9,z+1.5]],.25,'wood',7);for(const s of[-1,1])path(k,[[0,18.8,z+1.5],[s*1.6,19.6,z+1.6],[s*2.6,20.8,z+1.5]],.23,'trim',6);});
   for(const s of[-1,1])for(const zz of[-12,-6,0,6])k.rock(s*14.7,1.6,zz,1.0,3.4,1.1,7,'wall');
  });return k.finish();
 }
 function pagodaEave(k,y,r,h){
  k.using('roof',()=>{
   const rr=r+1.7,seg=16,profile=[[0,-.15],[rr,-.15],[rr,.08],[rr*.85,.10],[r*.96,h*.32],[r*.61,h],[0,h]];k.lathe(0,y,0,profile,'roof',seg);
   k.lathe(0,y-.19,0,[[rr-.12,0],[rr+.04,0],[rr+.04,.21],[rr-.12,.21],[rr-.12,0]],'wood',seg);
   for(let q=0;q<8;q++){const a=q*TAU/8,pts=[[rr,y+.09],[rr*.85,y+.13],[r*.96,y+h*.32+.04],[r*.61,y+h+.04]].map(([R,Y])=>[Math.cos(a)*R,Y,Math.sin(a)*R]);path(k,pts,.055,'trim',4);}
  });
 }
 function waterPagoda(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'leaf'},options);k.palette={...palette(recipe),wall:'#ded0aa',trim:'#e6d5a7',roof:'#3c7670',wood:'#935c45',metal:'#b7914a'};
  k.part('flooded-terraces','Founded water terraces and continuous dry stair','foundation',()=>{
   k.mark('founded-water-pagoda-plinth');k.terrace(0,0,-7,30,14,5.6);k.terrace(0,0,-.8,16,14.4,7);
   // Split the forward plinth and every water terrace around the stair. A solid
   // platform across the centre would bury the first treads beneath its coping.
   for(const s of[-1,1]){k.box(s*5.2,0,7.1,6.4,7,1.4,'wall');k.box(s*5.2,6.88,7.1,6.4,.12,1.4,'trim');}
   for(let t=0;t<4;t++){const top=1.4*(t+1),z=12-t*3.4,w=34-t*4;
    for(const s of[-1,1]){k.terrace(s*(w+4)/4,0,z,(w-4)/2,3.4,top);
     const poolW=t<2?w*.5-3.2:Math.max(2,w*.5-9),poolX=t<2?w*.25+.75:8.5+poolW/2;
     k.pool(s*poolX,top+.08,t===1?z+.35:z,poolW,2.25);
    }
   }
   k.mark('continuous-dry-water-stair');k.mark('connected-grand-stair');
   for(let j=0;j<20;j++){const top=(j+1)*.28,z=14.2-j*.28;k.box(0,0,z,3.5,top,.32,'trim');for(const s of[-1,1])k.box(s*1.94,0,z,.28,top+.6,.33,'wall');}
   k.box(0,0,7.65,3.5,5.6,2.4,'wall');k.box(0,5.45,8.6,3.5,.15,.70,'trim');stair(k,0,5.6,8.3,3.5,5,.28,.40);
   for(const s of[-1,1]){k.rail(s*14.6,-13,s*14.6,3.5,5.6,'wood');k.rail(s*14.6,-13,s*8,-13,5.6,'wood');}
  });
  k.part('stacked-eaves','Seven bracketed storeys with curved eaves','architecture',()=>{
   k.mark('bracket-carried-pagoda-eaves');
   for(let j=0;j<7;j++){const y=7+j*4.1,r=6.4-j*.62;
    k.cylinder(0,y,0,r,3.1,'wall',16);if(j<6){k.mark('continuous-pagoda-core');k.cylinder(0,y+3.1,0,r-.64,1.0,'wall',16);}k.cylinder(0,y,0,r+.16,.20,'trim',16);k.cylinder(0,y+2.9,0,r+.2,.2,'wood',16);
    for(let q=0;q<8;q++){const a=q*TAU/8,xx=Math.cos(a),zz=Math.sin(a);k.window(xx*(r+.035),y+.55,zz*(r+.035),Math.min(1.35,r*.42),1.9,a-Math.PI/2,'lattice');
     k.transform(xx*(r-.1),y+2.35,zz*(r-.1),a-Math.PI/2,1,()=>{k.box(0,0,.24,.26,.55,.75,'wood');k.box(0,.40,.51,.48,.17,1.4,'trim');k.beam([0,-.28,0],[0,.45,1.22],.09,'wood',5,true);});
    }
    pagodaEave(k,y+3.1,r,1.9);
   }
   k.mark('pagoda-finial-lantern');k.using('roof',()=>{k.lathe(0,35.5,0,[[0,0],[1.5,0],[1.5,.25],[.8,.7],[.8,2.5],[.55,2.7],[0,3.8]],'metal',12);for(let j=0;j<4;j++)k.ring(0,36+j*.6,0,1.15-j*.14,.07,'trim','xz',16);k.crystal(0,39.3,0,.5,1.8);});
  });
  k.part('sluice-court','Founded cloisters and lower-storey entrance','architecture',()=>{
   for(const s of[-1,1]){k.hall(s*11,5.6,-6,5,9,4.4,{roof:'leaf',roofHeight:3,entrance:false});k.arcade(s*7.6,5.6,-6,5,1.7,2.6,Math.PI/2);}
   k.mark('pagoda-processional-door');k.box(0,5.6,6.7,3.7,1.4,.70,'trim');k.archedPanel(0,7.2,6.47,2.5,2.5,.14,'wood');k.arch(0,7.2,6.6,2.5,2.5,.36,'trim');
   for(const s of[-1,1])k.box(s*.55,7.65,6.70,.10,.25,.10,'metal');
  });
  k.part('water-stair','Sluice bridges and water guardians','ornament',()=>{
   k.mark('carved-sluice-outlets');for(const s of[-1,1])for(let t=0;t<3;t++){const y=1.4*(t+1),z=10.2-t*3.4;k.box(s*7.6,y-.65,z,.8,.60,.8,'trim');k.box(s*7.6,y-.52,z+.43,.42,.34,.08,'dark');k.box(s*7.6,y-.28,z+.64,.28,.08,.42,'water');}
   for(const s of[-1,1]){k.tree(s*12.5,5.6,1,5,'broad');k.banner(s*5.5,7,7,3.8);}
  });return k.finish();
 }
 function tidePalace(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'hip'},options);k.palette={...palette(recipe),wall:'#dfdac5',trim:'#f1e5c8',roof:'#578d83',wood:'#76624a',metal:'#ac985c'};
  k.part('walled-basin','The walled basin and continuous quay','foundation',()=>{
   k.terrace(0,0,-9,34,16,1.4);k.pool(0,.1,9,30,20);k.mark('continuous-palace-quays');
   for(const s of[-1,1]){k.box(s*15.8,0,9,2.6,2.6,20);k.box(s*15.8,2.6,9,3,.22,20.5,'trim');k.rail(s*14.5,1,s*14.5,18,2.82,'metal');
    for(const z of[3,8,13,18]){k.box(s*15.8,.3,z,2.85,.30,.45,'trim');k.box(s*14.28,1.55,z,.35,.65,.7,'trim');}
    for(let j=0;j<5;j++)k.box(s*10,1.4-j*.24,-.5+j*.62,4.6,.28,.64,'trim');
    k.box(s*10,.42,5.6,4.6,.25,8.7,'wood');for(const z of[2,6,10]){k.cylinder(s*12,.1,z,.20,1.05,'wood',8);k.cylinder(s*8,.1,z,.20,.56,'wood',8);}
   }
  });
  k.part('chancery-loggia','Two-storey waterfront loggia and chancery','architecture',()=>{
   k.hall(0,1.4,-14,16,7,9.5,{roof:'hip',roofHeight:3.8});
   k.mark('drummed-palace-cupola');k.cylinder(0,10.8,-14,3.6,4.4,'wall',16);for(let q=0;q<8;q++){const a=q*TAU/8;k.window(Math.cos(a)*3.62,14.0,-14+Math.sin(a)*3.62,.7,.85,a-Math.PI/2);}
   k.using('roof',()=>k.dome(0,15.2,-14,4.0,4.8,'metal'));
   for(const s of[-1,1]){k.hall(s*12.5,1.4,-7,4.6,11,5.6,{roof:'hip',roofHeight:2.8,entrance:false});
    k.box(s*8.5,1.4,-7,3.1,.28,12.5,'trim');k.arcade(s*8.4,1.68,-7,6,1.8,2.7,Math.PI/2);
    for(const z of[-12,-8,-4])k.column(s*8.4,4.73,z,.15,2.1,'wall',8);
    k.box(s*8.4,4.58,-7,1.6,.20,12.5,'trim');k.rail(s*7.85,-12.5,s*7.85,-1.5,4.78,'metal');k.box(s*8.4,6.83,-7,1.6,.20,12.5,'trim');
   }
   k.mark('inhabited-canal-front-loggia');
   for(const x of[-6.6,-4.4,-2.2,0,2.2,4.4,6.6]){k.arch(x,1.4,-4.5,1.75,3,.65,'wall');k.column(x+1.04,4.95,-4.5,.17,2.6,'wall',8);}
   k.box(0,4.58,-5.4,16.4,.35,3.3,'trim');k.box(0,7.55,-5.4,16.6,.35,3.5,'trim');k.rail(-7.7,-3.93,7.7,-3.93,4.93,'metal');
   k.using('roof',()=>k.roof(0,7.90,-5.4,16.8,3.5,1.4,'roof','hip'));
   for(const x of[-5.5,0,5.5]){k.arch(x,1.4,-10.3,2.0,3.1,.40,'trim');k.archedPanel(x,1.4,-10.5,1.9,3,.1,'wood');}
  });
  k.part('sea-gate','Pier-borne sea gate and connecting galleries','architecture',()=>{
   k.mark('pier-borne-sea-gate');
   for(const s of[-1,1]){k.tower(s*15,0,19.5,1.8,13,'dome');k.box(s*15,13,19.5,4.2,.5,4.2,'trim');
    k.box(s*5.05,0,19.5,2.5,8.6,3.0,'wall');k.box(s*5.05,.1,19.5,2.85,.45,3.3,'trim');
    k.arch(s*10,0,19.5,6.9,6.5,2.0,'wall');k.box(s*10,6.9,19.5,8.4,.50,2.5,'trim');k.rail(s*6.1,20.55,s*13.8,20.55,7.4,'metal');k.rail(s*6.1,18.45,s*13.8,18.45,7.4,'metal');
   }
   k.arch(0,0,19.5,7.4,7.8,2.5,'wall');k.box(0,8.20,19.5,12.5,.65,3.2,'trim');k.box(0,8.85,19.5,11.5,2.9,2.7,'wall');
   for(const x of[-3.2,0,3.2]){k.window(x,9.3,20.87,1.3,1.65);k.window(x,9.3,18.13,1.3,1.65,Math.PI);}
   k.using('roof',()=>k.roof(0,11.75,19.5,12.2,3.4,2.0,'roof','hip'));
   k.mark('tide-gate-lifting-gear');for(const s of[-1,1]){k.box(s*3.5,0,19.5,.18,7.6,.18,'metal');k.beam([s*3.5,7.6,19.7],[s*3.5,8.7,20.6],.055,'metal',5,true);}
   stoneRing(k,0,10.35,21.03,.82,.16,.22,'metal',20);
  });
  k.part('mooring-court','Bollards, navigation lights and court sculpture','ornament',()=>{
   k.mark('palace-mooring-furniture');for(const s of[-1,1]){statue(k,s*6.4,1.4,-3.4,3.2);for(const z of[2,6,10]){k.cylinder(s*12,.7,z,.15,.5,'metal',8);k.box(s*12,1.15,z,.55,.13,.17,'metal');}k.banner(s*9,1.4,-13,4.4);}
   k.fountain(0,1.5,-8,1.4);k.emblem(0,10.6,-10.3,1.2);
  });return k.finish();
 }
 return {'grove-sanctuary':groveSanctuary,'reed-throne':reedThrone,'whale-moot':whaleMoot,'water-pagoda':waterPagoda,'tide-palace':tidePalace};
}
