import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngine, defaults, root} from './engine-loader.mjs';

const E=loadEngine(),read=p=>readFileSync(root+'/'+p,'utf8');
const source=read('src/ui/world-ui.js');
const labelsSource=source.slice(source.indexOf('function realmLabelAnchors('),source.indexOf('function makeGeoJumps()'));
const RealmProfile=Function(read('src/civilization/realm-profile.js')+';return RealmProfile;')();
const world=await E.generateWorld(defaults),sim=E.createCivilization(world);
const before=[E.physicalFingerprint(world),E.settlementFingerprint(sim),E.politicalFingerprint(sim)];

function harness({state=sim,worldData=world,width=1280,height=800,projected=false,pins=[]}={}){
    const calls={inspect:[],focus:[]},r=Object.create(E.AtlasRenderer.prototype);
    Object.assign(r,{world:worldData,sim:state,width,height,zoom:1,azimuth:.018,elevation:1.19,target:[0,0,0],relief:1,selected:-1,
        hoveredRealm:null,setHoveredRealm(id){this.hoveredRealm=id;},request(){}});
    r.updateCamera();if(projected)r.screen=(x,y,dh)=>{if(projected===true)assert.equal(dh,0,'town markers must project on the ground at every zoom');return[x,y];};
    const makeElement=()=>({dataset:{},children:[],style:{setProperty(k,v){this[k]=v;}},classList:{toggle(name,value){this[name]=value;}},
        setAttribute(k,v){this[k]=v;},appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},
        set innerHTML(value){this.html=value;this.children=[];},get innerHTML(){return this.html||'';},
        get offsetWidth(){return this.className?.includes('townLabel')?Math.min(120,this.nameWidth()+4):Math.min(180,this.nameWidth()+14);},
        get offsetHeight(){return this.className?.includes('townLabel')?Math.ceil((this.nameWidth()+4)/120)*12+2:30;},
        nameWidth(){return (this.html?.match(/<em(?:\s[^>]*)?>([^<]*)<\/em>/)?.[1]||'').length*4.8;},
        querySelector(selector){if(!this.className?.includes('realmLabel'))return null;
            return {'.realmFullName':{offsetWidth:Math.min(width<700?125:180,this.nameWidth()*1.5),offsetHeight:38},
                '.realmCompactName':{offsetWidth:Math.min(108,this.nameWidth()),offsetHeight:Math.ceil(this.nameWidth()/108)*15},
                '.realmLeader':{style:{}}}[selector];}
    });
    const dom={labels:makeElement(),names:{checked:true},compass:makeElement(),legends:{checked:true}};
    dom.labels.getBoundingClientRect=()=>({left:37,top:93});
    const win={addEventListener(){},ContinuousMap:{active:true,focusTown(id){calls.focus.push(id);}}};
    const args={world:worldData,sim:state,renderer:r,currentLayer:'realms',selectedRealm:0,labelItems:[],busy:false,
        document:{createElement:makeElement,fonts:{addEventListener(){}},querySelectorAll:selector=>pins.filter(p=>selector.includes(p.kind==='building'?'cmLabels':'worldLandmarkPins'))},window:win,$:id=>dom[id],GW:E.GW,
        POLITICAL:['realms','faiths','peoples','diplomacy','wealth','magic'],RealmNames:E.RealmNames,RealmProfile,
        PoliticalLand:E.PoliticalLand,AtlasSpace:E.AtlasSpace,cell:(x,y)=>Math.round(y)*E.GW+Math.round(x),escapeHTML:String,
        inspectCell(i){calls.inspect.push(i);},selectRealm(){},LandmarkBinding:{highCitadelLabel:p=>p.highCitadel.kind==='dragon'?'Dragon King Citadel':'High Holy City'}};
    const api=Function(...Object.keys(args),labelsSource+`;return {make(layer){currentLayer=layer;makeLabels();},position:positionLabels,items:()=>labelItems};`)(...Object.values(args));
    return{...api,r,dom,calls,win,document:args.document};
}
const towns=h=>h.items().filter(v=>v.feature.town);
const screenVisible=(r,p)=>{const [x,y]=r.screen(p.x,p.y,0);return x>=0&&x<=r.width&&y>=0&&y<=r.height;};
const rectangle=({element:e})=>({x:parseFloat(e.style.left)-(e.offsetWidth+6)/2,y:parseFloat(e.style.top)-(e.offsetHeight+4),w:e.offsetWidth+6,h:e.offsetHeight+4});
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('all 104 default settlements retain their complete names in overview and thematic layers',()=>{
    const h=harness(),expected=sim.provinces.filter(p=>p.settled);
    assert.equal(expected.length,104,'the default fixture must include the full inhabited world');
    for(const layer of ['realms','relief','settlements','water','ice','potential','plates','biomes','faiths','peoples']){
        h.make(layer);
        assert.equal(towns(h).length,expected.length,layer+' must not truncate each country or omit the towns');
        assert.equal(new Set(towns(h).map(v=>v.feature.provinceId)).size,expected.length);
        for(const {element:e,feature:f} of h.items().filter(v=>v.feature.realm!=null)){
            assert.equal((e.innerHTML.match(/<em[^>]+>/g)||[]).length,2);
            assert(e.innerHTML.includes('<em class="realmFullName">'+f.name+'</em>'));
            assert(e.innerHTML.includes('<em class="realmCompactName" aria-hidden="true">'+f.name+'</em>'),'the smaller lettering must print the same full country name');
            assert(!e.innerHTML.includes('realmMarker'),'numbers must never replace the printed state name');
        }
        for(const {feature:f,element:e} of towns(h)){
            assert.equal(f.name,sim.provinces[f.provinceId].name);
            assert(e.innerHTML.includes('<em>'+f.name+'</em>'),'full name, without abbreviation');
            assert(e.className.includes('cm-town-pin'),'the town focus target remains discoverable');
            assert.equal(e.style.opacity,screenVisible(h.r,f)?'1':'0',layer+': '+f.name);
        }
    }
});

