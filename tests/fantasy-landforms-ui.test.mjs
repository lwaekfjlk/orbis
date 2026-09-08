import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/ui/world-ui.js',import.meta.url),'utf8');
const defaults=source.slice(source.indexOf('const GEN_DEFAULTS ='),source.indexOf('const DEFAULT_WORLD_LAYER'));
const helpers=source.slice(source.indexOf('function landformRegionAt('),source.indexOf('/** Default presentation'));
const {generationParameters,landformRegionAt}=new Function(defaults+helpers+'return {generationParameters,landformRegionAt};')();

test('new generation uses dramatic landforms while a versionless save retains its original terrain',()=>{
 const params={seed:'Old world',plates:24},before=JSON.stringify(params),save={physicalHash:'old'};
 assert.equal(generationParameters(params).landformVersion,1);
 assert.equal(generationParameters(params,save).landformVersion,0);
 assert.equal(generationParameters({...params,landformVersion:0}).landformVersion,0);
 assert.equal(generationParameters({...params,landformVersion:1},save).landformVersion,1);
 assert.equal(JSON.stringify(params),before,'normalization must not rewrite the uploaded save');
 assert.equal(generationParameters(params,save).seed,params.seed);
 for(const version of [-1,2,'1',Infinity,NaN])assert.throws(()=>generationParameters({...params,landformVersion:version},save),/unsupported landform/);
});

test('landform inspection follows the clicked region and preserves water and older worlds',()=>{
 const red={id:7,name:'Ember Tablelands'},ridge={id:2,name:'The Thousand Ridges'};
 const w={height:[1200,1800,600,-5,900],lake:[-1,-1,700,-1,-1],landformRegion:[7,2,7,7,-1],landformRegions:[ridge,red]};
 assert.equal(landformRegionAt(w,0),red);assert.equal(landformRegionAt(w,1),ridge);
 for(const i of [2,3,4,-1,5,1.5])assert.equal(landformRegionAt(w,i),null);
 assert.equal(landformRegionAt({height:[100]},0),null);
});
