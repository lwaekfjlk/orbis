/** Individually authored wonder assemblies; shared construction vocabulary is injected by SacredCityKit. */
function createArcaneWonders({TAU,palette,stair,statue,path,lancet,pointed,stoneRing}){
 const annulus=(k,x,y,z,inside,outside,h,m='trim',n=32)=>k.lathe(x,y,z,[[inside,0],[outside,0],[outside,h],[inside,h],[inside,0]],m,n);
 // A solid wedge tread: neighboring sectors meet along their radial edges. These
 // are walkable helical stairs, rather than isolated rectangular floating tiles.
 function tread(k,a,b,innerA,outerA,innerB,outerB,y,h,m='trim'){
  const P=(a,r,Y)=>[Math.cos(a)*r,Y,Math.sin(a)*r],A=P(a,innerA,y),B=P(b,innerB,y),C=P(b,outerB,y),D=P(a,outerA,y),down=p=>[p[0],p[1]-h,p[2]];
  k.quad(A,B,C,D,m);k.quad(down(A),down(D),down(C),down(B),'wall');
  for(const [u,v]of[[A,D],[D,C],[C,B],[B,A]])k.quad(u,v,down(v),down(u),m);
 }
 function rimCourt(k,inner,half,y,h){
  const n=48,P=(a,r,Y)=>[Math.cos(a)*r,Y,Math.sin(a)*r],outer=a=>half/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));
  for(let j=0;j<n;j++){const a=j/n*TAU,b=(j+1)/n*TAU,A=P(a,inner,y+h),B=P(b,inner,y+h),C=P(b,outer(b),y+h),D=P(a,outer(a),y+h),down=p=>[p[0],y,p[2]];
   k.quad(A,B,C,D,'trim');k.quad(down(A),down(D),down(C),down(B),'wall');k.quad(A,down(A),down(B),B,'wall');k.quad(D,C,down(C),down(D),'wall');
  }
 }
 function fractured(k,y,r,height,invert=false){
  const n=16,ring=Array.from({length:n},(_,j)=>{const a=j/n*TAU,tip=y+(invert?-1:1)*(height*(.48+(j*7%5)*.13));return {a,tip}});
  for(let j=0;j<n;j++){const a=ring[j],b=ring[(j+1)%n],P=(q,rad,Y)=>[Math.cos(q.a)*rad,Y,Math.sin(q.a)*rad],A=P(a,r,y),B=P(b,r,y),C=P(b,r*.94,b.tip),D=P(a,r*.94,a.tip),inside=r*.62;
   const faces=[[A,B,C,D],[P(a,inside,y),P(a,inside,a.tip),P(b,inside,b.tip),P(b,inside,y)],[D,C,P(b,inside,b.tip),P(a,inside,a.tip)],[A,P(a,inside,y),P(b,inside,y),B]];
   for(let f=0;f<faces.length;f++){const q=faces[f];if(!invert)q.reverse();k.quad(...q,f===2?'dark':f===1?'wall':'trim')}
  }
 }
 function skyCrystal(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#a5b6cc',trim:'#e3e9e9',roof:'#47617e',metal:'#b4c1ca',water:'#6bc1db',dark:'#344d68'};
  k.part('resonator-drum','Four connected processional terraces','foundation',()=>{
   k.mark('connected-resonator-terraces');
   for(let j=0;j<4;j++){const r=17-j*1.6,y=j*1.5;k.lathe(0,y,0,[[0,0],[r,0],[r,1.30],[r+.16,1.36],[r+.16,1.50],[0,1.50]],'wall',32);annulus(k,0,y+1.35,0,r-.22,r+.17,.15,'trim');stair(k,0,y,r+1.8,7.0-j*.6,8,.1875,.28)}
   annulus(k,0,6.01,0,6.5,7.05,.13,'metal',32);annulus(k,0,6.01,0,3.1,3.55,.12,'metal',24);k.pool(0,6.02,0,5.2,5.2);
   if(k.lod>0)for(let j=0;j<8;j++){const a=j*TAU/8+.2;k.transform(Math.cos(a)*8.25,6.02,Math.sin(a)*8.25,a,1,()=>{k.box(0,0,0,2.0,.08,.26,'metal');k.box(0,.09,0,.24,.06,.68,'water')})}
  });
  k.part('suspension-ring','Eight jointed resonator buttresses','architecture',()=>{
   k.mark('jointed-resonator-buttress');
   for(let j=0;j<8;j++){const a=j*TAU/8+.2,P=(r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
    k.box(...P(10.5,6),2.3,.30,2.3,'trim',a);k.box(...P(10.5,6.30),1.72,2.80,1.72,'wall',a);
    k.box(...P(10.5,8.96),2.02,.40,2.02,'trim',a);
    k.beam(P(10.5,9.20),P(4.35,20.45),.61,'wall',6,true);
    k.beam(P(10.15,9.35),P(4.05,20.50),.11,'metal',4,true);
    k.box(...P(4.35,20.24),1.65,.46,1.55,'trim',a);
    if(k.lod>0){k.column(...P(10.5,9.36),.19,1.65,'metal',8);k.crystal(...P(10.5,11.01),.36,1.5);for(const yy of[12.5,16.0]){const r=10.5-(yy-9.2)/(20.45-9.2)*6.15;k.box(...P(r,yy),1.15,.24,1.44,'metal',a)}}
   }
   annulus(k,0,20.40,0,3.20,5.03,.58,'trim',32);annulus(k,0,20.90,0,3.16,5.10,.15,'metal',32);
   for(let j=0;j<8;j++){const a=j*TAU/8+.2,x=Math.cos(a)*3.65,z=Math.sin(a)*3.65;k.column(x,21.05,z,.19,2.0,'wall',8)}
   annulus(k,0,23.05,0,2.70,4.05,.27,'trim',32);annulus(k,0,23.32,0,2.66,4.11,.15,'metal',32);
  });
  k.part('suspended-stone','The eight-faceted suspended crystal','architecture',()=>{
   k.mark('unbound-crystal-gap');
   // One continuous faceted volume with a pointed underside. It starts above the
   // upper ring; neither a column nor an ornamental cable closes the magical gap.
   k.lathe(0,26.2,0,[[0,-1.9],[3.22,0],[4.6,2.7],[3.91,11.2],[0,15.5]],'water',8);
   if(k.lod>0)for(let j=0;j<8;j++){const a=j*TAU/8,P=(r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];k.beam(P(3.24,26.2),P(4.63,28.9),.045,'trim',4,true);k.beam(P(4.63,28.9),P(3.94,37.4),.045,'metal',4,true)}
   k.ring(0,31.8,0,5.1,.11,'metal','xy',32);k.ring(0,31.8,0,5.1,.09,'metal','yz',32);
  });
  k.part('observers','Grounded instrument galleries','architecture',()=>{
   k.mark('grounded-observer-gallery');
   for(const side of[-1,1]){
    const x=side*18.35;k.terrace(x,0,0,3.5,10.8,1.5);
    k.arcade(x,1.5,0,4,1.75,3.1,Math.PI/2);
    k.roof(x,4.96,0,3.25,10.3,1.1,'roof','gable');
    stair(k,x,0,6.95,2.3,8,.1875,.28);
    for(const z of[-3.5,0,3.5]){k.column(x-side*1.3,1.5,z,.15,3.15,'wall',8);k.box(x,1.50,z,1.0,.64,.82,'wall');k.ring(x,2.55,z,.45,.045,'metal','xy',12)}
    k.emblem(side*9,7.1,11,.7);
   }
   k.arch(0,0,19.4,4.2,4.8,.85,'trim');
  });
  return k.finish();
 }
 function suspendedTower(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#bbb2c3',trim:'#e7deda',roof:'#685b79',metal:'#b28674',dark:'#484158'};
  k.part('anchor-court','The anchor court and jointed counterweights','foundation',()=>{
   k.terrace(0,0,0,30,30,1.3);annulus(k,0,1.31,0,10.7,11.2,.12,'metal',32);stair(k,0,0,16.4,7,7,1.3/7,.28);
   for(let j=0;j<4;j++){const a=j*TAU/4+.79,x=Math.cos(a)*12.5,z=Math.sin(a)*12.5;k.terrace(x,1.3,z,3.8,3.8,.30);k.box(x,1.6,z,2.8,3.45,2.8,'wall');k.box(x,4.91,z,3.35,.28,3.35,'trim');k.box(x,5.2,z,2.90,.32,2.90,'metal');k.crystal(x,5.52,z,.66,2.35);for(const s of[-1,1])k.box(x+s*1.3,1.6,z,.16,3.35,2.92,'trim')}
  });
  k.part('lower-stump','The fractured stump and its landing','architecture',()=>{
   k.mark('fractured-lower-cut');
   k.lathe(0,1.3,0,[[0,0],[5.45,0],[5.45,.32],[5.10,.58],[4.85,7.1],[0,7.1]],'wall',16);
   for(const [y,r]of[[1.55,5.55],[5.1,5.12],[8.2,5.18]])annulus(k,0,y,0,r-.28,r,.22,'trim',32);
   fractured(k,8.4,4.86,1.65);
   annulus(k,0,9.35,0,4.82,6.48,.35,'trim',32);annulus(k,0,9.61,0,4.83,6.57,.11,'metal',32);
   for(let j=0;j<8;j++){const a=j*TAU/8; k.beam([Math.cos(a)*4.80,7.75,Math.sin(a)*4.80],[Math.cos(a)*6.24,9.35,Math.sin(a)*6.24],.21,'wall',5,true)}
   for(let j=0;j<6;j++){const a=j*TAU/6;if(j===1||j===2)continue;k.window(Math.cos(a)*5.11,4.25,Math.sin(a)*5.11,1.0,2.1,a-Math.PI/2)}
   k.archedPanel(0,1.6,5.18,2.05,3.8,.14,'dark');k.arch(0,1.6,5.41,2.12,3.86,.50,'trim');k.box(0,1.6,5.30,1.70,2.6,.09,'wood');k.box(0,1.30,5.85,3.0,.30,1.5,'trim');
  });
  k.part('floating-shaft','The severed shaft and open lantern','architecture',()=>{
   const base=15.5;k.mark('fractured-floating-cut');fractured(k,base+.8,4.62,2.05,true);
   k.lathe(0,base+.8,0,[[0,0],[4.6,0],[4.2,8.2],[4.9,8.9],[4.9,9.15],[3.6,10.2],[3.0,18.2],[3.6,18.8],[3.6,19.6],[0,19.6]],'wall',16);
   for(const [offset,rad]of[[3,4.54],[6.5,4.38],[13,3.49]]){
    annulus(k,0,base+offset-.24,0,rad-.2,rad+.12,.18,'trim',32);
    for(let j=0;j<6;j++){const a=j*TAU/6;if(offset===3&&j===2)continue;k.window(Math.cos(a)*(rad+.055),base+offset,Math.sin(a)*(rad+.055),.98,2.1,a-Math.PI/2)}
   }
   annulus(k,0,base+.77,0,4.42,4.9,.23,'metal',32);annulus(k,0,base+9.75,0,4.15,5.15,.28,'metal',32);
   k.mark('floating-arrival-porch');
   k.transform(0,16.35,0,TAU*1.12,1,()=>{
    k.box(0,-.23,5.04,2.46,.23,1.72,'trim');k.archedPanel(0,0,4.67,1.40,2.50,.10,'dark');k.arch(0,0,4.85,1.45,2.56,.27,'trim');
    k.using('roof',()=>k.roof(0,2.80,5.05,2.15,1.30,.60,'roof','gable'));
   });
   k.mark('open-lantern-stage');
   annulus(k,0,35.72,0,2.50,3.85,.30,'trim',24);
   for(let j=0;j<8;j++){const a=j*TAU/8,x=Math.cos(a)*3.14,z=Math.sin(a)*3.14;k.column(x,36.02,z,.17,2.50,'wall',8);k.transform(x,36.12,z,a-Math.PI/2,1,()=>pointed(k,0,0,0,1.60,2.26,.20,0,'trim',6))}
   k.crystal(0,36.2,0,.68,2.05);annulus(k,0,38.52,0,2.4,3.97,.27,'trim',24);
   k.using('roof',()=>{k.lathe(0,38.79,0,[[0,0],[4.15,0],[4.15,.20],[3.63,.42],[2.45,2.8],[.65,5.2],[0,6.1]],'roof',16);k.crystal(0,44.89,0,.72,2.85)});
  });
  k.part('light-bridge','The continuous lifting stair and its landings','architecture',()=>{
   k.mark('continuous-floating-stair');const n=48,start=Math.PI/2,turn=TAU*1.12,rise=6.65/n;
   for(let j=0;j<n;j++){const t=j/n,u=(j+1)/n,a=start+turn*t,b=start+turn*u,r=6.35-.62*t,s=6.35-.62*u,y=9.7+rise*(j+1);tread(k,a,b,r-.78,r+.78,s-.78,s+.78,y,rise+.12);
    if(k.lod>0&&j%3===0){const aa=(a+b)/2,rr=(r+s)/2+.70;k.beam([Math.cos(aa)*rr,y,Math.sin(aa)*rr],[Math.cos(aa)*rr,y+.95,Math.sin(aa)*rr],.045,'metal',4,true)}
    if(j%12===11){k.mark('suspended-stair-landing');tread(k,b-.08,b+.20,s-.88,s+1.0,s-.88,s+1.0,y,.25,'trim')}
   }
   const end=start+turn;tread(k,start-.16,start+.12,4.80,7.15,4.80,7.15,9.7,.28);tread(k,end-.15,end+.15,4.36,6.75,4.36,6.75,16.35,.30);
   k.emblem(0,6.4,14.5,1.0);for(const s of[-1,1])k.banner(s*8,1.3,13,4.0);
  });
  return k.finish();
 }
 function sunlessWell(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'flat'},options);k.palette={...palette(recipe),wall:'#aa987d',trim:'#dac7a6',roof:'#756d60',metal:'#aa8760',dark:'#343238'};
  k.part('rim-court','The pierced rim court and archive cells','foundation',()=>{
   k.mark('open-well-mouth');rimCourt(k,10.65,18,0,1.2);annulus(k,0,1.18,0,10.40,11.15,.26,'trim',48);
   // Four curb breaks align with real approaches; the southern one feeds the stair.
   for(let j=0;j<32;j++){const a=j*TAU/32,b=(j+1)*TAU/32;if(j===7||j===8)continue;tread(k,a,b,10.65,11.05,10.65,11.05,1.85,.42,'wall')}
   for(let j=0;j<8;j++){const a=j*TAU/8+.4;k.hall(Math.cos(a)*15,1.2,Math.sin(a)*15,4.3,4.1,3.9,{roof:'flat',entrance:true,angle:a+Math.PI/2})}
   stair(k,0,0,19.0,7,6,.20,.30);
  });
  k.part('descending-shaft','The splayed shaft and continuous descent','architecture',()=>{
   k.mark('uncovered-deep-shaft');
   for(let j=0;j<8;j++){const r=10.4-j*.55,y=-j*3.2,m=colorScale(k.color('wall'),.96-j*.064);
    k.lathe(0,y,0,[[r,0],[r-.55,-3.2],[r+.05,-3.2],[r+.60,0],[r,0]],m,32);
    annulus(k,0,y-.16,0,r-.02,r+.18,.16,j<4?'trim':'wall',32);
    if(k.lod>0&&j%2===0)for(let q=0;q<8;q++){const a=q*TAU/8+.12,rad=r-.37;k.transform(Math.cos(a)*rad,y-2.75,Math.sin(a)*rad,a+Math.PI/2,1,()=>{k.archedPanel(0,0,0,.86,1.76,.06,'dark');pointed(k,0,0,.08,.86,1.76,.15,0,'trim',5);k.box(0,-.09,.09,1.16,.10,.40,'trim')})}
   }
   k.lathe(0,-25.6,0,[[0,0],[6.08,0],[6.08,.03],[0,.03]],'dark',32);
   k.mark('continuous-well-stair');const n=120,drop=26.43/n,start=Math.PI/2,turn=TAU*2.5,rad=depth=>10.4-Math.max(0,Math.min(25.6,depth))*.55/3.2-1.01;
   for(let j=0;j<n;j++){const y=1.2-(j+1)*drop,a=start+j/n*turn,b=start+(j+1)/n*turn,r=rad(-y),s=rad(-(y-drop));tread(k,a,b,r-.80,r+.80,s-.80,s+.80,y,drop+.11,j<65?'trim':colorScale(k.color('trim'),.77));
    if(j%12===0){const aa=(a+b)/2,rr=(r+s)/2;k.beam([Math.cos(aa)*(rr+.95),y-.55,Math.sin(aa)*(rr+.95)],[Math.cos(aa)*(rr+.53),y-.06,Math.sin(aa)*(rr+.53)],.16,'wall',5,true)}
    if(k.lod>0&&j%4===0){const rr=r-.72;k.beam([Math.cos(a)*rr,y,Math.sin(a)*rr],[Math.cos(a)*rr,y+.70,Math.sin(a)*rr],.04,'metal',4,true)}
   }
   tread(k,start-.16,start+.08,8.45,10.76,8.45,10.76,1.2,.24); // Rim-to-first-tread landing.
  });
  k.part('well-head','The ventilated well gate and twin wind towers','architecture',()=>{
   k.mark('ventilated-well-head');
   for(const s of[-1,1]){const x=s*12.5;k.terrace(x,1.2,-11,3.35,3.35,.35);k.box(x,1.55,-11,2.55,9.80,2.55,'wall');
    for(const y of[3.9,7.0,10.9])k.box(x,y,-11,2.90,.21,2.90,'trim');
    for(let a=0;a<4;a++)k.transform(x,7.35,-11,a*Math.PI/2,1,()=>{k.box(0,0,1.29,1.40,2.66,.09,'dark');for(let q=0;q<5;q++)k.box(0,.2+q*.46,1.39,1.54,.14,.30,'trim')});
    k.using('roof',()=>{k.box(x,11.35,-11,3.23,.28,3.23,'trim');k.box(x,11.63,-11,2.82,.22,2.82,'roof')});
   }
   k.arch(0,1.2,14.5,4.0,4.8,.9,'wall');k.box(0,6.0,14.5,6.4,.45,1.6,'trim');k.using('roof',()=>k.box(0,6.45,14.5,6.7,.20,1.95,'trim'));
  });
  k.part('offering-rim','The inscribed offering stations','ornament',()=>{
   for(let j=0;j<12;j++){const a=j*TAU/12+.24,x=Math.cos(a)*12,z=Math.sin(a)*12;k.column(x,1.2,z,.20,1.10,'wall',8);k.lathe(x,2.3,z,[[0,0],[.48,0],[.48,.15],[.30,.25],[0,.25]],'metal',8)}
   k.emblem(0,7.2,15.0,1.1);for(const s of[-1,1])k.banner(s*6,1.2,16.5,3.8);
  });
  // Match the pierced court's 48-sided inner edge, inside the shaft lining's
  // 10.4–11.0 wall thickness. The entrance, not the bottom, is the ground datum.
  return {...k.finish(),groundY:0,excavation:{
   outline:Array.from({length:48},(_,j)=>[Math.cos(j*TAU/48)*10.65,Math.sin(j*TAU/48)*10.65]),floorY:-25.6,entrance:[0,19.15]
  }};
 }
 function skyCourt(recipe,options){
  const k=new LandmarkKit({...recipe,roofLanguage:'native'},options);k.palette={...palette(recipe),wall:'#c8af86',trim:'#ecdbb4',roof:'#bfa170',wood:'#594738',metal:'#b88c54',dark:'#4b4035'};
  k.part('trodden-ring','The raised timber ring and radial walks','foundation',()=>{
   k.lathe(0,0,0,[[0,0],[17,0],[17,.72],[17.2,.78],[17.2,.9],[0,.9]],'ground',32);annulus(k,0,.86,0,15.25,15.7,.16,'wood',32);annulus(k,0,.91,0,9.65,10.15,.09,'trim',32);
   for(let j=0;j<5;j++){const a=j*TAU/5+.32;k.transform(0,.91,0,a,1,()=>k.box(3.25,0,0,3.1,.09,1.10,'wood'))}
   stair(k,0,0,17.9,5.8,4,.225,.30);
  });
  k.part('standing-ring','The bound masts and their ground anchors','architecture',()=>{
   k.mark('collared-canopy-masts');
   for(let j=0;j<12;j++){const a=j*TAU/12,x=Math.cos(a)*12.5,z=Math.sin(a)*12.5,h=15+((j*5)%3)*1.4;
    k.box(x,.9,z,1.65,.30,1.65,'wall',a);k.lathe(x,1.2,z,[[0,0],[.57,0],[.50,h*.55],[.38,h],[0,h]],'wood',10);
    for(const yy of[1.5,5.5,12.8,14.05])annulus(k,x,yy,z,.44,.66,.24,'metal',10);
    k.beam([Math.cos(a)*13.65,.95,Math.sin(a)*13.65],[x,4.2,z],.20,'wood',5,true);
    k.box(Math.cos(a)*16.0,.90,Math.sin(a)*16.0,.80,.45,.80,'wall',a);k.beam([x,14.2,z],[Math.cos(a)*16,1.35,Math.sin(a)*16],.045,'metal',4,true);
    k.banner(x,13.5,z,3.2);
   }
   k.lathe(0,.9,0,[[0,0],[1.35,0],[1.35,.42],[1.14,.68],[.82,22.8],[0,22.8]],'wood',12);
   for(const yy of[1.5,5.6,13.2,20.9,21.6])annulus(k,0,yy,0,.80,yy>20?2.15:1.38,.28,'metal',12);
   for(let j=0;j<6;j++){const a=j*TAU/6;k.beam([Math.cos(a)*3.05,.91,Math.sin(a)*3.05],[Math.cos(a)*.90,5.6,Math.sin(a)*.90],.25,'wood',5,true)}
   k.cone(0,23.7,0,1.55,2.80,'metal',0,8);k.banner(0,22.3,0,4.2);
  });
  k.part('great-felt-canopy','The twelve-bay gathered felt canopy','roof',()=>{
   k.mark('gathered-felt-canopy');const n=24,rows=k.lod>1?5:3,thick=.095,P=(j,t,down=0)=>{const a=j/n*TAU,r=2.0+t*10.5,edgeSag=j%2?-.75:0,y=21.5-7.3*t-Math.sin(Math.PI*t)*1.75+edgeSag*t*t;return[Math.cos(a)*r,y-down,Math.sin(a)*r]};
   for(let row=0;row<rows;row++)for(let j=0;j<n;j++){const t=row/rows,u=(row+1)/rows,A=P(j,t),B=P((j+1)%n,t),C=P((j+1)%n,u),D=P(j,u),tone=colorScale(k.color(j%4<2?'roof':'trim'),j%2?.98:1);
    k.quad(A,B,C,D,tone);k.quad(P(j,t,thick),P(j,u,thick),P((j+1)%n,u,thick),P((j+1)%n,t,thick),colorScale(k.color('roof'),.80));
    if(row===0)k.quad(A,P(j,t,thick),P((j+1)%n,t,thick),B,'wood');if(row===rows-1)k.quad(D,C,P((j+1)%n,u,thick),P(j,u,thick),'trim');
   }
   for(let j=0;j<n;j+=2){const ps=[];for(let row=0;row<=rows;row++)ps.push(P(j,row/rows).map((v,i)=>v+(i===1?.045:0)));path(k,ps,.055,'metal',4)}
   annulus(k,0,21.35,0,1.8,2.24,.24,'wood',24);k.lathe(0,22.05,0,[[1.35,0],[2.75,0],[2.75,.12],[1.45,1.24],[1.35,1.24],[1.35,0]],'roof',16);
  });
  k.part('felt-halls','Five individually framed round felt halls','architecture',()=>{
   k.mark('round-felt-hall');
   for(let j=0;j<5;j++){const a=j*TAU/5+.32,x=Math.cos(a)*7.2,z=Math.sin(a)*7.2;k.cylinder(x,.9,z,2.95,.24,'wood',16);
    k.lathe(x,1.14,z,[[0,0],[2.65,0],[2.76,.90],[2.66,2.72],[2.56,3.26],[0,3.26]],j%2?'trim':'wall',16);
    for(const yy of[1.36,3.63,4.24])annulus(k,x,yy,z,2.56,2.80,.10,'wood',16);
    k.using('roof',()=>{k.roof(x,4.40,z,5.30,5.30,2.36,'roof','conic');k.cone(x,6.74,z,.30,.56,'metal',.12,8)});
    k.transform(x,1.14,z,a+Math.PI/2,1,()=>{k.box(0,0,2.75,1.16,2.04,.09,'dark');for(const s of[-1,1])k.box(s*.67,0,2.86,.16,2.16,.20,'wood');k.box(0,2.04,2.86,1.52,.18,.22,'wood');k.box(0,-.08,3.08,1.70,.14,.80,'wood');for(const s of[-1,1])k.box(s*.40,.12,2.83,.30,1.88,.08,j%2?'roof':'trim')});
    if(k.lod>0)for(let q=0;q<10;q++){const aa=q*TAU/10,xx=x+Math.cos(aa)*2.77,zz=z+Math.sin(aa)*2.77;k.beam([xx,1.35,zz],[x+Math.cos(aa)*2.60,4.31,z+Math.sin(aa)*2.60],.040,'metal',4,true);k.transform(xx,3.06,zz,aa-Math.PI/2,1,()=>{k.quad([0,.28,.018],[.17,.11,.018],[0,-.06,.018],[-.17,.11,.018],'metal')})}
   }
  });
  k.part('herd-pens','The laced wind screens and open stock pens','ornament',()=>{
   for(let j=0;j<6;j++){const a=j*TAU/6+.5;k.rail(Math.cos(a)*16,Math.sin(a)*16,Math.cos(a+.7)*16,Math.sin(a+.7)*16,1.15,'wood')}
   for(const side of[-1,1]){k.box(side*17.6,0,0,1.20,.90,12.8,'ground');for(let q=0;q<7;q++){const z=-6+q*2;k.box(side*17.6,.90,z,.27,3.15,.27,'wood');if(q<6){k.box(side*17.6,1.2,z+1,.12,2.25,1.70,'roof');k.beam([side*17.69,1.3,z+.20],[side*17.69,3.30,z+1.80],.040,'metal',4,true)}}}
   k.emblem(0,4.6,16.4,1.0);
  });
  return k.finish();
 }
 return {'sky-crystal':skyCrystal,'suspended-tower':suspendedTower,'sunless-well':sunlessWell,'sky-court':skyCourt};
}
