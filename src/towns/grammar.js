/** Road sockets and neighborhood centers for entire towns. Targets are snapped to
 * existing dry ground, then connected by the same slope-aware pathfinder. */
const TownGrammar = (()=>{
 function plan(city,profile,rng,candidates,route){
  const c=city.market,center=city.marketIndex,n=city.n,hubs=[center],roles={market:center},keyset=new Set();
  // Every hub offset below is authored against the original 152-unit town; S restates
  // them for whatever footprint this site earned, so the street net reaches its edge.
  const S=city.width/152;
  const snap=(x,z)=>candidates.reduce((best,k)=>{const q=city.xy(k.k),v=(q.x-x)**2+(q.z-z)**2+city.slope[k.k]*80;return v<best.v?{i:k.k,v}:best},{i:center,v:Infinity}).i;
  const add=(a,b,kind='street')=>{if(a===b)return;const key=[a,b].sort((x,y)=>x-y).join(':');if(keyset.has(key))return;const path=route(a,b);if(path.length<2)return;keyset.add(key);path.forEach(i=>city.road[i]=1);city.roads.push({kind,nodes:path,points:path.map(i=>({...city.xy(i),y:city.height[i]+.13,bridge:!!city.water[i]}))});if(!hubs.includes(b))hubs.push(b)};
  const at=(x,z)=>snap(c.x+x*S,c.z+z*S),chain=(pts,kind='street')=>{let a=center;for(const pt of pts){const b=at(...pt);add(a,b,kind);a=b}return a};
  const axis=(dx,dz,t)=>at(dx*t,dz*t);
  let axisX=1,axisZ=0;
  // Principal shoreline tangent is estimated from actual water samples.
  let sx=0,sz=0,count=0;
  for(let i=0;i<city.water.length;i++)if(city.water[i]){const q=city.xy(i),d=Math.hypot(q.x-c.x,q.z-c.z);if(d<72*S){const a=1/(d+4);sx+=(q.x-c.x)*a;sz+=(q.z-c.z)*a;count++}}
  const length=Math.hypot(sx,sz);if(length>1){axisX=-sz/length;axisZ=sx/length}
  city.shoreAxis=[axisX,axisZ];
  if(profile.plan==='axial'||profile.plan==='processional'){
   const rows=profile.plan==='processional'?[-40,-22,0,21,39]:[-32,-15,0,16,33],cols=[-38,-19,0,19,38],grid=rows.map(z=>cols.map(x=>at(x,z)));
   rows.forEach((_,j)=>cols.forEach((_,i)=>{if(i)add(grid[j][i-1],grid[j][i],j===2?'arterial':'street');if(j)add(grid[j-1][i],grid[j][i],i===2?'arterial':'lane')}));
   add(center,grid[2][2],'arterial');roles.civic=at(profile.plan==='processional'?-23:0,-32);roles.temple=at(profile.plan==='processional'?0:25,-36);roles.academy=at(-25,23);
  }else if(profile.plan==='rings'){
   let inner=[];for(const radius of[18,36,50]){const ring=[];for(let k=0;k<12;k++){const a=k/12*2*Math.PI;ring.push(at(Math.cos(a)*radius,Math.sin(a)*radius*.86))}for(let k=0;k<ring.length;k++){add(ring[k],ring[(k+1)%ring.length],'street');if(k%3===0)add(inner[k]??center,ring[k],'arterial')}inner=ring}
   roles.civic=at(-17,-13);roles.academy=at(18,-16);roles.temple=at(0,27);
  }else if(profile.plan==='groves'){
   for(let k=0;k<6;k++){const a=k*Math.PI/3+.18,rad=26+rng()*8,x=Math.cos(a)*rad,z=Math.sin(a)*rad*.85,h=at(x,z);add(center,h,'arterial');let ring=[];for(let j=0;j<5;j++){const t=j/5*Math.PI*2;ring.push(at(x+Math.cos(t)*11,z+Math.sin(t)*10))}for(let j=0;j<5;j++){add(j?ring[j-1]:h,ring[j],'lane')}if(k===0)roles.civic=h;if(k===2)roles.temple=h;if(k===4)roles.academy=h}
  }else if(profile.plan==='terraces'){
   // Rotate terrace axes along the local contour, retaining actual elevations.
   const ix=city.index(c.x+8,c.z),jx=city.index(c.x-8,c.z),iz=city.index(c.x,c.z+8),jz=city.index(c.x,c.z-8),gx=city.height[ix]-city.height[jx],gz=city.height[iz]-city.height[jz],L=Math.hypot(gx,gz)||1;
   const dx=-gz/L||1,dz=gx/L,rx=-dz,rz=dx;let last=center;
   for(let row=-2;row<=2;row++){const line=[];for(let col=-2;col<=2;col++){const x=col*19,z=row*16;line.push(at(dx*x+rx*z,dz*x+rz*z))}for(let j=1;j<5;j++)add(line[j-1],line[j],'street');add(last,line[row%2?0:4],'lane');last=line[row%2?4:0]}
   roles.civic=at(-rx*31,-rz*31);roles.temple=at(rx*23+dx*15,rz*23+dz*15);roles.academy=at(dx*25,dz*25);
  }else if(profile.plan==='labyrinth'||profile.plan==='grid'){
   const step=profile.plan==='labyrinth'?14:20,grid=[];for(let j=-3;j<=3;j++){const row=[];for(let i=-3;i<=3;i++){const jitter=profile.plan==='labyrinth'?2.5:0;row.push(at(i*step+(rng()-.5)*jitter,j*step*.8+(rng()-.5)*jitter))}grid.push(row)}
   for(let j=0;j<7;j++)for(let i=0;i<7;i++){if(i)add(grid[j][i-1],grid[j][i],j===3?'arterial':'lane');if(j&&(profile.plan==='grid'||i%2===0||j%2===0))add(grid[j-1][i],grid[j][i],i===3?'arterial':'street')}add(center,grid[3][3],'arterial');roles.civic=at(-22,-25);roles.temple=at(24,-22);roles.academy=at(23,23);
  }else{
   const dx=axisX,dz=axisZ,rx=-dz,rz=dx;let grids=[];const rows=profile.plan==='ribbon'?[-14,0,15]:[-23,-5,15,30];
   for(const t of rows){let line=[];for(let k=-3;k<=3;k++)line.push(at(dx*k*17+rx*t,dz*k*17+rz*t));grids.push(line);for(let k=1;k<7;k++)add(line[k-1],line[k],'arterial')}
   for(let r=1;r<grids.length;r++)for(let k=0;k<7;k+=2)add(grids[r-1][k],grids[r][k],'lane');add(center,grids[1][3],'street');roles.civic=at(rx*23,rz*23);roles.temple=at(dx*30+rx*16,dz*30+rz*16);roles.academy=at(-dx*28+rx*13,-dz*28+rz*13);
  }
  // Sparse feeder lanes fill remaining districts, avoiding an identical radial city.
  for(let k=0;k<(profile.plan==='groves'?5:8);k++){const q=candidates[Math.floor(rng()*Math.min(candidates.length,Math.round(1900*S*S)))],t=city.xy(q.k),near=hubs.reduce((a,b)=>Math.hypot(city.xy(a).x-t.x,city.xy(a).z-t.z)<Math.hypot(city.xy(b).x-t.x,city.xy(b).z-t.z)?a:b);add(near,q.k,'lane')}
  // Attach any accidentally isolated road subgraph to the market over valid ground.
  const flood=()=>{const seen=new Uint8Array(city.road.length),q=[center];seen[center]=1;for(let n0=0;n0<q.length;n0++){const k=q[n0],x=k%n,y=Math.floor(k/n);for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=n||yy<0||yy>=n)continue;const j=yy*n+xx;if(!seen[j]&&city.road[j]){seen[j]=1;q.push(j)}}}return seen};
  let seen=flood();for(const h of [...hubs])if(!seen[h]){add(center,h,'lane');seen=flood()}
  // Non-reachable pieces never receive an orphaned neighborhood.
  for(let i=0;i<city.road.length;i++)if(!seen[i])city.road[i]=0;
  city.roads=city.roads.filter(r=>r.nodes.every(i=>seen[i]));
  roles.workshop=roles.academy||hubs[3];roles.home=hubs[Math.min(5,hubs.length-1)]||center;roles.garden=hubs[hubs.length-1]||center;
  city.planSockets={roles,hubs,grammar:profile.plan};return hubs;
 }
 function moduleFor(city,b,rng){
  if(b.landmark){b.module='landmark-precinct';return}
  const f=city.townProfile,variant=Math.floor(rng()*3),kind=f.kit;
  b.program=city.districts[b.district].type;
  b.module=`${kind}/${b.program}-${variant}`;b.moduleVariant=variant;b.components=kind==='longhalls'?3:kind==='campuses'?4:kind==='pavilions'?3:kind==='terraces'?3:kind==='bastions'?3:kind==='decks'?3:kind==='cloisters'?4:4;
  b.blockType=kind;b.name=`${{courts:'Courtyard block',cloisters:'Cloister & guesthouse block',campuses:'Scholar campus',pavilions:'Pavilion clearing',terraces:'Workshop terrace',courtyards:'Courtyard compound',decks:'Raised waterside court',bastions:'Fortified working yard',longhalls:'Longhall & storehouses'}[kind]} ${b.id.slice(1)}`;
 }
 return {plan,moduleFor};
})();
