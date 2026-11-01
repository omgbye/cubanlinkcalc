/* Dependency-free WebGL2 visual. No weight, pricing, or feed calculations.
   Renderer v4, built on Codex's original: TRUE CURB LINKS (v4 geometry --
   one open oval ring per link, threaded through its neighbours, see
   linkMesh; wire/pitch solved numerically per tier in the v4.1 revision),
   karat tint (uTint), and procedural studio-environment
   reflections (v2). The v3 solid band is gone: its links stacked like
   shingles and read as diagonal plates however they were tuned.
   MODELED-LINK STAGED VARIANT (not deployed): the per-link geometry is no
   longer swept in code. One master Cuban link was modeled in Blender
   (modeled-link/model_link.py: filed flat facets front/back, squared-oval
   centreline, analytic normals, baked AO) and exported to link-mesh.bin
   (master 2,208 tris + decimated lod 922 + lod2 348). This file loads that
   asset async, derives each tier's mesh from it (along-axis scale for the
   tier aspect, as the old per-tier sweeps did), and keeps everything else
   -- drape, bust, clasp, shaders, tint, contract -- from the v4 renderer.
   Integration: renderChain(container, {widthMm, lengthIn, light, angleDeg, karat}).
   Canvas, buffers, and geometry are retained. Input calls coalesce into one RAF. */
