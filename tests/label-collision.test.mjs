import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {labelLayouts,referenceIndex} from './label-layout-reference.mjs';

const source=readFileSync(new URL('../src/ui/world-ui.js',import.meta.url),'utf8');
const {position,referencePosition,currentIndex}=labelLayouts(source);
const makeIndex=code=>Function('boxes','renderer',code+';return {remember,nearby};');
const optimizedIndex=makeIndex(currentIndex),oldIndex=makeIndex(referenceIndex);
function random(seed=7){return()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};}

test('numeric collision buckets preserve exact Set enumeration across edges, additions, and full rows',()=>{
    const next=random();
    for(const width of [320,430,639,1480]){
        const boxes=Array.from({length:80},()=>({x:next()*(width+160)-80,y:next()*800-80,w:next()*220+1,h:next()*80+1}));
        // Exact bucket boundaries, out-of-view controls and duplicate references
        // exercise the old first-bucket/insertion-order semantics.
        boxes.push({x:-48,y:48,w:96,h:48},{x:0,y:0,w:width,h:2},{x:width+48,y:0,w:48,h:480});
        boxes.push(boxes[0]);
        const fast=optimizedIndex(boxes,{width}),old=oldIndex(boxes,{width});
        for(let i=0;i<500;i++){
            if(i%17===0){const box={x:next()*width,y:next()*720,w:next()*180+4,h:next()*64+1};fast.remember(box);old.remember(box);}
            const wide=i%3===0,b=wide?{x:6.75,y:next()*800-80,w:width-13.5,h:next()*80+2.5}
                :{x:next()*(width+160)-80,y:next()*800-80,w:next()*180+1,h:next()*80+1};
            assert.deepEqual([...fast.nearby(b,wide)],[...old.nearby(b)],`${width}px query ${i}`);
        }
    }
});

function labelHarness(code,{width,height,count=104,dense=false}){
    const next=random(13),camera={panX:0,panY:0,angle:0};
    const r={width,height,zoom:1,continuousLayer:{},azimuth:0,hoveredRealm:null,
        setHoveredRealm(id){this.hoveredRealm=id;},screen(x,y){
            const dx=x+camera.panX,dy=y+camera.panY,c=Math.cos(camera.angle),s=Math.sin(camera.angle);
            return[width/2+(dx*c-dy*s)*this.zoom,height/2+(dx*s+dy*c)*this.zoom];
        }};
    const element=(name,town=false,realm=false)=>{
        const style={setProperty(key,value){this[key]=value;}},leader={style:{}};
        const label={style,dataset:{},title:'Inspect '+name,textContent:name,tabIndex:0,
            get offsetWidth(){return town?Math.min(120,name.length*(width<700?4.1:4.8)+4):Math.min(190,name.length*5.8+14);},
            get offsetHeight(){return town?Math.ceil((name.length*(width<700?4.1:4.8)+4)/120)*(r.zoom>=12?14:12)+2:30;},
            querySelector(selector){if(!realm)return null;return{
                '.realmFullName':{offsetWidth:Math.min(width<700?125:180,name.length*8),offsetHeight:38},
                '.realmCompactName':{offsetWidth:Math.min(108,name.length*5),offsetHeight:Math.ceil(name.length*5/108)*15},
                '.realmLeader':leader
            }[selector];}};
        return{label,leader};
    };
    const items=[];
    for(let id=0;id<8;id++){
        const x=(id%4-1.5)*width*.18,y=(Math.floor(id/4)-.5)*height*.48,name='Kingdom of the Eastern Long Realm '+id;
        const {label,leader}=element(name,false,true);
        items.push({element:label,leader,feature:{realm:id,name,x,y,i:id,labelSize:18,anchors:Array.from({length:8},(_,k)=>({x:x+(k%4-1.5)*20,y:y+(Math.floor(k/4)-.5)*20,i:id*10+k}))}});
    }
    for(let id=0;id<count;id++){
        const name=(id%9===0?"Granitewatch · Dragon King's Aerie ":id%5===0?'Saint Aurelian River Quarter ':'Oakwater ')+id;
        const {label,leader}=element(name,true),x=dense?(id%3-1)*2:(next()-.5)*width*.86,y=dense?(id%4-2)*2:(next()-.5)*height*.8;
        items.push({element:label,leader,feature:{town:true,provinceId:id,name,x,y,i:id,highCitadel:id%9===0?{}:undefined}});
    }
    for(let id=0;id<5;id++){
        const name='The Great Northern Water '+id,{label,leader}=element(name);
        items.push({element:label,leader,feature:{name,x:(next()-.5)*width*.8,y:(next()-.5)*height*.8,i:id}});
    }
    const dom={labels:{classList:{toggle(){}},getBoundingClientRect:()=>({left:31,top:47})},names:{checked:true},compass:{style:{}}};
    const pins=Array.from({length:4},(_,id)=>({style:{display:'grid'},dataset:id===0?{atlasSite:'holy'}:{},
        getBoundingClientRect:()=>({left:31+width/2+(id-1.5)*36,top:47+height/2,width:30,height:30})}));
    const controls=[{style:{},getBoundingClientRect:()=>({left:31+width-88,top:47+height-105,width:72,height:82})}];
    const args={$:id=>dom[id],renderer:r,world:{},labelItems:items,AtlasSpace:{TOWN_ZOOM:12},
        window:{LandmarkUI:{positionWorldPins(){for(const pin of pins)pin.style.display='grid';}}},
        document:{querySelectorAll:selector=>selector.includes('.world-landmark-pin')||selector.includes('.cm-building-pin')?pins:controls},
        getComputedStyle:()=>({fontSize:width<700?'15.3px':'18px'})};
    const run=Function(...Object.keys(args),code+';return positionLabels;')(...Object.values(args));
    return{r,camera,run,snapshot:()=>({
        labels:items.map(v=>({name:v.element.textContent,style:Object.fromEntries(Object.entries(v.element.style).filter(([,value])=>typeof value!=='function')),
            dataset:{...v.element.dataset},title:v.element.title,tabIndex:v.element.tabIndex,leader:{...v.leader.style}})),
        pins:pins.map(pin=>pin.style.display),compass:dom.compass.style.transform
    })};
}

test('optimized label placement is identical through desktop/mobile pan, rotation, zoom and crowded imports',()=>{
    for(const options of [{width:1480,height:980},{width:639,height:914},{width:430,height:900},{width:320,height:430,count:120,dense:true}]){
        const fast=labelHarness(position,options),old=labelHarness(referencePosition,options);
        for(const [panX,panY,angle,zoom] of [[0,0,0,1],[17,-13,0,1],[-23,9,.45,1],[0,0,Math.PI/2,1],[0,0,.45,3],[0,0,.45,12],[0,0,0,1]]){
            for(const h of [fast,old]){Object.assign(h.camera,{panX,panY,angle});h.r.zoom=zoom;h.r.azimuth=angle;h.run();}
            assert.deepEqual(fast.snapshot(),old.snapshot(),`${options.width}px, pan ${panX}/${panY}, rotate ${angle}, zoom ${zoom}`);
            if(zoom===1&&angle===0&&panX===0&&panY===0)assert(fast.snapshot().labels.filter(v=>/^Oakwater|^Saint |^Granitewatch/.test(v.name)).every(v=>v.style.opacity==='1'),'all on-screen town names remain available');
        }
    }
});
