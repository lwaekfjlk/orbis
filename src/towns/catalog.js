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
  {id:'steppe',name:'Drove Road Town',short:'Grassland town',plan:'droveway',kit:'stockades',material:'steppe',roof:'hip',palace:'steppe',width:1.25,scale:.95,wall:.8,spacing:1.3,description:'Wide droving lanes run the length of the settlement, with stock pens, felt-and-timber halls, windbreak screens and a standing mast court. Pasture between compounds is kept open on purpose.',districts:['Drove Market','The Standing Court','Wind Shrine','Felt & Leather Yards','Herders\' Ward','Open Pasture']},
  {id:'paddy',name:'Terrace Valley Town',short:'Terraced town',plan:'paddies',kit:'verandas',material:'paddy',roof:'leaf',palace:'paddy',width:.72,scale:.92,wall:0,spacing:1.02,description:'Contour lanes follow irrigation terraces. Deep-eaved veranda houses, dye yards, mills and sluice courts share the slope with the existing water; no new river is cut.',districts:['Water Market','The Sluice Court','River Shrine','Dye & Mill Yards','Veranda Ward','Terrace Commons']},
  {id:'delve',name:'Pithead Town',short:'Mining town',plan:'adits',kit:'headframes',material:'delve',roof:'gable',palace:'delve',width:.85,scale:1.0,wall:1.2,spacing:.92,description:'Lanes climb between spoil terraces to timber headframes. Counting halls, smelting yards, lamp shrines and hewers\u2019 rows form dense working blocks. Ore is worked where the parent world already has it.',districts:['Ore Exchange','The Warden\'s Court','Lamp Shrine','Smelting Yards','Hewers\' Ward','Spoil Terraces']},
  {id:'lagoon',name:'Lagoon Chancery Town',short:'Canal town',plan:'waterfront',kit:'quaysides',material:'lagoon',roof:'hip',palace:'lagoon',width:.92,scale:.96,wall:.5,spacing:1.0,description:'Quays and shaded loggias line the sheltered water. Warehouses, net yards, salt pans and arcaded houses face a walled basin. The lagoon itself is inherited, never dug.',districts:['Canal Market','The Tide Council','Salt Shrine','Net & Cooper Yards','Canal Ward','Lagoon Gardens']},
  {id:'fjord',name:'Northern Harbor Town',short:'Longhall town',plan:'ribbon',kit:'longhalls',material:'northern',roof:'northern',palace:'fjord',width:.80,scale:1.0,wall:.6,spacing:1.12,description:'A harbor-facing ribbon connects longhalls, boat stores and steep-roofed homes; short uphill lanes lead to a stone council hall. Snow is added only in a cold setting.',districts:['Harbor Exchange','Longhall Court','Memorial Close','Shipwright Yards','Timber Ward','Upland Commons']},
  {id:'taiga',name:'Boreal Log Town',short:'Log town',plan:'clearings',kit:'logyards',material:'taiga',roof:'northern',palace:'taiga',width:.78,scale:.95,wall:.9,spacing:1.24,description:'Lanes link cleared pockets in conifer forest. Log dwellings are banked against the drift line, granaries and wood stores stand on posts, and stone flues serve every hearth. The forest between the clearings is kept, not felled.',districts:['Winter Market','The Moot Yard','Ancestor Grove','Timber & Pitch Yards','Hearthkeepers’ Ward','Cleared Commons']},
  {id:'monsoon',name:'Monsoon Stilt Town',short:'Stilt town',plan:'stiltlanes',kit:'stilthouses',material:'monsoon',roof:'leaf',palace:'monsoon',width:.70,scale:.88,wall:0,spacing:1.30,description:'Raised plank lanes run between houses standing on hardwood posts under very deep thatched eaves. Screens replace glazing and nothing is heated. The seasonal flood is lived above rather than drained away.',districts:['Plank Market','The Rain Pavilion','Grove Shrine','Dye & Basket Yards','Raised Ward','Wet Commons']}
 ];
 function hash(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
 // Thresholds are set against the measured spread of a generated world, not guessed.
 // The old delta (wet>.24) and basalt (rift>.65 AND ore>.38) tests were above the
 // observed maxima, so neither tradition was ever assigned to anywhere.
 function native(p,w){
  const e=CityEnvironment.profile(w,p);
  if(e.temperature<6&&p.harbor>.12)return 'fjord';
  // A cold/dry foothill is not a hot-desert architectural assignment.
  if(e.glacialFoothills||e.bed>1500)return 'mountain';
  const volcanic=w.arc[p.i]>.30||w.rift[p.i]>.42;
  // Ore-bearing upland is its own working tradition; basalt stays a volcanic one.
  if(p.ore>.46&&e.bed>620&&!volcanic)return 'delve';
  if(volcanic&&p.ore>.34)return 'basalt';
  // A cold interior is conifer country. With no harbour it used to fall through every
  // warm test to the limestone court town, which is how a -1.3 C site was being built
  // as a Mediterranean courtyard town.
  if(e.temperature<6)return 'taiga';
  if(p.wet>.10||(p.siteLake>.22&&e.temperature>5))return 'delta';
  if(e.aridity<.72&&e.temperature>=16&&p.fresh>.16)return 'desert';
  // Warm, well-watered and genuinely fertile ground is terraced, not cleared.
  if(p.fertility>.34&&e.temperature>=17&&e.aridity>1.25)return 'paddy';
  // Hot AND perhumid forest is not the same tradition as a temperate woodland court.
  // Woodland was covering 6.7 C to 27.8 C with one identical set of buildings.
  if(e.forestFraction>.35&&e.temperature>=21&&e.aridity>1.2)return 'monsoon';
  if(e.forestFraction>.53)return 'forest';
  // A warm sheltered harbour is a lagoon port; fjord above already took the cold ones.
  if(p.harbor>.80&&e.temperature>=16&&e.bed<200)return 'lagoon';
  // Dry treeless grassland, between the desert and the woods.
  if(e.forestFraction<.18&&e.aridity<1.35&&e.temperature>=8)return 'steppe';
  if(p.mana>.58)return 'arcane';
  return hash(w.params.seed+'/urban-tradition/'+p.i)%2===0?'basilica':'river';
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
  if(id==='lagoon')return p.harbor>.20&&e.temperature>=10;
  if(id==='paddy')return e.aridity>.9&&e.temperature>=10;
  if(id==='delve')return p.ore>.20&&(e.bed>320||e.mountainous);
  if(id==='steppe')return e.forestFraction<.45&&e.temperature>=4;
  // Log building, banked walls and stone flues are a cold-climate answer. They are
  // buildable in a mild place, but they are not what this kit represents.
  if(id==='taiga')return e.temperature<9;
  // Stilts, screen walls and an unheated deep-eaved roof need heat AND real rain.
  if(id==='monsoon')return e.temperature>=18&&e.aridity>1.0;
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
