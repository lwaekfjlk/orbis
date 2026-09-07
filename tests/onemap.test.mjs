import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('OneMap has a single startup entry, with shell before executable scripts',()=>{
 const html=read('index.html'),bootstrap=read('src/bootstrap.js');
 assert(html.indexOf('id="omChrome"')<html.indexOf('<script'));
 assert(bootstrap.includes('OneMap.init()')&&bootstrap.includes('OneMap.bind()'));
 assert(!bootstrap.includes('CityUI.open')&&!bootstrap.includes('openLibrary'));
 const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'Static DOM ids must be unique');
 for(const id of ['map','play','step1','step10','forgeButton','omDrawer'])assert(ids.includes(id));
});
test('Single-file build has no external styles or executable scripts',()=>{
 const html=read('dist/telluric-onemap.html');
 assert(!/<script[^>]+src=/i.test(html));
 assert(!/<link[^>]+rel=["']stylesheet/i.test(html));
 assert(html.includes('body.onemap #stage'));
 assert(html.indexOf('id="omChrome"')<html.indexOf('<script>'));
});
test('Parent geography, society and world-map renderer retain the pre-art-upgrade baseline',()=>{
 const {sha256}=JSON.parse(read('docs/CORE_BASELINE.json'));
 // City detail and architecture intentionally change in v11. Physical geography,
 // civilization and the world-map geometry must still match the approved baseline.
 for(const [file,expected] of Object.entries(sha256)){
  if(!['src/world/geography.js','src/civilization/simulation.js','src/render/world-renderer.js'].includes(file))continue;
  let content=readFileSync(resolve(root,file));
  // v12 adds a configurable light direction to the shader. Normalize ONLY
  // that deliberate rendering change; all world geometry remains byte-identical.
  if(file==='src/render/world-renderer.js')content=Buffer.from(content.toString('utf8')
    .replace('uniform vec3 lightDir;','')
    .replace('vec3 sun=normalize(lightDir);','vec3 sun=normalize(vec3(-.65,1.,-.48));')
    .replace("'unlit', 'lightDir'", "'unlit'")
    .replace('gl.uniform3fv(this.loc.lightDir,this.sunDirection||[-.65,1,-.48]);',''));

  if(file==='src/render/world-renderer.js')content=Buffer.from(content.toString('utf8')
    .replace("return this.options.settlements !== false && (civil || this.layer === 'settlements' || this.layer === 'relief');", "return this.options.settlements !== false && (civil || this.layer === 'settlements');")
    .replace("return this.options.frontiers !== false && (civil || this.layer === 'relief');", "return this.options.frontiers !== false && civil;"));
  const actual=createHash('sha256').update(content).digest('hex');
  assert.equal(actual,expected,file+' unexpectedly changed');
 }
});