test('the actual default world fits town lettering within desktop and narrow overview screens',()=>{
    for(const [width,height] of [[1480,980],[639,914],[430,900]]){
        const h=harness({width,height});h.make('realms');
        const visible=towns(h).filter(v=>v.element.style.opacity==='1');
        assert.equal(visible.length,sim.provinces.filter(p=>p.settled&&screenVisible(h.r,p)).length);
        assert.equal(visible.length,104);
        let count=0;
        for(let i=0;i<visible.length;i++){
            const b=rectangle(visible[i]);
            assert(b.x>=7.99&&b.x+b.w<=width-7.99&&b.y>=7.99&&b.y+b.h<=height-21.99,visible[i].feature.name+' must fit the viewport');
            const {element:e,feature:f}=visible[i],[x,y]=h.r.screen(f.x,f.y,0);
            assert(Math.abs(parseFloat(e.style.left)+parseFloat(e.style['--town-anchor-x'])-x)<1e-6);
            assert(Math.abs(parseFloat(e.style.top)+parseFloat(e.style['--town-anchor-y'])-y)<1e-6,f.name+' must remain tied to its real settlement, independently of the surrounding country layout');
            for(let j=0;j<i;j++)if(overlaps(b,rectangle(visible[j])))count++;
        }
        assert.equal(count,0,width+'px overview should have enough room for all 104 town names');
    }
});

test('long high-city names claim nearby space before a dense cluster of larger-population towns',()=>{
    // Country anchors and fonts change as national territories change. Isolate
    // the long-name priority rule on the same crowded screen, with both tiny
    // high cities last in the population order and no country text obstacle.
    const ordinary=Array.from({length:18},(_,id)=>({id,i:id,name:'Riverside Metropolitan Quarter '+id,x:235,y:400,settled:true,urbanPop:5000}));
    const state={realms:[],provinces:[...ordinary,
        {id:18,i:18,name:"Granitewatch · Dragon King's Aerie",x:235,y:400,settled:true,urbanPop:650,highCitadel:{kind:'dragon',elevation:4097}},
        {id:19,i:19,name:'Blackley · The High Mountain Sanctuary',x:235,y:400,settled:true,urbanPop:650,highCitadel:{kind:'holy',elevation:3938}}]};
    const h=harness({state,width:430,height:900,projected:true});h.make('settlements');
    assert(towns(h).every(v=>v.element.style.opacity==='1'));
    for(const v of towns(h).filter(v=>v.feature.highCitadel)){
        const dx=parseFloat(v.element.style['--town-anchor-x']),dy=parseFloat(v.element.style['--town-anchor-y']);
        assert(Math.hypot(dx,dy)<=v.element.offsetHeight*2,'tiny high cities must not be displaced by the earlier population sort');
    }
    for(let i=0;i<towns(h).length;i++)for(let j=0;j<i;j++)assert(!overlaps(rectangle(towns(h)[i]),rectangle(towns(h)[j])));
});

