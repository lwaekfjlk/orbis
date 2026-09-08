import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cssFile=resolve(root,'styles/world.css');
const css=await readFile(cssFile,'utf8');
const faces=text=>[...text.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m=>m[1]);
const face=faces(css).find(s=>/font-family:\s*"IM Fell English"/.test(s));
const fontPath=resolve(dirname(cssFile),face.match(/url\("([^"]+)"\)/)[1]);
const font=await readFile(fontPath),tables=new Map();
for(let i=0;i<font.readUInt16BE(4);i++){
    const p=12+i*16;tables.set(font.toString('ascii',p,p+4),{offset:font.readUInt32BE(p+8),length:font.readUInt32BE(p+12)});
}
function fontName(id){
    const start=tables.get('name').offset,count=font.readUInt16BE(start+2),strings=start+font.readUInt16BE(start+4);
    for(let i=0;i<count;i++){
        const p=start+6+i*12;if(font.readUInt16BE(p)!==3||font.readUInt16BE(p+6)!==id)continue;
        const length=font.readUInt16BE(p+8),offset=strings+font.readUInt16BE(p+10);let name='';
        for(let j=offset;j<offset+length;j+=2)name+=String.fromCharCode(font.readUInt16BE(j));return name;
    }
    return'';
}
function glyph(codepoint){
    const cmap=tables.get('cmap').offset;
    for(let record=0;record<font.readUInt16BE(cmap+2);record++){
        const p=cmap+4+record*8,platform=font.readUInt16BE(p),encoding=font.readUInt16BE(p+2);
        if(platform!==0&&!(platform===3&&[1,10].includes(encoding)))continue;
        const start=cmap+font.readUInt32BE(p+4),format=font.readUInt16BE(start);
        if(format===12)for(let i=0;i<font.readUInt32BE(start+12);i++){
            const g=start+16+i*12,first=font.readUInt32BE(g),last=font.readUInt32BE(g+4);
            if(codepoint>=first&&codepoint<=last)return font.readUInt32BE(g+8)+codepoint-first;
        }
        if(format!==4||codepoint>65535)continue;
        const count=font.readUInt16BE(start+6)/2,end=start+14,begin=end+count*2+2,delta=begin+count*2,range=delta+count*2;
        for(let i=0;i<count;i++){
            if(codepoint<font.readUInt16BE(begin+i*2)||codepoint>font.readUInt16BE(end+i*2))continue;
            const advance=font.readUInt16BE(range+i*2),d=font.readInt16BE(delta+i*2);
            if(!advance)return(codepoint+d)&65535;
            const index=font.readUInt16BE(range+i*2+advance+2*(codepoint-font.readUInt16BE(begin+i*2)));
            return index?(index+d)&65535:0;
        }
    }
    return 0;
}

test('the local map face contains real italic outlines at its declared regular weight',()=>{
    assert.match(face,/font-style:\s*italic/);assert.match(face,/font-weight:\s*400/);
    assert.equal(fontName(1),'IM FELL English');assert.equal(fontName(2),'Italic');
    assert.equal(font.readUInt16BE(tables.get('OS/2').offset+4),400);
    assert.equal(font.readUInt16BE(tables.get('OS/2').offset+62)&1,1,'the font itself must be italic, rather than a slanted regular font');
    assert(font.readInt32BE(tables.get('post').offset+4)/65536<0,'italic outlines declare their own negative angle metric');
    assert.equal(font.readUInt16BE(tables.get('head').offset+44)&2,2);
});

test('the bundled italic face covers Latin names, accents and map punctuation without glyph substitution',()=>{
    const names="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝß àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ · ' - 0123456789";
    for(const character of new Set(names))assert(glyph(character.codePointAt(0))>0,'missing italic glyph: '+character);
    for(const name of ['Kingdom of Asgard','Principality of Chicomoztoc',"Granitewatch · Dragon King's Aerie",'Blackley · High Sanctuary'])
        for(const character of name)assert(glyph(character.codePointAt(0))>0,name+' must use the supplied map lettering');
});

test('development and standalone font loading use the same licensed binary without external services',async()=>{
    const index=await readFile(resolve(root,'index.html'),'utf8');
    assert.match(index,/<link\b[^>]*href="styles\/world\.css"/);
    assert(fontPath.startsWith(root+sep));assert.equal(fontPath,resolve(root,'assets/fonts/IMFellEnglish-Italic.ttf'));
    const license=await readFile(resolve(root,'assets/fonts/IMFellEnglish-OFL.txt'),'utf8');
    assert.match(license,/Copyright \(c\) 2010, Igino Marini/);assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/);
    // Exercise the real build's font transformation without writing a bundle or
    // generated worker. It must preserve the complete unmodified font bytes.
    const build=await readFile(resolve(root,'scripts/build.mjs'),'utf8');
    const helper=build.slice(build.indexOf('async function inlineFontURLs('),build.indexOf('// Duplicate trusted engine modules'));
    const inline=Function('readFile','realpath','resolve','dirname','sep','root',helper+';return inlineFontURLs;')(readFile,realpath,resolve,dirname,sep,root);
    const embedded=faces(await inline(css,cssFile)).find(s=>/font-family:\s*"IM Fell English"/.test(s));
    const encoded=embedded.match(/url\("data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\)/);
    assert(encoded,'standalone HTML must contain the italic face, not a relative URL or font service');
    assert.deepEqual(Buffer.from(encoded[1],'base64'),font);
});