(function(global){
 'use strict';
 const cache=new WeakMap();
 const profile=[[-215,75,42],[-200,97,52],[-160,126,63],[-80,155,75],[0,165,80],[55,159,75],[90,144,70],[120,120,60],[145,96,54],[167,74,47],[178,64,45]];
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const norm=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 /* Karat tint multipliers on the shader's gold, applied to the base color,
    the specular highlight, and the environment reflection alike. Brightness
    and yellow saturation RISE with karat: 10K palest/dullest, 14K the neutral
    baseline (1,1,1), 18K a touch brighter and more yellow, 22K richer, 24K
    the brightest, most saturated yellow-gold. Still subtle throughout.
    Anchors are linearly interpolated; a custom fineness maps onto the same
    scale by purity fraction (fineness x 24). */
 const tintAnchors=[[9,[.885,.855,.905]],[10,[.905,.872,.923]],[14,[1,1,1]],[18,[1.030,1.005,.905]],[22,[1.055,1.002,.825]],[24,[1.075,.995,.760]]];
 function tintForKarat(k){
  k=clamp(Number(k)||14,9,24);
  for(let i=1;i<tintAnchors.length;i++){
   const a=tintAnchors[i-1],b=tintAnchors[i];
   if(k<=b[0]){const t=(k-a[0])/(b[0]-a[0]);return a[1].map((v,j)=>v+(b[1][j]-v)*t);}
  }
  return tintAnchors[tintAnchors.length-1][1].slice();
 }
 function radius(y){
  for(let i=1;i<profile.length;i++)if(y<=profile[i][0]){
   const a=profile[i-1],b=profile[i],prev=profile[Math.max(0,i-2)],next=profile[Math.min(profile.length-1,i+1)];
   const h=b[0]-a[0],t=clamp((y-a[0])/h,0,1),t2=t*t,t3=t2*t;
   return [1,2].map((k,index)=>{
    const m1=(b[k]-prev[k])/(b[0]-prev[0]||1),m2=(next[k]-a[k])/(next[0]-a[0]||1);
    return ((2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*h*m1+(-2*t3+3*t2)*b[k]+(t3-t2)*h*m2)*(index===0?.80:.85);
   });
  }
  return [profile.at(-1)[1]*.80,profile.at(-1)[2]*.85];
 }
 function surface(y,t){const [rx,rz]=radius(y);return [rx*Math.sin(t),y,rz*Math.cos(t)];}
 function normal(y,t){const [rx,rz]=radius(y),lo=radius(y-.4),hi=radius(y+.4);return norm([Math.sin(t)/rx,-((hi[0]-lo[0])/.8*Math.sin(t)**2/rx+(hi[1]-lo[1])/.8*Math.cos(t)**2/rz),Math.cos(t)/rz]);}
 function center(t,drop,width){const y=162-drop*((1+Math.cos(t))/2)**3.4;const p=surface(y,t),n=normal(y,t);return p.map((v,i)=>v+n[i]*(width*.205+.65));}
 function sample(drop,width,steps=640){const pts=[],dist=[0];for(let i=0;i<=steps;i++){const p=center(-Math.PI+i/steps*Math.PI*2,drop,width);pts.push(p);if(i)dist.push(dist.at(-1)+Math.hypot(...p.map((v,j)=>v-pts[i-1][j])));}return {pts,dist,total:dist.at(-1)};}
 function chainGeometry(width,length){
  let lo=0,hi=390;
  for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(sample(mid,width,160).total<length*25.4)lo=mid;else hi=mid;}
  const drop=(lo+hi)/2,path=sample(drop,width),count=Math.max(28,Math.round(path.total/(width*tierPitch(tierFor(width))))),data=new Float32Array(count*12);let cursor=1;
  for(let i=0;i<count;i++){
   const target=path.total*i/count;while(cursor<path.dist.length-1&&path.dist[cursor]<target)cursor++;
   const a=cursor-1,f=(target-path.dist[a])/(path.dist[cursor]-path.dist[a]||1),t=-Math.PI+(a+f)/(path.pts.length-1)*Math.PI*2;
   const pos=center(t,drop,width),n=normal(pos[1],t),tangent=norm(center(t+.001,drop,width).map((v,j)=>v-center(t-.001,drop,width)[j]));
   const right0=norm(cross(tangent,n)),up0=norm(cross(right0,tangent));
   // True interlock: consecutive curb links are the same ring rotated 180
   // degrees about the chain axis. In frame terms that is negating the
   // right and up basis vectors on odd links: the warped ring (linkMesh)
   // then passes over its neighbour on one side and under it on the other
   // -- the woven crossing of a real chain -- instead of stacking on top.
   const s=i%2?-1:1;
   data.set([...pos,...right0.map(x=>x*s),...tangent,...up0.map(x=>x*s)],i*12);
  }
  const claspTarget=center(-1.1,drop,width);let closest=0,best=Infinity;
  // Even indices only: the clasp borrows a link frame and is offset along
  // its +up; an odd (180-degree flipped) frame would sink it into the bust.
  for(let i=0;i<count;i+=2){const d=Math.hypot(...claspTarget.map((v,j)=>v-data[i*12+j]));if(d<best){best=d;closest=i;}}
  const clasp=data.slice(closest*12,closest*12+12);
  for(let i=0;i<3;i++)clasp[i]+=clasp[9+i]*width*.12;
  return {data,count,drop,clasp};
 }
 const vs=`#version 300 es
 precision highp float;
 layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNormal;layout(location=2) in float aAO;
 layout(location=3) in vec3 aCenter;layout(location=4) in vec3 aRight;layout(location=5) in vec3 aAlong;layout(location=6) in vec3 aUp;
 uniform bool uChain;uniform float uWidth,uAngle,uAspect,uZoom,uCenterY;out vec3 vPos,vNormal,vLocal,vLink;out float vAO;
 vec3 turn(vec3 p){float c=cos(uAngle),s=sin(uAngle);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
 void main(){vec3 p=aPos,n=aNormal;if(uChain){p=aCenter+(aRight*aPos.x+aAlong*aPos.y+aUp*aPos.z)*uWidth;n=aRight*aNormal.x+aAlong*aNormal.y+aUp*aNormal.z;}
 vLink=aPos;vLocal=p;vPos=turn(p);vNormal=turn(n);vAO=aAO;
 vec3 camera=vec3(vPos.x,.866*(vPos.y+30.)-.5*vPos.z,.5*(vPos.y+30.)+.866*vPos.z-720.);
 float near=10.,far=1800.;gl_Position=vec4(camera.x*2.65*uZoom/uAspect,(camera.y-uCenterY)*2.65*uZoom,((far+near)/(near-far))*camera.z+(2.*far*near)/(near-far),-camera.z);}`;
 const fs=`#version 300 es
 precision highp float;in vec3 vPos,vNormal,vLocal,vLink;in float vAO;uniform float uMaterial,uLight,uDrop,uWidth;uniform vec3 uTint;out vec4 color;
 vec3 tonemap(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 /* Procedural studio environment for the chain only: a dark room with two
    softbox strips and a low warm strip, sampled by reflection direction.
    The key softbox azimuth follows uLight, so moving the studio light sweeps
    the reflections across the links. A handful of smoothsteps — no textures,
    cheap enough for phone GPUs. */
 vec3 studioEnv(vec3 d){vec3 base=mix(vec3(.030,.027,.022),vec3(.10,.095,.080),clamp(d.y*.5+.5,0.,1.));
 float az=atan(d.x,d.z);float keyAz=uLight*1.1+.55;
 float keyBox=smoothstep(.62,.18,abs(mod(az-keyAz+3.14159,6.28318)-3.14159))*smoothstep(-.05,.35,d.y)*smoothstep(1.05,.55,d.y);
 float fillBox=smoothstep(.85,.30,abs(mod(az-keyAz+2.60+3.14159,6.28318)-3.14159))*smoothstep(.0,.3,d.y)*.45;
 float lowStrip=smoothstep(.28,.06,abs(d.y+.18))*.35;
 return base+vec3(1.25,1.16,.98)*keyBox+vec3(.55,.58,.62)*fillBox+vec3(.9,.8,.6)*lowStrip;}
 void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 eye=normalize(vec3(0.,270.,720.)-vPos);vec3 l=normalize(vec3(uLight*1.7,.9,1.7));float diffuse=max(dot(n,l),0.);vec3 c;
 if(uMaterial>1.5){c=vec3(.055,.024,.007)+vec3(.17,.075,.018)*diffuse;}else if(uMaterial>0.5){vec3 r=reflect(-eye,n);float sky=.18+.35*max(r.y,0.);float key=pow(max(dot(r,l),0.),45.)*2.6;
 float box=smoothstep(.77,.96,dot(r,normalize(vec3(uLight*.85,.38,1.))))*.7;
 float strip=pow(max(dot(r,normalize(vec3(-1.2,.6,.4))),0.),30.)*1.1;
 float endSeam=smoothstep(.58,.745,abs(vLink.y));float darkSeam=(.30+.70*vAO)*(1.-endSeam*.48);
 vec3 gold=vec3(1.,.68,.18)*uTint;c=gold*(.075+sky*.50+diffuse*.16)+vec3(1.,.84,.43)*uTint*(key+box+strip);c*=darkSeam;
 c+=vec3(.18,.12,.04)*uTint*pow(1.-max(dot(n,eye),0.),4.);
 float ndv=max(dot(n,eye),0.);float fres=.22+.78*pow(1.-ndv,3.);
 c+=studioEnv(r)*uTint*fres*.85*darkSeam;
 }else{float front=max(dot(n,normalize(vec3(-.6,.8,1.))),0.);c=vec3(.19,.185,.17)+vec3(.38,.38,.35)*front+vec3(.27,.27,.25)*diffuse;
 float phi=atan(vLocal.x/110.,vLocal.z/65.);float cy=162.-uDrop*pow((1.+cos(phi))*.5,3.4);
 float contact=exp(-pow((vLocal.y-cy+uLight*2.)/(uWidth*.68+2.),2.));c*=1.-contact*.70;
 float rim=pow(1.-max(dot(n,eye),0.),3.);c+=vec3(.035,.035,.03)*rim;
 float grain=fract(sin(dot(vLocal.xy,vec2(12.9898,78.233)))*43758.5453);c*=.985+.03*grain;c*=1.-.22*exp(-pow((vLocal.y-176.8)/.65,2.));
 }color=vec4(pow(tonemap(c),vec3(1./2.2)),1.);}`;
 function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 function triangle(out,a,b,c){for(const p of [a,b,c])out.push(...p);}
 function bustMesh(){const data=[],stacks=110,sectors=100;
  const vertex=(i,j)=>{const y=-215+i/stacks*393,t=j/sectors*Math.PI*2,p=surface(y,t),n=normal(y,t);return [...p,...n,1];};
  for(let i=0;i<stacks;i++)for(let j=0;j<sectors;j++){const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i+1,j+1),d=vertex(i,j+1);triangle(data,a,c,b);triangle(data,a,d,c);}
  for(let j=0;j<sectors;j++){const a=surface(178,j/sectors*Math.PI*2),b=surface(178,(j+1)/sectors*Math.PI*2);triangle(data,[0,182,0,0,1,0,1],[...a,0,1,0,1],[...b,0,1,0,1]);}
  return new Float32Array(data);
 }
 /* MODELED LINK ASSET. link-mesh.bin (served next to this script):
   'CLNK' v1: u32 variantCount; per variant: u32 nameLen, name, u32
   vertexCount, then vertexCount x 7 f32 interleaved exactly as the old
   procedural mesh produced (pos xyz, normal xyz, AO) -- so the shader
   inputs, the endSeam band (vLink.y) and the AO seam shading behave as
   before. AO was baked in Blender with the v4 rule (back face .80, inner
   edge x.92). The master's outer size is 1.00 across x 1.2752 along; each
   tier's variant is the master (or a decimation) scaled along y by
   tierOuter/1.30 to reproduce the tier aspect from the width chart, with
   normals corrected for the scale. Base variant per tier: <=5mm lod2,
   <=9mm lod, >=12mm master; long chains step down a level (see draw()). */
 const LINK_ASSET_URL=(()=>{try{return new URL('link-mesh.bin',document.currentScript.src).href;}catch(e){return 'link-mesh.bin';}})();
 function parseLinkAsset(buf){
  const dv=new DataView(buf);let o=0;
  const magic=String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3));
  if(magic!=='CLNK')throw Error('bad link asset magic');
  const version=dv.getUint32(4,true),count=dv.getUint32(8,true);o=12;
  if(version!==1)throw Error('bad link asset version');
  const variants={};
  for(let i=0;i<count;i++){
   const nl=dv.getUint32(o,true);o+=4;
   let name='';for(let j=0;j<nl;j++)name+=String.fromCharCode(dv.getUint8(o+j));o+=nl;
   const vc=dv.getUint32(o,true);o+=4;
   const bytes=new Uint8Array(vc*28);bytes.set(new Uint8Array(buf,o,vc*28)); // copy: name lengths break f32 alignment
   variants[name]=new Float32Array(bytes.buffer);o+=vc*28;
  }
  return variants;
 }
 function scaledVariant(data,f){
  if(f===1)return data;
  const out=new Float32Array(data.length);
  for(let i=0;i<data.length;i+=7){
   const nx=data[i+3],ny=data[i+4]/f,nz=data[i+5],nl=Math.hypot(nx,ny,nz)||1;
   out[i]=data[i];out[i+1]=data[i+1]*f;out[i+2]=data[i+2];
   out[i+3]=nx/nl;out[i+4]=ny/nl;out[i+5]=nz/nl;out[i+6]=data[i+6];
  }
  return out;
 }
 const MASTER_OUTER=1.2752; // measured vertex extent along (end taper trims the tips)
 /* framing:'macro' magnification: at 6.5x a 12mm link projects ~94px wide
    in a 550x430 frame (measured with this file's own projection math);
    uZoom/uCenterY default to 1/0, where the projection is the identity.
    options.zoom multiplies MACRO_ZOOM in the macro framing only (the
    studio passes >1 for its compact strip, 1 when expanded); the bust
    framing ignores it — its uZoom stays exactly 1. */
 const MACRO_ZOOM=6.5;
 function tierLevels(maxW){return maxW<=5?['lod2']:maxW<=9?['lod','lod2']:['master','lod','lod2'];}
 /* Link tiers, chosen per draw (and by chainGeometry for the pitch) by
    width: a 3mm strand is a few pixels wide and needs a coarse ring; a 20mm
    strand is the hero and gets the fine one. The B column carries the
    width-chart aspect bias described above; the W column is the per-tier
    wire width from the threading solve.
    [maxWidthMm, ringSteps, sectionSteps, centrelineAlongSemiAxis, wireWidth]. */
 const LINK_TIERS=[[5,20,8,.60,.29],[7,24,9,.56,.29],[9,28,10,.51,.29],[12,36,12,.4675,.29],[16,40,13,.44,.27],[Infinity,44,14,.4225,.26]];
 function tierFor(width){return LINK_TIERS.find(t=>width<=t[0])||LINK_TIERS[LINK_TIERS.length-1];}
 const PITCH_DELTAS=[0,0,0,0,0,0];
 function tierPitch(tier){const i=LINK_TIERS.indexOf(tier);return tier[3]+tier[4]/2+.012+(PITCH_DELTAS[i]||0);}
 function standMesh(){
  const out=[],segments=64;
  function cylinder(rx,rz,bottom,top){
   for(let j=0;j<segments;j++){
    const t=j/segments*Math.PI*2,u=(j+1)/segments*Math.PI*2;
    const n=norm([Math.cos(t)/rx,0,Math.sin(t)/rz]),m=norm([Math.cos(u)/rx,0,Math.sin(u)/rz]);
    const a=[rx*Math.cos(t),bottom,rz*Math.sin(t),...n,1],b=[rx*Math.cos(u),bottom,rz*Math.sin(u),...m,1],c=[rx*Math.cos(u),top,rz*Math.sin(u),...m,1],d=[rx*Math.cos(t),top,rz*Math.sin(t),...n,1];
    triangle(out,a,b,c);triangle(out,a,c,d);
    triangle(out,[0,top,0,0,1,0,1],[d[0],top,d[2],0,1,0,1],[c[0],top,c[2],0,1,0,1]);
   }
  }
  cylinder(12,10,-253,-213);cylinder(77,43,-267,-252);
  return new Float32Array(out);
 }
 function claspMesh(){
  const out=[],x=.55,y=.68,z=.18;
  const faces=[[[0,0,1],[[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]],[[0,0,-1],[[-x,y,-z],[x,y,-z],[x,-y,-z],[-x,-y,-z]]],[[1,0,0],[[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]]],[[-1,0,0],[[-x,-y,z],[-x,y,z],[-x,y,-z],[-x,-y,-z]]],[[0,1,0],[[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]]],[[0,-1,0],[[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]]]];
  for(const [n,pts] of faces){const p=pts.map(v=>[...v,...n,n[2]>0?.95:.45]);triangle(out,p[0],p[1],p[2]);triangle(out,p[0],p[2],p[3]);}
  return new Float32Array(out);
 }
 function mesh(gl,data){const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,i===2?1:3,gl.FLOAT,false,28,i===0?0:i===1?12:24);}return {vao,count:data.length/7};}
 function initialize(el){const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');el.appendChild(canvas);const gl=canvas.getContext('webgl2',{antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!gl){canvas.remove();const p=document.createElement('p');p.className='renderer-error';p.textContent='The interactive studio needs WebGL 2. Your calculator controls remain available.';el.appendChild(p);return {failed:true};}
  const program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const bust=mesh(gl,bustMesh()),stand=mesh(gl,standMesh()),instances=gl.createBuffer();
  const clasp=mesh(gl,claspMesh()),claspInstances=gl.createBuffer();gl.bindVertexArray(clasp.vao);gl.bindBuffer(gl.ARRAY_BUFFER,claspInstances);
  for(let i=3;i<=6;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,(i-3)*12);gl.vertexAttribDivisor(i,1);}
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
  const uniforms={};for(const name of ['uChain','uWidth','uAngle','uAspect','uZoom','uCenterY','uMaterial','uLight','uDrop','uTint'])uniforms[name]=gl.getUniformLocation(program,name);
  const state={canvas,gl,program,bust,stand,linkTiers:null,linkReady:false,clasp,claspInstances,instances,uniforms,lastKey:'',scheduled:false,options:{},width:0,height:0};
  loadLinkAsset(state,el);
  new ResizeObserver(entries=>{const r=entries[0].contentRect;state.width=r.width;state.height=r.height;schedule(state);}).observe(el);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();el.setAttribute('aria-label','Studio paused because the graphics context was lost. Reload to restore it.');});
  return state;
 }
 function loadLinkAsset(state,el){
  fetch(LINK_ASSET_URL).then(r=>{if(!r.ok)throw Error('link asset HTTP '+r.status);return r.arrayBuffer();}).then(buf=>{
   const variants=parseLinkAsset(buf),gl=state.gl;
   state.linkTiers=LINK_TIERS.map(tier=>{
    const f=2*(tier[3]+tier[4]/2)/MASTER_OUTER;
    const levels=tierLevels(tier[0]).map(name=>{
     const m=mesh(gl,scaledVariant(variants[name],f));
     gl.bindVertexArray(m.vao);gl.bindBuffer(gl.ARRAY_BUFFER,state.instances);
     for(let i=3;i<=6;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,(i-3)*12);gl.vertexAttribDivisor(i,1);}
     return m;
    });
    return {maxW:tier[0],levels};
   });
   state.linkReady=true;schedule(state);
  }).catch(()=>{ // degrade to the fallback message, never a blank panel
   state.failed=true;state.canvas.remove();
   const p=document.createElement('p');p.className='renderer-error';p.textContent='The interactive studio could not load its 3D model. Your calculator controls remain available.';el.appendChild(p);
  });
 }
 function schedule(s){if(s.scheduled||s.failed)return;s.scheduled=true;requestAnimationFrame(()=>{s.scheduled=false;draw(s);});}
 function draw(s){const {gl,canvas,uniforms:u,options:o}=s;if(!s.width||!s.height)return;const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(s.width*dpr),h=Math.round(s.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(s.program);
  const key=o.widthMm+':'+o.lengthIn;if(s.lastKey!==key){s.chain=chainGeometry(o.widthMm,o.lengthIn);gl.bindBuffer(gl.ARRAY_BUFFER,s.instances);gl.bufferData(gl.ARRAY_BUFFER,s.chain.data,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,s.claspInstances);gl.bufferData(gl.ARRAY_BUFFER,s.chain.clasp,gl.DYNAMIC_DRAW);s.lastKey=key;}
  gl.uniform1f(u.uWidth,o.widthMm);gl.uniform1f(u.uAngle,o.angleDeg*Math.PI/180);gl.uniform1f(u.uAspect,w/h);gl.uniform1f(u.uLight,o.light);gl.uniform1f(u.uDrop,s.chain.drop);
  const macro=o.framing==='macro';gl.uniform1f(u.uZoom,macro?MACRO_ZOOM*(o.zoom||1):1);let macroCY=0;if(macro){const bp=center(0,s.chain.drop,o.widthMm);macroCY=.866*(bp[1]+30)-.5*Math.cos(o.angleDeg*Math.PI/180)*bp[2];}gl.uniform1f(u.uCenterY,macroCY);
  const tint=tintForKarat(o.karat);gl.uniform3f(u.uTint,tint[0],tint[1],tint[2]);
  gl.uniform1i(u.uChain,0);gl.uniform1f(u.uMaterial,2);gl.bindVertexArray(s.stand.vao);gl.drawArrays(gl.TRIANGLES,0,s.stand.count);gl.uniform1f(u.uMaterial,0);gl.bindVertexArray(s.bust.vao);gl.drawArrays(gl.TRIANGLES,0,s.bust.count);
  if(s.linkReady){gl.uniform1i(u.uChain,1);gl.uniform1f(u.uMaterial,1);const tier=s.linkTiers.find(t=>o.widthMm<=t.maxW)||s.linkTiers[s.linkTiers.length-1];const drop=s.chain.count>300?2:s.chain.count>220?1:0;const m=tier.levels[Math.min(tier.levels.length-1,drop)];gl.bindVertexArray(m.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,m.count,s.chain.count);
  gl.bindVertexArray(s.clasp.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,s.clasp.count,1);}
  canvas.dataset.renderError=String(gl.getError());canvas.dataset.links=String(s.chain.count);canvas.dataset.valid=String(s.chain.data.every(Number.isFinite));
 }
 global.renderChain=function(el,options){if(!(el instanceof Element))throw TypeError('renderChain needs a container element.');let s=cache.get(el);if(!s){s=initialize(el);cache.set(el,s);}if(s.failed)return;
  s.options={widthMm:clamp(Number(options.widthMm)||12,3,20),lengthIn:clamp(Number(options.lengthIn)||24,16,32),light:clamp(Number(options.light)||0,-1,1),angleDeg:Number(options.angleDeg)||0,karat:clamp(Number(options.karat)||14,9,24),framing:options.framing==='macro'?'macro':'full',zoom:clamp(Number(options.zoom)||1,.25,4)};schedule(s);
 };
})(window);
