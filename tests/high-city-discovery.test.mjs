import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/ui/onemap-ui.js',import.meta.url),'utf8');
const fixture=()=>({year:400,options:{highCitadelsVersion:1},events:[],realms:[],provinces:[
    {id:0,i:10,x:10,y:20,name:'River Town',settled:true,city:true,urbanPop:5000,settlementType:'Town',owner:-1},
    {id:1,i:20,x:30,y:40,name:"Granitewatch · Dragon King's Aerie",settled:true,city:false,urbanPop:1100,highCitadel:{kind:'dragon',version:1,originalName:'Granitewatch',elevation:4097}},
    {id:2,i:30,x:50,y:60,name:'Blackley · High Sanctuary',settled:true,city:false,urbanPop:1000,highCitadel:{kind:'holy',version:1,originalName:'Blackley',elevation:3938}}
]});
function harness(state=fixture()){
    const nodes=new Map(),calls={town:[],region:[],inspect:[]},world={params:{seed:'Existing world'},continents:[],features:[],legends:[]};
    function node(id=''){
        return{id,value:'',textContent:'',dataset:{},style:{},children:[],listeners:new Map(),
            classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this[k]=v;},
            addEventListener(type,fn){this.listeners.set(type,fn);},focus(){},appendChild(e){this.children.push(e);},
            querySelectorAll(selector){const match=selector.match(/^\[data-([^\]]+)\]$/);if(!match)return[];
                const key=match[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.filter(e=>key in e.dataset);},
            querySelector(selector){return selector==='button'?this.children[0]:this.querySelectorAll(selector)[0]||null;},
            set innerHTML(html){this.html=html;this.children=[];for(const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)){
                const e=node();for(const a of m[1].matchAll(/data-([\w-]+)="([^"]*)"/g))e.dataset[a[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];
                e.textContent=m[2].replace(/<[^>]*>/g,'');e.click=()=>e.onclick?.();this.children.push(e);
            }},get innerHTML(){return this.html||'';}
        };
    }
    const element=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
    const document={getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},body:{dataset:{}}};
    const win={addEventListener(){},ContinuousMap:{active:true,focusTown(id){calls.town.push(id);return Promise.resolve({provinceId:id});}}};
    const renderer={zoom:1,focus(x,y){calls.region.push([x,y]);},request(){},canvas:element('map')};
    const registry=state.provinces.filter(p=>p.highCitadel).map(p=>({id:'site-'+p.id,provinceId:p.id,i:p.i,x:p.x,y:p.y,name:p.name,highCitadel:p.highCitadel,kind:p.highCitadel.kind}));
    const args={window:win,document,world,sim:state,renderer,ContinuousMap:win.ContinuousMap,
        LandmarkUI:{registry,close(){}},CityUI:{close(){}},
        LandmarkBinding:{highCitadelLabel:p=>p.highCitadel.kind==='dragon'?'Dragon King Citadel':'High Holy City'},
        TownCatalog:{native:()=> 'mountain'},RealmNames:{fullName:r=>r.name},fmtPop:String,escapeHTML:String,
        busy:false,simAdvancing:false,playing:false,inspectCell:i=>calls.inspect.push(i)};
    Function(...Object.keys(args),source)(...Object.values(args));win.OneMap.bind();win.OneMap.onWorldUpdate();
    const search=q=>{element('omSearch').value=q;element('omSearch').oninput();return element('omSearchResults');};
    return{state,world,win,element,search,calls};
}

test('empty search exposes both existing high cities with altitude and a direct visit action',()=>{
    const h=harness(),before=JSON.stringify(h.state),results=h.search('');
    assert.match(results.innerHTML,/VISIT THE HIGH CITIES/);
    assert.match(results.innerHTML,/Dragon King Citadel · 龙王城/);assert.match(results.innerHTML,/High Holy City · 圣城/);
    assert.match(results.innerHTML,/Granitewatch · 4,097 m/);assert.match(results.innerHTML,/Blackley · 3,938 m/);
    const cards=results.querySelectorAll('[data-high-city]');assert.equal(cards.length,2);
    for(const card of cards)card.click();assert.deepEqual(h.calls.town,[1,2]);assert.deepEqual(h.calls.region,[]);
    assert.equal(results.querySelectorAll('[data-search-hit]').length,1,'featured cities must not appear twice in the initial list');
    assert.equal(JSON.stringify(h.state),before,'finding and visiting a city cannot rewrite the save');
});

test('English and Chinese high-city searches return a single correct city and the primary result visits its model',()=>{
    const h=harness();
    for(const [q,id] of [['dragon',1],['DragonCity',1],['dragon city',1],['dragon king citadel',1],['龙城',1],['龙王',1],['龙王城',1],['holy',2],['HolyCity',2],['holy city',2],['圣城',2]]){
        const results=h.search(q),hits=results.querySelectorAll('[data-search-hit]');
        assert.equal(hits.length,1,q+' should find exactly one actual high city, without a duplicate monument row');
        assert(results.innerHTML.includes(h.state.provinces[id].name));
        hits[0].click();assert.equal(h.calls.town.at(-1),id,q+' must approach the dedicated model, not stop at a regional zoom');
    }
    assert.equal(h.calls.region.length,0);
    const result=h.search('龙王城');h.element('omSearch').listeners.get('keydown')({key:'Enter',preventDefault(){}});
    assert.equal(h.calls.town.at(-1),1,'keyboard Enter uses the same direct route');assert.equal(result.querySelectorAll('[data-high-city]').length,0);
});

test('ordinary search still locates the region and its separate Zoom button approaches the town',()=>{
    const h=harness(),results=h.search('River Town');
    results.querySelectorAll('[data-search-hit]')[0].click();
    assert.deepEqual(h.calls.region,[[10,20]]);assert.deepEqual(h.calls.inspect,[10]);assert.deepEqual(h.calls.town,[]);
    results.querySelectorAll('[data-search-enter]')[0].click();assert.deepEqual(h.calls.town,[0]);
});

test('legacy or uninhabited high-city records never create visit shortcuts or alter saved founding rules',()=>{
    const legacy=fixture();legacy.options.highCitadelsVersion=0;legacy.provinces=legacy.provinces.slice(0,1);
    const h=harness(legacy),before=JSON.stringify(legacy);
    assert.equal(h.search('').querySelectorAll('[data-high-city]').length,0);
    assert.match(h.search('龙王城').innerHTML,/No matching place/);
    assert.equal(JSON.stringify(legacy),before);assert.deepEqual(h.calls.town,[]);
    const current=harness();current.state.provinces[1].settled=false;current.state.provinces[2].urbanPop=649;
    current.win.OneMap.onWorldUpdate();assert.equal(current.search('').querySelectorAll('[data-high-city]').length,0,'only currently buildable inhabited high cities get a visit shortcut');
});
