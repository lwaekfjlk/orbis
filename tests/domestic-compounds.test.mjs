import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scripts} from '../scripts/manifest.mjs';

const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
const E=Function(source+'\nreturn {ArtisanCityKit,TownCatalog};')();
function fixture(style,angle,{infill=false,dense=false,legacy=false,market=false}={}){
 const w=dense?1.1:infill?1.8:5.4,d=dense?1.1:infill?2.4:8.1;
 const b={id:'street-house',x:4,z:-2,y:1.2,w,d,h:3,angle,type:market?'workshop':'home',program:market?'market':'housing',moduleVariant:2,infill,denseInfill:dense,streetSocket:0};
 const normal={x:-Math.sin(angle),z:Math.cos(angle)},edge=Math.abs(normal.x)>.5?w/2:d/2;
 const a={x:b.x+normal.x*(edge+.08),z:b.z+normal.z*(edge+.08)},road={x:b.x+normal.x*(edge+1),z:b.z+normal.z*(edge+1),i:0};
 const cold=['fjord','taiga'].includes(style),hot=['desert','monsoon','paddy'].includes(style),temperature=cold?-5:hot?27:14,aridity=style==='desert'?.3:hot?2:1;
 const c={townProfile:E.TownCatalog.styles.find(s=>s.id===style),townRecipe:{seed:'domestic-compound-proof'},siteEnvironment:{temperature,aridity,bed:400,forestFraction:.4,ore:.2},environment:{temperature:[temperature],aridity:[aridity],bed:[400],ice:[0],snow:[0],winter:[cold?-15:temperature]},index:()=>0,xy:()=>road,buildings:[b],...(legacy?{}:{connectors:[{blockId:b.id,a,b:road}]})};
 const p={faith:[1,0,0,0,0,0],people:[1],fresh:.4,ore:.2};
 return{b,c,p};
}
const digest=m=>m.body.data.concat(m.roof.data);

test('street-front houses preserve counts, surveyed lots and saved state in every tradition and quarter turn',()=>{
 for(const style of Object.keys(E.ArtisanCityKit.palettes))for(let q=0;q<4;q++)for(const kind of[{}, {infill:true}, {infill:true,dense:true}]){
  const {b,c,p}=fixture(style,q*Math.PI/2,kind),snapshot=JSON.stringify({b,c,p});
  const m=E.ArtisanCityKit.compound({...b,lod:1},c,p,{color:'#998866'});
  assert.equal(m.structures,kind.infill?1:6,style+' count');
  assert.equal(JSON.stringify({b,c,p}),snapshot,'rendering changed the saved city');
  assert(m.roof.data.length>0&&m.body.data.length>0,style+' removable roofs');
  for(const g of[m.body,m.roof])for(let i=0;i<g.data.length;i+=9){
   const [x,y,z]=g.data.slice(i,i+3);
   assert(Number.isFinite(x+y+z),style+' finite vertices');
   assert(Math.abs(x-b.x)<b.w/2+.00001&&Math.abs(z-b.z)<b.d/2+.00001,style+' geometry entered an adjacent lane');
   assert(y>=b.y-.00001,style+' house buried below its seating');
  }
 }
});

test('a connector-free saved town replays the same street-facing geometry',()=>{
 for(const style of['river','fjord','desert','monsoon'])for(let q=0;q<4;q++){
  const {b,c,p}=fixture(style,q*Math.PI/2,{legacy:true,market:true});
  const a=E.ArtisanCityKit.compound(b,c,p,{}),again=E.ArtisanCityKit.compound(b,c,p,{});
  assert.deepEqual(digest(a),digest(again),style+' legacy seed replay');
  assert.equal(a.structures,6);
 }
});
