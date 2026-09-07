/** The town's architectural vocabulary, as four orthogonal axes that get COMBINED
 * rather than a bundle that gets picked.
 *
 * Before this, every one of the fifteen traditions drew from four roof shapes and one
 * fixed palette, so the only thing separating two towns was which bundle they landed in.
 * Here the eave form, the wall material, the colourway and the ornament are chosen
 * independently, from inputs the world already computes: climate, what the site
 * supplies, the province's faith, and the realm that holds it.
 *
 * ANCESTRY DOES NOT DETERMINE ARCHITECTURE. A people contributes a craft leaning —
 * whether its builders reach for stone, timber, earth or water-borne construction —
 * which only breaks ties between materials the site already supports. It never selects
 * a form, and two towns of different peoples in the same place with the same faith come
 * out the same. docs/MODEL.md states that peoples are fantasy mixtures and not human
 * stereotypes; binding a real-world national architecture to one would contradict that.
 */
const TownVocabulary = (() => {
 /* A. EAVE AND ROOF FORMS. `gable`, `hip`, `leaf` and `northern` are the original
  * geometry; the rest were added to widen a silhouette library that was the whole of
  * the town's visual identity. Each carries what it is FOR, because that is what
  * decides where it is used. */
 const ROOFS = {
  gable:    {label:'Pitched gable',        pitch:1.00, eave:.10, sheds:.6, shades:.2, note:'The temperate default: sheds rain, cheap to frame.'},
  hip:      {label:'Hipped',               pitch:.95,  eave:.12, sheds:.6, shades:.3, note:'Four slopes; stands up to wind from any quarter.'},
  northern: {label:'Steep shingled',       pitch:1.55, eave:.06, sheds:1.0, shades:.1, note:'Pitched to shed snow before it can load the frame.'},
  leaf:     {label:'Deep thatch',          pitch:1.20, eave:.55, sheds:.9, shades:.7, note:'Sheds monsoon rain well clear of an unsealed wall.'},
  upturned: {label:'Upturned tile',        pitch:1.05, eave:.62, sheds:.8, shades:.8, note:'A concave sweep on bracket sets; throws water outward and shades the wall.'},
  deepeave: {label:'Deep straight eave',   pitch:.72,  eave:.78, sheds:.7, shades:.9, note:'Shallow pitch under a very deep eave on exposed rafters.'},
  parapet:  {label:'Parapet terrace',      pitch:.30,  eave:.02, sheds:.1, shades:.4, note:'A usable roof terrace where there is no rain to shed.'},
  vault:    {label:'Barrel vault',         pitch:.85,  eave:.05, sheds:.3, shades:.5, note:'Mass over the room instead of a frame; dry-country construction.'},
  conic:    {label:'Felted cone',          pitch:1.30, eave:.08, sheds:.9, shades:.3, note:'A ring frame under felt: struck and re-pitched, not founded.'},
  rockcut:  {label:'Rock-cut face',        pitch:0,    eave:.10, sheds:1.0, shades:1.0, note:'Cut into the mass; there is no roof plane to build.'}
 };
 /* B. WALL MATERIALS, each with what the site has to supply for it to be available. */
 const MATERIALS = {
  log:       {label:'Stacked log',      needs:'timber', warmth:1.0, mass:.5,  note:'Round courses with notched corners; forest country that freezes.'},
  timber:    {label:'Timber frame',     needs:'timber', warmth:.7,  mass:.3,  note:'Framed and braced, with infill panels between the posts.'},
  thatch:    {label:'Light frame',      needs:'timber', warmth:.1,  mass:.1,  note:'Posts and screens; the wall only has to keep rain out.'},
  adobe:     {label:'Mud brick',        needs:'earth',  warmth:.6,  mass:1.0, note:'Battered earth walls; thermal mass against a hot dry day.'},
  firedbrick:{label:'Fired brick',      needs:'earth',  warmth:.6,  mass:.8,  note:'Kiln-fired courses; needs fuel and a settled kiln.'},
  masonry:   {label:'Coursed masonry',  needs:'stone',  warmth:.5,  mass:.9,  note:'Cut and coursed rubble, the ordinary town wall.'},
  cutstone:  {label:'Ashlar',           needs:'stone',  warmth:.5,  mass:1.0, note:'Squared and fitted; quarry country and civic money.'},
  rockface:  {label:'Rock-cut',         needs:'stone',  warmth:.9,  mass:1.0, note:'The room is excavated, not built.'},
  felt:      {label:'Felt over frame',  needs:'herd',   warmth:.8,  mass:.1,  note:'Layered felt on a lattice; portable by design.'}
 };
 /* C. ORNAMENT, from the province's dominant faith. This is the one axis that is
  * explicitly cultural, and it is belief rather than ancestry. */
 const ORNAMENT = {
  sun:      {crown:'dome',    finial:'disc',   note:'Sun discs over the door and a gilded crown.'},
  stars:    {crown:'crystal', finial:'ring',   note:'Armillary rings and a crystal at the ridge.'},
  grove:    {crown:'spire',   finial:'branch', note:'Branching finials and a living post at the gate.'},
  hearth:   {crown:'battlement', finial:'brazier', note:'A brazier niche and heavy angular buttressing.'},
  tide:     {crown:'dome',    finial:'crest',  note:'Wave crests along the ridge and a stepped basin.'},
  ancestors:{crown:'spire',   finial:'post',   note:'Memorial posts flanking the approach.'},
  secular:  {crown:'native',  finial:'banner', note:'Civic banners and a plain public emblem.'}
 };
 /* D. CRAFT LEANING per people. Breaks ties between materials the site ALREADY
  * supports; never selects a form and never overrides climate. */
 const CRAFT = ['earth','timber','stone','timber','stone','water','earth'];

 const clamp01 = v => Math.max(0, Math.min(1, v));

 /** What the ground here can actually supply, 0..1 each. */
 function supply(site){
  const forest = clamp01((site.forestFraction ?? 0) / .5);
  const stone  = clamp01(((site.bed ?? 0) - 250) / 1400 + (site.mountainous ? .45 : 0) + (site.ore ?? 0) * .6);
  const earth  = clamp01(.35 + (site.aridity != null ? (1 - clamp01(site.aridity / 1.6)) * .5 : .2));
  const herd   = clamp01(.15 + (1 - forest) * (site.aridity != null && site.aridity < 1.1 ? .8 : .2));
  return {timber: forest, stone, earth, herd};
 }

 /** The eave form. Weather decides it; faith only breaks a tie between forms the
  * weather is already equally happy with. */
 function roofFor(cl, site, faith, seedRoll){
  const have = supply(site);
  // cl.dry is scaled to the whole world's aridity; settled ground is a narrower band,
  // so the dry-country forms need a measure that spans the range towns actually sit in.
  const arid = clamp01((1.15 - cl.a) / .95);
  const score = {};
  for(const [id, r] of Object.entries(ROOFS)) score[id] = 0;
  // The ordinary middle of the range is the DEFAULT, and has to win unless something
  // specific displaces it. Left too low, the specialised forms swamped it and every
  // temperate town ended up exotic.
  score.gable    += 1.75 - Math.abs(cl.thermal - .5) * 1.0;
  score.hip      += 1.55 - Math.abs(cl.thermal - .5) * .9 + (1 - have.timber) * .35;
  // Snow has to leave the roof before it loads the frame.
  score.northern += cl.load * 5.2 + cl.cold * 1.4;
  score.conic    += cl.load * .8 + arid * 1.8 + have.herd * 1.6 - have.timber * 1.4 - have.stone * 1.1;
  score.gable    += cl.load * .7;
  // Rain has to be thrown clear of the wall.
  score.leaf     += cl.humid * cl.warm * 4.2;
  score.upturned += cl.humid * 2.2 + cl.warm * 1.1;
  // A deep straight eave needs real rain AND the timber to cantilever it.
  score.deepeave += cl.humid * 1.8 * have.timber + have.timber * .9;
  // Where there is no rain, the roof becomes a floor, or mass over the room.
  score.parapet  += arid * cl.warm * 4.4;
  score.vault    += arid * 1.7 + have.earth * .7 - cl.load * 2.4;
  // Excavation is a LAST resort, not a preference: it wants dry, high, stony ground
  // and no other decent answer. Scored loosely it took a fifth of the world.
  score.rockcut  += Math.max(0, arid - .45) * 3.0 * Math.max(0, have.stone - .30) * 3.0
                 + clamp01(((site.bed ?? 0) - 900) / 1600) * 1.2
                 - cl.humid * 3 - have.timber * 1.8 - .25;
  // Belief nudges between otherwise equal answers; it cannot make a snow roof flat.
  if(faith === 'sun')   { score.vault += .55; score.parapet += .35; }
  if(faith === 'stars') { score.upturned += .45; score.conic += .30; }
  if(faith === 'grove') { score.deepeave += .55; score.leaf += .35; }
  if(faith === 'hearth'){ score.rockcut += .45; score.gable += .30; }
  if(faith === 'tide')  { score.upturned += .35; score.leaf += .30; }
  if(faith === 'ancestors'){ score.conic += .40; score.northern += .25; }
  // A small deterministic jitter so one climate band is not one single roof.
  let best = 'gable', bestScore = -Infinity, k = 0;
  for(const id of Object.keys(ROOFS)){
   const v = score[id] + ((seedRoll(k++) - .5) * .40);
   if(v > bestScore){ bestScore = v; best = id; }
  }
  return best;
 }

 /** The wall material. Climate first, then what the ground supplies, then craft. */
 function materialFor(cl, site, craft, seedRoll){
  const have = supply(site);
  const arid = clamp01((1.15 - cl.a) / .95);
  const score = {};
  for(const id of Object.keys(MATERIALS)) score[id] = 0;
  score.masonry    += have.stone * 1.4 + .9;                        // the ordinary default
  score.log        += cl.cover * 3.4 + cl.cold * 2.0 + have.timber * 1.3;
  score.timber     += have.timber * 2.0 + (1 - Math.abs(cl.thermal - .45) * 2) * .9;
  score.thatch     += cl.warm * cl.humid * 3.6 + have.timber * .6;
  score.adobe      += cl.warm * arid * 3.2 + have.earth * 1.1 - cl.humid * 1.8;
  // Fired brick needs fuel and a settled kiln, so it belongs to wetter, wooded,
  // non-freezing country rather than being the cheap answer everywhere.
  score.firedbrick += have.earth * .9 + have.timber * .6 + (1 - arid) * .6 - cl.cover * 1.4 - .15;
  // Ashlar is quarry country and civic money: it needs a lot of stone, not a little.
  score.cutstone   += Math.max(0, have.stone - .35) * 3.4 - cl.warm * .3;
  score.rockface   += Math.max(0, have.stone - .32) * 2.6 + Math.max(0, arid - .40) * 2.4 - cl.humid * 2.6 - have.timber * 1.6 - .25;
  score.felt       += have.herd * 1.8 + arid * 1.5 + cl.cold * 1.1 - have.timber * 1.8 - have.stone * 1.0 - .1;
  // Craft leaning is a thumb on the scale, applied only to what the site can supply.
  for(const [id, m] of Object.entries(MATERIALS)) if(m.needs === craft) score[id] += .55 * (have[craft] ?? .3);
  let best = 'masonry', bestScore = -Infinity, k = 0;
  for(const id of Object.keys(MATERIALS)){
   const v = score[id] + ((seedRoll(k++) - .5) * .34);
   if(v > bestScore){ bestScore = v; best = id; }
  }
  return best;
 }

 /** Combine everything into one description a builder can read straight off. */
 function select(input){
  const {climate, site = {}, faith = 'secular', people = 0, seed = 'v'} = input;
  const rng = LandmarkCatalog.rng(seed + '/vocabulary');
  const rolls = []; for(let i = 0; i < 24; i++) rolls.push(rng());
  const roll = i => rolls[i % rolls.length];
  const craft = CRAFT[people % CRAFT.length] || 'stone';
  const roof = roofFor(climate, site, faith, roll);
  const material = materialFor(climate, site, craft, i => roll(i + 12));
  const r = ROOFS[roof], m = MATERIALS[material], o = ORNAMENT[faith] || ORNAMENT.secular;
  return {
   roof, material, craft, faith,
   // Pitch and eave start from the form and are then modulated by the weather, so a
   // gable in a snowy place is steeper than the same gable in a mild one.
   pitch: r.pitch * (1 + climate.load * .45 + climate.humid * .12 - climate.dry * .18),
   eave: r.eave + clamp01(climate.warm * climate.humid) * .30 - climate.cold * .05,
   crown: o.crown, finial: o.finial,
   roofNote: r.note, materialNote: m.note, ornamentNote: o.note,
   label: `${m.label} under a ${r.label.toLowerCase()} roof`
  };
 }
 return {ROOFS, MATERIALS, ORNAMENT, CRAFT, supply, select, roofFor, materialFor, version: 1};
})();
