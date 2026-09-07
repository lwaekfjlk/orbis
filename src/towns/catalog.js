/** Town-scale composition recipes. A recipe is a street/district grammar plus a
 * family of ordinary building compounds, not a palace dropped among generic homes.
 * Native terrain is always supplied by generateCity; styles never create water.
 */
const TownCatalog = (() => {
 const styles = [
  {id:'river',name:'River Crown Town',short:'Court town',plan:'axial',kit:'courts',material:'limestone',roof:'hip',palace:'river',width:1.0,scale:1.0,wall:1,spacing:1,description:'Two civic axes join market squares. Courtyard homes, arcaded shops, guild yards and a modest palace share the same masonry language.',districts:['Exchange Square','Crown Precinct','Sanctuary Close','Guild Courts','Garden Ward','Orchard Commons']},
  {id:'basilica',name:'Pilgrimage Town',short:'Sanctuary town',plan:'processional',kit:'cloisters',material:'ivory',roof:'hip',palace:'basilica',width:1.3,scale:1.08,wall:1,spacing:1.1,description:'A long processional way connects the sanctuary and guesthouse quarter; cloisters, hospices, arcaded markets and houses form the surrounding town.',districts:['Pilgrim Market','Bishop\'s Close','The Great Sanctuary','Scriptorium Courts','Guesthouse Ward','Cloister Gardens']},
  {id:'arcane',name:'Collegium Town',short:'Academy town',plan:'rings',kit:'campuses',material:'moonstone',roof:'gable',palace:'arcane',width:1,scale:1.05,wall:0,spacing:1.13,description:'Linked campus rings contain small observatories, scholar houses, instrument workshops and public courts. The academy is a precinct within a complete town.',districts:['Instrument Market','Assembly Court','Star Sanctuary','High College','Scholars\' Ward','Observatory Gardens']},
  {id:'forest',name:'Woodland Court Town',short:'Woodland town',plan:'groves',kit:'pavilions',material:'woodland',roof:'leaf',palace:'forest',width:.65,scale:.90,wall:0,spacing:1.45,description:'Branching paths connect dispersed clearings. Pavilion compounds, timber galleries and working yards coexist with retained trees; no giant tree is added to the world.',districts:['Clearing Market','Canopy Council','Grove Sanctuary','Timber Yards','Pavilion Groves','The Green Commons']},
  {id:'mountain',name:'Highland Hold Town',short:'Terrace town',plan:'terraces',kit:'terraces',material:'granite',roof:'gable',palace:'mountain',width:.75,scale:1.0,wall:1,spacing:1.12,description:'Contour-following lanes and short switchbacks link stone terraces, workshop yards, storehouses and a fortified hall. Buildable slope limits remain in force.',districts:['Lower Exchange','The High Hold','Ancestor Court','Forge Terraces','Stonecutters\' Ward','High Commons']},
  {id:'desert',name:'Caravan Courtyard Town',short:'Courtyard town',plan:'labyrinth',kit:'courtyards',material:'sandstone',roof:'flat',palace:'desert',width:.68,scale:.83,wall:1,spacing:.80,description:'Compact courtyard compounds, wind towers, shaded bazaars and caravan yards form close-knit blocks. Cisterns use the existing freshwater supply; no oasis is invented.',districts:['Covered Bazaar','Governor\'s Court','Sanctuary Court','Caravanserai Yards','Cistern Ward','Orchard Enclosures']},
  {id:'delta',name:'Waterside Stilt Town',short:'Waterside town',plan:'waterfront',kit:'decks',material:'reed',roof:'hip',palace:'delta',width:.62,scale:.90,wall:0,spacing:1.18,description:'Linked shore lanes serve raised timber compounds, fishing yards, warehouses and reed halls. New homes stay on valid shore ground; the parent lake or delta is unchanged.',districts:['Landing Market','Reed Council','Tidal Sanctuary','Boatwright Yards','Raised Courts','Reed Commons']},
  {id:'basalt',name:'Frontier Bastion Town',short:'Fortified town',plan:'grid',kit:'bastions',material:'basalt',roof:'hip',palace:'basalt',width:1,scale:1.0,wall:1.6,spacing:1.0,description:'Defensible streets connect workshop blocks, heavy-walled dwellings, supply courts and bastions. Dark stone is a material tradition, not a reason to add lava or volcanoes.',districts:['Supply Market','The Bastion','Hearth Sanctuary','Foundry Yards','Citadel Ward','Protected Commons']},
  {id:'fjord',name:'Northern Harbor Town',short:'Longhall town',plan:'ribbon',kit:'longhalls',material:'northern',roof:'northern',palace:'fjord',width:.80,scale:1.0,wall:.6,spacing:1.12,description:'A harbor-facing ribbon connects longhalls, boat stores and steep-roofed homes; short uphill lanes lead to a stone council hall. Snow is added only in a cold setting.',districts:['Harbor Exchange','Longhall Court','Memorial Close','Shipwright Yards','Timber Ward','Upland Commons']}
 ];
 function hash(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
 function native(p,w){
  const e=CityEnvironment.profile(w,p);
  if(e.temperature<6&&p.harbor>.12)return 'fjord';
  // A cold/dry foothill is not a hot-desert architectural assignment.
  if(e.glacialFoothills||e.bed>1500)return 'mountain';
  if(p.wet>.24||(p.siteLake>.45&&e.temperature>5))return 'delta';
  if(e.aridity<.72&&e.temperature>=16&&p.fresh>.16)return 'desert';
  if(e.forestFraction>.53)return 'forest';
  if((w.arc[p.i]>.48||w.rift[p.i]>.65)&&p.ore>.38)return 'basalt';
  if(p.mana>.58)return 'arcane';
  return hash(w.params.seed+'/urban-tradition/'+p.i)%4===0?'basilica':'river';
 }
 function allowed(p,w,id){
  const e=CityEnvironment.profile(w,p);
  if(id==='delta')return p.wet>.08||p.siteLake>.18||p.harbor>.16;
  if(id==='fjord')return p.harbor>.12&&e.temperature<13;
  if(id==='mountain')return e.bed>850||e.mountainous;
  if(id==='forest')return e.forestFraction>.22;
  // This kit includes palms and hot-climate wind towers. Cold courtyard
  // architecture is possible, but is not what this specific kit represents.
  if(id==='desert')return e.aridity<1&&e.temperature>=16&&p.fresh>.16;
  return true;
 }
 function resolve(w,s,p,override={}){
  const stored=s.townRecipes?.[p.id]||{};let id=override.style||stored.style||native(p,w),compatibilityNote='';
  if(!override.style&&stored.style&&!allowed(p,w,stored.style)){id=native(p,w);compatibilityNote='Legacy layout was adapted to the actual site climate; the world was not changed.';}
  const style=styles.find(t=>t.id===id)||styles[0];
  if(!allowed(p,w,style.id))throw Error(`${style.name} is incompatible with this existing site's geography.`);
  const seed=String(override.seed??stored.seed??`${w.params.seed}/town/${p.i}`).slice(0,120);
  const mix=Number(override.variety??stored.variety??.6);
  return {format:'telluric-town-recipe',version:1,style:style.id,seed,variety:Math.max(0,Math.min(1,Number.isFinite(mix)?mix:.6)),provinceId:p.id,sourceCell:p.i,environmentVersion:CityEnvironment.version,compatibilityNote};
 }
 function validate(r){if(!r||r.format!=='telluric-town-recipe'||r.version!==1||!styles.some(t=>t.id===r.style)||typeof r.seed!=='string'||r.seed.length>120||!Number.isInteger(r.provinceId)||!Number.isFinite(r.variety)||r.variety<0||r.variety>1)throw Error('Invalid town composition recipe.');return r}
 function signature(r){return hash(JSON.stringify([r.version,r.style,r.seed,r.variety])).toString(16)}
 return {styles,native,allowed,resolve,validate,signature,hash};
})();
