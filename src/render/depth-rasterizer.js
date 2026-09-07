/** Optional software z-buffer for local architectural scenes.
 * Unlike painter sorting, per-pixel depth handles crossing roofs, arches and large terraces.
 * Shadows are cached in light space. Resolution is capped during software rendering.
 */
function installDepthRasterizer(r){
 if(!r.software)return r;
 r.upload=function(name,g,shadow=true,unlit=0,alpha=1){this.meshes[name]={vertices:g.data instanceof Float32Array?g.data:new Float32Array(g.data),count:g.data.length/9,shadow,unlit,alpha};this.dirtyShadow=true;};
 const hidden=document.createElement('canvas'),ctx=hidden.getContext('2d',{alpha:false});let width=0,height=0,image=null,depth=null,shadow=null,shadowKey='';const S=1024;
 let sun=norm([-.65,1,-.48]);
 function projected(v,k,m,W,H){return[(m[0]*v[k]+m[4]*v[k+1]+m[8]*v[k+2]+m[12]+1)*W*.5,(1-m[1]*v[k]-m[5]*v[k+1]-m[9]*v[k+2]-m[13])*H*.5,m[2]*v[k]+m[6]*v[k+1]+m[10]*v[k+2]+m[14]]}
 function shadowMap(){const buf=new Float32Array(S*S).fill(Infinity),mat=r.lightVP;
  for(const[name,mesh]of Object.entries(r.meshes)){if(!mesh.shadow||!r.visible(name))continue;const v=mesh.vertices;for(let k=0;k<v.length;k+=27){const a=projected(v,k,mat,S,S),b=projected(v,k+9,mat,S,S),c=projected(v,k+18,mat,S,S);raster(a,b,c,buf,S,S,null,0)}}return buf;
 }
 function raster(A,B,C,zbuf,W,H,pixels,color,worldLight=null){
  let a=A,b=B,c=C;let area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<.015)return;
  if(area<0){const tmp=b;b=c;c=tmp;area=-area;if(worldLight){worldLight=[worldLight[0],worldLight[2],worldLight[1]]}}
  const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));if(minX>maxX||minY>maxY)return;
  const ia=1/area,x=minX+.5,y=minY+.5;
  const e0=(b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x),e1=(c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x),e2=area-e0-e1;
  const dx0=b[1]-c[1],dx1=c[1]-a[1],dx2=a[1]-b[1],dy0=c[0]-b[0],dy1=a[0]-c[0],dy2=b[0]-a[0];
  let E0=e0,E1=e1,E2=e2;
  const zDX=(dx0*a[2]+dx1*b[2]+dx2*c[2])*ia,zDY=(dy0*a[2]+dy1*b[2]+dy2*c[2])*ia;let zRow=(e0*a[2]+e1*b[2]+e2*c[2])*ia;
  let light=null;if(worldLight){light=[];for(let t=0;t<3;t++)light.push([(e0*worldLight[0][t]+e1*worldLight[1][t]+e2*worldLight[2][t])*ia,(dx0*worldLight[0][t]+dx1*worldLight[1][t]+dx2*worldLight[2][t])*ia,(dy0*worldLight[0][t]+dy1*worldLight[1][t]+dy2*worldLight[2][t])*ia])}
  for(let yy=minY;yy<=maxY;yy++){let w0=E0,w1=E1,w2=E2,z=zRow;let lu=light?.[0][0]||0,lv=light?.[1][0]||0,lz=light?.[2][0]||0;
   for(let xx=minX;xx<=maxX;xx++){const index=yy*W+xx;if(w0>=-.01&&w1>=-.01&&w2>=-.01&&z<zbuf[index]){zbuf[index]=z;if(pixels){let shade=1;if(light){const sx=lu|0,sy=lv|0;if(sx>1&&sx<S-2&&sy>1&&sy<S-2){let sum=0;const at=sy*S+sx,bias=.0013;for(const off of[0,1,-1,S,-S])sum+=lz-bias<=shadow[at+off]?1:0;shade=.67+.33*sum/5}}const p=index*4;pixels[p]=color[0]*shade;pixels[p+1]=color[1]*shade;pixels[p+2]=color[2]*shade;pixels[p+3]=255}}w0+=dx0;w1+=dx1;w2+=dx2;z+=zDX;if(light){lu+=light[0][1];lv+=light[1][1];lz+=light[2][1]}}
   E0+=dy0;E1+=dy1;E2+=dy2;zRow+=zDY;if(light)for(let t=0;t<3;t++)light[t][0]+=light[t][2];
  }
 }
 r.render=function(){if(!this.width||!this.height)return;this.updateCamera();sun=norm(this.sunDirection||[-.65,1,-.48]);const quality=this.interacting?1:(this.antialiasScale||1),scale=Math.min(quality,(this.renderQuality?2400:1200)/this.width,(this.renderQuality?1650:900)/this.height),W=Math.max(1,Math.round(this.width*scale)),H=Math.max(1,Math.round(this.height*scale));
  if(W!==width||H!==height){width=W;height=H;hidden.width=W;hidden.height=H;image=ctx.createImageData(W,H);depth=new Float32Array(W*H)}depth.fill(Infinity);
  const bg=this.backgroundColor||rgb(this.backgroundHex||'#87b4b8'),data=image.data;
  for(let y=0;y<H;y++){const light=1+(1-y/H)*.022;for(let x=0;x<W;x++){const i=(y*W+x)*4;data[i]=Math.min(255,bg[0]*255*light);data[i+1]=Math.min(255,bg[1]*255*light);data[i+2]=Math.min(255,bg[2]*255*light);data[i+3]=255}}
  const sk=(this.model?.signature||'city')+'/'+this.roofs+'/'+this.landscape+'/'+this.explosion+'/'+Object.keys(this.meshes).length;
  if(this.dirtyShadow||!shadow||shadowKey!==sk){shadow=shadowMap();shadowKey=sk;this.dirtyShadow=false}
  for(const[name,mesh]of Object.entries(this.meshes)){if(!this.visible(name))continue;const v=mesh.vertices;
   for(let k=0;k<v.length;k+=27){const a=projected(v,k,this.mvp,W,H),b=projected(v,k+9,this.mvp,W,H),c=projected(v,k+18,this.mvp,W,H);let n=[v[k+3],v[k+4],v[k+5]];if(n[1]<0)n=n.map(t=>-t);let illum=.56+.47*Math.max(0,dot(n,sun))+.06*Math.max(n[1],0);illum=lerp(illum,1,mesh.unlit||0);const color=[0,1,2].map(j=>Math.min(255,255*(v[k+6+j]*illum*.985+.015)));
    const light=[projected(v,k,this.lightVP,S,S),projected(v,k+9,this.lightVP,S,S),projected(v,k+18,this.lightVP,S,S)];raster(a,b,c,depth,W,H,data,color,light);
   }
  }
  if(this.contactShadows){
   const delta=1.25/400,sample=[[3,1],[-3,-1],[1,-3],[-1,3],[7,4],[-7,-4],[4,-7],[-4,7]];
   for(let y=8;y<H-8;y++)for(let x=8;x<W-8;x++){const i=y*W+x,z=depth[i];if(!Number.isFinite(z))continue;let occlusion=0;
    for(const [dx,dy]of sample){const dz=z-depth[i+dy*W+dx];if(dz>.00004&&dz<delta)occlusion+=(1-dz/delta);}
    const s=1-occlusion*.032;data[i*4]*=s;data[i*4+1]*=s;data[i*4+2]*=s;
   }
  }
  ctx.putImageData(image,0,0);this.ctx.setTransform(1,0,0,1,0,0);this.ctx.imageSmoothingEnabled=true;this.ctx.drawImage(hidden,0,0,this.canvas.width,this.canvas.height);this.onChange();
 };
 return r;
}
