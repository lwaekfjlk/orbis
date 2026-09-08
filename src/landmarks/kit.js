/** Reusable mesh kit. Coordinates are right-handed, Y-up; measurements are art units.
 * Geometry is partitioned into named construction modules, with separate roofs.
 * No images, remote models, fonts, textures, or runtime services are required.
 */
class LandmarkKit {
 constructor(recipe,options={}){this.recipe=recipe;this.options=options;this.palette=LandmarkCatalog.palettes[recipe.material];this.random=LandmarkCatalog.rng(recipe.seed+'/mesh');this.parts=[];this.current=null;this.lod=options.lod??recipe.complexity;this.modules={};this.transforms=[];this.baseY=0;}
 color(c){return Array.isArray(c)?c:rgb(this.palette[c]||c||this.palette.wall)}
 part(id,name,role,fn,note=''){const prior=this.current;const p={id,name,role,note,geometry:new Geometry(),anchor:[0,0,0],bounds:null,modules:[]};this.parts.push(p);this.current=p;fn();this.current=prior;return p}
 using(role,fn){if(this.current.role===role){fn();return}const old=this.current,id=old.id+'-'+role;let p=this.parts.find(q=>q.id===id);if(!p){p={id,name:old.name+' / '+role,role,note:old.note,geometry:new Geometry(),anchor:[0,0,0],bounds:null,modules:[]};this.parts.push(p)}this.current=p;fn();this.current=old}
 mark(name){this.modules[name]=(this.modules[name]||0)+1;if(this.current&&!this.current.modules.includes(name))this.current.modules.push(name)}
 transform(x,y,z,angle,scale,fn){this.transforms.push({x,y,z,a:angle||0,s:scale||1});fn();this.transforms.pop()}
 pt(p){let v=p.slice();for(let i=this.transforms.length-1;i>=0;i--){const t=this.transforms[i],c=Math.cos(t.a),s=Math.sin(t.a);v=[(v[0]*c-v[2]*s)*t.s+t.x,v[1]*t.s+t.y,(v[0]*s+v[2]*c)*t.s+t.z]}return v}
 tri(a,b,c,m){this.current.geometry.tri(this.pt(a),this.pt(b),this.pt(c),this.color(m))}
 quad(a,b,c,d,m){this.tri(a,b,c,m);this.tri(a,c,d,m)}
 box(x,y,z,w,h,d,m='wall',angle=0){if(w<=0||h<=0||d<=0)return;this.transform(x,y,z,angle,1,()=>{const a=[-w/2,0,-d/2],b=[w/2,0,-d/2],c=[w/2,0,d/2],q=[-w/2,0,d/2],up=p=>[p[0],h,p[2]];this.quad(a,up(a),up(b),b,m);this.quad(b,up(b),up(c),c,m);this.quad(c,up(c),up(q),q,m);this.quad(q,up(q),up(a),a,m);this.quad(up(a),up(q),up(c),up(b),m);this.quad(a,b,c,q,m)})}
 lathe(x,y,z,profile,m='wall',seg=16,angle=0){this.transform(x,y,z,angle,1,()=>{for(let k=0;k<profile.length-1;k++){
  const [r1,h1]=profile[k],[r2,h2]=profile[k+1];if(r1===r2&&h1===h2)continue;
  for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2,b=(i+1)%seg/seg*Math.PI*2,p=[Math.cos(a)*r1,h1,Math.sin(a)*r1],q=[Math.cos(a)*r2,h2,Math.sin(a)*r2],u=[Math.cos(b)*r2,h2,Math.sin(b)*r2],v=[Math.cos(b)*r1,h1,Math.sin(b)*r1];
   // One triangle at a pole, rather than a collapsed quad with an unstable normal.
   if(r1===0)this.tri(p,q,u,m);else if(r2===0)this.tri(p,q,v,m);else this.quad(p,q,u,v,m);
  }
 }})}
 cylinder(x,y,z,r,h,m='wall',seg=12){this.lathe(x,y,z,[[0,0],[r,0],[r,h],[0,h]],m,seg)}
 cone(x,y,z,r,h,m='roof',r2=0,seg=12){this.lathe(x,y,z,[[0,0],[r,0],[r2,h],[0,h]],m,seg)}
 column(x,y,z,r,h,m='wall',seg=12){this.mark('moulded-column');const foot=Math.min(h*.10,r*.55),cap=Math.min(h*.12,r*.72),n=this.lod>0?seg:Math.min(seg,8);
  this.box(x,y,z,r*2.6,foot,r*2.6,'trim');
  this.lathe(x,y+foot,z,[[0,0],[r*1.12,0],[r*1.12,foot*.45],[r,foot*.9],[r*.92,h*.24],[r*.77,h-foot-cap],[0,h-foot-cap]],m,n);
  this.lathe(x,y+h-cap,z,[[0,0],[r*.80,0],[r*.83,cap*.25],[r*1.18,cap*.72],[r*1.22,cap],[0,cap]],'trim',n);
  this.box(x,y+h-cap*.12,z,r*2.7,cap*.12,r*2.7,'trim');
 }
 dome(x,y,z,r,h,m='metal'){this.mark('ribbed-dome');const steps=this.lod>1?9:this.lod>0?7:5,seg=this.lod>1?24:this.lod>0?20:12,seat=Math.min(h*.12,r*.10),prof=[[0,0],[r,0],[r,seat]];
  for(let j=1;j<=steps;j++){const t=j/steps*Math.PI/2;prof.push([j===steps?0:r*Math.cos(t),seat+(h-seat)*Math.sin(t)])}
  this.using('roof',()=>{
   this.lathe(x,y,z,prof,m,seg);
   this.lathe(x,y,z,[[0,0],[r*1.045,0],[r*1.045,seat*.28],[r*1.02,seat*.65],[r*1.02,seat],[0,seat]],'trim',seg);
   if(this.lod>0)for(let k=0;k<(this.lod>1?12:8);k++){const a=k/(this.lod>1?12:8)*Math.PI*2;let last=null;
    for(let j=0;j<=steps;j++){const t=j/steps*Math.PI/2,p=[x+(r+.028)*Math.cos(t)*Math.cos(a),y+seat+(h-seat)*Math.sin(t)+.02,z+(r+.028)*Math.cos(t)*Math.sin(a)];if(last)this.beam(last,p,Math.min(.055,r*.025),'trim',4,true);last=p}
   }
   const f=Math.min(.24,r*.15);this.lathe(x,y+h,z,[[0,0],[f*1.5,0],[f*1.5,f*.4],[f,f*.7],[f,f*1.3],[f*.3,f*2.8],[0,f*3.4]],'metal',8);
  })
 }
 beam(a,b,r,m='trim',seg=5,capped=false){const d=sub(b,a),L=Math.hypot(...d);if(L<.001)return;const n=norm(d),u=norm(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0])),v=cross(n,u);
  for(let k=0;k<seg;k++){const A=k/seg*Math.PI*2,B=(k+1)%seg/seg*Math.PI*2,p=t=>u.map((q,i)=>a[i]+(Math.cos(t)*q+Math.sin(t)*v[i])*r),q=t=>p(t).map((e,i)=>e+d[i]);this.quad(p(A),p(B),q(B),q(A),m);if(capped){this.tri(a,p(B),p(A),m);this.tri(b,q(A),q(B),m)}}
 }
 ring(x,y,z,r,t,m='metal',plane='xz',seg=40){for(let k=0;k<seg;k++){const a=k/seg*Math.PI*2,b=(k+1)/seg*Math.PI*2;const p=A=>plane==='xy'?[x+r*Math.cos(A),y+r*Math.sin(A),z]:plane==='yz'?[x,y+r*Math.cos(A),z+r*Math.sin(A)]:[x+r*Math.cos(A),y,z+r*Math.sin(A)];this.beam(p(a),p(b),t,m,5)}}
 /* A roof is a closed volume with a shaded fascia, not an infinitely thin tent.
  * Keep the established footprint, pitch and tradition-specific silhouettes. Small
  * LOD 0 town roofs get only the structural edge; seams belong to closer views. */
 roof(x,y,z,w,d,h,m='roof',kind='hip',angle=0){this.mark(kind+'-roof');this.using('roof',()=>this.transform(x,y,z,angle,1,()=>{
  const W=w*.55,D=d*.55,t=Math.max(.055,Math.min(.20,Math.min(w,d)*.032)),edge=colorScale(this.color(m),.68),seam=colorScale(this.color(m),1.14);
  const skirt=ring=>{const centre=[0,-t,0];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],c=[b[0],b[1]-t,b[2]],q=[a[0],a[1]-t,a[2]];this.quad(a,b,c,q,edge);this.tri(centre,q,c,edge)}};
  const ridge=(a,b,r=.07)=>this.beam(a,b,r,'metal',4,true);
  const pitched=(ww,dd,hh,gable=false)=>{
   const a=[-ww,0,-dd],b=[ww,0,-dd],c=[ww,0,dd],q=[-ww,0,dd],run=gable?dd:Math.max(0,dd-ww*.65),A=[0,hh,-run],B=[0,hh,run];
   this.quad(a,q,B,A,m);this.quad(A,B,c,b,m);this.tri(a,A,b,gable&&m==='roof'?'wall':m);this.tri(q,c,B,gable&&m==='roof'?'wall':m);skirt([a,b,c,q]);
   ridge(A.map((v,i)=>v+(i===1?.025:0)),B.map((v,i)=>v+(i===1?.025:0)),Math.min(.12,t*.60));
   if(this.lod>0){for(const p of[a,b,c,q])this.beam(p,p[2]<0?A:B,Math.min(.065,t*.38),seam,4,true);
    // Long parallel courses describe slates or shingles, without tessellating each tile.
    const courses=this.lod>1?4:Math.min(w,d)>=5?2:0;
    for(let j=1;j<=courses;j++){const u=j/(courses+1),xx=ww*(1-u),zz=dd+(run-dd)*u;for(const sign of[-1,1])this.beam([sign*xx,hh*u+.02,-zz],[sign*xx,hh*u+.02,zz],Math.min(.032,t*.19),seam,4,true)}
   }
   return {A,B};
  };
  if(kind==='upturned'){
   const steps=this.lod>0?6:3,over=.58,up=h*.62;
   const ring=u=>{const hw=W*(1+over-(1+over-.06)*u),hd=D*(1+over-(1+over-.34)*u),base=h*Math.pow(u,1.85),lift=up*Math.pow(1-u,2.2);return[[-hw,base+lift,-hd],[0,base,-hd],[hw,base+lift,-hd],[hw,base,0],[hw,base+lift,hd],[0,base,hd],[-hw,base+lift,hd],[-hw,base,0]]};
   const eave=ring(0);let prev=eave;
   for(let j=1;j<=steps;j++){const cur=ring(j/steps);for(let k=0;k<8;k++)this.quad(prev[k],cur[k],cur[(k+1)%8],prev[(k+1)%8],m);prev=cur}
   for(let k=0;k<8;k++)this.tri([0,h,0],prev[(k+1)%8],prev[k],m);skirt(eave);
   if(this.lod>0){for(const k of[0,2,4,6])this.cone(eave[k][0]*1.02,eave[k][1],eave[k][2]*1.02,.13,h*.46,'metal',0,5);for(const k of[1,3,5,7])this.box(eave[k][0]*.82,eave[k][1]-h*.16,eave[k][2]*.82,.16,h*.22,.16,'wood')}
   ridge([0,h*1.02,-D*.34],[0,h*1.02,D*.34],.085);for(const sign of[-1,1])this.cone(0,h*1.02,sign*D*.34,.12,h*.26,'metal',0,6);return;
  }
  if(kind==='deepeave'){
   // Eaves span the room's short side. A long narrow wing must not acquire
   // a canopy as wide as its length and shrink the whole house to fit its lot.
   const over=Math.min(w,d)*.20,ww=W+over,dd=D+over;pitched(ww,dd,h*.62);
   if(this.lod>0)for(let u=-1;u<=1;u+=.5)for(const sign of[-1,1])this.beam([W*u,-.05,sign*D],[W*u,-.22,sign*dd],.045,'wood',4,true);return;
  }
  if(kind==='vault'){
   const seg=this.lod>1?12:this.lod>0?9:5;let prev=null;
   for(let j=0;j<=seg;j++){const u=j/seg*Math.PI,xx=-Math.cos(u)*W,yy=(j===0||j===seg)?0:Math.sin(u)*h,edge=[[xx,yy,-D],[xx,yy,D]];
    if(prev){this.quad(prev[0],prev[1],edge[1],edge[0],m);this.tri([0,0,-D],prev[0],edge[0],m);this.tri([0,0,D],edge[1],prev[1],m)}prev=edge;
   }
   // Split each end of the bottom ring at the same vertex as the vault's end fan.
   skirt([[-W,0,-D],[0,0,-D],[W,0,-D],[W,0,D],[0,0,D],[-W,0,D]]);
   if(this.lod>0)for(const z of[-D,D]){let last=null;for(let j=0;j<=seg;j++){const u=j/seg*Math.PI,p=[-Math.cos(u)*W,Math.sin(u)*h+.015,z];if(last)this.beam(last,p,t*.38,'trim',4,true);last=p}}return;
  }
  if(kind==='conic'){
   const r=Math.min(W,D)*1.06,seg=this.lod>0?12:7;
   this.lathe(0,0,0,[[0,-t],[r,-t],[r,0],[r*.98,h*.16],[r*.62,h*.66],[0,h]],m,seg);
   if(this.lod>0){this.lathe(0,0,0,[[r*.98,h*.14],[r*1.01,h*.14],[r*1.01,h*.18],[r*.98,h*.18],[r*.98,h*.14]],'trim',seg);for(let j=0;j<seg;j+=2){const a=j/seg*Math.PI*2;this.beam([Math.cos(a)*r*.9,h*.20,Math.sin(a)*r*.9],[0,h*.94,0],.03,'trim',4,true)}}
   this.cylinder(0,h*.92,0,r*.13,.30,'wood',6);return;
  }
  if(kind==='parapet'||kind==='flat'){
   const base=Math.max(.12,h*.16),pw=w*1.02,pd=d*1.02;this.box(0,-t,0,pw,base+t,pd,m);
   for(const sign of[-1,1]){this.box(sign*(pw/2-.1),base,0,.20,h*.34,pd,'trim');this.box(0,base,sign*(pd/2-.1),pw-.4,h*.34,.20,'trim')}
   if(this.lod>0)for(const sign of[-1,1]){this.box(sign*(pw/2-.1),base+h*.34,0,.28,.08,pd+.08,'trim');this.box(0,base+h*.34,sign*(pd/2-.1),pw-.48,.08,.28,'trim')}return;
  }
  if(kind==='rockcut'){
   this.box(0,0,-D*.55,w*1.04,h*1.5,d*.5,'wall');this.box(0,h*1.1,0,w*1.02,.22,d*1.02,'trim');
   if(this.lod>0){this.box(0,h*.97,D*.42,w*.84,.12,.32,edge);for(const sign of[-1,1])this.box(sign*W*.72,0,D*.42,.26,h*1.05,.30,'trim')}return;
  }
  const {A,B}=pitched(W,D,h,kind==='gable');
  if(kind==='leaf'||kind==='northern'){ridge([0,h,-D-.35],A,.09);ridge(B,[0,h,D+.35],.09);this.cone(0,h,D+.35,.12,.55,'metal',0,6)}
 }))}
 parapet(x,y,z,w,d,m='wall'){this.mark('parapet');this.box(x-w/2,y,z,.25,.60,d,m);this.box(x+w/2,y,z,.25,.60,d,m);this.box(x,y,z-d/2,w,.60,.25,m);this.box(x,y,z+d/2,w,.60,.25,m);for(let xx=-w/2;xx<=w/2;xx+=1.05)for(const sign of [-1,1])this.box(x+xx,y+.6,z+sign*d/2,.46,.32,.38,m);for(let zz=-d/2+1;zz<d/2;zz+=1.05)for(const sign of[-1,1])this.box(x+sign*w/2,y+.6,z+zz,.38,.32,.46,m)}
 stairs(x,y,z,w,n,rise=.25,run=.45,angle=0,m='trim'){this.mark('ceremonial-stair');this.transform(x,y,z,angle,1,()=>{for(let i=0;i<n;i++)this.box(0,i*rise,-i*run,w,rise,(n-i)*run*2+.10,m)})}
 arch(x,y,z,w,h,d,m='wall',angle=0){this.mark('open-arch');const r=w/2,t=Math.max(.17,w*.12),spring=Math.max(.05,h-r),seg=this.lod>1?10:this.lod>0?7:5;
  this.transform(x,y,z,angle,1,()=>{
   this.box(-r-t/2,0,0,t,spring,d,m);this.box(r+t/2,0,0,t,spring,d,m);
   for(const sign of[-1,1]){this.box(sign*(r+t/2),-.12,0,t*1.65,.22,d*1.3,'trim');if(this.lod>0)this.box(sign*(r+t/2),spring-.10,0,t*1.25,.14,d*1.12,'trim')}
   for(let k=0;k<seg;k++){const a=k/seg*Math.PI,b=(k+1)/seg*Math.PI,p=(A,R,Z)=>[Math.cos(A)*R,spring+Math.sin(A)*R,Z],tone=this.lod>1&&k%2===0?colorScale(this.color(m),.94):m;
    this.quad(p(a,r,-d/2),p(b,r,-d/2),p(b,r+t,-d/2),p(a,r+t,-d/2),tone);this.quad(p(a,r,d/2),p(a,r+t,d/2),p(b,r+t,d/2),p(b,r,d/2),tone);
    this.quad(p(a,r,-d/2),p(a,r,d/2),p(b,r,d/2),p(b,r,-d/2),'trim');this.quad(p(a,r+t,-d/2),p(b,r+t,-d/2),p(b,r+t,d/2),p(a,r+t,d/2),tone);
    if(k===0)this.quad(p(a,r,-d/2),p(a,r+t,-d/2),p(a,r+t,d/2),p(a,r,d/2),m);
    if(k===seg-1)this.quad(p(b,r,-d/2),p(b,r,d/2),p(b,r+t,d/2),p(b,r+t,-d/2),m);
   }
  })
 }
 arcade(x,y,z,n,w=2,h=3,angle=0){this.mark('colonnade');this.transform(x,y,z,angle,1,()=>{for(let k=0;k<n;k++)this.arch((k-(n-1)/2)*(w+.25),0,0,w,h,.42,'wall');this.box(0,h+.15,0,n*(w+.25)+.2,.22,1.0,'trim');this.using('roof',()=>{this.box(0,h+.4,-.35,n*(w+.25)+.5,.15,2,'roof')})})}
 archedPanel(x,y,z,w,h,d,m='dark'){const r=w/2,spring=Math.max(.05,h-r),seg=this.lod>1?8:5;
  this.transform(x,y,z,0,1,()=>{this.box(0,0,0,w,spring,d,m);for(let k=0;k<seg;k++){const a=k/seg*Math.PI,b=(k+1)/seg*Math.PI,p=(t,z)=>[Math.cos(t)*r,spring+Math.sin(t)*r,z];
   this.tri([0,spring,d/2],p(a,d/2),p(b,d/2),m);this.tri([0,spring,-d/2],p(b,-d/2),p(a,-d/2),m);this.quad(p(a,-d/2),p(b,-d/2),p(b,d/2),p(a,d/2),m);
  }for(const [a,b]of[[-r,0],[0,r]])this.quad([a,spring,-d/2],[b,spring,-d/2],[b,spring,d/2],[a,spring,d/2],m)})
 }
 window(x,y,z,w,h,angle=0,style='arch'){if(this.lod===0)return;this.mark('recessed-window');this.transform(x,y,z,angle,1,()=>{
  const jamb=Math.min(.10,w*.17),depth=Math.min(.22,w*.30),arched=style==='arch',r=w/2,spring=arched?Math.max(.12,h-r):h;
  // The glazing sits behind the projecting masonry reveals and casts a real recess.
  if(arched)this.archedPanel(0,.03,.025,w,h-.03,.06,'dark');else this.box(0,.03,.025,w,h-.03,.06,'dark');
  if(arched){const seg=this.lod>1?8:5;for(let k=0;k<seg;k++){const a=k/seg*Math.PI,b=(k+1)/seg*Math.PI,p=(t,z)=>[Math.cos(t)*r,spring+Math.sin(t)*r,z];
   const q=(t,z)=>[Math.cos(t)*(r+jamb),spring+Math.sin(t)*(r+jamb),z];
   this.quad(p(a,depth),q(a,depth),q(b,depth),p(b,depth),'trim');this.quad(p(a,.005),p(a,depth),p(b,depth),p(b,.005),'trim');this.quad(q(a,.005),q(b,.005),q(b,depth),q(a,depth),'trim');this.quad(p(a,.005),p(b,.005),q(b,.005),q(a,.005),'trim');
   if(k===0)this.quad(p(a,.005),q(a,.005),q(a,depth),p(a,depth),'trim');if(k===seg-1)this.quad(p(b,.005),p(b,depth),q(b,depth),q(b,.005),'trim');
  }}
  else this.box(0,h,depth*.5,w+jamb*2,jamb,depth,'trim');
  for(const sign of[-1,1])this.box(sign*(w+jamb)/2,0,depth*.5,jamb,spring,depth,'trim');
  this.box(0,-jamb*.5,depth*.65,w+jamb*3,jamb,depth*1.65,'trim');
  this.box(0,.08,.079,Math.min(.055,w*.1),h-.14,.035,'metal');
  if(style==='lattice'||this.lod>1)this.box(0,h*.44,.084,w,.048,.03,'metal');
  if(style==='lattice'&&this.lod>1)for(const sign of[-1,1])this.beam([sign*w*.39,.14,.095],[-sign*w*.39,h-.08,.095],.022,'metal',4,true);
 })}
 hall(x,y,z,w,d,h,opts={}){this.mark('audience-hall');const roof=this.recipe.roofLanguage&&this.recipe.roofLanguage!=='native'?this.recipe.roofLanguage:(opts.roof||'hip');
  this.transform(x,y,z,opts.angle||0,1,()=>{
   const base=Math.min(.28,h*.12),cornice=Math.min(.28,h*.12),doorW=Math.min(1.3,w*.37),doorH=Math.min(2.25,h*.70),entrance=opts.entrance!==false;
   this.box(0,0,0,w+.45,base,d+.45,'trim');this.box(0,base,0,w,h-base,d,'wall');
   this.box(0,h-cornice,0,w+.14,cornice*.48,d+.14,'trim');this.box(0,h-cornice*.42,0,w+.30,cornice*.42,d+.30,'trim');
   if(this.lod>0){
    this.box(0,base,0,w+.12,.11,d+.12,'trim');
    const floors=Math.max(1,Math.floor((h-.30)/1.8)),pitch=(h-.60-cornice)/floors,wh=Math.min(1.05,pitch*.72),bottom=base+.24,ww=Math.min(.62,Math.min(w,d)*.23),style=this.recipe.culture==='Dwarven craft'?'lattice':'arch';
    for(const side of[-1,1]){
     const nx=Math.max(1,Math.floor(w/1.7)),nz=Math.max(1,Math.floor(d/1.7));
     for(let k=0;k<nx;k++){const xx=(k-(nx-1)/2)*(w-.72)/nx;for(let j=0;j<floors;j++){const yy=bottom+j*pitch;if(side===1&&entrance&&Math.abs(xx)<doorW*.5+ww*.5+.18&&yy<base+doorH)continue;this.window(xx,yy,side*(d/2+.018),ww,wh,side===1?0:Math.PI,style)}}
     for(let k=0;k<nz;k++){const zz=(k-(nz-1)/2)*(d-.72)/nz;for(let j=0;j<floors;j++)this.window(side*(w/2+.018),bottom+j*pitch,zz,ww,wh,side===1?-Math.PI/2:Math.PI/2,style)}
    }
    for(const xx of[-1,1])for(const zz of[-1,1]){const px=xx*(w/2-.13),pz=zz*(d/2+.025);this.box(px,base,pz,.28,h-base-cornice,.21,'trim');if(this.lod>1)for(let j=0;j<Math.min(6,Math.floor(h/.65));j++)this.box(px,base+.12+j*.65,pz,.38,.18,.28,'trim')}
    for(let j=1;j<floors;j++)this.box(0,base+j*pitch,0,w+.10,.09,d+.10,'trim');
   }
   if(roof==='flat')this.using('roof',()=>{this.box(0,h-.02,0,w,.10,d,'roof');this.parapet(0,h,0,w,d)});
   else this.roof(0,h,0,w+.4,d+.4,(opts.roofHeight||Math.min(w,d)*.38)*this.recipe.roofPitch,opts.roofMaterial||'roof',roof);
   if(entrance){
    const front=d/2+.09;this.archedPanel(0,base,front,doorW+.05,doorH+.12,.14,'dark');this.arch(0,base,front+.14,doorW+.05,doorH+.12,.30,'trim');
    if(this.lod>0){this.box(0,base,front+.11,doorW*.84,doorH*.73,.07,'wood');this.box(0,base,front+.155,.045,doorH*.74,.025,'metal');this.box(0,base-.05,front+.16,doorW+.46,.13,.65,'trim');for(const sx of[-1,1])this.box(sx*doorW*.12,base+doorH*.39,front+.18,.045,.12,.035,'metal')}
   }
  })
 }
 tower(x,y,z,r,h,crown='spire'){if(this.recipe.crown&&this.recipe.crown!=='native')crown=this.recipe.crown;this.mark(crown+'-tower');this.cylinder(x,y,z,r*1.14,.35,'trim',12);this.cylinder(x,y+.35,z,r,h-.35,'wall',12);for(let yy=2.1;yy<h;yy+=2.3)this.cylinder(x,y+yy,z,r*1.065,.16,'trim',12);this.cylinder(x,y+h-.3,z,r*1.18,.38,'trim',12);
 if(this.lod>0)for(let k=0;k<4;k++){const a=k*Math.PI/2;this.window(x+Math.sin(a)*(r+.03),y+h-2.2,z+Math.cos(a)*(r+.03),r*.65,1.15,-a)}
 this.using('roof',()=>{if(crown==='dome')this.dome(x,y+h,z,r*1.19,r*1.2);else if(crown==='battlement'){for(let k=0;k<10;k++){const a=k*Math.PI/5;this.box(x+Math.cos(a)*r,y+h,z+Math.sin(a)*r,.45,.6,.4,'wall',a)}}else if(crown==='crystal'){this.cone(x,y+h,z,r*1.25,.5,'trim',r*.92,8);this.crystal(x,y+h+.5,z,r*.8,r*3.5)}else{this.lathe(x,y+h,z,[[0,0],[r*1.28,0],[r*.91,.32],[r*.63,r*1.25],[r*.17,r*2.7],[0,r*3.15]],'roof',12);this.cone(x,y+h+r*3.15,z,.13,.75,'metal',0,6)}})}
 terrace(x,y,z,w,d,h=.8){this.mark('terrace');this.box(x,y,z,w,h,d,'wall');this.box(x,y+h-.06,z,w+.35,.16,d+.35,'trim');if(this.lod>0)for(let k=-w/2+1;k<w/2;k+=1.5)this.box(x+k,y+.12,z+d/2+.025,.05,h-.15,.06,'dark')}
 rail(x1,z1,x2,z2,y,m='trim'){const d=Math.hypot(x2-x1,z2-z1),n=Math.max(1,Math.ceil(d/.9));this.beam([x1,y+.75,z1],[x2,y+.75,z2],.075,m);for(let j=0;j<=n;j++){const t=j/n;this.beam([x1+(x2-x1)*t,y,z1+(z2-z1)*t],[x1+(x2-x1)*t,y+.72,z1+(z2-z1)*t],.045,m)}}
 bridge(x,y,z,length=12,width=2.6,angle=0){this.mark('arcaded-bridge');this.transform(x,y,z,angle,1,()=>{const n=Math.max(1,Math.round(length/3));for(let k=0;k<n;k++)this.arch((k-(n-1)/2)*length/n,0,0,length/n-.5,2.7,width,'wall');this.box(0,3.0,0,length+.45,.35,width+.25,'trim');this.rail(-length/2,-width/2,length/2,-width/2,3.35);this.rail(-length/2,width/2,length/2,width/2,3.35)})}
 pool(x,y,z,w,d){this.mark('cistern');this.box(x,y,z,w+.5,.28,d+.5,'trim');if(this.recipe.geography.freshwater>.3)this.box(x,y+.285,z,w,.025,d,'water');else this.box(x,y+.29,z,w,.025,d,'ground');if(this.lod>0&&this.recipe.geography.freshwater>.3){for(let k=0;k<4;k++)this.box(x+(k-1.5)*w*.16,y+.319,z+(k%2-.5)*d*.3,w*.16,.015,.055,'trim')}}
 fountain(x,y,z,r=1.4){this.pool(x,y,z,r*2,r*2);if(this.recipe.geography.freshwater<=.3)return;this.lathe(x,y+.3,z,[[.4,0],[.22,.5],[.9,.7],[.85,.95],[.15,.98],[.15,1.5],[.48,1.6],[.46,1.8],[0,1.8]],'trim',12);this.cylinder(x,y+2.1,z,.06,.3,'water',6)}
 // Forms match CityEnvironment.canopy(), so a tree authored into a precinct is the
 // same species the surrounding landscape grows. 'pine'/'broad' are kept as aliases
 // for the hand-authored templates that name them directly.
 tree(x,y,z,h=5,kind='broad'){this.mark(kind+'-tree');
  if(kind==='none')return;
  if(kind==='cushion'){this.rock(x,y,z,h*.30,h*.16,h*.30,7,'leaf',true);return}
  if(kind==='scrub'){this.rock(x,y,z,h*.34,h*.42,h*.32,7,'leaf',true);this.rock(x+h*.22,y,z-h*.16,h*.22,h*.28,h*.21,6,'leaf',true);return}
  this.cone(x,y,z,h*.11,h*.65,'wood',h*.045,7);
  if(kind==='pine'||kind==='conifer'){for(let k=0;k<3;k++)this.cone(x,y+h*.23+k*h*.2,z,h*(.3-.055*k),h*.52,'leaf',0,9);if(this.recipe.geography.cold&&this.lod>0)for(let k=0;k<2;k++)this.cone(x,y+h*.32+k*h*.25,z,h*(.21-.06*k),h*.42,'trim',0,9)}
  else if(kind==='palm'){for(let k=0;k<7;k++){const a=k/7*Math.PI*2,tip=[x+Math.cos(a)*h*.48,y+h*.73,z+Math.sin(a)*h*.48],mid=[x+Math.cos(a)*h*.2,y+h*.97,z+Math.sin(a)*h*.2],root=[x,y+h*.79,z];this.tri(root,mid,[tip[0]-.14,tip[1],tip[2]-.14],'leaf');this.tri(root,[tip[0]+.14,tip[1],tip[2]+.14],mid,'leaf')}}
  // Savanna: a bare stem carrying one wide flat crown.
  else if(kind==='acacia'){this.rock(x,y+h*.62,z,h*.52,h*.26,h*.50,this.lod>0?9:6,'leaf',true)}
  // Mangrove: a low canopy standing on visible prop roots.
  else if(kind==='mangrove'){for(let k=0;k<4;k++){const a=k/4*Math.PI*2;this.beam([x+Math.cos(a)*h*.24,y,z+Math.sin(a)*h*.24],[x,y+h*.42,z],h*.035,'wood',4)}this.rock(x,y+h*.44,z,h*.36,h*.44,h*.34,this.lod>0?9:6,'leaf',true)}
  // Closed tropical canopy: a tall clear trunk with layered crowns above it.
  else if(kind==='rainforest'){for(let k=0;k<4;k++){const a=k*2.1,r=h*(.30-.04*k);this.rock(x+Math.cos(a)*h*.14,y+h*(.72+k*.09),z+Math.sin(a)*h*.14,r,h*.26,r,this.lod>0?9:6,k%2?'leaf':colorScale(this.color('leaf'),1.10),true)}}
  else{for(let k=0;k<5;k++){const a=k*2.3999,xx=x+Math.cos(a)*h*.2,zz=z+Math.sin(a)*h*.2,yy=y+h*(.66+(k%2)*.17);this.beam([x,y+h*.43,z],[xx,yy,zz],h*.045,'wood');this.rock(xx,yy-h*.16,zz,h*.33,h*.30,h*.32,this.lod>0?9:6,k%2?'leaf':colorScale(this.color('leaf'),1.12),true)}}}
 rock(x,y,z,rx,h,rz,seg=8,m='ground',foliage=false){const values=[];for(let k=0;k<seg;k++)values.push(.85+this.random()*.23);const profiles=foliage?[[.55,0],[1,.25],[.82,.65],[.30,.98],[0,1.05]]:[[1,0],[.92,.33],[.75,.72],[.37,1],[.05,1.05]];for(let ring=0;ring<profiles.length-1;ring++){for(let k=0;k<seg;k++){const p=(R,j)=>{const a=j/seg*Math.PI*2,jj=j%seg;return[x+Math.cos(a)*rx*profiles[R][0]*values[jj],y+h*profiles[R][1],z+Math.sin(a)*rz*profiles[R][0]*values[jj]]};this.quad(p(ring,k),p(ring+1,k),p(ring+1,k+1),p(ring,k+1),colorScale(this.color(m),.90+(k%3)*.055))}}}
 hedge(x,y,z,w,d){this.box(x,y,z,w,.45,d,'leaf');if(this.lod>0)this.box(x,y+.44,z,w*.96,.05,d*.96,colorScale(this.color('leaf'),1.15))}
 garden(x,y,z,w=7,d=7){this.mark('formal-garden');this.box(x,y,z,w,.09,d,'ground');for(const sx of[-1,1])for(const sz of[-1,1]){const xx=x+sx*w*.25,zz=z+sz*d*.25;this.hedge(xx,y+.08,zz,w*.35,.35);this.hedge(xx,y+.08,zz+d*.15,w*.35,.35);this.hedge(xx-w*.175,y+.08,zz+d*.075,.35,d*.15);this.hedge(xx+w*.175,y+.08,zz+d*.075,.35,d*.15)}this.box(x,y+.11,z,.85,.05,d,'trim');this.box(x,y+.12,z,w,.05,.85,'trim')}
 crystal(x,y,z,r=1,h=4){this.mark('crystal-crown');this.lathe(x,y,z,[[0,0],[r*.7,0],[r,h*.18],[r*.85,h*.72],[0,h]],'water',6);if(this.lod>0){for(let k=0;k<6;k++){const a=k*Math.PI/3;this.beam([x+Math.cos(a)*r*.85,y+h*.72,z+Math.sin(a)*r*.85],[x,y+h,z],.024,'trim')}}}
 emblem(x,y,z,s=1){this.mark('ritual-'+this.recipe.faith);const f=this.recipe.faith;
 if(f==='stars'){this.ring(x,y,z,s,.065,'metal','xy',18);this.ring(x,y,z,s*.7,.05,'metal','yz',16);this.crystal(x,y-s*.3,z,s*.22,s*.9)}
 else if(f==='grove'){this.beam([x,y-s,z],[x,y+s,z],.09,'wood');for(const sign of[-1,1]){this.beam([x,y-s*.2,z],[x+sign*s*.8,y+s*.5,z],.055,'wood');this.cone(x+sign*s*.7,y+s*.2,z,.27,.6,'leaf',0,5)}}
 else if(f==='hearth'){this.lathe(x,y-s*.3,z,[[.3,0],[s*.6,s*.2],[s*.6,s*.35],[0,s*.35]],'metal',8);this.crystal(x,y+s*.04,z,s*.26,s*.85)}
 else if(f==='tide'){for(let k=0;k<3;k++)this.beam([x-s,y+(k-1)*.27,z],[x+s,y+(k-1)*.27+.20,z],.065,'metal')}
 else if(f==='ancestors'){for(const sign of[-1,0,1]){this.box(x+sign*s*.55,y-s*.6,z,s*.26,s*(sign?1.0:1.6),s*.25,'trim');this.cone(x+sign*s*.55,y+s*(sign?.4:1),z,s*.19,.35,'metal',0,4)}}
 else {this.ring(x,y,z,s*.65,.09,'metal','xy',20);if(f==='sun')for(let k=0;k<12;k++){const a=k*Math.PI/6;this.beam([x+Math.cos(a)*s*.85,y+Math.sin(a)*s*.85,z],[x+Math.cos(a)*s*1.15,y+Math.sin(a)*s*1.15,z],.06,'metal')}}}
 banner(x,y,z,h=3){this.mark('banner');this.beam([x,y,z],[x,y+h,z],.04,'metal');this.quad([x,y+h,z],[x+.8,y+h-.12,z],[x+.8,y+h-1,z],[x,y+h-.8,z],this.recipe.faith==='stars'?'water':'roof')}
 cultureDetail(x,y,z){const c=this.recipe.culture;if(c==='Dwarven craft'){for(const s of[-1,1])this.box(x+s*2,y,z,.9,2,.9,'wall',Math.PI/4)}else if(c==='Elven craft'){this.tree(x-2.5,y,z,4);this.tree(x+2.5,y,z,4)}else if(c==='Clan craft'){for(const s of[-1,1]){this.cylinder(x+s*2,y,z,.22,2.5,'wood',6);this.cone(x+s*2,y+2.4,z,.55,.55,'roof',0,4)}}else if(c==='Drake craft'){for(const s of[-1,1]){this.tri([x+s,y,z],[x+s*3,y+2.5,z],[x+s*1.3,y+1.2,z+.3],'metal')}}else{this.banner(x-2,y,z,2.4);this.banner(x+2,y,z,2.4)}}
 finish(){let total=0;const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of this.parts){const a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity],v=p.geometry.data;for(let k=0;k<v.length;k+=9)for(let t=0;t<3;t++){if(!Number.isFinite(v[k+t]))throw Error('Non-finite landmark vertex.');a[t]=Math.min(a[t],v[k+t]);b[t]=Math.max(b[t],v[k+t]);lo[t]=Math.min(lo[t],v[k+t]);hi[t]=Math.max(hi[t],v[k+t])}p.bounds={min:a,max:b};p.anchor=a.map((v,i)=>(v+b[i])/2);total+=v.length/27;}this.parts=this.parts.filter(p=>p.geometry.data.length);return{recipe:this.recipe,signature:LandmarkCatalog.signature(this.recipe),parts:this.parts,bounds:{min:lo,max:hi},stats:{triangles:total,parts:this.parts.length,modules:this.modules,moduleCount:Object.values(this.modules).reduce((a,b)=>a+b,0)}}}
}
