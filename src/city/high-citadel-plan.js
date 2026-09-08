/** Small inhabited ridge settlements: independent parcels, joined by surveyed
 * footpaths. The parent rock, snow and drainage are never levelled or replaced. */
const HighCitadelPlan = (() => {
 const matches=p=>['dragon','holy'].includes(p?.highCitadel?.kind);
 function survey(){
  const span=2.16,grow=span/CityEnvironment.cityDimensions.span;
  return{span,grow,crowd:0,settled:1,width:CityEnvironment.cityDimensions.width*grow,
   depth:CityEnvironment.cityDimensions.depth*grow,terrainSpan:span*CityEnvironment.cityFootprint};
 }
 const plans={
  dragon:[
   ['keep',0,-9,6.4,6,9,'civic','The Dragon Crown'],
   ['watch',-10,-10,2.7,2.7,6,'civic','West Horn Watch'],['watch',10,-10,2.7,2.7,6,'civic','East Horn Watch'],
   ['roost',-10,-3,4.1,3.8,4.5,'garden','Windward Roost'],['roost',10,-3,4.1,3.8,4.5,'garden','Dawn Roost'],
   ['lodge',-4.8,-2,3.1,3.2,3.6,'home','Crownkeeper Lodge'],['lodge',4.8,-2,3.1,3.2,3.6,'home','Wingkeeper Lodge'],
   ['forge',-10,5,3.7,3.3,4,'workshop','Ember Forge'],['store',10,5,3.1,3.2,3.5,'workshop','Winter Stores'],
   ['lodge',-4.8,5,3.2,3.2,3.5,'home','Ridge Hearth'],['lodge',4.8,5,3.2,3.2,3.5,'home','Cloud Hearth'],
   ['lodge',-7,11,3.1,2.8,3.5,'home','Gatekeeper Lodge'],['store',7,11,3.1,2.8,3.4,'workshop','Wayfarer Stores'],
   ['gate',0,11,4,3.1,5.6,'civic','The Horn Gate']
  ],
  holy:[
   ['sanctuary',0,-9,6.1,6.5,9.5,'temple','Sanctuary Above the Clouds'],
   ['bell',-9,-10,2.6,2.6,7,'temple','Dawn Bell'],['bell',9,-10,2.6,2.6,7,'temple','Vesper Bell'],
   ['chapel',-10,-3,3.3,4.1,5.3,'temple','The Quiet Chapel'],['chapel',10,-3,3.3,4.1,5.3,'temple','Chapel of the Ascent'],
   ['scriptorium',-4.5,-1,3.3,3.1,3.8,'academy','High Scriptorium'],['hospice',4.5,-1,3.3,3.1,3.8,'home','Keepers’ House'],
   ['hospice',-10,5,3.8,3.2,4,'home','Pilgrims’ Hospice'],['scriptorium',10,5,3.8,3.2,4,'academy','The Reading House'],
   ['hospice',-4.5,6,3.1,3,3.5,'home','Western Guesthouse'],['hospice',4.5,6,3.1,3,3.5,'home','Eastern Guesthouse'],
   ['store',-7,11,3,2.8,3.4,'workshop','Pilgrim Stores'],['store',7,11,3,2.8,3.4,'workshop','Winter Pantry'],
   ['gate',0,12,3.8,2.8,5.2,'temple','Gate of the Ascent']
  ]
 };
 function build(c,p,{landmarkOnly,parcelBounds,atlasScale}){
  c.highCitadel={...p.highCitadel};c.streetGradeCap=1.2;c.port=null;c.connectors=[];c.blocks=[];c.urbanRadius=c.width*.40;
  const {n,width,depth}=c,nn=n*n;
  const dry=k=>!c.water[k]&&c.environment.ice[k]<=25&&c.environment.snow[k]<=.5&&c.atlasSlope[k]<=c.streetGradeCap;
  // Turn the complete composition towards the safest rock shoulder. A summit
  // can be gentle on one side and sheer on the other; a central derivative alone
  // would put the largest sanctuary over the steep side of that same ridge.
  const rotated=(x,z,t)=>t===1?[-z,x]:t===2?[-x,-z]:t===3?[z,-x]:[x,z];
  let turn=0,fit=Infinity,shiftX=0,shiftZ=0;
  for(let t=0;t<4;t++)for(const ox of[-6,-3,0,3,6])for(const oz of[-6,-3,0,3,6]){
   let score=Math.hypot(ox,oz)*.08;
   for(const [role,px,pz,pw,pd,h]of plans[p.highCitadel.kind]){
    const [rx,rz]=rotated(px,pz,t),x=rx+ox,z=rz+oz,w=t%2?pd:pw,d=t%2?pw:pd;
    if(Math.abs(x)+w/2>width/2-1.2||Math.abs(z)+d/2>depth/2-1.2)score+=1000;
    const bounds=parcelBounds(x,z,w,d),fall=(bounds.top-bounds.low)/atlasScale;
    score+=fall*(['keep','sanctuary'].includes(role)?4:1)+Math.max(0,fall-Math.min(3.8,h*.65))*6;
   }
   if(score<fit){fit=score;turn=t;shiftX=ox;shiftZ=oz;}
  }
  const rotate=(x,z)=>{const [a,b]=rotated(x,z,turn);return[a+shiftX,b+shiftZ];};
  c.highCitadel.orientation=turn;c.highCitadel.shoulder=[shiftX,shiftZ];
  const districts=p.highCitadel.kind==='dragon'?
   [['civic','The Crown Ridge'],['home','Hearth Terraces'],['workshop','Keeper Yards'],['garden','The High Roosts']]:
   [['temple','The Sacred Ridge'],['home','Pilgrim Terraces'],['academy','The Reading Close'],['workshop','Winter Courts']];
  c.districts=districts.map(([type,name],id)=>({id,type,name,x:0,z:0,buildings:0}));
  const margin=.65;
  for(const [role,px,pz,pw,pd,h,type,name]of plans[p.highCitadel.kind]){
   const [tx,tz]=rotate(px,pz),w=turn%2?pd:pw,d=turn%2?pw:pd;
   let best=null;
   for(let oz=-3;oz<=3;oz+=.6)for(let ox=-3;ox<=3;ox+=.6){
    const x=tx+ox,z=tz+oz;if(Math.abs(x)+w/2>width/2-1.2||Math.abs(z)+d/2>depth/2-1.2)continue;
    if(c.buildings.some(b=>Math.abs(b.x-x)<(b.w+w)/2+margin&&Math.abs(b.z-z)<(b.d+d)/2+margin))continue;
    if(!cityParcelEvery(c,{x,z},w,d,dry))continue;
    const bound=parcelBounds(x,z,w,d),fall=(bound.top-bound.low)/atlasScale,footingLimit=Math.min(3.8,h*.65);
    if(fall>footingLimit)continue;
    const score=Math.hypot(ox,oz)+fall*.22;
    if(!best||score<best.score)best={x,z,w,d,score,terrainFall:fall,footingLimit};
   }
   if(!best)continue;
   const district=Math.max(0,c.districts.findIndex(d=>d.type===type));
   const b={...best,id:`high-${p.id}-${role}-${c.buildings.length}`,type,name,h,y:0,angle:turn*Math.PI/2,
    district,landmark:['keep','sanctuary','gate','bell','watch','chapel','roost'].includes(role),
    highRole:role,module:`high-${p.highCitadel.kind}-${role}`,condition:1,components:1,lod:2};
   delete b.score;c.buildings.push(b);
  }
  if(!c.buildings.some(b=>['keep','sanctuary'].includes(b.highRole)))throw Error('No stable parcel for the high citadel sanctuary.');
  const occupied=new Uint8Array(nn);
  for(let k=0;k<nn;k++){const q=c.xy(k);if(c.buildings.some(b=>Math.abs(q.x-b.x)<b.w/2+.25&&Math.abs(q.z-b.z)<b.d/2+.25))occupied[k]=1;}
  const pass=k=>dry(k)&&!occupied[k];
  let center=-1,nearest=Infinity;
  for(let k=0;k<nn;k++)if(pass(k)){const q=c.xy(k),dist=Math.hypot(q.x,q.z);if(dist<nearest){nearest=dist;center=k;}}
  if(center<0)throw Error('No dry approach to the high citadel.');
  c.marketIndex=center;c.market=c.xy(center);c.road[center]=1;
  function route(goal){
   const costs=new Float64Array(nn).fill(Infinity),prev=new Int32Array(nn).fill(-1),heap=new MinHeap();costs[center]=0;heap.push(center,0);
   while(heap.length){const[k,cost]=heap.pop();if(cost>costs[k]+1e-8)continue;if(k===goal)break;
    const x=k%n,z=Math.floor(k/n);
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
     const xx=x+dx,zz=z+dz;if(xx<1||xx>=n-1||zz<1||zz>=n-1)continue;
     const j=zz*n+xx;if(!pass(j)||(dx&&dz&&(!pass(z*n+xx)||!pass(zz*n+x))))continue;
     const next=cost+Math.hypot(dx,dz)*(1+c.atlasSlope[j]*3)*(c.road[j]?.6:1);
     if(next<costs[j]){costs[j]=next;prev[j]=k;heap.push(j,next);}
    }
   }
   if(!Number.isFinite(costs[goal]))return[];const path=[];for(let k=goal;k!==-1;k=prev[k]){path.push(k);if(k===center)break;}return path.reverse();
  }
  const connected=[];
  for(const b of c.buildings){
   const ends=[[b.x,b.z+b.d/2+.75],[b.x,b.z-b.d/2-.75],[b.x+b.w/2+.75,b.z],[b.x-b.w/2-.75,b.z]]
    .map(([x,z])=>c.index(x,z)).filter(pass).sort((a,b)=>{const A=c.xy(a),B=c.xy(b);return Math.hypot(A.x-c.market.x,A.z-c.market.z)-Math.hypot(B.x-c.market.x,B.z-c.market.z);});
   let path=[];for(const end of ends){path=route(end);if(path.length)break;}if(!path.length)continue;
   path.forEach(i=>c.road[i]=1);const points=path.map(i=>({...c.xy(i),y:c.height[i]+.13,bridge:false}));
   c.roads.push({kind:'path',role:'ridge-stair',nodes:path,points});
   b.streetSocket=path.at(-1);const q=c.xy(b.streetSocket);
   const a={x:cityClamp(q.x,b.x-b.w/2,b.x+b.w/2),z:cityClamp(q.z,b.z-b.d/2,b.z+b.d/2)};
   c.connectors.push({blockId:b.id,a,b:{...q,i:b.streetSocket},dist:Math.hypot(q.x-a.x,q.z-a.z)});
   let low=Infinity,top=-Infinity;cityParcelEvery(c,b,b.w,b.d,k=>{low=Math.min(low,c.height[k]);top=Math.max(top,c.height[k]);return true;});
   b.foundationBed=low;b.y=top+.07;connected.push(b);
  }
  c.buildings=connected;c.landmarks=connected.filter(b=>b.landmark).map(b=>b.id);
  if(!connected.some(b=>['keep','sanctuary'].includes(b.highRole)))throw Error('The high sanctuary has no dry footpath.');
  for(const district of c.districts){const group=connected.filter(b=>b.district===district.id);district.buildings=group.length;
   if(group.length){district.x=group.reduce((s,b)=>s+b.x,0)/group.length;district.z=group.reduce((s,b)=>s+b.z,0)/group.length;}}
  c.blocks=connected.filter(b=>!b.landmark).map(b=>({id:b.id,template:b.module,district:b.district,components:1,streetSocket:b.streetSocket,x:b.x,z:b.z,width:b.w,depth:b.d}));
  c.lod={full:connected.length,mid:0,plain:0,estimate:connected.length*4000};
  const weights={home:0,workshop:0,market:0,temple:0,academy:0,harbor:0,civic:0,garden:0};for(const d of c.districts)weights[d.type]+=d.buildings;
  c.stats={modules:c.blocks.length,structures:connected.length,grammar:'ridge-pilgrimage',buildings:connected.length,landmarks:c.landmarks.length,streets:c.roads.length,districts:c.districts.length,waterPercent:c.water.reduce((a,b)=>a+b,0)/nn*100,bridges:0,piers:0,port:null,weights};
  c.fingerprint=cityHash(JSON.stringify({recipe:TownCatalog.signature(c.townRecipe),center:c.center,roads:c.roads.map(r=>r.nodes),buildings:connected.map(b=>[b.id,b.x,b.z,b.w,b.d,b.highRole])}));
  return landmarkOnly?{townRecipe:c.townRecipe,townProfile:c.townProfile,highCitadel:c.highCitadel,buildingCount:connected.length,buildings:connected.filter(b=>['keep','sanctuary'].includes(b.highRole))}:c;
 }
 // Founding tests the same parcels and paths that will actually be displayed,
 // on a temporary view of the province. No residents or terrain are changed.
 function viable(w,sim,p,kind){
  const candidate={...p,settled:true,urbanPop:Math.max(650,p.urbanPop),highCitadel:{kind,version:1}};
  const provinces=sim.provinces.slice();provinces[p.id]=candidate;
  try{const c=generateCityLandmark(w,{...sim,provinces},p.id);return c.buildingCount>=10&&c.buildings.length===1;}catch(_){return false;}
 }
 return{matches,survey,build,viable};
})();
