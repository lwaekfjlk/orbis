import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngine,root} from './engine-loader.mjs';

const E=loadEngine();
const Profile=Function('PoliticalLand','RealmNames','PEOPLES','FAITHS','GOVERNMENTS','BIOME',readFileSync(root+'/src/civilization/realm-profile.js','utf8')+';return RealmProfile;')(E.PoliticalLand,E.RealmNames,E.PEOPLES,E.FAITHS,E.GOVERNMENTS,E.BIOME);
const ui=readFileSync(root+'/src/ui/onemap-ui.js','utf8');
// Execute the production handler with a minimal card sink, so the status-versus-
// legacy-owner decision is checked as behavior rather than by matching source text.
const inspectBody=ui.slice(ui.indexOf('    function inspectWorld(i){'),ui.indexOf('    async function readSaga(id){'));
function fixture(){
    const w={height:new Float32Array([100,100,100,-100]),lake:new Float32Array([-1,-1,130,-1]),provinceId:new Int32Array([0,-1,-1,-1]),biome:new Uint8Array(4),temp:new Float32Array(4),arid:new Float32Array(4),features:[],basins:[],lakeId:new Int32Array(4).fill(-1)};
    const s={realms:[{id:0,alive:true,name:'Asgard',capital:0}],provinces:[{id:0,owner:0,pop:100,settled:false,cells:[0]}]};
    return {w,s};
}
function inspector(w,s,politics){
    if(arguments.length<3)politics=E.PoliticalLand;
    const cards=[];
    const run=Function('world','sim','PoliticalLand','BIOME','CityEnvironment','selectionCard','clearSelection','openDrawer','closeDrawer',
        'let busy=false,scene="world",drawer=null,selection=null;'+inspectBody+';return inspectWorld;')
        (w,s,politics,E.BIOME,E.CityEnvironment,(kicker,title,subtitle,buttons,media,realm)=>cards.push({kicker,title,subtitle,buttons,media,realm}),()=>{},()=>{},()=>{});
    return {run,cards};
}

test('The actual OneMap location card trusts wildness status instead of resurrecting a dead province owner',()=>{
    const {w,s}=fixture();s.realms[0].alive=false;
    const before=JSON.stringify(s),view=inspector(w,s);
    assert.equal(E.PoliticalLand.status(w,s,0).label,'wildness');
    view.run(0);
    assert.equal(view.cards.length,1);assert.equal(view.cards[0].realm,null);assert.equal(view.cards[0].kicker,'wildness');
    assert.doesNotMatch(view.cards[0].subtitle,/Asgard/);assert.equal(JSON.stringify(s),before);
    s.realms.push({id:1,alive:true,name:'Duat',capital:1});
    s.provinces.push({id:1,owner:1,pop:50,settled:false,cells:[1]});w.provinceId[1]=1;
    view.run(0);
    assert.equal(view.cards[1].realm,null);assert.equal(view.cards[1].kicker,'wildness','a neighboring country does not acquire open territory automatically');
    view.run(1);
    assert.equal(view.cards[2].realm,s.realms[1]);assert.equal(view.cards[2].kicker,'Duat');
    assert.equal(s.provinces[0].owner,0,'the display does not rewrite an imported province ledger');
});
test('The legacy location-card fallback also rejects an extinct country when PoliticalLand is unavailable',()=>{
    const {w,s}=fixture();s.realms[0].alive=false;
    const view=inspector(w,s,undefined);view.run(0);
    assert.equal(view.cards[0].realm,null);assert.notEqual(view.cards[0].kicker,'Asgard');
});
test('Realm profiles and territory use identical unit-area fallback while excluding water',()=>{
    const {w,s}=fixture();w.provinceId[1]=0;s.provinces[0].cells.push(1);
    const before=JSON.stringify(s);
    let territory=E.PoliticalLand.territory(w,s),profile=Profile.create(w,s,0);
    assert.deepEqual(territory.areas[0],{land:2,water:1,cells:3});
    assert.equal(profile.facts.area,2);assert.equal(profile.facts.areaShare,1);assert.equal(profile.facts.population,100);
    assert.match(profile.summary,/100% of the world's dry land/);
    w.area=new Float32Array([2]);
    territory=E.PoliticalLand.territory(w,s);profile=Profile.create(w,s,0);
    assert.deepEqual(territory.areas[0],{land:3,water:1,cells:3});
    assert.equal(profile.facts.area,3);assert.equal(profile.facts.areaShare,1);
    assert.equal(JSON.stringify(s),before);
});

test('inland water ignores a stale town province index when showing its country and actions',()=>{
    for(const bed of [-10,100]){
        const {w,s}=fixture(),n=25,i=12;
        Object.assign(w,{height:new Float32Array(n).fill(100),lake:new Float32Array(n).fill(-1),provinceId:new Int32Array(n),biome:new Uint8Array(n),temp:new Float32Array(n).fill(12),arid:new Float32Array(n),lakeId:new Int32Array(n).fill(-1)});
        w.height[i]=bed;if(bed>0){w.lake[i]=150;w.biome[i]=15;}
        s.realms.push({id:1,alive:true,name:'Duat'});s.provinces.push({id:1,owner:1,name:'Old Town',pop:1000,urbanPop:900,settled:true});w.provinceId[i]=1;
        const politics={status:(w,s,i)=>E.PoliticalLand.status(w,s,i,5),description:(w,s,i)=>E.PoliticalLand.description(w,s,i,5)},before=JSON.stringify(s);
        const view=inspector(w,s,politics);view.run(i);
        assert.equal(view.cards[0].realm,s.realms[0]);assert.equal(view.cards[0].title,bed<=0?'Inland sea':'Lake');
        assert.equal(view.cards[0].kicker,'Asgard');assert.doesNotMatch(view.cards[0].subtitle,/town residents/);
        assert.deepEqual(view.cards[0].buttons.map(b=>b.label),['Details']);assert.equal(JSON.stringify(s),before);
    }
});
