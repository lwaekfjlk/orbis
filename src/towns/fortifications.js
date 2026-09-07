/** Defensive urbanism, v11. Pure layout data; never edits a parent world field.
 * A citadel reserves genuinely buildable high ground BEFORE streets are routed.
 * The outer enceinte follows a buffered urban hull. Water gaps are not called gates.
 */
/** A town that has both a tradition and the surplus to carry a wonder gets one, and WHICH
 * wonder is a property of the tradition, not a roll. Only the pilgrimage towns used to have
 * one, so every other tradition topped out at a citadel and the world read the same however
 * far you travelled. Loaded here because fortifications reserves the parcel a wonder stands
 * on, before the streets are routed. */
const TOWN_WONDERS = {
    basilica: [{ id: 'cathedral',        name: 'Grand Sanctuary',   material: 'ivory' }],
    forest:   [{ id: 'grove-sanctuary',  name: 'Grove Sanctuary',   material: 'woodland' }],
    // Two traditions are broad enough to hold a second answer, chosen by what the site has
    // rather than by a roll: an arcane town on a deep mana field raises the tower instead of
    // the crystal, and a volcanic town over real ore keeps a dragon rather than a warlord.
    arcane:   [{ id: 'suspended-tower',  name: 'Suspended Tower',   material: 'moonstone', when: p => p.mana > .58 },
               { id: 'sky-crystal',      name: 'Suspended Crystal', material: 'moonstone' }],
    basalt:   [{ id: 'dragon-court',     name: 'Dragon Court',      material: 'basalt', when: p => p.ore > .42 },
               { id: 'dread-keep',       name: 'Dread Keep',        material: 'basalt' }],
    mountain: [{ id: 'deep-city',        name: 'Deep City',         material: 'granite' }],
    delve:    [{ id: 'forge-hollow',     name: 'Forge Hollow',      material: 'delve' }],
    river:    [{ id: 'gilded-palace',    name: 'Gilded Palace',     material: 'limestone' }],
    desert:   [{ id: 'sunless-well',     name: 'Sunless Well',      material: 'sandstone' }],
    delta:    [{ id: 'reed-throne',      name: 'Reed Throne',       material: 'reed' }],
    fjord:    [{ id: 'whale-moot',       name: 'Whalebone Moot',    material: 'northern' }],
    steppe:   [{ id: 'sky-court',        name: 'Sky Court',         material: 'steppe' }],
    paddy:    [{ id: 'water-pagoda',     name: 'Water Pagoda',      material: 'paddy' }],
    lagoon:   [{ id: 'tide-palace',      name: 'Tide Palace',       material: 'lagoon' }]
};
function wonderFor(style, support, p) {
    if (support < 6500)
        return null;
    const list = TOWN_WONDERS[style];
    if (!list)
        return null;
    return list.find(v => !v.when || (p && v.when(p))) || list[list.length - 1];
}
const FortressPlan=(()=>{
 const inside=(q,b,pad=0)=>Math.abs(q.x-b.x)<=b.w/2+pad&&Math.abs(q.z-b.z)<=b.d/2+pad;
 function reserve(c,candidates,p,steep=.85,terrain=null){
  // A hamlet does not acquire a royal capital just because its view was opened.
  if((p.detailSupport??p.urbanSupport)<1500||c.townProfile.id==='delta')return null;
  const wonder=wonderFor(c.townProfile.id,p.detailSupport??p.urbanSupport,p),sacred=!!wonder;
  const ordinary=candidates.filter(a=>{const q=c.xy(a.k),d=Math.hypot(q.x-c.market.x,q.z-c.market.z);const S=c.width/152;return d>(sacred?23:19)*S&&d<(sacred?34:43)*S&&Math.abs(q.x)<c.width*.34&&Math.abs(q.z)<c.depth*.32});
  const ranked=ordinary.map(a=>({k:a.k,score:c.height[a.k]*(sacred?1.7:2.4)-Math.max(0,c.slope[a.k]-.8)*4-Math.hypot(c.xy(a.k).x-c.market.x,c.xy(a.k).z-c.market.z)*(sacred?.14:.05)})).sort((a,b)=>b.score-a.score);
  for(const size of (sacred?[38,34,30,26,22]:[26,22,18])) for(const {k}of ranked.slice(0,700)){
   const q=c.xy(k),site={...q,k,w:size,d:size},samples=[];let valid=true;
   if(inside(c.market,site,5))continue;
   // Step with the grid, not a fixed stride: anything coarser than a cell skips cells that
   // buildingAt then finds, and the reserve hands back a parcel the precinct cannot use.
   // The grid is n x n over width x depth, so the z cell is the smaller of the two.
   const step=Math.min(c.width,c.depth)/(c.n-1)*.85;
   for(let x=-size/2-1.1;x<=size/2+1.1;x+=step){for(let z=-size/2-1.1;z<=size/2+1.1;z+=step){const j=c.index(q.x+x,q.z+z);if(c.water[j]||c.environment.ice[j]>25||c.environment.snow[j]>.5||c.slope[j]>steep){valid=false;break}samples.push(c.height[j])}if(!valid)break}
   // A cut-in citadel spans a real bank, so it is allowed far more fall than a pad would be.
   if(!valid||Math.max(...samples)-Math.min(...samples)>13)continue;
   // Choose a supported precinct before streets commit to its protected parcel.
   if(terrain){const bounds=terrain.bounds(q.x,q.z,size,size);if((bounds.top-bounds.low)/terrain.scale>(sacred?44:13)*.65)continue;}
   site.sacred=sacred;site.wonder=wonder;site.deck=Math.max(...samples)+.16;site.bed=Math.min(...samples);site.relief=site.deck-site.bed;
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
  c.defenses={version:2,walls:[],gates:[],towers:[],quays:[],perimeter:[],enclosed:false,kind:['forest','delta'].includes(c.townProfile.id)?'timber':'stone'};
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
  const wet=q=>{const i=c.index(q.x,q.z);return !!c.water[i]||c.environment.ice[i]>=25};
  const blocked=q=>c.buildings.some(b=>inside(q,b,.45));
  // The frame interpolates the ground between cells. Snapping each wall endpoint
  // to a cell made consecutive masonry pieces jump above and below that surface.
  const ground=q=>{
   const x=Math.max(0,Math.min(c.n-1,(q.x/c.width+.5)*(c.n-1))),z=Math.max(0,Math.min(c.n-1,(q.z/c.depth+.5)*(c.n-1)));
   const i=Math.floor(x),j=Math.floor(z),u=x-i,v=z-j,at=(a,b)=>c.height[Math.min(c.n-1,b)*c.n+Math.min(c.n-1,a)];
   return (at(i,j)*(1-u)+at(i+1,j)*u)*(1-v)+(at(i,j+1)*(1-u)+at(i+1,j+1)*u)*v;
  };
  const n=samples.length,d=c.defenses;d.perimeter=poly;
  const tags=samples.map((a,j)=>{const b=samples[(j+1)%n],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
   if([a,b,mid].some(blocked))return 'blocked';
   return [a,b,mid].some(wet)?'quay':'wall';
  });
  // A slope is not a physical wall. Keep short, joined sections on steep ground,
  // where the mesh can follow the bank; the previous scarp tag silently deleted
  // whole stretches and nevertheless reported their ring as enclosed.
  const cross=(a,b)=>a.x*b.z-a.z*b.x;
  const within=q=>poly.every((a,j)=>{const b=poly[(j+1)%poly.length];return cross({x:b.x-a.x,z:b.z-a.z},{x:q.x-a.x,z:q.z-a.z})>=-1e-7});
  const cumulative=[0];for(let j=0;j<n;j++)cumulative.push(cumulative[j]+Math.hypot(samples[(j+1)%n].x-samples[j].x,samples[(j+1)%n].z-samples[j].z));
  const circumference=cumulative[n],crossings=[];
  // Only an actual inside/outside crossing may cut the curtain. Proximity to a
  // street running alongside it used to open unrelated stretches of the wall.
  for(const road of c.roads)for(let k=1;k<road.points.length;k++){
   const a=road.points[k-1],b=road.points[k];if(within(a)&&within(b))continue;
   const v={x:b.x-a.x,z:b.z-a.z},roadLength=Math.hypot(v.x,v.z);if(roadLength<1e-7)continue;
   for(let j=0;j<n;j++){
    const q=samples[j],r=samples[(j+1)%n],u={x:r.x-q.x,z:r.z-q.z},den=cross(v,u);if(Math.abs(den)<1e-8)continue;
    const offset={x:q.x-a.x,z:q.z-a.z},t=cross(offset,u)/den,f=cross(offset,v)/den;
    if(t<0||t>1||f<0||f>1)continue;
    const before={x:a.x+v.x*(t-1e-5),z:a.z+v.z*(t-1e-5)},after={x:a.x+v.x*(t+1e-5),z:a.z+v.z*(t+1e-5)};
    if(within(before)===within(after))continue;
    const length=cumulative[j+1]-cumulative[j],sine=Math.abs(den)/(roadLength*length);
    const halfRoad=(c.townProfile.width||1)*(road.kind==='arterial'?.67:road.kind==='street'?.5:.37);
    crossings.push({position:cumulative[j]+f*length,half:Math.min(4.8,Math.max(2.2,halfRoad/Math.max(.2,sine)+1.25))});
   }
  }
  const expanded=tags.slice();
  for(const crossing of crossings)for(let j=0;j<n;j++){
   const center=(cumulative[j]+cumulative[j+1])/2,delta=Math.abs(center-crossing.position),distance=Math.min(delta,circumference-delta);
   if(tags[j]==='wall'&&distance<crossing.half)expanded[j]='gate';
  }
  // A gateway must span the complete run it replaces. If several close crossings
  // produce one broad opening, keep individual portals separated by a short pier.
  const runs=()=>{const result=[];if(expanded.every(t=>t==='gate')){result.push([0,n]);return result;}
   for(let j=0;j<n;j++)if(expanded[j]==='gate'&&expanded[(j-1+n)%n]!=='gate'){let end=j+1;while(end<j+n&&expanded[end%n]==='gate')end++;result.push([j,end]);}return result;};
  const spannable=(j,end)=>{const a=samples[j%n],b=samples[end%n],len=Math.hypot(a.x-b.x,a.z-b.z);return len>=2&&len<=12&&legal(a)&&legal(b)};
  for(const [j,end]of runs())if(!spannable(j,end)){
   for(let k=j;k<end;k++)expanded[k%n]=tags[k%n];
   // Restore compact openings at the actual crossing positions instead of
   // sealing a whole flank merely because its road openings merged.
   for(const crossing of crossings){
    let start=-1,stop=-1;for(let k=j;k<end;k++){const center=(cumulative[k%n]+cumulative[k%n+1])/2,delta=Math.abs(center-crossing.position);if(Math.min(delta,circumference-delta)<2.2){if(start<0)start=k;stop=k+1;}}
    if(start>=0&&spannable(start,stop)&&[start-1,stop].every(k=>expanded[(k+n)%n]!=='gate'))for(let k=start;k<stop;k++)expanded[k%n]='gate';
   }
  }
  for(let j=0;j<n;j++)if(expanded[j]==='wall'){
   const a=samples[j],b=samples[(j+1)%n],ya=ground(a),yb=ground(b);
   d.walls.push({a:{...a,y:ya},b:{...b,y:yb},height:d.kind==='timber'?2.0:3.5,width:d.kind==='timber'?.35:.85});
   if((j%10===0||poly.some(q=>Math.hypot(q.x-a.x,q.z-a.z)<1e-7))&&[0,1,2,-1,-2].every(k=>expanded[(j+k+n)%n]==='wall'))d.towers.push({...a,y:ya,r:d.kind==='timber'?.65:1.1,h:d.kind==='timber'?3.1:5.1});
  }
  // Group contiguous openings. Only dry, road-crossed ones become gateway spans.
  for(let j=0;j<n;j++)if(expanded[j]==='gate'&&expanded[(j-1+n)%n]!=='gate'){
   let end=j+1;while(end<j+n&&expanded[end%n]==='gate')end++;
   const a=samples[j],b=samples[end%n];
   if(spannable(j,end))d.gates.push({a:{...a,y:ground(a)},b:{...b,y:ground(b)},name:['The Lower Gate','The Pilgrim Gate','The Crown Gate','The Water Gate'][d.gates.length%4]});
  }
  // Waterfront runs carry a lower, heavier quay section rather than a hole. A
  // harbour town closed its enceinte along the water; leaving the run open is
  // what made half of every coastal town read as breached.
  for(let j=0;j<n;j++)if(expanded[j]==='quay'){
   const a=samples[j],b=samples[(j+1)%n],ya=ground(a),yb=ground(b);
   d.quays.push({a:{...a,y:ya},b:{...b,y:yb},height:d.kind==='timber'?1.5:2.3,width:d.kind==='timber'?.5:1.15});
  }
  // Enclosed now means every perimeter section has actual masonry or a gateway.
  d.enclosed=expanded.every(t=>t!=='blocked');
  d.terrainGapSegments=expanded.filter(t=>t==='blocked').length;
  d.waterfrontSegments=expanded.filter(t=>t==='quay').length;
  d.scarpSegments=0;
  d.approachCount=approaches.length;
  c.walls=[];return d;
 }
 return{reserve,build,hull,inside};
})();