test('dense and edge towns move their lettering, keep the original marker, and never lose keyboard access',()=>{
    const state={realms:[],provinces:Array.from({length:18},(_,id)=>({id,i:id,name:'River Quarter '+id,x:id===0?1:210,y:id===0?1:220,settled:true,urbanPop:20}))};
    state.provinces.push({id:18,i:18,name:'Offscreen',x:-2,y:200,settled:true,urbanPop:20});
    const h=harness({state,width:430,height:700,projected:true});h.make('settlements');
    const visible=towns(h).slice(0,18);
    for(const v of visible){const {feature:f,element:e}=v,b=rectangle(v);
        assert.equal(e.style.opacity,'1');assert.equal(e.tabIndex,0);
        assert(b.x>=8&&b.x+b.w<=422&&b.y>=8&&b.y+b.h<=678);
        assert.equal(parseFloat(e.style.left)+parseFloat(e.style['--town-anchor-x']),f.x);
        assert.equal(parseFloat(e.style.top)+parseFloat(e.style['--town-anchor-y']),f.y);
    }
    for(let i=0;i<visible.length;i++)for(let j=0;j<i;j++)assert(!overlaps(rectangle(visible[i]),rectangle(visible[j])),'dense label names must occupy separate lines');
    assert.equal(towns(h).at(-1).element.style.opacity,'0');assert.equal(towns(h).at(-1).element.tabIndex,-1);
});

test('world town names persist through the detail thresholds and preserve ordinary and high-city focus actions',()=>{
    const state={realms:[],provinces:[{id:0,i:4,name:'Small Village',x:300,y:200,settled:true,urbanPop:20},
        {id:1,i:9,name:'Snow Aerie',x:450,y:200,settled:true,urbanPop:650,highCitadel:{kind:'dragon',elevation:4096,version:1}}]};
    const h=harness({state,projected:true});h.r.continuousLayer={};h.make('settlements');
    const [ordinary,high]=towns(h).sort((a,b)=>a.feature.provinceId-b.feature.provinceId);
    ordinary.element.onclick();assert.deepEqual(h.calls.inspect,[4]);
    high.element.onclick();assert.deepEqual(h.calls.focus,[1]);
    assert.match(high.element.title,/Snow Aerie.*Dragon King Citadel.*4,096 m/);
    ordinary.element.ondblclick({stopPropagation(){}});assert.deepEqual(h.calls.focus,[1,0]);
    for(const zoom of [1,E.AtlasSpace.TOWN_ZOOM-.01,E.AtlasSpace.TOWN_ZOOM,E.AtlasSpace.DETAIL_ZOOM*3,700]){
        h.r.zoom=zoom;h.position();
        assert(towns(h).every(v=>v.element.style.opacity==='1'),'zoom '+zoom+' must not erase town names');
    }
    ordinary.element.onclick();assert.deepEqual(h.calls.focus,[1,0,0],'local labels retain the former continuous pin action');
    h.dom.names.checked=false;h.position();assert.equal(h.dom.labels.classList.hidden,true);
    h.dom.names.checked=true;h.position();assert.equal(h.dom.labels.classList.hidden,false);
    assert(towns(h).every(v=>v.element.style.opacity==='1'));
});

test('town lettering avoids visible landmark pins in map coordinates and reclaims space when they disappear',()=>{
    const p={id:0,i:4,name:'Pin-side Village',x:300,y:200,settled:true,urbanPop:40};
    const pin={kind:'world',style:{display:'grid'},getBoundingClientRect:()=>({left:322,top:278,width:30,height:30})};
    const h=harness({state:{provinces:[p],realms:[]},projected:true,pins:[pin]});h.make('settlements');
    const town=towns(h)[0],obstacle={x:283,y:183,w:34,h:34};
    assert(!overlaps(rectangle(town),obstacle),'a world icon must not cover any town text');
    pin.style.display='none';h.position();
    assert.equal(town.element.style.left,'300px');assert.equal(town.element.style.top,'200px','hidden pins no longer reserve space');
    pin.style.display='grid';h.r.continuousLayer={};h.r.zoom=E.AtlasSpace.TOWN_ZOOM;h.position();
    assert.equal(town.element.style.top,'200px','world pins hidden by the local-view layer do not block names');
    pin.kind='building';h.position();assert(!overlaps(rectangle(town),obstacle),'local building pins also reserve their measured bounds');
});

