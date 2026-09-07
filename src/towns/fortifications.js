/** Defensive urbanism, v11. Pure layout data; never edits a parent world field.
 * A citadel reserves genuinely buildable high ground BEFORE streets are routed.
 * The outer enceinte follows a buffered urban hull. Water gaps are not called gates.
 */
const FortressPlan=(()=>{
 const inside=(q,b,pad=0)=>Math.abs(q.x-b.x)<=b.w/2+pad&&Math.abs(q.z-b.z)<=b.d/2+pad;
 function reserve(c,candidates,p){
  // A hamlet does not acquire a royal capital just because its view was opened.
  if((p.detailSupport??p.urbanSupport)<1500||c.townProfile.id==='delta')return null;
  const sacred=c.townProfile.id==='basilica'&&(p.detailSupport??p.urbanSupport)>=6500;
  const ordinary=candidates.filter(a=>{const q=c.xy(a.k),d=Math.hypot(q.x-c.market.x,q.z-c.market.z);const S=c.width/152;return d>(sacred?23:19)*S&&d<(sacred?34:43)*S&&Math.abs(q.x)<c.width*.34&&Math.abs(q.z)<c.depth*.32});
  const ranked=ordinary.map(a=>({k:a.k,score:c.height[a.k]*(sacred?1.7:2.4)-c.slope[a.k]*4-Math.hypot(c.xy(a.k).x-c.market.x,c.xy(a.k).z-c.market.z)*(sacred?.14:.05)})).sort((a,b)=>b.score-a.score);
  for(const size of (sacred?[38,34,30,26,22]:[26,22,18])) for(const {k}of ranked.slice(0,700)){
   const q=c.xy(k),site={...q,k,w:size,d:size},samples=[];let valid=true;
   if(inside(c.market,site,5))continue;
   // Step with the grid, not a fixed stride: anything coarser than a cell skips cells that
   // buildingAt then finds, and the reserve hands back a parcel the precinct cannot use.
   // The grid is n x n over width x depth, so the z cell is the smaller of the two.
   const step=Math.min(c.width,c.depth)/(c.n-1)*.85;
   for(let x=-size/2-1.1;x<=size/2+1.1;x+=step){for(let z=-size/2-1.1;z<=size/2+1.1;z+=step){const j=c.index(q.x+x,q.z+z);if(c.water[j]||c.environment.ice[j]>25||c.environment.snow[j]>.5||c.slope[j]>.85){valid=false;break}samples.push(c.height[j])}if(!valid)break}
   if(!valid||Math.max(...samples)-Math.min(...samples)>5.6)continue;
   site.sacred=sacred;site.deck=Math.max(...samples)+.16;site.bed=Math.min(...samples);site.relief=site.deck-site.bed;
   // buildingAt() snaps its footprint samples to the NEAREST cell, so a cell centre up to
   // half a cell beyond the parcel edge is still tested. Mask that far or a street routes
   // through ground the precinct will later refuse to build on.
   const pad=Math.max(.65,c.width/(c.n-1)*.5+.05);
   const masks=new Uint8Array(c.n*c.n);for(let j=0;j<masks.length;j++)if(inside(c.xy(j),site,pad))masks[j]=1;
   c.citadelReserve=masks;c.citadelSite=site;return site;
  }return null;
 }
 function hull(points){const pts=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z),cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);const lo=[],hi=[];for(const p of pts){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p)}for(const p of pts.reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p)}lo.pop();hi.pop();return lo.concat(hi)}
 function build(c){
  c.defenses={version:1,walls:[],gates:[],towers:[],quays:[],perimeter:[],enclosed:false,kind:['forest','delta'].includes(c.townProfile.id)?'timber':'stone'};
  if(c.buildings.length<12)return c.defenses;
  const points=[];for(const b of c.buildings)for(const sx of[-1,1])for(const sz of[-1,1])points.push({x:b.x+sx*(b.w/2+2.4),z:b.z+sz*(b.d/2+2.4)});
  const poly=hull(points),samples=[];
  for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/1.4));for(let k=0;k<steps;k++){const t=k/steps;samples.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t})}}
  const legal=q=>{const i=c.index(q.x,q.z);return Math.abs(q.x)<c.width/2-1&&Math.abs(q.z)<c.depth/2-1&&!c.water[i]&&c.environment.ice[i]<25&&!c.buildings.some(b=>inside(q,b,.45))};
  // Reserve road-free building cells, then grow a land-only access field from
  // the existing streets. Curved approaches avoid houses instead of crossing them.
  const occupied=new Uint8Array(c.n*c.n),approaches=[];
  for(const b of c.buildings){const a=c.index(b.x-b.w/2,b.z-b.d/2),z=c.index(b.x+b.w/2,b.z+b.d/2);for(let y=Math.floor(a/c.n);y<=Math.floor(z/c.n);y++)for(let x=a%c.n;x<=z%c.n;x++)occupied[y*c.n+x]=1;}
  // Footprints are rounded out to whole cells, which is what auditCity also samples, so the
  // mask must stay that coarse. A street cell is never a house though: generateCity refuses
  // to build on one. Reopening them keeps the network connected for the approach search,
  // which a dense town otherwise seals off entirely.
  for(let i=0;i<occupied.length;i++)if(c.road[i])occupied[i]=0;
  const passable=i=>!occupied[i]&&!c.water[i]&&c.environment.ice[i]<25;
  const distance=new Float64Array(c.n*c.n).fill(Infinity),parent=new Int32Array(c.n*c.n).fill(-1),queue=new MinHeap();
  for(let i=0;i<c.road.length;i++)if(c.road[i]&&passable(i)){distance[i]=0;queue.push(i,0);}
  const steps=(c.n-1)/c.width;
  while(queue.length){const [i,d]=queue.pop();if(d!==distance[i]||d>41.8*steps)continue;const x=i%c.n,y=Math.floor(i/c.n);
   for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<2||xx>=c.n-2||yy<2||yy>=c.n-2)continue;const j=yy*c.n+xx;if(!passable(j))continue;const nd=d+1+Math.abs(c.height[j]-c.height[i])*.7;if(nd<distance[j]){distance[j]=nd;parent[j]=i;queue.push(j,nd)}}
  }
  const candidates=[];for(const q of samples){const dx=q.x-c.market.x,dz=q.z-c.market.z,L=Math.hypot(dx,dz)||1,out={x:q.x+dx/L*7,z:q.z+dz/L*7};if(!legal(q)||!legal(out))continue;const goal=c.index(out.x,out.z);if(distance[goal]>0&&distance[goal]<34.2*steps)candidates.push({q,goal,cost:distance[goal]});}
  candidates.sort((a,b)=>a.cost-b.cost);
  for(const {q,goal}of candidates){if(approaches.some(a=>Math.hypot(a.x-q.x,a.z-q.z)<40*c.width/152))continue;
   const nodes=[];let i=goal;while(i>=0){nodes.push(i);if(distance[i]===0)break;i=parent[i];}if(nodes.length<3)continue;nodes.reverse();
   nodes.forEach(i=>c.road[i]=1);c.roads.push({kind:'arterial',nodes,points:nodes.map(i=>({...c.xy(i),y:c.height[i]+.14,bridge:false})),role:'gate-approach'});approaches.push(q);if(approaches.length>=3)break;
  }
  const nearRoad=q=>{let r=Infinity;for(const road of c.roads)for(const pt of road.points)r=Math.min(r,Math.hypot(q.x-pt.x,q.z-pt.z));return r};
  const tags=samples.map((a,j)=>{const b=samples[(j+1)%samples.length],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};return!legal(a)||!legal(b)||!legal(mid)?'water':Math.min(nearRoad(a),nearRoad(b))<1.55?'gate':'wall'});
  // Widen a road opening instead of quietly blocking its shoulders.
  const expanded=tags.slice();tags.forEach((t,j)=>{if(t==='gate')for(const d of[-1,1]){const k=(j+d+tags.length)%tags.length;if(expanded[k]==='wall')expanded[k]='gate'}});
  const d=c.defenses,n=samples.length;d.perimeter=poly;
  for(let j=0;j<n;j++)if(expanded[j]==='wall'){
   const a=samples[j],b=samples[(j+1)%n],ya=c.height[c.index(a.x,a.z)],yb=c.height[c.index(b.x,b.z)];
   d.walls.push({a:{...a,y:ya},b:{...b,y:yb},height:d.kind==='timber'?2.0:3.5,width:d.kind==='timber'?.35:.85});
   if(j%10===0&&[0,1,2,-1,-2].every(k=>expanded[(j+k+n)%n]==='wall'))d.towers.push({...a,y:ya,r:d.kind==='timber'?.65:1.1,h:d.kind==='timber'?3.1:5.1});
  }
  // Group contiguous openings. Only dry, road-crossed ones become gateway spans.
  for(let j=0;j<n;j++)if(expanded[j]==='gate'&&expanded[(j-1+n)%n]!=='gate'){
   let end=j+1;while(end<j+n&&expanded[end%n]==='gate')end++;
   const a=samples[j],b=samples[end%n],len=Math.hypot(a.x-b.x,a.z-b.z);
   if(len>=2&&len<=12&&legal(a)&&legal(b))d.gates.push({a:{...a,y:c.height[c.index(a.x,a.z)]},b:{...b,y:c.height[c.index(b.x,b.z)]},name:['The Lower Gate','The Pilgrim Gate','The Crown Gate','The Water Gate'][d.gates.length%4]});
  }
  d.enclosed=expanded.every(t=>t!=='water');d.terrainGapSegments=expanded.filter(t=>t==='water').length;d.approachCount=approaches.length;
  c.walls=[];return d;
 }
 return{reserve,build,hull,inside};
})();
