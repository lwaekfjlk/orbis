import assert from 'node:assert/strict';

// Former string-bucket / Set implementation. Insertion order matters because
// overlap sums and equally near vacant rows must choose the same placement.
export const referenceIndex=`
    const buckets=new Map(),bucketSize=48;
    const cells=b=>{const out=[];for(let y=Math.floor(b.y/bucketSize);y<=Math.floor((b.y+b.h)/bucketSize);y++)for(let x=Math.floor(b.x/bucketSize);x<=Math.floor((b.x+b.w)/bucketSize);x++)out.push(x+','+y);return out;};
    const remember=b=>{for(const key of cells(b)){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}};
    for(const b of boxes)remember(b);
    const nearby=b=>{const found=new Set();for(const key of cells(b))for(const other of buckets.get(key)||[])found.add(other);return found;};
`;
export function labelLayouts(source){
    const position=source.slice(source.indexOf('function positionLabels()'),source.indexOf('function makeGeoJumps()'));
    const indexStart=position.indexOf('    const buckets='),indexEnd=position.indexOf('    const fitTown=',indexStart);
    assert(indexStart>=0&&indexEnd>indexStart);
    const currentIndex=position.slice(indexStart,indexEnd);
    let referencePosition=position.slice(0,indexStart)+referenceIndex+position.slice(indexEnd);
    const offsetsStart=referencePosition.indexOf('        let rings=townOffsets.get(stepY);');
    const offsetsEnd=referencePosition.indexOf('            for(const [dx,dy] of offsets)',offsetsStart);
    assert(offsetsStart>=0&&offsetsEnd>offsetsStart);
    referencePosition=referencePosition.slice(0,offsetsStart)+`
        for(let ring=1;!free&&ring<=4;ring++){
            const offsets=[];
            for(let x=-ring;x<=ring;x++)offsets.push([x*stepX,-ring*stepY],[x*stepX,ring*stepY]);
            for(let y=1-ring;y<ring;y++)offsets.push([-ring*stepX,y*stepY],[ring*stepX,y*stepY]);
            offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
`+referencePosition.slice(offsetsEnd);
    return{position,referencePosition,currentIndex};
}