test('a decorative pin yields a country’s only anchor and returns after names, camera and layer changes',()=>{
    // A one-cell island is the country's entire dry territory. Filling the
    // surrounding grid with unowned land would now correctly grant it many
    // alternative anchors through the complete-territory ownership map.
    const x=150,y=100,i=y*E.GW+x,worldData={height:new Float32Array(E.GN),lake:new Int8Array(E.GN).fill(-1),area:new Float32Array(E.GN).fill(1),provinceId:new Int32Array(E.GN).fill(-1)};
    worldData.height[i]=1;worldData.provinceId[i]=0;
    const state={realms:[{id:0,name:'Tiny Island',title:'Kingdom of Tiny Island',alive:true,capital:0,strength:1,gov:0}],
        provinces:[{id:0,i,name:'Island Town',x,y,owner:0,cells:[i],settled:true,urbanPop:40}]};
    const pins=[],h=harness({state,worldData,projected:'all',pins});h.r.layer='realms';h.r.onChange=h.position;
    h.r.screen=(gx,gy)=>[gx+150,gy+100];
    const container={children:[],set innerHTML(value){this.children=[];},replaceChildren(...children){this.children=children;},appendChild(e){this.children.push(e);}};
    h.document.getElementById=id=>id==='worldLandmarkPins'?container:h.dom[id];
    const create=h.document.createElement;
    h.document.createElement=()=>{const e=create();e.kind='world';e.getBoundingClientRect=()=>({left:37+parseFloat(e.style.left)-12,top:93+parseFloat(e.style.top)-12,width:24,height:24});return e;};
    const sites=[{id:'only-anchor',i,x,y,name:'Island Monument',recipe:{style:'test'}},
        {id:'unrelated',i:y*E.GW+280,x:280,y,name:'Distant Monument',recipe:{style:'test'}}];
    Function('window','document','world','sim','renderer','LandmarkBinding','LandmarkCatalog',read('src/ui/landmark-ui.js'))(
        h.win,h.document,worldData,state,h.r,{inventory:()=>sites},{styles:[{id:'test',icon:'◇'}]});
    h.win.LandmarkUI.onWorldUpdate();pins.push(...container.children);h.make('realms');
    const country=h.items().find(v=>v.feature.realm===0);
    assert.deepEqual(country.feature.anchors.map(a=>a.i),[i],'the fixture must retain exactly one real territorial anchor');
    assert.equal(country.element.style.opacity,'1','a decorative pin cannot erase the only country label');
    assert.equal(country.element.style.left,'300px');assert.equal(pins[0].style.display,'none');
    assert.equal(pins[1].style.display,'grid','unrelated pins remain visible');
    h.dom.names.checked=false;h.position();assert.equal(pins[0].style.display,'grid','turning names off immediately clears label suppression');
    h.dom.names.checked=true;h.position();assert.equal(pins[0].style.display,'none');
    sites[0].x=280;h.r.onChange();assert.equal(pins[0].style.display,'grid','newly separated projections restore the pin');
    sites[0].x=x;h.r.onChange();assert.equal(pins[0].style.display,'none');
    h.r.layer='settlements';h.make('settlements');assert.equal(pins[0].style.display,'grid','a layer without country lettering must not retain its suppression');
    assert.equal(towns(h)[0].element.style.opacity,'1');
    // A dedicated dragon / holy site is part of the map's geographic identity,
    // so its symbol keeps the real anchor and the entire country name moves.
    pins[0].dataset.atlasSite='dragon';h.r.layer='realms';h.make('realms');
    const fullCountry=h.items().find(v=>v.feature.realm===0),e=fullCountry.element;
    assert.equal(pins[0].style.display,'grid','dedicated site symbols must never yield to a country name');
    assert.equal(e.style.opacity,'1');assert.notEqual(e.dataset.labelVariant,'marker');
    const scale=+e.style.transform.match(/scale\(([^)]+)\)/)[1],w=(parseFloat(e.style.width)+6)*scale,hh=(parseFloat(e.style.height)+4)*scale;
    const countryBox={x:parseFloat(e.style.left)-w/2,y:parseFloat(e.style.top)-hh/2,w,h:hh};
    assert(!overlaps(countryBox,{x:286,y:186,w:28,h:28}),'the complete country lettering must move away from the protected symbol');
    h.dom.names.checked=false;h.position();assert.equal(pins[0].style.display,'grid');
    h.dom.names.checked=true;h.position();assert.equal(pins[0].style.display,'grid');
});

test('settlement membership changes rebuild labels without a city-model population threshold',()=>{
    const p={id:0,i:3,name:'Growing Village',x:300,y:200,settled:true,urbanPop:650},state={provinces:[p],realms:[]};
    const h=harness({state,projected:true});h.make('settlements');assert.equal(towns(h).length,1);
    p.urbanPop=649;h.make('settlements');assert.equal(towns(h).length,1);
    p.urbanPop=20;h.make('settlements');assert.equal(towns(h).length,1);
    p.settled=false;h.make('settlements');assert.equal(towns(h).length,0);
    p.settled=true;p.name='Renamed Village';h.make('settlements');assert.equal(towns(h)[0].feature.name,p.name);
});

test('label layout and reading leave world geography and simulation unchanged',()=>{
    assert.deepEqual([E.physicalFingerprint(world),E.settlementFingerprint(sim),E.politicalFingerprint(sim)],before);
});
