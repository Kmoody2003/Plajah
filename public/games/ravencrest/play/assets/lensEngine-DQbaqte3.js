const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/depthMatte-Bbnu6htQ.js","assets/index-CBRYEgLD.js","assets/samMatte-Dp_H3-o2.js"])))=>i.map(i=>d[i]);
import{_ as ae}from"./index-CBRYEgLD.js";class ee{constructor(){this.w=null,this.ready=!1,this.busy=!1,this.latest=null,this.fresh=!1}async init(e={}){if(this.ready)return!0;if(typeof Worker>"u"||typeof createImageBitmap!="function")return!1;try{this.w=new Worker(new URL("/games/ravencrest/play/assets/faceWorker.worker-BjEqOmal.js",import.meta.url),{type:"module"})}catch{return!1}const a=await new Promise(o=>{const l=setTimeout(()=>o(!1),2e4);this.w.onmessage=i=>{const s=i.data||{};if(s.type==="ready"){clearTimeout(l),o(!!s.ok);return}s.type==="result"&&(this.busy=!1,s.frame?(this.latest={blendshapes:s.frame.blendshapes,matrix:s.frame.matrix?new Float32Array(s.frame.matrix):null,bbox:s.frame.bbox,faces:s.frame.faces??[]},this.fresh=!0):(this.latest=null,this.fresh=!0))},this.w.onerror=()=>{clearTimeout(l),o(!1)},this.w.postMessage({type:"init",numFaces:e.numFaces??1,blendshapes:e.blendshapes!==!1})});return this.ready=a,a||this.dispose(),a}send(e,a){!this.ready||!this.w||this.busy||(this.busy=!0,createImageBitmap(e).then(o=>{if(!this.w){try{o.close()}catch{}this.busy=!1;return}this.w.postMessage({type:"frame",bitmap:o,ts:a},[o])}).catch(()=>{this.busy=!1}))}take(){return this.fresh?(this.fresh=!1,this.latest):null}poll(){return this.fresh?(this.fresh=!1,{fresh:!0,frame:this.latest}):{fresh:!1,frame:null}}dispose(){try{this.w?.terminate()}catch{}this.w=null,this.ready=!1,this.busy=!1,this.latest=null,this.fresh=!1}get isReady(){return this.ready}}const Ae=[33,133,159,145],Pe=[263,362,386,374];function se(f,[e,a,o,l],i,s){const t=f[e],r=f[a],n=f[o],c=f[l];if(!t||!r||!n||!c)return null;const h=r.x-t.x,d=r.y-t.y,p=Math.hypot(h*s,d)||1e-6,u=Math.hypot((n.x-c.x)*s,n.y-c.y),m=(t.x+r.x+n.x+c.x)/4,v=(t.y+r.y+n.y+c.y)/4,y=f[i];return{cx:m,cy:v,dx:h,dy:d,open:Math.min(1,u/p),gx:y?Math.max(-1,Math.min(1,(y.x-m)*s/p)):0,gy:y?Math.max(-1,Math.min(1,(y.y-v)/p)):0}}function Le(f,e){const a=f[61],o=f[291],l=f[13],i=f[14];if(!a||!o||!l||!i)return null;const s=o.x-a.x,t=o.y-a.y,r=Math.hypot(s*e,t)||1e-6;return{cx:(a.x+o.x+l.x+i.x)/4,cy:(a.y+o.y+l.y+i.y)/4,dx:s,dy:t,open:Math.min(1,Math.hypot((l.x-i.x)*e,l.y-i.y)/r)}}function Ce(f,e){const a=[];for(const o of f??[]){if(!o||o.length<400)continue;const l=se(o,Ae,468,e),i=se(o,Pe,473,e),s=Le(o,e);if(!l||!i||!s)continue;let t=1,r=1,n=0,c=0;for(const h of o)h.x<t&&(t=h.x),h.x>n&&(n=h.x),h.y<r&&(r=h.y),h.y>c&&(c=h.y);a.push({eyes:[l,i],mouth:s,bbox:{x:t,y:r,w:n-t,h:c-r}})}return a}const Ue="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",_e="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",ie=Ue,Ie=_e;class be{constructor(){this.fl=null,this.ready=!1,this.loading=!1,this.blend=!0}async init(e={}){if(this.ready)return!0;if(this.loading)return!1;this.loading=!0,this.blend=e.blendshapes!==!1;try{const a=await import(ie),o=await a.FilesetResolver.forVisionTasks(`${ie}/wasm`);for(const l of["GPU","CPU"])try{this.fl=await a.FaceLandmarker.createFromOptions(o,{baseOptions:{modelAssetPath:Ie,delegate:l},runningMode:"VIDEO",numFaces:e.numFaces??1,outputFaceBlendshapes:this.blend,outputFacialTransformationMatrixes:this.blend});break}catch(i){console.warn(`[vtuber] FaceLandmarker ${l} delegate failed:`,i)}this.ready=!!this.fl}catch(a){console.warn("[vtuber] FaceLandmarker init failed:",a)}finally{this.loading=!1}return this.ready}detect(e,a){if(!this.ready||!this.fl)return null;try{const o=this.fl.detectForVideo(e,a),l=o?.faceBlendshapes?.[0]?.categories;if(this.blend?!l||!l.length:!o?.faceLandmarks?.[0]?.length)return null;const i={};for(const c of l??[])i[c.categoryName]=c.score;const s=o?.facialTransformationMatrixes?.[0]?.data;let t=null;const r=o?.faceLandmarks?.[0];if(r&&r.length){let c=1,h=1,d=0,p=0;for(const u of r)u.x<c&&(c=u.x),u.x>d&&(d=u.x),u.y<h&&(h=u.y),u.y>p&&(p=u.y);t={x:c,y:h,w:d-c,h:p-h}}const n=(e.videoWidth||e.width||1)/Math.max(1,e.videoHeight||e.height||1);return{blendshapes:i,matrix:s?new Float32Array(s):null,bbox:t,faces:Ce(o?.faceLandmarks,n)}}catch{return null}}dispose(){try{this.fl?.close?.()}catch{}this.fl=null,this.ready=!1}get isReady(){return this.ready}}class Te{constructor(){this.c=document.createElement("canvas"),this.ctx=this.c.getContext("2d",{willReadFrequently:!0}),this.gain=1,this.frame=0}src(e){try{const a=e.videoWidth,o=e.videoHeight;if(!a||!o)return e;const l=Math.min(1,360/Math.min(a,o)),i=Math.max(2,Math.round(a*l)),s=Math.max(2,Math.round(o*l));if((this.c.width!==i||this.c.height!==s)&&(this.c.width=i,this.c.height=s),this.ctx.filter=this.gain>1.03?`brightness(${this.gain.toFixed(2)}) contrast(1.06) saturate(1.05)`:"none",this.ctx.drawImage(e,0,0,i,s),this.ctx.filter="none",this.frame++%15===0){const t=this.ctx.getImageData(0,0,i,s).data;let r=0,n=0;for(let p=0;p<t.length;p+=512)r+=t[p]*.299+t[p+1]*.587+t[p+2]*.114,n++;const c=r/Math.max(1,n)/Math.max(1,this.gain),h=110,d=c<h?Math.min(2.6,h/Math.max(18,c)):1;this.gain+=(d-this.gain)*.35}return this.gain>1.06?this.c:e}catch{return e}}get boost(){return this.gain}}const re="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",De="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";class Ge{constructor(){this.seg=null,this.loading=!1,this.failed=!1,this.mask=null,this.lastRun=0,this.stamp=0}get state(){return this.seg?"ready":this.failed?"failed":this.loading?"loading":"idle"}async init(){if(!(this.seg||this.loading||this.failed)){this.loading=!0;try{const e=await import(re),a=await e.FilesetResolver.forVisionTasks(`${re}/wasm`);this.seg=await e.ImageSegmenter.createFromOptions(a,{baseOptions:{modelAssetPath:De},runningMode:"VIDEO",outputConfidenceMasks:!0})}catch(e){console.warn("[lens] person matte unavailable — rendering without a cut-out:",e),this.failed=!0}this.loading=!1}}update(e,a){if(!this.seg||!e.videoWidth)return this.mask;if(this.mask&&a-this.lastRun<66)return this.mask;this.lastRun=a;try{const o=this.seg.segmentForVideo(e,a),l=o.confidenceMasks?.[0];if(l){const i=l.getAsFloat32Array(),s=l.width,t=l.height;(!this.mask||this.mask.data.length!==i.length)&&(this.mask={data:new Uint8Array(i.length),w:s,h:t,stamp:0});const r=this.mask.data;for(let n=0;n<i.length;n++)r[n]=Math.max(0,Math.min(255,i[n]*255|0));this.mask.w=s,this.mask.h=t,this.mask.stamp=++this.stamp}o.close?.()}catch{}return this.mask}dispose(){try{this.seg?.close?.()}catch{}this.seg=null,this.mask=null,this.loading=!1,this.failed=!1}}const B={joy:{label:"Joyful",icon:"😊",a:[1,.82,.22],b:[1,.36,.72]},calm:{label:"Serene",icon:"😌",a:[.48,.36,1],b:[.18,.9,.84]},sad:{label:"Blue",icon:"😢",a:[.24,.45,1],b:[.14,.14,.55]},anger:{label:"Fired up",icon:"😠",a:[1,.16,.12],b:[1,.55,0]},surprise:{label:"Amazed",icon:"😮",a:[0,.9,1],b:[.95,.98,1]}},q=Object.keys(B),C=(f,e,a)=>((f[e]??0)+(f[a]??0))/2,X=f=>Math.max(0,Math.min(1,f));function Fe(f){const e=C(f,"mouthSmileLeft","mouthSmileRight"),a=C(f,"cheekSquintLeft","cheekSquintRight"),o=C(f,"eyeWideLeft","eyeWideRight"),l=C(f,"browDownLeft","browDownRight"),i=C(f,"noseSneerLeft","noseSneerRight"),s=C(f,"eyeSquintLeft","eyeSquintRight"),t=C(f,"mouthFrownLeft","mouthFrownRight"),r=C(f,"mouthPressLeft","mouthPressRight"),n=f.browInnerUp??0,c=C(f,"browOuterUpLeft","browOuterUpRight"),h=f.jawOpen??0,d=X(e*1.7+a*.5),p=X(o*1.8+n*.5+c*.6+h*.35-d*.6),u=X(l*2.1+i*1.2+r*.5+s*.3-d*.8),m=X(t*2.3+n*.7-o*.8-d*.9),v=X(1-Math.max(d,p,u,m)*1.7)*.9;return{joy:d,calm:v,sad:m,anger:u,surprise:p}}class Ne{constructor(){this.s={joy:0,calm:1,sad:0,anger:0,surprise:0}}push(e,a){const o=e??{joy:0,calm:1,sad:0,anger:0,surprise:0},l=1-Math.exp(-a*3.2);for(const i of q)this.s[i]+=(o[i]-this.s[i])*l}get(){let e="calm",a=-1,o=0;const l={};for(const r of q){const n=this.s[r];n>a&&(a=n,e=r),l[r]=Math.pow(n,1.6)+1e-4,o+=l[r]}const i=[0,0,0],s=[0,0,0];for(const r of q){const n=l[r]/o,c=B[r];for(let h=0;h<3;h++)i[h]+=c.a[h]*n,s[h]+=c.b[h]*n}const t=Math.max(this.s.joy,this.s.sad,this.s.anger,this.s.surprise);return{scores:{...this.s},dominant:e,intensity:t,a:i,b:s}}}class Be{constructor(){this.orbs=[],this.pops=[],this.nextId=1,this.nextSpawn=0,this.scores=new Map,this.lastCollect=null}reset(){this.orbs=[],this.pops=[],this.scores.clear(),this.lastCollect=null,this.nextSpawn=0}leaderboard(e=3){return[...this.scores.entries()].sort((a,o)=>o[1]-a[1]).slice(0,e).map(([a,o])=>({who:a,pts:o}))}totalFor(e){return this.scores.get(e)??0}spawn(e){const a=Math.random()<.5,o=Math.random()<.1;this.orbs.push({id:this.nextId++,emo:q[Math.random()*q.length|0],value:o?5:1,x:a?-.08:1.08,y:.16+Math.random()*.62,vx:(a?1:-1)*(.05+Math.random()*.07),vy:(Math.random()-.5)*.02,r:o?.085:.058+Math.random()*.02,born:e,phase:Math.random()*Math.PI*2})}update(e,a){a>=this.nextSpawn&&this.orbs.length<5&&(this.spawn(a),this.nextSpawn=a+1400+Math.random()*2200);for(const o of this.orbs)o.x+=o.vx*e,o.y+=o.vy*e+Math.sin((a-o.born)/700+o.phase)*.012*e*6;this.orbs=this.orbs.filter(o=>o.x>-.14&&o.x<1.14&&o.y>-.1&&o.y<1.1),this.pops=this.pops.filter(o=>a-o.born<o.ttl);for(const o of this.pops)o.x+=o.vx*e,o.y+=o.vy*e,o.kind==="spark"&&(o.vy+=.4*e)}tap(e,a,o,l,i){let s=null,t=1/0;for(const r of this.orbs){const n=e-r.x,c=(a-r.y)/l,h=Math.hypot(n,c),d=r.r*1.45;h<=d&&h<t&&(t=h,s=r)}if(!s)return!1;this.orbs=this.orbs.filter(r=>r.id!==s.id),this.scores.set(o,(this.scores.get(o)??0)+s.value),this.lastCollect={emo:s.emo,at:i},this.pops.push({kind:"ring",x:s.x,y:s.y,vx:0,vy:0,born:i,ttl:650,hue:s.emo});for(let r=0;r<14;r++){const n=Math.random()*Math.PI*2,c=.15+Math.random()*.25;this.pops.push({kind:"spark",x:s.x,y:s.y,vx:Math.cos(n)*c,vy:Math.sin(n)*c-.1,born:i,ttl:700+Math.random()*400,hue:s.emo})}return this.pops.push({kind:"text",x:s.x,y:s.y-.03,vx:0,vy:-.07,born:i,ttl:1500,hue:s.emo,text:`+${s.value} ${o.split(" ")[0]}`}),this.onCollect?.({who:o,orb:s}),!0}rgb(e,a,o){const l=B[e][a];return`rgba(${l[0]*255|0},${l[1]*255|0},${l[2]*255|0},${o})`}draw(e,a,o,l){e.save();for(const s of this.orbs){const t=s.x*a,r=s.y*o,n=s.r*a,c=1+Math.sin((l-s.born)/380+s.phase)*.06,h=n*c;e.globalCompositeOperation="lighter";const d=e.createRadialGradient(t,r,h*.4,t,r,h*2.6);d.addColorStop(0,this.rgb(s.emo,"a",.55)),d.addColorStop(1,this.rgb(s.emo,"b",0)),e.fillStyle=d,e.beginPath(),e.arc(t,r,h*2.6,0,Math.PI*2),e.fill(),e.globalCompositeOperation="source-over";const p=e.createRadialGradient(t-h*.3,r-h*.35,h*.1,t,r,h);p.addColorStop(0,"rgba(255,255,255,0.95)"),p.addColorStop(.35,this.rgb(s.emo,"a",.95)),p.addColorStop(1,this.rgb(s.emo,"b",.9)),e.fillStyle=p,e.beginPath(),e.arc(t,r,h,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,h*.07),e.strokeStyle="rgba(255,255,255,0.75)",e.stroke(),e.font=`${Math.round(h*1.05)}px serif`,e.textAlign="center",e.textBaseline="middle",e.fillText(B[s.emo].icon,t,r+h*.04),s.value>1&&(e.strokeStyle="rgba(255,225,120,0.9)",e.lineWidth=Math.max(2,h*.08),e.setLineDash([h*.25,h*.2]),e.lineDashOffset=-l/40,e.beginPath(),e.arc(t,r,h*1.35,0,Math.PI*2),e.stroke(),e.setLineDash([]))}for(const s of this.pops){const t=(l-s.born)/s.ttl,r=s.x*a,n=s.y*o;e.globalAlpha=Math.max(0,1-t),s.kind==="ring"?(e.strokeStyle=this.rgb(s.hue,"a",1),e.lineWidth=a*.012*(1-t),e.beginPath(),e.arc(r,n,a*(.05+t*.14),0,Math.PI*2),e.stroke()):s.kind==="spark"?(e.fillStyle=this.rgb(s.hue,"a",1),e.beginPath(),e.arc(r,n,a*.008*(1-t*.6),0,Math.PI*2),e.fill()):(e.font=`800 ${Math.round(a*.05)}px system-ui, sans-serif`,e.textAlign="center",e.textBaseline="middle",e.lineWidth=a*.008,e.strokeStyle="rgba(0,0,0,0.6)",e.strokeText(s.text,r,n),e.fillStyle="#fff",e.fillText(s.text,r,n))}e.globalAlpha=1;const i=this.leaderboard(3);if(i.length){const s=Math.round(a*.03),t=Math.round(a*.04),r=Math.round(o*.1);e.font=`700 ${s}px system-ui, sans-serif`,e.textAlign="left",e.textBaseline="top";const n=i.map((h,d)=>`${["🥇","🥈","🥉"][d]} ${h.who.split(" ")[0].slice(0,12)}  ${h.pts}`),c=Math.max(...n.map(h=>e.measureText(h).width))+s;e.fillStyle="rgba(0,0,0,0.45)",e.fillRect(t-s*.5,r-s*.4,c,n.length*s*1.35+s*.6),e.fillStyle="#fff",n.forEach((h,d)=>e.fillText(h,t,r+d*s*1.35))}e.restore()}}const Xe=`#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x*0.5+0.5, 1.0-(p.y*0.5+0.5)); gl_Position = vec4(p,0.0,1.0); }`,H=`
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`,Oe=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes;
uniform vec4 uBulge[9]; uniform int uN;
void main(){
  vec2 p = vUv * uRes;
  for(int i = 0; i < 9; i++){
    if(i >= uN) break;
    vec2 d = p - uBulge[i].xy;
    float r = length(d) / uBulge[i].z;
    if(r < 1.){
      float k = 1. - r * r;
      p = uBulge[i].xy + d * (1. - uBulge[i].w * k * k);
    }
  }
  frag = vec4(texture(uTex, p / uRes).rgb, 1.);
}`,ze=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT;
${H}
const vec3 LW = vec3(.299, .587, .114);
void main(){
  vec3 c = mix(texture(uTex, vUv).rgb, textureLod(uTex, vUv, 1.6).rgb, .4);   // light denoise + bloom source
  float l = dot(c, LW);
  float g = pow(clamp(l, 0., 1.), .62) * 1.2;                                 // lift the shadows without flattening the highlights
  float n = h21(vUv * uRes + fract(uT) * 91.7);
  g += (n - .5) * .26 * (1. - g * .5);                                        // live sensor grain
  g *= .86 + .14 * sin(vUv.y * uRes.y * 3.14159);                             // scanlines
  g += .05 * smoothstep(0., .18, sin(vUv.y * 6. - uT * 2.2));                 // rolling bar
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.) * 1.1;
  g *= smoothstep(.95, .42, length(q));                                       // goggle vignette
  g = clamp(g, 0., 1.4);
  vec3 col = vec3(.1, 1., .22) * g + vec3(.55, 1., .65) * pow(clamp(g, 0., 1.), 4.) * .55;
  frag = vec4(col, 1.);
}`,We=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
${H}
const vec3 LW = vec3(.299, .587, .114);
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
vec3 pal(float t){                         // ironbow: black → indigo → magenta → orange → yellow → white
  t = clamp(t, 0., 1.) * 5.;
  vec3 c0 = vec3(0., 0., .04), c1 = vec3(.22, 0., .45), c2 = vec3(.72, .08, .38), c3 = vec3(1., .42, .04), c4 = vec3(1., .9, .25), c5 = vec3(1.);
  if(t < 1.) return mix(c0, c1, t);
  if(t < 2.) return mix(c1, c2, t - 1.);
  if(t < 3.) return mix(c2, c3, t - 2.);
  if(t < 4.) return mix(c3, c4, t - 3.);
  return mix(c4, c5, t - 4.);
}
void main(){
  vec2 px = vUv * uRes;
  vec2 buv = (floor(px / 4.) * 4. + 2.) / uRes;                   // chunky thermal-sensor pixels
  float l = dot(textureLod(uTex, buv, 2.).rgb, LW);
  float heat = pow(clamp(l, 0., 1.), .8);
  if (uHasMask > .5) {
    float m = smoothstep(.42, .58, mk(vec2(0.)));
    float halo = clamp(smoothstep(.42, .58, dil(16.)) - m, 0., 1.);
    heat = mix(heat * .5, .5 + heat * .55, m);                    // body hot, room cool
    heat += halo * .14;
  }
  heat += (vn(px / 34. + vec2(0., uT * .6)) - .5) * .05;          // heat shimmer
  vec3 col = pal(heat);
  if (vUv.x > .94 && vUv.x < .965 && vUv.y > .25 && vUv.y < .75) {   // legend bar
    col = pal(1. - (vUv.y - .25) / .5);
  }
  frag = vec4(col, 1.);
}`,qe=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
uniform vec3 uAuraA; uniform vec3 uAuraB; uniform float uAuraAmt;
${H}
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
float ero(float r){
  float m = 1.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = min(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
void main(){
  vec2 px = vUv * uRes;
  vec3 scene = texture(uTex, vUv).rgb;
  float m = 0., halo = 0., inner = 0.;
  if (uHasMask > .5) {
    m = smoothstep(.42, .58, mk(vec2(0.)));
    float h1 = smoothstep(.4, .6, dil(9.)), h2 = smoothstep(.4, .6, dil(26.)), h3 = smoothstep(.4, .6, dil(58.));
    halo = clamp(.55 * h1 + .38 * h2 + .3 * h3 - m, 0., 1.);
    inner = clamp(m - smoothstep(.4, .6, ero(6.)), 0., 1.);
  } else {                                                        // no cut-out yet: glow from the frame edges
    float e = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y));
    halo = smoothstep(.2, .0, e) * .8;
  }
  float n = vn(px / 48. + vec2(0., -uT * 1.5)) * .6 + vn(px / 20. + vec2(uT * .6, -uT * 2.3)) * .4;
  float flame = smoothstep(.12, .85, halo * (.55 + .9 * n));
  float outward = clamp(smoothstep(.95, .15, halo) + (n - .5) * .35, 0., 1.);
  vec3 aura = mix(uAuraA, uAuraB, outward);
  float pulse = .86 + .14 * sin(uT * 2.4 + n * 3.);
  float amt = .55 + .75 * uAuraAmt;
  vec3 col = scene * (1. - flame * .3);
  col += aura * flame * 1.7 * amt * pulse;                        // the glow
  col += aura * inner * .55 * amt;                                // wrap-light on you
  float mote = step(.993, h21(floor(px / 3.) + floor(uT * 7.))) * halo;
  col += vec3(1., .95, .85) * mote * .9;                          // drifting sparks
  frag = vec4(clamp(col, 0., 1.), 1.);
}`,Y=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask; uniform sampler2D uDepth;
uniform vec2 uRes; uniform float uT; uniform float uHasMask; uniform float uHasDepth;
uniform vec2 uMapA; uniform vec2 uMapB;
${H}
const vec3 LW = vec3(.299, .587, .114);
float mkAt(vec2 uv){ return texture(uMask, uv * uMapA + uMapB).r; }
float mk(vec2 off){ return mkAt(vUv + off); }
float dpAt(vec2 uv){ return texture(uDepth, uv * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
float ero(float r){
  float m = 1.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = min(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
`,He=Y+`
uniform sampler2D uGlyph; uniform float uCell;

// one grid of falling code: x = glyph, y = trail brightness, z = head, w = glow (blurred glyph)
vec4 layer(vec2 px, float cellH, float spd, float seed, float density, float bias, out vec2 cellId){
  vec2 cs = vec2(cellH * .62, cellH);
  vec2 cell = floor(px / cs), loc = fract(px / cs);
  cellId = cell;
  float rows = ceil(uRes.y / cs.y);
  float rnd = h11(cell.x * 1.37 + seed);
  float on = step(1. - density, h11(cell.x * 3.7 + seed * 1.3));
  float trail = 7. + 24. * h11(cell.x * 2.11 + seed + 9.7);
  float period = rows + trail + 6.;
  float head = mod(uT * spd * 12. * (.3 + .7 * rnd) + h11(cell.x * 5.3 + seed) * period, period);
  float d = head - cell.y;
  float b = step(0., d) * step(d, trail) * pow(clamp(1. - d / trail, 0., 1.), 1.5) * on;
  float isHead = step(0., d) * step(d, 1.) * on;
  float tick = floor(uT * (1.5 + 5. * rnd) + h21(cell + seed) * 10.);      // glyphs mutate in place
  float gid = floor(h21(cell + seed + tick * .37) * 64.);
  vec2 gl = vec2(1. - loc.x, loc.y);                                      // the film's glyphs are mirrored
  vec2 guv = (vec2(mod(gid, 8.), floor(gid / 8.)) + gl * .9 + .05) / 8.;
  float g = texture(uGlyph, guv, bias).r;
  // glow: a softer read of the same glyph, faded out before the cell edge so neighbouring atlas cells never bleed in
  float win = smoothstep(0., .18, loc.x) * smoothstep(1., .82, loc.x) * smoothstep(0., .12, loc.y) * smoothstep(1., .88, loc.y);
  float glow = texture(uGlyph, guv, bias + 1.2).r * win;
  return vec4(g * smoothstep(0., .06, min(loc.y, 1. - loc.y)), b, isHead, glow);
}

void main(){
  vec2 px = vUv * uRes;
  float m = uHasMask > .5 ? smoothstep(.42, .58, mk(vec2(0.))) : 0.;
  float rim = uHasMask > .5 ? clamp(smoothstep(.42, .58, dil(5.)) - m, 0., 1.) : 0.;
  float d = uHasDepth > .5 ? dpAt(vUv) : mix(.45, .8, m);

  // depth band → this pixel's code grid. The person is a band of their own.
  float band = d < .34 ? 0. : (d < .62 ? 1. : 2.);
  float scale = band < .5 ? .6 : (band < 1.5 ? .88 : 1.3);
  float spd = band < .5 ? .65 : (band < 1.5 ? 1. : 1.4);
  float seed = 3.1 + band * 17.3;
  if (m > .5) { scale = 1.02; spd = 1.15; seed = 71.9; }

  vec2 cell;
  vec4 L = layer(px, uCell * scale, spd, seed, 1., 0., cell);
  vec2 cs = vec2(uCell * scale * .62, uCell * scale);
  float lod = log2(max(cs.y, 1.));
  vec2 cuv = (cell + .5) * cs / uRes, st = cs / uRes;
  #define LUM(u) dot(textureLod(uTex, (u), lod).rgb, LW)
  float l0 = LUM(cuv);
  float gx = LUM(cuv + vec2(st.x, 0.)) - LUM(cuv - vec2(st.x, 0.));
  float gy = LUM(cuv + vec2(0., st.y)) - LUM(cuv - vec2(0., st.y));
  float lb = dot(textureLod(uTex, cuv, lod + 4.).rgb, LW);
  float edge = length(vec2(gx, gy)) * 2.4;
  if (uHasDepth > .5) {
    float dx = dpAt(cuv + vec2(st.x, 0.)) - dpAt(cuv - vec2(st.x, 0.));
    float dy = dpAt(cuv + vec2(0., st.y)) - dpAt(cuv - vec2(0., st.y));
    edge += length(vec2(dx, dy)) * 5.;                                    // object contours from depth
  }
  edge = clamp(edge + rim * 1.2, 0., 1.);
  float tone = clamp(pow(l0, .42) * .95 + (l0 - lb) * 1.2 + edge * .9, 0., 1.);

  float fog = uHasDepth > .5 ? mix(.38, 1.15, smoothstep(.1, .85, d)) : mix(.55, 1.12, m);
  vec3 dim = vec3(.0, .23, .07), mid = vec3(.0, .82, .25), hot = vec3(.55, 1., .62);
  float trail = L.y * (.55 + .7 * edge);
  vec3 col = mix(dim, mid, tone) * tone * (.18 + .9 * L.x) * fog;                       // the form, made of glyphs
  col += mix(mid, hot, trail * trail) * L.x * trail * (.75 + .5 * tone) * fog;          // the falling streams
  col += vec3(.82, 1., .86) * L.x * L.z * (1.1 + edge) * fog;                           // white-hot heads
  col += vec3(0., .55, .18) * L.w * (trail * .5 + L.z) * .55 * fog;                     // glyph glow
  float spark = step(.985, h21(cell + floor(uT * 9.) + seed));                          // random flare
  col += vec3(.5, 1., .6) * L.x * spark * tone * .7;

  // far code behind everything that isn't you
  vec2 c2;
  vec4 F = layer(px, uCell * .45, .5, 7.7, .7, 1., c2);
  col += vec3(0., .42, .14) * F.x * (F.y * .7 + F.z * .5) * (1. - m) * (1. - smoothstep(.4, .8, d)) * .8;
  col += vec3(.35, 1., .55) * rim * .45;

  // near streaks: out of focus, in front of everything
  vec2 c3;
  vec4 N = layer(px, uCell * 2.4, 1.8, 13.3, .35, 1.1, c3);
  col += vec3(.3, 1., .55) * N.x * N.y * .9 + vec3(.75, 1., .82) * N.x * N.z * 1.2;
  frag = vec4(col, 1.);
}`,Ye=Y+`
uniform float uBoil; uniform vec3 uMotion;
float lumAt(vec2 uv){ return dot(texture(uTex, uv).rgb, LW); }
float gblur(vec2 uv, float s){
  float acc = lumAt(uv) * .2, w = .2;
  for(int i=0;i<8;i++){
    float a = float(i) * .785398 + .39;
    vec2 o = vec2(cos(a), sin(a)) * s / uRes;
    acc += lumAt(uv + o) * .12 + lumAt(uv + o * 2.) * .05; w += .17;
  }
  return acc / w;
}
void main(){
  vec2 px = vUv * uRes;
  float k = uRes.y / 720.;                                               // line weights scale with the frame
  vec2 wob = (vec2(vn(px / 50. + uBoil * 2.7), vn(px / 50. + uBoil * 2.7 + 13.)) - .5) * 2.2 / uRes;
  vec2 uv = vUv + wob;

  // ink: XDoG
  float g1 = gblur(uv, 1.1 * k), g2 = gblur(uv, 2.3 * k);
  float ink = smoothstep(.014, .04, g2 - g1);
  float m = 0., contour = 0.;
  if (uHasMask > .5) {
    m = smoothstep(.42, .58, mk(wob));
    contour = clamp(smoothstep(.42, .58, dil(3.5 * k)) - smoothstep(.42, .58, ero(1.5 * k)), 0., 1.);
  }
  if (uHasDepth > .5) {
    vec2 e = 3. * k / uRes;
    float dz = length(vec2(dpAt(uv + vec2(e.x, 0.)) - dpAt(uv - vec2(e.x, 0.)), dpAt(uv + vec2(0., e.y)) - dpAt(uv - vec2(0., e.y))));
    contour = max(contour, smoothstep(.06, .14, dz));
  }

  // colour: flat cel tones from a smooth copy of the frame, printed ~1px off the ink
  vec3 base = textureLod(uTex, uv + vec2(1.2, -.8) / uRes, 2.).rgb;
  float l = dot(base, LW);
  vec3 hue = base / max(l, .04);
  hue = clamp(mix(vec3(1.), hue, 1.35), 0., 2.6);
  float tone = l < .26 ? .34 : (l < .6 ? .66 : .95);
  vec3 col = clamp(hue * tone, 0., 1.);

  // Ben-Day dots in the mid band, hatching in shadow, black spotting at the bottom
  vec2 r45 = mat2(.7071, -.7071, .7071, .7071) * px;
  vec2 dc = fract(r45 / (6.5 * k)) - .5;
  float dots = 1. - smoothstep(.26, .32, length(dc));
  if (tone < .7 && tone > .5) col = mix(col, col * .72, dots * smoothstep(.45, .3, l - .26 + .15));
  float hatch = step(.62, fract((px.x + px.y) / (5. * k)));
  if (tone < .5) col = mix(col, vec3(.05), hatch * smoothstep(.2, .08, l) * .8);
  col = mix(col, vec3(.04), smoothstep(.11, .07, l));

  // newsprint
  float fib = vn(px / 2.2) * .5 + vn(px / 8.) * .3 + vn(vec2(px.x / 1.3, px.y / 12.)) * .2;
  vec3 paper = vec3(.97, .94, .86) * (.93 + .1 * fib);

  if (uHasMask > .5) {
    // background panel: one flat colour + a dot screen, lifted so the figure pops
    vec3 bgc = clamp(hue * .78, 0., 1.);
    vec2 dc2 = fract(r45 / (9. * k)) - .5;
    float dr = .12 + .3 * (1. - l);
    vec3 bg = mix(mix(vec3(.98, .93, .78), bgc, .45), bgc * .7, 1. - smoothstep(dr, dr + .06, length(dc2)));
    bg = mix(bg, vec3(.05), ink * .55);
    // speed lines: radial streaks converging on the action
    vec2 c = vec2(mix(.5, uMotion.y, .6), mix(.5, uMotion.z, .6));
    vec2 q = (vUv - c) * vec2(uRes.x / uRes.y, 1.);
    float a = atan(q.y, q.x), r = length(q);
    float streak = step(.72, h11(floor(a * 110.) + uBoil * .13)) * smoothstep(.18, .55, r);   // re-drawn every boil
    bg = mix(bg, vec3(.05), clamp(streak * smoothstep(.12, .45, uMotion.x), 0., 1.) * .85);
    col = mix(bg, col, m);
  }
  col *= paper;
  col = mix(col, vec3(.04, .035, .04), max(ink, contour));
  frag = vec4(clamp(col, 0., 1.), 1.);
}`,$e=Y+`
uniform sampler2D uPlate; uniform float uHasPlate; uniform float uBoil;
const vec3 INK = vec3(.03, .03, .03);
vec3 paperCol(vec3 detail, vec3 broad){
  float l = dot(clamp(detail, 0., 1.), LW);
  float lq = max(floor(pow(l, .8) * 3. + .5) / 3., .12);
  vec3 ch = broad / max(dot(broad, LW), .05);
  ch = clamp(mix(vec3(1.), ch, 1.15), vec3(.25), vec3(2.2));
  return clamp(ch * lq, 0., 1.);
}
vec3 plateAt(vec2 vuv, float lod0){
  vec4 s = vec4(0.);
  for (int i = 0; i < 8; i++) {                                           // push-pull: first level that knows
    s = textureLod(uPlate, vuv, lod0 + float(i));
    if (s.a > .3) break;
  }
  return s.rgb / max(s.a, .001);
}
void main(){
  vec2 px = vUv * uRes;
  vec2 wob = (vec2(vn(px / 60. + uBoil * 2.3), vn(px / 60. + uBoil * 2.3 + 11.)) - .5) * 2.5 / uRes;
  vec2 uv = vUv + wob;
  vec3 detail = textureLod(uTex, uv, 2.6).rgb, broad = textureLod(uTex, uv, 4.).rgb;
  if (uHasMask > .5 && uHasPlate > .5) {
    float m = smoothstep(.3, .5, dil(8.));
    vec2 vuv = uv * uMapA + uMapB;
    detail = mix(detail, plateAt(vuv, .6), m);
    broad = mix(broad, plateAt(vuv, 2.), m);
  }
  vec3 col = paperCol(detail, broad);
  // ink only on the big shapes of the flattened world
  vec2 e = vec2(2.5) * uRes.y / 720. / uRes;
  float a = dot(paperCol(textureLod(uTex, uv + vec2(e.x, 0.), 2.6).rgb, broad), LW), b = dot(paperCol(textureLod(uTex, uv - vec2(e.x, 0.), 2.6).rgb, broad), LW);
  float c = dot(paperCol(textureLod(uTex, uv + vec2(0., e.y), 2.6).rgb, broad), LW), d = dot(paperCol(textureLod(uTex, uv - vec2(0., e.y), 2.6).rgb, broad), LW);
  float edge = smoothstep(.15, .27, length(vec2(a - b, c - d)));
  if (uHasMask > .5 && uHasPlate > .5) edge *= 1. - smoothstep(.3, .5, dil(10.));   // no ghost outline of the removed person
  col = mix(col, INK, edge);
  float g = vn(px / 3.) * .6 + vn(px / 9.) * .4;
  col *= .955 + .07 * g;                                                  // paper tooth
  frag = vec4(clamp(col, 0., 1.), 1.);
}`,je=Y+`
uniform sampler2D uPal; uniform float uPalN; uniform float uGrid;
vec3 oklab(vec3 c){
  c = pow(clamp(c, 0., 1.), vec3(2.2));
  float l = .4122214708 * c.r + .5363325363 * c.g + .0514459929 * c.b;
  float m = .2119034982 * c.r + .6806995451 * c.g + .1073969566 * c.b;
  float s = .0883024619 * c.r + .2817188376 * c.g + .6299787005 * c.b;
  l = pow(l, 1. / 3.); m = pow(m, 1. / 3.); s = pow(s, 1. / 3.);
  return vec3(.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s);
}
vec3 nearest(vec3 c){
  vec3 lc = oklab(c), best = vec3(0.); float bd = 1e9;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uPalN) break;
    vec3 p = texelFetch(uPal, ivec2(i, 0), 0).rgb;
    vec3 dl = oklab(p) - lc;
    float dd = dl.x * dl.x * 1.6 + dl.y * dl.y + dl.z * dl.z;
    if (dd < bd) { bd = dd; best = p; }
  }
  return best;
}
float bayer(vec2 cell){
  int x = int(mod(cell.x, 4.)), y = int(mod(cell.y, 4.));
  int a = x ^ y;
  int v = ((a & 1) << 3) | ((y & 1) << 2) | (((a >> 1) & 1) << 1) | ((y >> 1) & 1);
  return (float(v) + .5) / 16. - .5;
}
float subjAt(vec2 cell){ return uHasMask > .5 ? step(.5, mkAt((cell + .5) * uGrid / uRes)) : 0.; }
float depAt(vec2 cell){ return uHasDepth > .5 ? dpAt((cell + .5) * uGrid / uRes) : .5; }
void main(){
  vec2 px = vUv * uRes;
  vec2 cell = floor(px / uGrid);
  vec2 cuv = (cell + .5) * uGrid / uRes;
  vec3 c = textureLod(uTex, cuv, log2(uGrid) - .5).rgb;
  float s = subjAt(cell), d = depAt(cell);
  float l = dot(c, LW);
  c = mix(vec3(l), c, 1.3);
  c = (c - .5) * 1.12 + .5;
  float ditherAmt = .1;
  if (uHasDepth > .5 && s < .5) {
    float plane = floor(clamp(d, 0., .999) * 4.) / 3.;                   // 4 parallax planes
    vec3 sky = textureLod(uTex, vec2(.5, .15), 10.).rgb * vec3(.85, .95, 1.2) + vec3(.05, .08, .14);
    c = mix(c, clamp(sky, 0., 1.), (1. - plane) * .5);
    c = mix(vec3(dot(c, LW)), c, .7 + .3 * plane);
    ditherAmt = .1 + (1. - plane) * .08;
  }
  c += bayer(cell) * ditherAmt;
  vec3 col = nearest(c);
  if (uHasMask > .5) {
    float nU = subjAt(cell + vec2(0., -1.)), nD = subjAt(cell + vec2(0., 1.)), nL = subjAt(cell + vec2(-1., 0.)), nR = subjAt(cell + vec2(1., 0.));
    if (s < .5 && max(max(nU, nD), max(nL, nR)) > .5) col = texelFetch(uPal, ivec2(0, 0), 0).rgb;   // sprite outline
    else if (s > .5 && (nU < .5 || nL < .5)) col = nearest(col * 1.3 + .06);                         // rim light, top-left
  }
  if (uHasDepth > .5 && s < .5) {                                         // depth breaks: shade the far side
    float dn = max(max(depAt(cell + vec2(1., 0.)), depAt(cell + vec2(-1., 0.))), max(depAt(cell + vec2(0., 1.)), depAt(cell + vec2(0., -1.))));
    if (dn - d > .14) col = nearest(col * .55);
  }
  frag = vec4(col, 1.);
}`,Ve=Y+`
uniform sampler2D uGlyph; uniform float uCell;
void main(){
  vec2 px = vUv * uRes;
  vec2 cs = vec2(uCell * .6, uCell);
  vec2 cell = floor(px / cs), loc = fract(px / cs);
  vec2 cuv = (cell + .5) * cs / uRes, st = cs / uRes;
  float lod = log2(max(cs.y, 1.)) - .3;
  vec3 c = textureLod(uTex, cuv, lod).rgb;
  #define LUM(u) dot(textureLod(uTex, (u), lod).rgb, LW)
  float l = dot(c, LW);
  float lb = dot(textureLod(uTex, cuv, lod + 3.).rgb, LW);
  l = clamp(pow(l, .6) + (l - lb) * .9, 0., 1.);
  vec2 g = vec2(LUM(cuv + vec2(st.x, 0.)) - LUM(cuv - vec2(st.x, 0.)), LUM(cuv + vec2(0., st.y)) - LUM(cuv - vec2(0., st.y)));
  float d = .6, s = 0.;
  if (uHasDepth > .5) {
    d = dpAt(cuv);
    g += vec2(dpAt(cuv + vec2(st.x, 0.)) - dpAt(cuv - vec2(st.x, 0.)), dpAt(cuv + vec2(0., st.y)) - dpAt(cuv - vec2(0., st.y))) * 2.2;
  }
  if (uHasMask > .5) {
    s = smoothstep(.4, .6, mkAt(cuv));
    g += vec2(mkAt(cuv + vec2(st.x, 0.)) - mkAt(cuv - vec2(st.x, 0.)), mkAt(cuv + vec2(0., st.y)) - mkAt(cuv - vec2(0., st.y))) * .8;
  }
  float gi;
  if (length(g) > .2) {
    float a = mod(atan(g.y, g.x) + 3.14159, 3.14159);                     // gradient direction, 0..pi
    // gradient → edge glyph (the edge runs perpendicular to it): 12 '|', 13 '_', 14 '/', 15 '\\'
    gi = a < .39 || a > 2.75 ? 12. : (a < 1.18 ? 15. : (a < 1.96 ? 13. : 14.));
  } else {
    gi = floor(clamp(l, 0., .999) * 12.);                                 // density ramp
  }
  float glyph = textureLod(uGlyph, (vec2(mod(gi, 4.), floor(gi / 4.)) + loc * .92 + .04) / 4., log2(max(1., 128. / cs.y))).r;   // explicit LOD: no mip bleed across cells
  float fog = uHasDepth > .5 ? mix(.3, 1.1, smoothstep(.1, .8, d)) : 1.;
  vec3 mono = vec3(.55, .95, 1.) * (.45 + .8 * l);
  vec3 tint = mix(vec3(dot(c, LW)), c, 1.5) * 1.25 + .08;
  vec3 ink = uHasMask > .5 ? mix(mono, tint, s) : mix(mono, tint, .75);
  vec3 col = vec3(.015, .02, .03) + ink * glyph * fog;
  frag = vec4(clamp(col, 0., 1.), 1.);
}`,K=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT; uniform float uSeed;
${H}
const vec3 LW = vec3(.299, .587, .114);
`,xe=`
float scratch(vec2 uv, float f, float lane, float life, float aspect){
  float run = floor(f / life);                                   // a scratch survives ~life frames
  float alive = step(.42, h11(run * 3.31 + lane * 11.7));
  float x = h11(run * 7.73 + lane * 3.1) + (vn(vec2(f * .21, lane * 9.)) - .5) * .012;
  float w = (.45 + 1.6 * h11(run + lane * 2.3)) / uRes.x;
  float d = abs(uv.x - x);
  float line = 1. - smoothstep(w * .4, w * 1.4, d);
  line *= smoothstep(.2, .45, vn(vec2(uv.y * (3. + 5. * h11(run + lane)) + run * 4.1, lane * 5.)));   // broken along y
  return line * alive;
}
`,Ke=K+xe+`
void main(){
  float f = uSeed;
  vec2 px = vUv * uRes;
  // gate weave: the whole frame drifts a couple of px; now and then it hops and shows the frame line
  vec2 uv = vUv + vec2(vn(vec2(f * .37, 1.)) - .5, vn(vec2(f * .29, 7.)) - .5) * vec2(3.2, 4.5) / uRes;
  float hop = step(.975, h11(f * 1.713)) * (.03 + .06 * h11(f * 3.1));
  uv.y = uv.y + hop;
  float bar = 0.;
  if (uv.y > 1.) { uv.y -= 1.03; bar = 1. - step(0., uv.y); }   // the black gap between frames
  uv.y = clamp(uv.y, 0., 1.);

  vec3 c = mix(texture(uTex, uv).rgb, textureLod(uTex, uv, 1.5).rgb, .35);   // period lens: soft
  vec3 ORTHO = vec3(.06, .50, .44);
  float l = dot(c, ORTHO);
  float halo = dot(textureLod(uTex, uv, 4.5).rgb, ORTHO);
  l += smoothstep(.5, 1., halo) * .28;                               // halation round highlights
  l = smoothstep(.05, .93, l);                                       // crushed blacks, hot whites
  l = pow(l, 1.12);
  l *= 1. + (h11(f * .913) - .5) * .22 + (vn(vec2(f * .13, 3.)) - .5) * .12;   // exposure flicker

  float g = (vn(px / 1.7 + f * 13.1) - .5) * .30 + (h21(px + f * 7.3) - .5) * .14;
  l += g * (.55 - abs(l - .5) * .6);                                 // grain lives in the mids

  float aspect = uRes.x / uRes.y;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float s = scratch(uv, f, fi, 7. + fi * 6., aspect);
    l = mix(l, h11(floor(f / (7. + fi * 6.)) + fi * 5.) > .35 ? 1.05 : .02, s * .75);
  }
  // dust: blobs that exist for exactly one frame
  float dn = vn(px / (5. + 4. * h11(f)) + f * 31.7);
  float dust = smoothstep(.925, .955, dn) * step(.35, h11(f * .77));
  l = mix(l, h11(f * 2.9) > .5 ? 0. : 1., dust);
  // a hair caught in the gate: a curled line near an edge, a few frames at a time
  float hr = floor(f / 9.);
  if (h11(hr * 5.7) > .55) {
    vec2 c0 = vec2(h11(hr) < .5 ? .08 : .9, .2 + .6 * h11(hr * 2.1));
    vec2 q = (vUv - c0) * vec2(aspect, 1.);
    float a = atan(q.y, q.x), r = length(q);
    float curl = abs(r - (.05 + .03 * sin(a * 2. + hr))) ;
    l = mix(l, .03, (1. - smoothstep(.0008, .0026, curl)) * step(r, .12) * step(-1.2, a) * step(a, 2.4));
  }
  // iris vignette: uneven and breathing
  vec2 q = (vUv - .5) * vec2(aspect, 1.);
  float vig = smoothstep(.98, .3, length(q * vec2(.82, 1.)) + (vn(vec2(f * .08, 2.)) - .5) * .06);
  l *= mix(.18, 1., vig);
  l *= 1. - bar;

  vec3 col = mix(vec3(.06, .05, .045), vec3(1., .96, .87), clamp(l, 0., 1.15));   // silver, faintly warm
  frag = vec4(clamp(col, 0., 1.), 1.);
}`,Je=K+xe+`
uniform vec4 uEvt; uniform vec4 uReel;
vec3 grade(vec3 c){
  float l = dot(c, LW);
  c = mix(vec3(l), c, .72 - uReel.x * .25);                          // dye fade eats saturation
  c *= vec3(1.06 + uReel.y * .1, .9 - uReel.y * .08, .95 - uReel.x * .1);   // magenta/red shift of aged prints
  c = (c - .5) * (1.18 + uReel.z * .25) + .5;                        // print contrast
  c = mix(vec3(.075, .045, .05) + uReel.x * .05, vec3(1., .95, .86), clamp(c, 0., 1.));   // milky blacks, yellowed whites
  return c;
}
void main(){
  float f = uSeed, ev = uEvt.x, pr = uEvt.y, es = uEvt.z;
  vec2 px = vUv * uRes;
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv + (vec2(vn(vec2(f * .41, 1.)), vn(vec2(f * .33, 5.))) - .5) * vec2(4., 6.) / uRes;   // jittery gate

  float bar = 0.;
  if (ev == 2.) {                                                    // roll: one full frame slides past
    float off = pr * 1.06;
    uv.y += off;
    if (uv.y > 1.) { uv.y -= 1.06; bar = 1. - step(0., uv.y); }
  }
  if (ev == 3. && pr < .5) uv += vec2(.012, -.035) * (h11(es) - .2);  // misframed splice
  float tear = 0.;
  if (ev == 5.) {                                                    // desync: torn, doubled picture
    float band = step(.5, vn(vec2(vUv.y * 3. + es, f * .5)));
    float shift = (h11(f * 1.3 + es) - .5) * .09 * band * (1. - pr);
    uv.x += shift;
    tear = band;
  }
  uv = clamp(uv, 0., 1.);

  vec3 c = texture(uTex, uv).rgb;
  if (ev == 5.) c = mix(c, texture(uTex, clamp(uv + vec2(.035 * (1. - pr), 0.), 0., 1.)).rgb, .4 * tear);
  c = mix(c, textureLod(uTex, uv, 1.2).rgb, .3);                     // 4th-generation print softness
  c = grade(c);

  // chemical stains: big blotches that crawl over several seconds
  float st = vn(vUv * vec2(aspect, 1.) * 2.2 + uReel.w * 7. + uT * .05);
  c = mix(c, c * vec3(.95, .78, .65), smoothstep(.62, .78, st) * .55);
  c = mix(c, c * vec3(.7, 1., .9), smoothstep(.7, .83, vn(vUv * 3.1 - uReel.w * 3. + uT * .04)) * .3);

  // flicker + grain
  c *= 1. + (h11(f * .713) - .5) * .14;
  float g = (vn(px / 1.4 + f * 17.3) - .5) * .32 + (h21(px + f * 3.7) - .5) * .16;
  c += g * (.5 - abs(dot(c, LW) - .5) * .5) * vec3(1., .95, 1.05);

  // scratches: white base scratches and green-cyan emulsion scratches
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float s = scratch(uv, f, fi + 10., 3. + fi * 4., aspect);
    vec3 sc = mod(fi, 2.) < .5 ? vec3(.98, .97, .9) : vec3(.25, .85, .62);
    c = mix(c, sc, s * .8);
  }
  // heavy dirt: dark crumbs and bright holes, a new handful every frame
  float d1 = vn(px / (4. + 6. * h11(f * 1.7)) + f * 21.3);
  c = mix(c, vec3(.03), smoothstep(.9, .94, d1) * step(.25, h11(f * .37)));
  float d2 = vn(px / 3. + f * 47.1 + 9.);
  c = mix(c, vec3(1., .96, .85), smoothstep(.94, .97, d2) * step(.55, h11(f * .53)));

  // edges: uneven burn-in vignette + orange light leak
  vec2 q = (vUv - .5) * vec2(aspect, 1.);
  c *= mix(.3, 1., smoothstep(1.02, .35, length(q * vec2(.8, 1.))));
  float leak = smoothstep(.75, 1., vUv.x + (vn(vec2(vUv.y * 2., uT * .3)) - .5) * .25) * (.4 + .6 * vn(vec2(uT * .7, 3.)));
  c += vec3(1., .45, .1) * leak * .35;

  // splice: flash frame + tape seam
  if (ev == 3.) {
    c = mix(c, vec3(1., .97, .9), (1. - smoothstep(0., .3, pr)) * .85);
    float seam = abs(vUv.y - (.15 + .7 * h11(es)));
    c = mix(c, vec3(.1, .08, .06), (1. - smoothstep(.002, .006, seam)) * .9);
    c *= 1. - .15 * step(seam, .03);
  }
  // changeover cue mark: a ringed dot, top-right, flashing on alternate frame pairs
  if (ev == 4. && mod(floor(pr * 12.), 3.) < 2.) {
    vec2 cp = (vUv - vec2(.9, .1)) * vec2(aspect, 1.);
    float r = length(cp);
    float edge = vn(cp * 60. + es) * .006;
    c = mix(c, vec3(.02), 1. - smoothstep(.026 + edge, .03 + edge, r));
    c = mix(c, vec3(1., .96, .8), (1. - smoothstep(.016 + edge, .02 + edge, r)) * .9);
  }
  // the burn: grows from a seed point through the stuck frame
  if (ev == 1.) {
    vec2 bc = vec2(.3 + .4 * h11(es), .3 + .4 * h11(es * 1.7));
    vec2 bq = (vUv - bc) * vec2(aspect, 1.);
    float rr = length(bq) + (vn(bq * 9. + es) - .5) * .12 + (vn(bq * 31. - uT * 2.) - .5) * .03;
    float R = pr * pr * 1.4;
    float hole = 1. - smoothstep(R - .01, R, rr);
    float ring = (1. - smoothstep(R, R + .03, rr)) - hole;
    float chr = (1. - smoothstep(R + .02, R + .12, rr)) - ring - hole;
    float bub = smoothstep(.55, .75, vn(bq * 24. + uT * 3.)) * (1. - smoothstep(R, R + .15, rr)) * (1. - hole);
    c = mix(c, c * vec3(.55, .3, .12), clamp(chr, 0., 1.) * .9);
    c = mix(c, vec3(1., .5, .08), clamp(ring + bub * .6, 0., 1.));
    c = mix(c, mix(vec3(1., .92, .7), vec3(1.), smoothstep(R * .3, 0., rr)), hole);
  }
  c *= 1. - bar;
  frag = vec4(clamp(c, 0., 1.), 1.);
}`,Qe=K+`
uniform vec4 uEvt;
vec3 yiq(vec3 c){ return vec3(dot(c, vec3(.299, .587, .114)), dot(c, vec3(.596, -.274, -.322)), dot(c, vec3(.211, -.523, .312))); }
vec3 rgb(vec3 y){ return vec3(y.x + .956 * y.y + .621 * y.z, y.x - .272 * y.y - .647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z); }
void main(){
  float lines = 240.;
  float line = floor(vUv.y * lines);
  float t = uT;
  // time-base error: every scanline slides a little, more at the top (skew) and in tracking bands
  float tbc = (vn(vec2(line * .07, t * 4.)) - .5) * 1.6 + (vn(vec2(line * .9, t * 30.)) - .5) * .6;
  tbc += smoothstep(.12, 0., vUv.y) * sin(t * 2.3 + vUv.y * 40.) * 2.5;   // top-of-frame flag waving
  float trk = uEvt.x;
  float band = trk * (1. - smoothstep(0., .07, abs(vUv.y - uEvt.y)));
  tbc += band * (h11(line + floor(t * 30.)) - .5) * 60.;
  float head = smoothstep(.955, .985, vUv.y);                         // head-switching noise at the bottom
  tbc += head * (14. + 10. * h11(line + floor(t * 60.)));
  vec2 uv = vec2(vUv.x + tbc / uRes.x, (line + .5) / lines);
  uv.y += (h11(floor(t * 30.)) - .5) * .0015;                         // vertical jitter
  float lod = log2(max(1., uRes.y / lines)) - .2;

  // luma: soft horizontal bandwidth + peaking (the white/black halos VHS draws round every edge)
  float px1 = 1.6 / uRes.x;
  float y0 = yiq(textureLod(uTex, uv, lod).rgb).x;
  float ys = 0.;
  for (int i = -2; i <= 2; i++) ys += yiq(textureLod(uTex, uv + vec2(float(i) * px1 * 1.5, 0.), lod).rgb).x;
  ys /= 5.;
  float yb = 0.;
  for (int i = -3; i <= 3; i++) yb += yiq(textureLod(uTex, uv + vec2(float(i) * px1 * 3.5, 0.), lod + .5).rgb).x;
  yb /= 7.;
  float Y = ys + (ys - yb) * .85;

  // chroma: very low bandwidth, delayed to the right, slightly noisy
  vec2 IQ = vec2(0.);
  for (int i = 0; i < 8; i++) {
    float o = (float(i) - 2.) * 5.5 / uRes.x;
    IQ += yiq(textureLod(uTex, uv + vec2(o - 3.5 / uRes.x, 0.), lod + 1.5).rgb).yz;
  }
  IQ /= 8.;
  IQ *= 1.15;
  IQ += (vec2(vn(vec2(vUv.x * 90., line + t * 50.)), vn(vec2(vUv.x * 90. + 9., line - t * 50.))) - .5) * .07 * (1.2 - Y);

  // tape noise: horizontal streaky snow, dropouts
  float sn = (vn(vec2(vUv.x * uRes.x / 3., line * 1.7 + t * 300.)) - .5) * .09;
  Y += sn;
  float drop = step(.9965, h11(line * 1.3 + floor(t * 30.) * 7.1)) * smoothstep(.0, .05, fract(vUv.x * .7 + h11(line + t) * 3.)) * step(.6, vn(vec2(vUv.x * 6., line + t)));
  Y = mix(Y, 1.1, drop * .9);
  Y = mix(Y, h11(vUv.x * 900. + line * 7. + t * 99.), band * .5 + head * .55);

  // camcorder tone: lifted blacks, clipped soft whites, warm
  Y = .06 + .9 * smoothstep(-.02, 1.02, Y);
  vec3 c = rgb(vec3(Y, IQ));
  c *= vec3(1.04, 1., .93);
  c = mix(c, vec3(dot(c, LW)), .08);
  // interlace: alternate lines a touch darker, the field order flips every frame
  c *= .94 + .06 * mod(floor(vUv.y * uRes.y * .5) + floor(t * 60.), 2.);
  // overscan: a dark ragged left edge and a soft vignette
  c *= smoothstep(.004, .016, vUv.x + (h11(line) - .5) * .004);
  vec2 q = vUv - .5;
  c *= 1. - dot(q, q) * .55;
  frag = vec4(clamp(c, 0., 1.), 1.);
}`,Ze=K+`
uniform vec4 uCam; uniform vec2 uVel; uniform float uFocus; uniform float uExpo; uniform float uGlitch;
vec2 camUv(vec2 uv, float skew){
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - .5) * vec2(aspect, 1.);
  float r = uCam.z;
  p = mat2(cos(r), -sin(r), sin(r), cos(r)) * p;
  p /= uCam.w;
  p.x += skew * (uv.y - .5);                                        // CMOS rolling shutter
  return p / vec2(aspect, 1.) + .5 + uCam.xy;
}
void main(){
  vec2 px = vUv * uRes;
  float f = uSeed;
  // glitch: macroblock smear + horizontal tears when the camera is slammed
  vec2 base = vUv;
  if (uGlitch > .01) {
    float row = floor(vUv.y * 22.);
    float tearOn = step(1. - uGlitch * .6, h11(row + floor(uT * 20.)));
    base.x += tearOn * (h11(row * 3.1 + floor(uT * 20.)) - .5) * .12 * uGlitch;
  }
  vec2 uv = camUv(base, uVel.x * 1.6);
  // motion blur along the shake
  vec3 c = vec3(0.);
  for (int i = 0; i < 7; i++) {
    float k = float(i) / 6. - .5;
    c += textureLod(uTex, clamp(uv + uVel * k, 0., 1.), uFocus * 3.2).rgb;
  }
  c /= 7.;
  // compression: 8x8 blocks under motion
  float mv = length(uVel) * 60. + uGlitch;
  if (mv > .15) {
    vec2 blk = floor(px / 8.);
    float b = step(1. - min(.85, (mv - .15) * .8), h21(blk + floor(uT * 12.)));
    vec3 bc = textureLod(uTex, clamp(camUv((blk * 8. + 4.) / uRes, 0.), 0., 1.), 3.).rgb;
    c = mix(c, bc, b * .85);
  }
  if (uGlitch > .2) {                                               // chroma split
    float o = uGlitch * .012;
    c.r = textureLod(uTex, clamp(uv + vec2(o, 0.), 0., 1.), 1.).r;
    c.b = textureLod(uTex, clamp(uv - vec2(o, 0.), 0., 1.), 1.).b;
  }
  // camcorder edge enhancement
  vec3 bl = textureLod(uTex, clamp(uv, 0., 1.), 2.).rgb;
  c += (c - bl) * .5 * (1. - uFocus);

  // auto-exposure: gain lifts shadows into noise; highlights clip hard
  c *= uExpo;
  float l = dot(c, LW);
  c = mix(vec3(l), c, .55);                                          // tired, cheap colour
  c *= vec3(.98, 1.03, .9);                                          // Hi8 green-yellow cast
  c = smoothstep(.03, .92, c);
  float n = (h21(px + fract(uT) * 911.) - .5) * (.07 + .1 * max(0., uExpo - 1.)) + (vn(px / 2. + uT * 60.) - .5) * .06;
  c += n * vec3(1., .9, 1.15) * (1.1 - l);
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  c *= 1. - dot(q, q) * .42;
  if (uGlitch > .55 && h11(floor(uT * 30.)) > .6) c = mix(c, vec3(h11(floor(px.y / 3.) + uT)), .35);   // dropout lines
  frag = vec4(clamp(c, 0., 1.), 1.);
}`,ke=`
const vec3 Y709 = vec3(.2126, .7152, .0722);
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 toSrgb(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
// Oklab (Ottosson 2020)
vec3 linToOklab(vec3 c){
  vec3 lms = vec3(dot(c, vec3(.4122214708, .5363325363, .0514459929)),
                  dot(c, vec3(.2119034982, .6806995451, .1073969566)),
                  dot(c, vec3(.0883024619, .2817188376, .6299787005)));
  lms = pow(max(lms, 0.), vec3(1. / 3.));
  return vec3(dot(lms, vec3(.2104542553, .7936177850, -.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, .4505937099)),
              dot(lms, vec3(.0259040371, .7827717662, -.8086757660)));
}
vec3 oklabToLin(vec3 o){
  vec3 lms = vec3(o.x + .3963377774 * o.y + .2158037573 * o.z,
                  o.x - .1055613458 * o.y - .0638541728 * o.z,
                  o.x - .0894841775 * o.y - 1.2914855480 * o.z);
  lms = lms * lms * lms;
  return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, .2309699292)),
              dot(lms, vec3(-1.2684380046, 2.6097574011, -.3413193965)),
              dot(lms, vec3(-.0041960863, -.7034186147, 1.7076147010)));
}
/** Oklab chroma vector from hue (degrees) + chroma. */
vec2 hc(float hDeg, float c){ float h = radians(hDeg); return vec2(cos(h), sin(h)) * c; }
`,et=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uPrev; uniform sampler2D uMask; uniform sampler2D uDepth;
uniform vec2 uRes; uniform float uCut; uniform vec3 uStock;
uniform float uHasMask; uniform vec2 uMapA; uniform vec2 uMapB; uniform float uHasDepth;
uniform vec4 uFace[3]; uniform vec4 uLip[3]; uniform int uNF;
uniform sampler2D uSeg; uniform sampler2D uMatPal; uniform float uHasSeg; uniform vec4 uSegRect;
uniform vec2 uSegOff; uniform float uSegTrust;   // cached labels: camera drift since their keyframe, and how much the picture still agrees   // scene materials (sceneSegment.ts) + their ramps
uniform vec4 uLook[3];   // per tracked face: the actor's complexion (hue°, chroma) + hair (hue°, chroma); chroma 0 = not known
uniform vec4 uWard[3];   // per tracked face: wardrobe top (hue°, chroma) + bottom (hue°, chroma); chroma 0 = not known
${ke}
/** Perceptual grey (Oklab L of a neutral with the stock's measured luminance). */
float greyL(vec2 uv, float lod){ return pow(max(dot(toLin(textureLod(uTex, uv, lod).rgb), uStock), 0.), 1. / 3.); }
void main(){
  vec2 uv = vUv;
  float L = greyL(uv, 3.);                                   // the block's grey (this pass is ~1/8 res)
  // texture energy: spread of the 2px detail inside the block (leaves, grass, gravel vs sky, skin, plaster)
  float s1 = 0., s2 = 0.;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    float v = greyL(uv + (vec2(float(i), float(j)) - 1.5) * 2. / uRes, 1.);
    s1 += v; s2 += v * v;
  }
  s1 /= 16.;
  float tex = sqrt(max(s2 / 16. - s1 * s1, 0.));
  float around = greyL(uv, 5.5);                             // the neighbourhood's grey
  float y = uv.y;                                            // 0 = top of frame

  // scene prior: is there open sky along the top? (bright, even top band)
  // (the brightest of five patches: trees and buildings often frame the sky at the corners)
  float top = max(max(greyL(vec2(.1, .07), 4.), greyL(vec2(.3, .07), 4.)), max(greyL(vec2(.5, .07), 4.), max(greyL(vec2(.7, .07), 4.), greyL(vec2(.9, .07), 4.))));
  float exterior = smoothstep(.7, .85, top);

  float far = .5;
  if (uHasDepth > .5) far = 1. - texture(uDepth, uv * uMapA + uMapB).r;   // Depth Anything: near = white
  float person = uHasMask > .5 ? smoothstep(.4, .6, texture(uMask, uv * uMapA + uMapB).r) : 0.;

  // ── what the segmenter says this is: a material, and that material's grey → colour ramp ──
  vec2 segAb = vec2(0.); float segTrust = 0.;
  if (uHasSeg > .5) {
    vec2 su = (uv - uSegOff - uSegRect.xy) / (uSegRect.zw - uSegRect.xy);   // labels cover the picture inside any black bars
    vec2 sv = texture(uSeg, su).rg;
    sv.g *= step(0., su.x) * step(su.x, 1.) * step(0., su.y) * step(su.y, 1.) * uSegTrust;
    int mat = int(sv.r * 255. + .5);
    vec4 p0 = texelFetch(uMatPal, ivec2(mat, 0), 0), p1 = texelFetch(uMatPal, ivec2(mat, 1), 0);
    segAb = mix((p0.rg - .5) * .5, (p1.rg - .5) * .5, smoothstep(p0.b, p1.b, L));
    float conf = smoothstep(.3, .8, sv.g);
    segTrust = p0.a * conf;
    // a tree is leaves AND trunk: where the block is smooth it is bark (red-brown), where it is busy, leaves
    if (abs(p1.a - .25) < .1) segAb = mix(segAb, hc(45., .035), (1. - smoothstep(.015, .05, tex)) * smoothstep(.4, .55, L));
    person = max(person, step(.4, p1.a) * conf);             // people and their clothes — the segmenter finds what the selfie matte misses
  }
  float hasPeople = max(uHasMask, uHasSeg);

  // ── faces: skin oval, lips, eyes, hair cap (tracker landmarks, canvas uv) ──
  float skin = 0., lip = 0., eye = 0., hair = 0.;
  vec2 wardAb = vec2(0.); float wardW = 0.;
  vec4 look = vec4(0.); float lookW = 0.;
  for (int k = 0; k < 3; k++) {
    if (k >= uNF) break;
    vec4 f = uFace[k];
    vec2 q = (uv - f.xy) / f.zw;
    float d = length(q);
    float oval = smoothstep(1.05, .78, d);
    float near = smoothstep(1.8, 1., d);
    if (near > lookW) { lookW = near; look = uLook[k]; }
    skin = max(skin, oval);
    vec4 m = uLip[k];
    vec2 lq = (uv - m.xy) / vec2(m.z * .6, m.z * .3 * uRes.x / uRes.y);
    lip = max(lip, smoothstep(1., .55, length(lq)) * m.w * smoothstep(.0, -.04, L - around));
    eye = max(eye, smoothstep(.16, .05, abs(q.y + .2)) * smoothstep(.15, .3, abs(q.x)) * smoothstep(.7, .5, abs(q.x)) * smoothstep(.1, -.06, L - around));
    // hair: a cap over the crown and down the sides, outside the skin oval
    float cap = smoothstep(1.55, 1.1, length(q * vec2(.9, 1.))) * smoothstep(.1, -.45, q.y);
    hair = max(hair, cap * (1. - oval));
    // this character's clothes: the body below their face — torso ~4 head-heights, then the skirt/trousers
    vec4 wd = uWard[k];
    float below = smoothstep(.6, 1.1, q.y) * smoothstep(3.2, 2.2, abs(q.x));
    float isTop = smoothstep(6.5, 5.5, q.y);
    vec2 want = mix(hc(wd.z, wd.w), hc(wd.x, wd.y), isTop);
    float known = mix(step(.001, wd.w), step(.001, wd.y), isTop);
    float w = below * known;
    if (w > wardW) { wardW = w; wardAb = want; }
  }
  hair *= 1. - skin * .8;
  hair *= hasPeople > .5 ? person : smoothstep(.6, .3, L);   // no matte: only the darker greys round the head

  // ── weights for each kind of surface ──
  float even = 1. - smoothstep(.015, .05, tex);
  float leafy = smoothstep(.03, .08, tex);
  float bg = 1. - person;
  float wSky = exterior * smoothstep(.55, .72, L) * even * smoothstep(.75, .2, y) * mix(1., smoothstep(.45, .8, far), uHasDepth) * bg;
  float wLeaf = leafy * smoothstep(.12, .25, L) * smoothstep(.72, .5, L) * smoothstep(.95, .55, y) * bg * (1. - wSky) * mix(.15, 1., exterior);   // indoors, texture is fabric and carving, not leaves
  float wEarth = smoothstep(.55, .9, y) * bg * (1. - wLeaf * .6);
  float wWall = even * smoothstep(.35, .55, L) * bg * (1. - wSky);
  float wWood = smoothstep(.45, .2, L) * (1. - leafy * .7) * bg;
  // with no tracker/matte, even mid-high greys in the middle of frame are most often a face or hands
  float wSkinGuess = hasPeople > .5 ? person * even * smoothstep(.04, .12, L) * (uNF > 0 ? .25 : .45) : 0.;
  float wSkin = max(skin, wSkinGuess) * (1. - eye * .7);
  float wHair = hair;
  float wCloth = person * (1. - clamp(wSkin + wHair, 0., 1.));
  float wNeutral = .15;

  // ── what each one looks like (Oklab a,b), at this grey ──
  vec2 sky = hc(252., mix(.035, .1, smoothstep(.65, .05, y)) * (1. - smoothstep(.86, .97, L)));   // zenith deepens; clouds go white
  sky += hc(70., .012) * smoothstep(.75, .95, L);                                                // sunlit cloud tops
  vec2 leaf = mix(hc(160., .055), hc(122., .075), smoothstep(.2, .5, L));                         // shade blue-green → lit yellow-green
  vec2 earth = hc(68., .035 * smoothstep(.08, .3, L));
  vec2 wall = hc(80., .028);                                                                   // warm plaster / paper
  vec2 wood = hc(58., .05 * smoothstep(.05, .25, L));
  vec2 skinC = hc(mix(42., 58., smoothstep(.35, .8, L)), mix(.085, .06, smoothstep(.35, .8, L)));   // shadow side redder (subsurface)
  vec2 lipC = hc(22., .1);
  vec2 hairC = mix(hc(55., .03), hc(80., .075), smoothstep(.3, .7, L));                          // eumelanin → pheomelanin
  // the actual actor, when the colour script knows them: their complexion and hair, shaded by the film's grey
  if (look.y > 0.) skinC = hc(look.x + mix(-8., 6., smoothstep(.35, .8, L)), look.y * mix(1.15, .85, smoothstep(.35, .8, L)));
  if (look.w > 0.) hairC = hc(look.z, look.w * smoothstep(.05, .35, L));
  vec2 cloth = L < .3 ? mix(hc(60., .018), hc(255., .035), smoothstep(.16, .3, L))             // black (hair or suit) → navy / charcoal
             : L < .65 ? mix(hc(70., .04), hc(95., .035), smoothstep(.3, .65, L))              // brown → olive / khaki
             : hc(85., .015);                                                                  // white & cream linen
  vec2 neutral = hc(75., .01);
  // a known costume colour (colour script) replaces the period guess; the grey still sets how much chroma fits
  cloth = mix(cloth, wardAb * smoothstep(.04, .3, L), wardW);

  float wsum = wSky + wLeaf + wEarth + wWall + wWood + wSkin + wHair + wCloth + wNeutral + lip;
  vec2 ab = (sky * wSky + leaf * wLeaf + earth * wEarth + wall * wWall + wood * wWood + skinC * wSkin
           + hairC * wHair + cloth * wCloth + neutral * wNeutral + lipC * lip * 2.) / (wsum + lip);

  // the segmenter's material, where it is sure, outranks the texture/position guesses (people keep their own logic)
  ab = mix(ab, segAb, segTrust * (1. - person));

  // light has colour: cool sky fill in the shadows, warm key in the highlights
  ab += hc(250., .018) * smoothstep(.45, .1, L) * (1. - max(wSkin, person * .8)) + hc(72., .016) * smoothstep(.55, .9, L) * (1. - wSky);
  // atmospheric perspective: distance scatters toward the sky's blue and loses saturation
  if (uHasDepth > .5) { float a = smoothstep(.55, .95, far) * (1. - wSky) * .55; ab = mix(ab, hc(245., .03), a); }

  // ── temporal memory: keep last frame's colour unless the grey here changed (motion / new content) or the shot cut ──
  vec4 prev = texture(uPrev, vec2(uv.x, 1. - uv.y));
  float changed = smoothstep(.03, .14, abs(L - prev.b));
  float k = max(uCut, max(mix(.1, 1., changed), 1. - prev.a));
  vec2 outAb = mix((prev.rg - .5) * .5, ab, k);
  frag = vec4(outAb * 2. + .5, L, 1.);
}`,tt=`
vec3 tcPrint(vec3 rgb){
  vec3 E = vec3(dot(rgb, vec3(.88, .11, .01)), dot(rgb, vec3(.07, .86, .07)), dot(rgb, vec3(.01, .12, .87)));   // separations
  vec3 x = log2(max(E, 1e-5)) + 2.47;                         // stops from mid grey
  vec3 dye = 1.6 / (1. + exp(1.55 * x));                       // C, M, Y dye laid down (steep matrices: saturated separations)
  float key = .14 / (1. + exp(1.2 * (log2(max(dot(rgb, vec3(.2126, .7152, .0722)), 1e-5)) + 2.47)));
  // optical density at the R, G, B of the projector lamp: columns = cyan, magenta, yellow absorption spectra
  mat3 ABS = mat3(vec3(1., .28, .08), vec3(.12, 1., .38), vec3(.03, .12, 1.));
  vec3 D = ABS * dye + key;
  return pow(vec3(10.), -D);
}
vec3 technicolor(vec3 rgb){
  vec3 grey = tcPrint(vec3(.18));
  vec3 tc = tcPrint(rgb) / grey * .18;
  // the steep records over-crush the tones; give back most of the scene's luminance, keep the dye's colour
  float yi = dot(rgb, vec3(.2126, .7152, .0722)), yt = max(dot(tc, vec3(.2126, .7152, .0722)), 1e-4);
  return clamp(tc * pow(max(yi, 1e-4) / yt, .7), 0., 1.);
}
`,at=`#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uChroma; uniform vec2 uCRes; uniform vec3 uStock; uniform float uAmt; uniform float uGrade;
${ke}
${tt}
void main(){
  vec3 lin = toLin(texture(uTex, vUv).rgb);
  float Y = max(dot(lin, uStock), 0.);                        // what the film measured here
  float L = pow(Y, 1. / 3.);
  // joint bilateral upsampling: 3×3 chroma taps, weighted by space and by how alike their grey is to ours
  vec2 c = vec2(vUv.x, 1. - vUv.y) * uCRes - .5;
  vec2 base = floor(c), fr = c - base;
  vec2 ab = vec2(0.); float ws = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec4 t = texture(uChroma, (base + o + .5) / uCRes);
    vec2 dd = o - fr;
    float w = exp(-dot(dd, dd) * .9) * exp(-pow((t.b - L) / .07, 2.)) + 1e-5;
    ab += (t.rg - .5) * .5 * w; ws += w;
  }
  ab /= ws;
  ab *= smoothstep(.0, .3, L) * (1. - smoothstep(.9, 1., L)) * uAmt;   // near black / white there is no room for colour

  vec3 rgb = max(oklabToLin(vec3(L, ab)), 0.);
  rgb *= Y / max(dot(rgb, uStock), 1e-5);                     // photographs back to exactly the measured grey
  // pull out-of-gamut colour toward the neutral of the same luminance (keeps Y, keeps hue)
  vec3 g = vec3(Y), d = rgb - g;
  vec3 hi = mix(vec3(1e3), (1. - g) / max(d, 1e-5), step(1e-5, d));
  vec3 lo = mix(vec3(1e3), g / max(-d, 1e-5), step(1e-5, -d));
  float t = clamp(min(min(min(hi.x, hi.y), hi.z), min(min(lo.x, lo.y), lo.z)), 0., 1.);
  rgb = g + d * t;
  if (uGrade > 0.) rgb = mix(rgb, technicolor(rgb), uGrade);
  frag = vec4(toSrgb(rgb), 1.);
}`,ot={live:"Xenova/segformer-b0-finetuned-ade-512-512",remaster:"Xenova/segformer-b2-finetuned-ade-512-512"},le={},_={live:"idle",remaster:"idle"},g={none:0,sky:1,foliage:2,grass:3,earth:4,rock:5,water:6,building:7,plaster:8,floor:9,wood:10,fabric:11,metal:12,person:13,road:14,flower:15,light:16,fire:17,paper:18,animal:19,food:20,glass:21,apparel:22},ne={sky:g.sky,tree:g.foliage,plant:g.foliage,palm:g.foliage,grass:g.grass,field:g.grass,earth:g.earth,sand:g.earth,path:g.earth,land:g.earth,"dirt track":g.earth,mountain:g.rock,rock:g.rock,hill:g.rock,stone:g.rock,water:g.water,sea:g.water,river:g.water,lake:g.water,"swimming pool":g.water,waterfall:g.water,fountain:g.water,building:g.building,house:g.building,skyscraper:g.building,tower:g.building,bridge:g.building,hovel:g.building,column:g.building,wall:g.plaster,ceiling:g.plaster,floor:g.floor,rug:g.floor,stairs:g.floor,stairway:g.floor,step:g.floor,table:g.wood,cabinet:g.wood,chair:g.wood,desk:g.wood,shelf:g.wood,bookcase:g.wood,door:g.wood,"chest of drawers":g.wood,wardrobe:g.wood,bench:g.wood,"coffee table":g.wood,counter:g.wood,buffet:g.wood,barrel:g.wood,fence:g.wood,bannister:g.wood,railing:g.wood,"swivel chair":g.wood,stool:g.wood,box:g.wood,sofa:g.fabric,armchair:g.fabric,cushion:g.fabric,pillow:g.fabric,curtain:g.fabric,blanket:g.fabric,bed:g.fabric,towel:g.fabric,blind:g.fabric,seat:g.fabric,ottoman:g.fabric,awning:g.fabric,tent:g.fabric,canopy:g.fabric,car:g.metal,bus:g.metal,truck:g.metal,van:g.metal,airplane:g.metal,ship:g.metal,boat:g.metal,bicycle:g.metal,minibike:g.metal,streetlight:g.metal,pole:g.metal,radiator:g.metal,stove:g.metal,refrigerator:g.metal,person:g.person,sculpture:g.person,statue:g.person,base:g.apparel,road:g.road,sidewalk:g.road,runway:g.road,flower:g.flower,lamp:g.light,light:g.light,chandelier:g.light,sconce:g.light,fireplace:g.fire,painting:g.paper,poster:g.paper,book:g.paper,signboard:g.paper,"bulletin board":g.paper,flag:g.paper,animal:g.animal,food:g.food,windowpane:g.glass,mirror:g.glass,glass:g.glass,bottle:g.glass,vase:g.glass,apparel:g.apparel,bag:g.apparel};function te(f){const e=le[f];if(e)return e;const a=ot[f];_[f]="loading";const o=(async()=>{try{const l=await ae(()=>import("./transformers.web-BUbDYS53.js"),[]),i=typeof navigator<"u"&&!!navigator.gpu,s=await l.AutoProcessor.from_pretrained(a);let t=null;for(const r of i?["webgpu","wasm"]:["wasm"])try{t=await l.AutoModel.from_pretrained(a,{device:r,dtype:r==="webgpu"?"fp32":"q8"});break}catch(n){console.warn("[sceneSegment] device",r,"failed:",n?.message||n)}return _[f]=t?"ready":"failed",t?{model:t,processor:s,tf:l}:null}catch(l){return console.warn("[sceneSegment] load failed:",l?.message||l),_[f]="failed",null}})();return le[f]=o,o}let O=null;function st(f,e){const[,a,o,l]=f.dims,i=f.data;if(!O||O.length!==a){O=new Uint8Array(a);for(let h=0;h<a;h++){const d=String(e?.[h]??"").toLowerCase();O[h]=ne[d]??ne[d.split(/[,;]/)[0].trim()]??g.none}}const s=new Uint8Array(l*o*2),t=l*o,r=new Float32Array(t).fill(-1e9),n=new Float32Array(t).fill(-1e9),c=new Uint8Array(t);for(let h=0;h<a;h++){const d=h*t;for(let p=0;p<t;p++){const u=i[d+p];u>r[p]?(n[p]=r[p],r[p]=u,c[p]=h):u>n[p]&&(n[p]=u)}}for(let h=0;h<t;h++)s[h*2]=O[c[h]],s[h*2+1]=Math.round(255*(1-Math.exp(n[h]-r[h])));return{data:s,w:l,h:o,stamp:0,rect:[0,0,1,1]}}async function it(f,e){const a=await te(e);if(!a)return null;try{const o=await a.tf.RawImage.fromCanvas(f),l=await a.processor(o),{logits:i}=await a.model(l),s=i.location&&i.location!=="cpu"&&i.getData?await i.getData(!0):null;return st(s?{dims:i.dims,data:s}:i,a.model.config?.id2label??{})}catch(o){return console.warn("[sceneSegment] segment failed:",o?.message||o),null}}function rt(f,e){e.width=96,e.height=54;const l=e.getContext("2d",{willReadFrequently:!0});l.drawImage(f,0,0,96,54);const i=l.getImageData(0,0,96,54).data,s=d=>{let p=0;for(let u=0;u<54;u++)p+=i[(u*96+d)*4+1];return p/54},t=d=>{let p=0;for(let u=0;u<96;u++)p+=i[(d*96+u)*4+1];return p/96};let r=0,n=95,c=0,h=53;for(;r<96/3&&s(r)<10;)r++;for(;n>192/3&&s(n)<10;)n--;for(;c<54/3&&t(c)<10;)c++;for(;h>108/3&&t(h)<10;)h--;return[r/96,c/54,(n+1)/96,(h+1)/54]}function lt(f){const e=f.getContext("2d",{willReadFrequently:!0}),a=e.getImageData(0,0,f.width,f.height),o=a.data,l=new Uint32Array(256);for(let c=0;c<o.length;c+=16)l[o[c]*77+o[c+1]*150+o[c+2]*29>>8]++;let i=0;for(const c of l)i+=c;let s=0,t=255,r=0;for(let c=0;c<256;c++)if(r+=l[c],r>i*.02){s=c;break}r=0;for(let c=255;c>=0;c--)if(r+=l[c],r>i*.02){t=c;break}if(t-s<24)return;const n=255/(t-s);for(let c=0;c<o.length;c+=4)o[c]=(o[c]-s)*n,o[c+1]=(o[c+1]-s)*n,o[c+2]=(o[c+2]-s)*n;e.putImageData(a,0,0)}function nt(f,e,a,o,l,i){const s=rt(f,i),t=(s[2]-s[0])*e,r=(s[3]-s[1])*a;return l.width=512,l.height=Math.max(2,Math.round(512*r/t)),l.getContext("2d").drawImage(f,s[0]*e,s[1]*a,t,r,0,0,l.width,l.height),lt(l),it(l,o).then(n=>(n&&(n.rect=s),n))}class ht{constructor(e="live"){this.tier=e,this.map=null,this.busy=!1,this.last=0,this.frame=document.createElement("canvas"),this.probe=document.createElement("canvas"),this.stamp=0}setTier(e){e!==this.tier&&(this.tier=e,_[e]==="idle"&&te(e))}init(){te(this.tier)}state(){return _[this.tier]==="ready"||_.live!=="ready"?_[this.tier]:"ready"}update(e,a){const o=_[this.tier]==="ready"?this.tier:_.live==="ready"?"live":null;if(!o)return this.map;if(!this.busy&&a-this.last>(o==="live"?330:120)){const l=e.videoWidth||e.width||0,i=e.videoHeight||e.height||0;if(!l||!i)return this.map;this.busy=!0,this.last=a;try{nt(e,l,i,o,this.frame,this.probe).then(s=>{s&&(s.stamp=++this.stamp,this.map=s)}).finally(()=>{this.busy=!1})}catch{this.busy=!1}}return this.map}}const we={[g.sky]:{dark:[240,.075,.45],bright:[252,.03,.92],trust:.9},[g.foliage]:{dark:[165,.05,.15],bright:[120,.085,.55],trust:.85,flag:.25},[g.grass]:{dark:[145,.06,.15],bright:[115,.1,.6],trust:.85},[g.earth]:{dark:[58,.035,.15],bright:[75,.045,.7],trust:.7},[g.rock]:{dark:[70,.012,.2],bright:[82,.02,.8],trust:.6},[g.water]:{dark:[232,.045,.2],bright:[205,.03,.8],trust:.8},[g.building]:{dark:[62,.022,.2],bright:[80,.028,.8],trust:.6},[g.plaster]:{dark:[75,.02,.3],bright:[86,.028,.85],trust:.6},[g.floor]:{dark:[52,.045,.15],bright:[70,.04,.6],trust:.6},[g.wood]:{dark:[50,.06,.1],bright:[66,.05,.6],trust:.7},[g.fabric]:{dark:[22,.055,.15],bright:[45,.035,.7],trust:.5},[g.metal]:{dark:[250,.01,.1],bright:[240,.008,.9],trust:.6},[g.person]:{dark:[42,.085,.35],bright:[58,.06,.8],trust:0,flag:1},[g.road]:{dark:[75,.006,.2],bright:[82,.01,.8],trust:.7},[g.flower]:{dark:[18,.12,.2],bright:[92,.1,.8],trust:.7},[g.light]:{dark:[70,.09,.5],bright:[88,.04,.98],trust:.8},[g.fire]:{dark:[42,.14,.35],bright:[82,.09,.95],trust:.9},[g.paper]:{dark:[80,.02,.3],bright:[90,.016,.9],trust:.5},[g.animal]:{dark:[58,.04,.15],bright:[70,.035,.75],trust:.6},[g.food]:{dark:[55,.06,.2],bright:[82,.06,.8],trust:.6},[g.glass]:{dark:[230,.015,.2],bright:[220,.01,.9],trust:.5},[g.apparel]:{dark:[255,.03,.1],bright:[80,.02,.85],trust:.4,flag:.5}},he=f=>Math.max(0,Math.min(255,Math.round((f*2+.5)*255))),ce=f=>Math.max(0,Math.min(255,Math.round(f*255)));function ue(f=we){const e=new Uint8Array(256);for(const[a,o]of Object.entries(f)){const l=Number(a);if(!o||l<0||l>=32)continue;[o.dark,o.bright].forEach(([s,t,r],n)=>{const c=(n*32+l)*4,h=s*Math.PI/180;e[c]=he(Math.cos(h)*t),e[c+1]=he(Math.sin(h)*t),e[c+2]=ce(r),e[c+3]=ce(n===0?o.trust:o.flag??0)})}return e}function ct(f,[e,a]){return{...f,dark:[e,a*1.1,f.dark[2]],bright:[e,a*.75,f.bright[2]],trust:Math.max(f.trust,.85)}}class ut{constructor(){this.script=null,this.shotIdx=-2,this.palette=ue(),this.stamp=0}set(e){this.script=e,this.shotIdx=-2,this.rebuild(null)}get(){return this.script}shotAt(e){const a=this.script?.shots;if(!a?.length)return-1;let o=0,l=a.length-1;for(;o<=l;){const i=o+l>>1;if(e<a[i].t0)l=i-1;else if(e>=a[i].t1)o=i+1;else return i}return-1}rebuild(e){const a={...we},o=l=>{for(const[i,s]of Object.entries(l||{})){const t=g[i],r=a[t];s&&r&&(a[t]=ct(r,s))}};o(this.script?.materials),o(e?.materials),this.palette=ue(a),this.stamp++}update(e){const a=this.shotAt(e);return a===this.shotIdx?!1:(this.shotIdx=a,this.rebuild(a>=0?this.script.shots[a]:null),!0)}palettePixels(){return this.palette}peopleCount(){return this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.length??0:0}wardrobe(e){const a=e<0?void 0:this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.[e]:void 0;return[a?.top?.[0]??0,a?.top?.[1]??0,a?.bottom?.[0]??0,a?.bottom?.[1]??0]}look(e){const a=e<0?void 0:this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.[e]?.who:void 0,o=a?this.script?.cast?.find(l=>l.name===a):void 0;return[o?.skin?.[0]??0,o?.skin?.[1]??0,o?.hair?.[0]??0,o?.hair?.[1]??0]}stock(){return this.script?.stock}grade(){return this.script?.grade??0}}const I=48,z=27;class ft{constructor(){this.c=document.createElement("canvas"),this.x=this.c.getContext("2d",{willReadFrequently:!0}),this.prev=null,this.energy=0,this.burst=0,this.cx=.5,this.cy=.5,this.luma=.5,this.c.width=I,this.c.height=z}update(e){try{this.x.drawImage(e,0,0,I,z)}catch{return}const a=this.x.getImageData(0,0,I,z).data,o=new Float32Array(I*z);let l=0,i=0,s=0,t=0;for(let n=0,c=0;c<o.length;n+=4,c++){const h=(a[n]*.299+a[n+1]*.587+a[n+2]*.114)/255;if(o[c]=h,l+=h,this.prev){const d=Math.abs(h-this.prev[c]),p=d>.06?d:0;i+=p,s+=p*(c%I),t+=p*Math.floor(c/I)}}this.luma=l/o.length;const r=this.prev?Math.min(1,i/o.length*9):0;this.burst=r,this.energy+=(r-this.energy)*(r>this.energy?.45:.08),i>.5&&(this.cx+=(s/i/(I-1)-this.cx)*.3,this.cy+=(t/i/(z-1)-this.cy)*.3),this.prev=o}}class dt{constructor(){this.vx=0,this.vy=0,this.speed=0,this.clicks=0,this.lx=NaN,this.ly=NaN,this.lt=0,this.users=0,this.onMove=e=>{const a=e.timeStamp||performance.now();if(!Number.isNaN(this.lx)&&a>this.lt){const o=Math.max(4,a-this.lt)/1e3,l=(e.clientX-this.lx)/o,i=(e.clientY-this.ly)/o;this.vx+=(l-this.vx)*.5,this.vy+=(i-this.vy)*.5}this.lx=e.clientX,this.ly=e.clientY,this.lt=a},this.onDown=()=>{this.clicks++}}attach(){this.users++===0&&typeof window<"u"&&(window.addEventListener("pointermove",this.onMove,{passive:!0}),window.addEventListener("pointerdown",this.onDown,{passive:!0}))}detach(){--this.users===0&&typeof window<"u"&&(window.removeEventListener("pointermove",this.onMove),window.removeEventListener("pointerdown",this.onDown))}step(e){const a=Math.exp(-e*7);this.vx*=a,this.vy*=a,this.speed+=(Math.hypot(this.vx,this.vy)-this.speed)*(1-Math.exp(-e*12))}}const U=new dt;class mt{constructor(){this.attached=!1,this.seenClicks=0}get vx(){return U.vx}get vy(){return U.vy}get speed(){return U.speed}start(){this.attached||(this.attached=!0,U.attach(),this.seenClicks=U.clicks)}stop(){this.attached&&(this.attached=!1,U.detach())}step(e){U.step(e)}takeClicks(){const e=U.clicks-this.seenClicks;return this.seenClicks=U.clicks,e}}class pt{constructor(){this.mod=null,this.loading=!1,this.canvas=null,this.lastPull=0,this.stamp=0}state(){return this.mod?this.mod.depthMatteStatus():this.loading?"loading":"idle"}init(){this.mod||this.loading||(this.loading=!0,ae(()=>import("./depthMatte-Bbnu6htQ.js"),__vite__mapDeps([0,1])).then(e=>{this.mod=e,e.loadDepthEstimator()}).catch(()=>{}).finally(()=>{this.loading=!1}))}update(e,a){if(!this.mod||this.mod.depthMatteStatus()!=="ready")return null;if(a-this.lastPull>120){this.lastPull=a;const o=this.mod.estimateDepthLatest(e,256,Math.max(2,Math.round(256*(e.videoHeight||9)/(e.videoWidth||16))));o&&(this.canvas=o,this.stamp++)}return this.canvas}}class vt{constructor(){this.mod=null,this.loading=!1,this.canvas=null,this.lastPull=0,this.stamp=0}init(){this.mod||this.loading||(this.loading=!0,ae(()=>import("./samMatte-Dp_H3-o2.js"),__vite__mapDeps([2,1])).then(e=>{this.mod=e,e.loadSam()}).catch(()=>{}).finally(()=>{this.loading=!1}))}get active(){return!!this.mod||this.loading}update(e,a,o,l){if(!this.mod||this.mod.samMatteStatus()!=="ready")return null;if(a-this.lastPull>150){this.lastPull=a;const i=192,s=Math.max(2,Math.round(192*(e.videoHeight||9)/(e.videoWidth||16))),t=this.mod.segmentSamLatest(e,{x:o,y:l},i,s,.01);t&&(this.canvas=t,this.stamp++)}return this.canvas}}const N="#0b0a0a";function gt(f,e=.18){let[a,o,l]=f.map(n=>n/255);const i=.299*a+.587*o+.114*l,s=1.35;a=i+(a-i)*s,o=i+(o-i)*s,l=i+(l-i)*s;const t=i<e?e-i:0,r=n=>Math.round(Math.max(0,Math.min(1,n+t))*12)/12;return[r(a)*255,r(o)*255,r(l)*255]}const yt=f=>`rgb(${f[0]|0},${f[1]|0},${f[2]|0})`,bt=(f,e)=>{const a=/rgb\((\d+),(\d+),(\d+)\)/.exec(f);return a?`rgb(${+a[1]*e|0},${+a[2]*e|0},${+a[3]*e|0})`:f};function D(f,e,a,o){f.save(),f.shadowColor="rgba(0,0,0,0.28)",f.shadowOffsetX=o*.9,f.shadowOffsetY=o*1.3,f.shadowBlur=0,f.fillStyle=a,f.beginPath(),e(),f.fill(),f.restore(),f.lineWidth=o,f.strokeStyle=N,f.lineJoin="round",f.beginPath(),e(),f.stroke()}function Tt(f,e,a,o,l,i,s,t){f.save(),f.lineCap="round",f.strokeStyle="rgba(0,0,0,0.28)",f.lineWidth=i+t*2,f.beginPath(),f.moveTo(e+t,a+t*1.3),f.lineTo(o+t,l+t*1.3),f.stroke(),f.strokeStyle=N,f.lineWidth=i+t*2,f.beginPath(),f.moveTo(e,a),f.lineTo(o,l),f.stroke(),f.strokeStyle=s,f.lineWidth=i,f.beginPath(),f.moveTo(e,a),f.lineTo(o,l),f.stroke(),f.restore()}function xt(f,e,a,o,l){const i=e.r,s=i*2,t=Math.max(2,i*.045);f.save(),f.globalAlpha=l;let r=e.roll*.4;if(a?.shoulderL&&a.shoulderR&&a.shoulderL.v>.5&&a.shoulderR.v>.5){const w=Math.atan2(a.shoulderL.y-a.shoulderR.y,a.shoulderL.x-a.shoulderR.x),E=Math.atan2(Math.sin(w),Math.cos(w));r=Math.max(-.3,Math.min(.3,Math.abs(E)>Math.PI/2?E-Math.sign(E)*Math.PI:E))}const n=e.x-Math.sin(e.roll)*i*.78,c=e.y+Math.cos(e.roll)*i*.78,h=s*.92,d=s*.6,p=s*.16;f.save(),f.translate(n,c),f.rotate(r);for(const w of[-1,1])D(f,()=>{f.rect(w*h*.2-h*.14,d*.9,h*.28,p)},o.pants,t),D(f,()=>{f.ellipse(w*h*.24,d*.9+p,h*.2,s*.06,0,0,Math.PI*2)},"#111111",t);D(f,()=>{f.moveTo(-h*.36,0),f.quadraticCurveTo(-h*.5,d*.45,-h*.5,d*.95),f.lineTo(h*.5,d*.95),f.quadraticCurveTo(h*.5,d*.45,h*.36,0),f.closePath()},o.shirt,t),f.strokeStyle=bt(o.shirt,.55),f.lineWidth=t*.8,f.beginPath(),f.moveTo(0,d*.12),f.lineTo(0,d*.93),f.stroke(),f.restore();const u=Math.cos(r),m=Math.sin(r),v=(w,E)=>({x:n+w*u-E*m,y:c+w*m+E*u}),y=s*.4,b=s*.13;for(const w of[-1,1]){const E=v(w*h*.4,d*.22),A=w<0?a?.wristR&&a.wristR.x<n?a.wristR:a?.wristL&&a.wristL.x<n?a.wristL:null:a?.wristL&&a.wristL.x>=n?a.wristL:a?.wristR&&a.wristR.x>=n?a.wristR:null;let P=Math.PI/2+w*-.35+r;A&&A.v>.45&&(P=Math.atan2(A.y-E.y,A.x-E.x));const L=E.x+Math.cos(P)*y,$=E.y+Math.sin(P)*y;Tt(f,E.x,E.y,L,$,b,o.shirt,t),D(f,()=>{f.arc(L,$,s*.075,0,Math.PI*2)},o.glove,t)}f.save(),f.translate(e.x,e.y),f.rotate(e.roll);const T=i*1.04,R=i*.94;D(f,()=>{f.ellipse(0,0,T,R,0,0,Math.PI*2)},o.skin,t),D(f,()=>{f.ellipse(0,-R*.02,T*1.02,R*.98,0,Math.PI*1.08,Math.PI*1.92);const w=6;for(let E=0;E<=w;E++){const A=E/w,P=T*.86-A*T*1.72,L=-R*.38+Math.sin(A*Math.PI*w)*R*.04-Math.sin(A*Math.PI)*R*.1;f.lineTo(P,L)}f.closePath()},o.hair,t),f.restore();const x=i*.27,S=i*.33;for(let w=0;w<2;w++){const E=w===0?-1:1,A=e.eyes[w]||e.eyes[0],P=E*i*.26,L=-i*.02,$=e.x+P*Math.cos(e.roll)-L*Math.sin(e.roll),Ee=e.y+P*Math.sin(e.roll)+L*Math.cos(e.roll);if(f.save(),f.translate($,Ee),f.rotate(e.roll+E*.22),D(f,()=>{f.ellipse(0,0,x,S,0,0,Math.PI*2)},"#ffffff",t*.9),A&&A.open<.12)f.strokeStyle=N,f.lineWidth=t,f.beginPath(),f.moveTo(-x*.8,0),f.lineTo(x*.8,0),f.stroke();else{const oe=Re=>Math.max(-.5,Math.min(.5,Re*3));f.fillStyle=N,f.beginPath(),f.arc(-E*x*.18+oe(A?.gx??0)*x,oe(A?.gy??0)*S,Math.max(1.5,i*.055),0,Math.PI*2),f.fill()}f.restore()}f.save(),f.translate(e.x,e.y),f.rotate(e.roll);const k=i*.5,M=i*.5;if(f.fillStyle=N,f.strokeStyle=N,e.mouthOpen<.07)f.lineWidth=Math.max(2,t*1.1),f.lineCap="round",f.beginPath(),f.moveTo(-k/2,M),f.quadraticCurveTo(0,M+k*.14,k/2,M),f.stroke();else{const w=Math.min(k*.9,e.mouthOpen*k*1.8);f.beginPath(),f.moveTo(-k/2,M),f.lineTo(k/2,M),f.ellipse(0,M,k/2,w,0,0,Math.PI),f.closePath(),f.fill(),w>k*.4&&(f.save(),f.clip(),f.fillStyle="#d9526b",f.beginPath(),f.ellipse(0,M+w*.95,k*.28,w*.38,0,0,Math.PI*2),f.fill(),f.restore())}f.restore(),f.restore()}const G={shoulderL:11,shoulderR:12,elbowL:13,elbowR:14,wristL:15,wristR:16},fe="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",kt="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";class wt{constructor(){this.pl=null,this.ready=!1,this.loading=!1}async init(){if(this.ready)return!0;if(this.loading)return!1;this.loading=!0;try{const e=await import(fe),a=await e.FilesetResolver.forVisionTasks(`${fe}/wasm`);for(const o of["GPU","CPU"])try{this.pl=await e.PoseLandmarker.createFromOptions(a,{baseOptions:{modelAssetPath:kt,delegate:o},runningMode:"VIDEO",numPoses:1});break}catch(l){console.warn(`[vtuber] PoseLandmarker ${o} delegate failed:`,l)}this.ready=!!this.pl}catch(e){console.warn("[vtuber] PoseLandmarker init failed:",e)}finally{this.loading=!1}return this.ready}detect(e,a){if(!this.ready||!this.pl)return null;try{const l=this.pl.detectForVideo(e,a)?.landmarks?.[0];return!l||!l.length?null:{pts:l.map(i=>({x:i.x,y:i.y,v:i.visibility??1}))}}catch{return null}}dispose(){try{this.pl?.close?.()}catch{}this.pl=null,this.ready=!1}get isReady(){return this.ready}}class de{constructor(){this.filter="jackolantern",this.dimLights=!1,this.batSwarm=!1,this.audioMouthBoost=0,this.mirrored=!1,this.worker=new ee,this.sync=null,this.feed=new Te,this.faceState="idle",this.lastSend=-1e9,this.lastTs=-1,this.lastSync=-1e9,this.lastApply=0,this.tracks=[],this.bats=[],this.dust=[],this.beamX=.5,this.beamY=.46,this.initBats(),this.initDust(),this.ensureFaceTracker()}initBats(){const e=["#f97316","#ef4444","#fbbf24","#a855f7"];this.bats=Array.from({length:22},(a,o)=>{const l=.3+o/22*1.35;return{x:Math.random(),y:.12+Math.random()*.72,z:l,vx:(Math.random()>.5?1:-1)*(.08+Math.random()*.18)*l,vy:(Math.random()-.5)*.08,wingPhase:Math.random()*Math.PI*2,wingSpeed:11+Math.random()*8,orbitAngle:o/22*Math.PI*2,orbitRadius:.14+o%5*.055,eyeColor:e[o%e.length]}})}initDust(){this.dust=Array.from({length:38},()=>({x:Math.random(),y:Math.random(),vx:(Math.random()-.5)*.025,vy:-.015-Math.random()*.025,size:1+Math.random()*2.4,alpha:.2+Math.random()*.55}))}ensureFaceTracker(){if(this.faceState!=="idle")return;this.faceState="loading";const e={numFaces:2,blendshapes:!1};this.worker.init(e).then(async a=>{if(a){this.faceState="worker";return}const o=new be;await o.init(e)?(this.sync=o,this.faceState="sync"):this.faceState="failed"})}setFilter(e){this.filter=e,e!=="none"&&this.ensureFaceTracker()}getFilter(){return this.filter}getTrackingStatus(e=performance.now()){return{state:this.faceState,locked:this.tracks.some(a=>e-a.seenAt<650)}}setMirrored(e){this.mirrored=e}setDimLights(e){this.dimLights=e}getDimLights(){return this.dimLights}setBatSwarm(e){this.batSwarm=e}getBatSwarm(){return this.batSwarm}setAudioLevel(e){this.audioMouthBoost=Math.max(0,Math.min(1,e))}feedVideoFaces(e,a,o,l){if(e.readyState<2||!e.videoWidth)return;const i=1e3/28;let s=null,t=!1;if(this.faceState==="worker"){a-this.lastSend>=i&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),this.worker.send(this.feed.src(e),this.lastTs),this.lastSend=a);const r=this.worker.poll();t=r.fresh,s=r.frame}else this.faceState==="sync"&&this.sync&&a-this.lastSync>=90&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),s=this.sync.detect(this.feed.src(e),this.lastTs),this.lastSync=a,t=!0);t&&s?.faces&&s.faces.length>0&&this.ingestDetectedFaces(s.faces,e.videoWidth,e.videoHeight,o,l,a)}ingestDetectedFaces(e,a,o,l,i,s){const t=Math.max(l/a,i/o),r=(l-a*t)/2,n=(i-o*t)/2,c=d=>this.mirrored?l-(d*a*t+r):d*a*t+r,h=this.mirrored?-1:1;for(const d of e){const p={x:c(d.eyes[0].cx),y:d.eyes[0].cy*o*t+n,r:Math.hypot(d.eyes[0].dx*a,d.eyes[0].dy*o)*t*.65,gx:h*d.eyes[0].gx,gy:d.eyes[0].gy,open:d.eyes[0].open},u={x:c(d.eyes[1].cx),y:d.eyes[1].cy*o*t+n,r:Math.hypot(d.eyes[1].dx*a,d.eyes[1].dy*o)*t*.65,gx:h*d.eyes[1].gx,gy:d.eyes[1].gy,open:d.eyes[1].open},[m,v]=p.x<=u.x?[p,u]:[u,p],y=Math.atan2(v.y-m.y,v.x-m.x),b={x:c(d.mouth.cx),y:d.mouth.cy*o*t+n,w:Math.hypot(d.mouth.dx*a,d.mouth.dy*o)*t,open:Math.max(d.mouth.open,this.audioMouthBoost*.55)},T=d.bbox,R=c(T.x+T.w/2),x=(T.y+T.h/2)*o*t+n,S=T.w*a*t*.5*1.12,k=T.h*o*t*.5*1.18;let M=this.tracks[0];M?(M.seenAt=s,M.tcx=R,M.tcy=x,M.trx=S,M.try_=k,M.troll=y,M.teyes=[{...m},{...v}],M.tmouth={...b}):(M={cx:R,cy:x,rx:S,ry:k,roll:y,eyes:[{...m},{...v}],mouth:{...b},seenAt:s,alpha:1,tcx:R,tcy:x,trx:S,try_:k,troll:y,teyes:[{...m},{...v}],tmouth:{...b}},this.tracks.push(M))}}stepAndEnsureTracks(e,a,o,l){const i=a/1e3;if(!this.tracks.some(n=>a-n.seenAt<650)){const n=Math.sin(i*1.15)*o*.025+Math.cos(i*2.3)*o*.008,c=Math.sin(i*1.7)*l*.016,h=o*.5+n,d=l*.45+c,p=Math.min(o,l)*.21,u=p*1.24,m=Math.sin(i*.95)*.065,v=Math.max(0,Math.sin(i*6.8)*.6+Math.sin(i*11.3)*.4)*(.35+.65*Math.max(0,Math.sin(i*1.6))),y=Math.max(this.audioMouthBoost*.65,v*.42),b=Math.sin(i*.8)*.22,T=Math.cos(i*1.1)*.12,R=p*.41,x=-u*.12,S=p*.21,k={x:h-R,y:d+x,r:S,gx:b,gy:T,open:.3},M={x:h+R,y:d+x,r:S,gx:b,gy:T,open:.3},w={x:h,y:d+u*.42,w:p*.82,open:y};if(this.tracks.length===0)this.tracks.push({cx:h,cy:d,rx:p,ry:u,roll:m,eyes:[k,M],mouth:w,seenAt:a-700,alpha:1,tcx:h,tcy:d,trx:p,try_:u,troll:m,teyes:[k,M],tmouth:w});else{const E=this.tracks[0];E.tcx=h,E.tcy=d,E.trx=p,E.try_=u,E.troll=m,E.teyes=[k,M],E.tmouth=w,E.alpha=1}}const t=1-Math.exp(-e*20),r=1-Math.exp(-e*30);for(const n of this.tracks){n.cx+=(n.tcx-n.cx)*t,n.cy+=(n.tcy-n.cy)*t,n.rx+=(n.trx-n.rx)*t,n.ry+=(n.try_-n.ry)*t,n.roll+=(n.troll-n.roll)*t;for(let h=0;h<2;h++)n.eyes[h].x+=(n.teyes[h].x-n.eyes[h].x)*t,n.eyes[h].y+=(n.teyes[h].y-n.eyes[h].y)*t,n.eyes[h].r+=(n.teyes[h].r-n.eyes[h].r)*t,n.eyes[h].gx+=(n.teyes[h].gx-n.eyes[h].gx)*t,n.eyes[h].gy+=(n.teyes[h].gy-n.eyes[h].gy)*t;n.mouth.x+=(n.tmouth.x-n.mouth.x)*t,n.mouth.y+=(n.tmouth.y-n.mouth.y)*t,n.mouth.w+=(n.tmouth.w-n.mouth.w)*t;const c=Math.max(n.tmouth.open,this.audioMouthBoost*.65);n.mouth.open+=(c-n.mouth.open)*r}}apply(e,a,o,l){const i=a.width,s=a.height;if(!i||!s)return;const t=Math.max(1/120,Math.min(.1,this.lastApply?(l-this.lastApply)/1e3:1/30));this.lastApply=l,o&&this.feedVideoFaces(o,l,i,s),this.stepAndEnsureTracks(t,l,i,s);const r=this.tracks[0],n=l/1e3,c=this.filter==="bats"||this.batSwarm;if(c&&(this.stepBats(t,n,r,i,s),this.drawBatsLayer(e,i,s,n,0,.85)),r)switch(this.filter){case"jackolantern":this.drawJackOLantern(e,r,i,s,n);break;case"ghostface":this.drawGhostFace(e,r,i,s,n);break;case"zombie":this.drawZombieFace(e,r,i,s,n);break;case"werewolf":this.drawWerewolfFace(e,r,i,s,n);break;case"vampire":this.drawVampireFace(e,r,i,s,n);break}c&&this.drawBatsLayer(e,i,s,n,.85,2.5),this.dimLights&&this.drawDimLightsFoundFootage(e,r,i,s,t,n)}drawJackOLantern(e,a,o,l,i){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const s=a.rx*1.18,t=a.ry*.98,r=Math.min(t*.45,a.mouth.open*t*.92),n=.88+.12*Math.sin(i*23)*Math.cos(i*14.7),c=e.createRadialGradient(0,t*.85,s*.1,0,t*1.15,s*1.65);c.addColorStop(0,`rgba(251, 146, 60, ${.42*n})`),c.addColorStop(.5,`rgba(234, 88, 12, ${.18*n})`),c.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=c,e.beginPath(),e.ellipse(0,t*1,s*1.6,t*.9,0,0,Math.PI*2),e.fill(),e.fillStyle="rgba(0, 0, 0, 0.65)",e.beginPath(),e.ellipse(0,t*.08+r*.3,s*1.08,t*1.04+r*.4,0,0,Math.PI*2),e.fill(),e.save(),e.beginPath(),e.moveTo(-s*.16,-t*.86),e.bezierCurveTo(-s*.22,-t*1.24,s*.04,-t*1.38,s*.24,-t*1.28),e.bezierCurveTo(s*.16,-t*1.12,s*.14,-t*.96,s*.18,-t*.85),e.closePath();const h=e.createLinearGradient(-s*.2,-t*1.3,s*.2,-t*.85);h.addColorStop(0,"#3f2e1e"),h.addColorStop(.5,"#293818"),h.addColorStop(1,"#1c1917"),e.fillStyle=h,e.fill(),e.lineWidth=Math.max(2,s*.025),e.strokeStyle="#0c0a09",e.stroke(),e.restore();const d=[{ox:-.74,w:.42,h:.9,shade:-.28},{ox:.74,w:.42,h:.9,shade:-.28},{ox:-.46,w:.46,h:.97,shade:-.12},{ox:.46,w:.46,h:.97,shade:-.12},{ox:-.21,w:.44,h:1.02,shade:.04},{ox:.21,w:.44,h:1.02,shade:.04},{ox:0,w:.46,h:1.04,shade:.14}];for(const x of d){const S=x.ox*s,k=x.w*s,M=x.h*t+r*(1-Math.abs(x.ox)*.65),w=e.createRadialGradient(S-k*.22,-M*.28,k*.08,S,M*.1,Math.max(k,M)*1.15);x.shade>0?(w.addColorStop(0,"#fdba74"),w.addColorStop(.32,"#f97316"),w.addColorStop(.76,"#c2410c"),w.addColorStop(1,"#431407")):x.shade>-.2?(w.addColorStop(0,"#fb923c"),w.addColorStop(.4,"#ea580c"),w.addColorStop(.8,"#9a3412"),w.addColorStop(1,"#3b0f04")):(w.addColorStop(0,"#ea580c"),w.addColorStop(.45,"#b45309"),w.addColorStop(.85,"#7c2d12"),w.addColorStop(1,"#270902")),e.fillStyle=w,e.beginPath(),e.ellipse(S,r*.22,k,M,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,s*.022),e.strokeStyle="rgba(28, 10, 3, 0.72)",e.stroke()}e.fillStyle="rgba(40, 12, 3, 0.18)";for(let x=0;x<9;x++){const S=x/9*Math.PI*2+.4,k=Math.cos(S)*s*.62,M=Math.sin(S)*t*.58;e.beginPath(),e.ellipse(k,M,s*.06,t*.04,S,0,Math.PI*2),e.fill()}const p=(x,S)=>{e.save(),e.translate(0,S),x(),e.fillStyle="#d97706",e.fill(),e.lineWidth=Math.max(2.5,s*.04),e.strokeStyle="#78350f",e.stroke(),e.restore(),e.save(),x(),e.clip();const k=e.createRadialGradient(0,t*.25+Math.sin(i*19)*t*.04,s*.04,0,0,s*.95);k.addColorStop(0,`rgba(255, 255, 240, ${.98*n})`),k.addColorStop(.28,`rgba(253, 224, 71, ${.96*n})`),k.addColorStop(.62,`rgba(249, 115, 22, ${.92*n})`),k.addColorStop(1,"#450a0a"),e.fillStyle=k,e.fillRect(-s,-t,s*2,t*2.5);for(let M=-2;M<=2;M++){const w=M*s*.22+Math.sin(i*14+M*2.1)*s*.05,E=t*(.35+.15*Math.sin(i*21+M)),A=e.createLinearGradient(w,t*.6,w,-E);A.addColorStop(0,"rgba(254, 240, 138, 0.85)"),A.addColorStop(.6,"rgba(249, 115, 22, 0.55)"),A.addColorStop(1,"rgba(239, 68, 68, 0)"),e.fillStyle=A,e.beginPath(),e.ellipse(w,t*.2,s*.12,E,0,0,Math.PI*2),e.fill()}e.restore(),x(),e.lineWidth=Math.max(2,s*.025),e.strokeStyle="#1c0a00",e.stroke()},u=s*.36,m=-t*.16,v=s*.27,y=t*.25;p(()=>{e.beginPath(),e.moveTo(-u-v*.85,m+y*.38),e.lineTo(-u-v*.08,m-y*.82),e.lineTo(-u+v*.78,m+y*.22),e.lineTo(-u+v*.12,m+y*.45),e.closePath()},t*.035),p(()=>{e.beginPath(),e.moveTo(u+v*.85,m+y*.38),e.lineTo(u+v*.08,m-y*.82),e.lineTo(u-v*.78,m+y*.22),e.lineTo(u-v*.12,m+y*.45),e.closePath()},t*.035),p(()=>{e.beginPath(),e.moveTo(0,-t*.02),e.lineTo(-s*.12,t*.19),e.lineTo(s*.12,t*.19),e.closePath()},t*.028);const b=t*.36,T=s*.72,R=t*.13+r*.88;p(()=>{e.beginPath(),e.moveTo(-T,b-t*.12),e.lineTo(-T*.68,b+t*.04),e.lineTo(-T*.52,b-t*.06),e.lineTo(-T*.28,b+t*.08),e.lineTo(-T*.14,b-t*.03),e.lineTo(T*.14,b-t*.03),e.lineTo(T*.28,b+t*.08),e.lineTo(T*.52,b-t*.06),e.lineTo(T*.68,b+t*.04),e.lineTo(T,b-t*.12),e.lineTo(T*.76,b+R*.82),e.lineTo(T*.46,b+R*.48),e.lineTo(T*.32,b+R*.98),e.lineTo(0,b+R*1.05),e.lineTo(-T*.32,b+R*.98),e.lineTo(-T*.46,b+R*.48),e.lineTo(-T*.76,b+R*.82),e.closePath()},-t*.032),e.restore()}drawGhostFace(e,a,o,l,i){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const s=a.rx*1.08,t=a.ry*1.15,r=Math.min(t*.68,a.mouth.open*t*1.25),n=e.createRadialGradient(0,-t*.1,s*.6,0,t*.2,s*1.65);n.addColorStop(0,"#090a0f"),n.addColorStop(.7,"#030407"),n.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=n,e.beginPath(),e.moveTo(0,-t*1.32),e.bezierCurveTo(s*1.45,-t*1.15,s*1.55,t*.55,s*1.15,t*1.45+r),e.lineTo(-s*1.15,t*1.45+r),e.bezierCurveTo(-s*1.55,t*.55,-s*1.45,-t*1.15,0,-t*1.32),e.closePath(),e.fill(),e.beginPath(),e.moveTo(0,-t*.94),e.bezierCurveTo(s*.88,-t*.92,s*.92,-t*.18,s*.68,t*.18),e.bezierCurveTo(s*.42,t*.54,s*.44,t*.96+r,0,t*1.06+r),e.bezierCurveTo(-s*.44,t*.96+r,-s*.42,t*.54,-s*.68,t*.18),e.bezierCurveTo(-s*.92,-t*.18,-s*.88,-t*.92,0,-t*.94),e.closePath();const c=e.createRadialGradient(-s*.18,-t*.25,s*.1,0,t*.2,t*1.3);c.addColorStop(0,"#f8fafc"),c.addColorStop(.55,"#e2e8f0"),c.addColorStop(.85,"#94a3b8"),c.addColorStop(1,"#334155"),e.fillStyle=c,e.fill(),e.lineWidth=Math.max(2,s*.03),e.strokeStyle="#0f172a",e.stroke(),e.fillStyle="rgba(15, 23, 42, 0.22)",e.beginPath(),e.ellipse(-s*.46,t*.24,s*.14,t*.28,.25,0,Math.PI*2),e.ellipse(s*.46,t*.24,s*.14,t*.28,-.25,0,Math.PI*2),e.fill();for(const v of[-1,1]){e.save(),e.beginPath(),e.moveTo(v*s*.14,-t*.22),e.bezierCurveTo(v*s*.42,-t*.36,v*s*.68,-t*.12,v*s*.54,t*.14),e.bezierCurveTo(v*s*.38,t*.32,v*s*.12,t*.08,v*s*.14,-t*.22),e.closePath(),e.fillStyle="#050508",e.fill();const y=v<0?0:1,b=a.eyes[y].gx*s*.08,T=a.eyes[y].gy*t*.08;e.fillStyle="rgba(165, 243, 252, 0.45)",e.beginPath(),e.arc(v*s*.36+b,-t*.04+T,Math.max(1.5,s*.025),0,Math.PI*2),e.fill(),e.restore()}e.fillStyle="#090d16",e.beginPath(),e.ellipse(-s*.055,t*.16,s*.032,t*.065,.2,0,Math.PI*2),e.ellipse(s*.055,t*.16,s*.032,t*.065,-.2,0,Math.PI*2),e.fill();const h=t*.34,d=t*.72+r*.95,p=(h+d)*.5,u=s*(.19+a.mouth.open*.08),m=Math.max(t*.16,(d-h)*.52);if(e.beginPath(),e.ellipse(0,p,u,m,0,0,Math.PI*2),e.fillStyle="#030407",e.fill(),e.lineWidth=Math.max(2,s*.025),e.strokeStyle="rgba(51, 65, 85, 0.7)",e.stroke(),a.mouth.open>.08)for(let v=0;v<4;v++){const y=p+Math.sin(i*4+v*1.7)*m*.6,b=Math.cos(i*3.2+v)*u*1.4,T=e.createRadialGradient(b,y,2,b,y,s*.28);T.addColorStop(0,`rgba(186, 230, 253, ${Math.min(.32,a.mouth.open*.5)})`),T.addColorStop(1,"rgba(186, 230, 253, 0)"),e.fillStyle=T,e.beginPath(),e.arc(b,y,s*.28,0,Math.PI*2),e.fill()}e.restore()}drawZombieFace(e,a,o,l,i){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const s=a.rx,t=a.ry;e.save();const r=e.createRadialGradient(0,-t*.1,s*.2,0,0,Math.max(s,t)*1.15);r.addColorStop(0,"rgba(132, 155, 118, 0.52)"),r.addColorStop(.65,"rgba(78, 95, 68, 0.62)"),r.addColorStop(.92,"rgba(35, 42, 30, 0.45)"),r.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=r,e.beginPath(),e.ellipse(0,0,s*1.06,t*1.08,0,0,Math.PI*2),e.fill(),e.restore();for(const u of[-1,1]){const m=e.createRadialGradient(u*s*.58,t*.14,s*.04,u*s*.58,t*.14,s*.34);m.addColorStop(0,"rgba(42, 18, 21, 0.72)"),m.addColorStop(.6,"rgba(63, 29, 36, 0.38)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.beginPath(),e.arc(u*s*.58,t*.14,s*.34,0,Math.PI*2),e.fill()}e.strokeStyle="rgba(58, 12, 24, 0.68)",e.lineCap="round";const n=[{x:-s*.72,y:-t*.35,dx:.22,dy:.18},{x:s*.72,y:-t*.35,dx:-.22,dy:.18},{x:-s*.54,y:t*.18,dx:.18,dy:-.14},{x:s*.54,y:t*.18,dx:-.18,dy:-.14}];for(const u of n){e.lineWidth=Math.max(1.4,s*.018),e.beginPath(),e.moveTo(u.x,u.y);const m=u.x+u.dx*s,v=u.y+u.dy*t;e.quadraticCurveTo(u.x+u.dx*s*.5,u.y,m,v),e.stroke(),e.lineWidth=Math.max(1,s*.011),e.beginPath(),e.moveTo(m,v),e.lineTo(m+u.dx*s*.55,v-u.dy*t*.6),e.moveTo(m,v),e.lineTo(m+u.dx*s*.45,v+u.dy*t*.75),e.stroke()}e.save(),e.beginPath(),e.moveTo(-s*.48,-t*.56),e.quadraticCurveTo(-s*.15,-t*.46,s*.18,-t*.62),e.lineWidth=Math.max(3.5,s*.042),e.strokeStyle="#450a0a",e.stroke(),e.lineWidth=Math.max(1.5,s*.018),e.strokeStyle="#991b1b",e.stroke(),e.strokeStyle="#1c1917",e.lineWidth=Math.max(1.2,s*.014);for(let u=.15;u<=.85;u+=.18){const m=-s*.48+u*s*.66,v=-t*.56+Math.sin(u*Math.PI)*t*.05;e.beginPath(),e.moveTo(m-s*.02,v-t*.04),e.lineTo(m+s*.02,v+t*.04),e.stroke()}e.restore(),e.restore();for(const u of a.eyes){e.save();const m=e.createRadialGradient(u.x,u.y,u.r*.3,u.x,u.y,u.r*1.65);m.addColorStop(0,"rgba(30, 10, 18, 0.85)"),m.addColorStop(.65,"rgba(68, 18, 30, 0.55)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.beginPath(),e.arc(u.x,u.y,u.r*1.65,0,Math.PI*2),e.fill(),e.fillStyle="#d9f99d",e.beginPath(),e.ellipse(u.x,u.y,u.r*.92,u.r*.64,a.roll,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,u.r*.12),e.strokeStyle="#450a0a",e.stroke();const v=u.x+u.gx*u.r*.38,y=u.y+u.gy*u.r*.32;e.fillStyle="#94a3b8",e.beginPath(),e.arc(v,y,u.r*.42,0,Math.PI*2),e.fill(),e.fillStyle="#1e293b",e.beginPath(),e.arc(v,y,u.r*.16,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const c=a.mouth.w*1.25,h=Math.max(c*.24,a.mouth.open*c*.85);e.fillStyle="#2a080c",e.beginPath(),e.ellipse(0,h*.15,c*.62,h*.72,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(2,c*.05),e.strokeStyle="#450a0a",e.stroke();const d=6,p=c*.88/d;for(let u=0;u<d;u++){const m=-c*.44+u*p+p*.1,v=u*37%5*.03*c;e.fillStyle=u%2===0?"#fef08a":"#d6d3d1",e.strokeStyle="#451a03",e.lineWidth=1.2,e.beginPath(),e.roundRect(m,-h*.38,p*.78,h*.36+v,2),e.fill(),e.stroke(),e.beginPath(),e.roundRect(m,h*.12,p*.78,h*.36-v*.5,2),e.fill(),e.stroke()}e.restore()}drawWerewolfFace(e,a,o,l,i){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const s=a.rx*1.15,t=a.ry*1.12,r=Math.sin(i*5.2)*.05;for(const m of[-1,1])e.save(),e.translate(m*s*.68,-t*.72),e.rotate(m*(.28+r)),e.beginPath(),e.moveTo(-s*.22,t*.18),e.lineTo(0,-t*.56),e.lineTo(s*.22,t*.18),e.closePath(),e.fillStyle="#27201c",e.fill(),e.lineWidth=Math.max(2,s*.025),e.strokeStyle="#0c0a09",e.stroke(),e.beginPath(),e.moveTo(-s*.11,t*.12),e.lineTo(0,-t*.36),e.lineTo(s*.11,t*.12),e.closePath(),e.fillStyle="#573b32",e.fill(),e.restore();const n=38;e.beginPath();for(let m=0;m<=n;m++){const v=m/n*Math.PI*2,y=Math.sin(v)>-.25,b=(m%2===0?1.24:1.04)*(y?1.12:.96),T=Math.cos(v)*s*b,R=Math.sin(v)*t*(m%2===0?1.12:.96);m===0?e.moveTo(T,R):e.lineTo(T,R)}e.closePath();const c=e.createRadialGradient(0,0,s*.45,0,0,s*1.35);c.addColorStop(0,"rgba(41, 32, 26, 0.22)"),c.addColorStop(.55,"rgba(48, 37, 29, 0.86)"),c.addColorStop(.85,"rgba(28, 22, 18, 0.96)"),c.addColorStop(1,"#0c0a09"),e.fillStyle=c,e.fill(),e.strokeStyle="rgba(168, 142, 118, 0.45)",e.lineWidth=Math.max(1.5,s*.016);for(let m=0;m<28;m++){const v=m/28*Math.PI*2,y=.72,b=1.08+m%3*.06;e.beginPath(),e.moveTo(Math.cos(v)*s*y,Math.sin(v)*t*y),e.lineTo(Math.cos(v)*s*b,Math.sin(v)*t*b),e.stroke()}const h=e.createLinearGradient(0,-t*.22,0,t*.28);h.addColorStop(0,"rgba(28, 22, 18, 0.75)"),h.addColorStop(1,"rgba(18, 14, 12, 0.92)"),e.fillStyle=h,e.beginPath(),e.moveTo(-s*.22,-t*.18),e.lineTo(s*.22,-t*.18),e.lineTo(s*.28,t*.22),e.lineTo(-s*.28,t*.22),e.closePath(),e.fill(),e.fillStyle="#09090b",e.beginPath(),e.moveTo(-s*.18,t*.08),e.quadraticCurveTo(0,t*.02,s*.18,t*.08),e.lineTo(0,t*.26),e.closePath(),e.fill(),e.fillStyle="rgba(255,255,255,0.45)",e.beginPath(),e.ellipse(-s*.05,t*.11,s*.045,t*.02,-.2,0,Math.PI*2),e.fill(),e.restore();for(const m of a.eyes){e.save(),e.fillStyle="#09090b",e.beginPath(),e.ellipse(m.x,m.y,m.r*.98,m.r*.62,a.roll,0,Math.PI*2),e.fill();const v=m.x+m.gx*m.r*.35,y=m.y+m.gy*m.r*.3,b=e.createRadialGradient(v,y,m.r*.05,v,y,m.r*.56);b.addColorStop(0,"#fef08a"),b.addColorStop(.55,"#f59e0b"),b.addColorStop(1,"#b45309"),e.fillStyle=b,e.beginPath(),e.arc(v,y,m.r*.52,0,Math.PI*2),e.fill(),e.fillStyle="#000000",e.beginPath(),e.ellipse(v,y,m.r*.14,m.r*.42,a.roll,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255, 255, 255, 0.9)",e.beginPath(),e.arc(v-m.r*.15,y-m.r*.15,m.r*.11,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const d=a.mouth.w*1.32,p=Math.max(d*.18,a.mouth.open*d*.92);e.fillStyle="#180508",e.beginPath(),e.ellipse(0,p*.2,d*.64,p*.65,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(3,d*.06),e.strokeStyle="#09090b",e.stroke();const u=(m,v,y,b,T)=>{e.beginPath(),e.moveTo(m-y*.5,v),e.quadraticCurveTo(m,v+(T?-b:b),m+y*.1,v+(T?-b:b)),e.quadraticCurveTo(m+y*.35,v,m+y*.5,v),e.closePath();const R=e.createLinearGradient(m,v,m,v+(T?-b:b));R.addColorStop(0,"#fde68a"),R.addColorStop(.4,"#fafaf9"),R.addColorStop(1,"#e7e5e4"),e.fillStyle=R,e.fill(),e.lineWidth=1.4,e.strokeStyle="#292524",e.stroke()};u(-d*.38,-p*.25,d*.15,d*.34,!1),u(d*.38,-p*.25,d*.15,d*.34,!1);for(let m=-2;m<=2;m++)u(m*d*.1,-p*.28,d*.08,d*.16,!1);u(-d*.31,p*.55,d*.13,d*.28,!0),u(d*.31,p*.55,d*.13,d*.28,!0),e.restore()}drawVampireFace(e,a,o,l,i){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const s=a.rx,t=a.ry;e.save(),e.beginPath(),e.moveTo(-s*1.38,t*.45),e.lineTo(-s*.95,-t*.35),e.lineTo(-s*.55,t*1.15),e.lineTo(s*.55,t*1.15),e.lineTo(s*.95,-t*.35),e.lineTo(s*1.38,t*.45),e.closePath();const r=e.createLinearGradient(0,-t*.35,0,t*1.15);r.addColorStop(0,"#7f1d1d"),r.addColorStop(.5,"#450a0a"),r.addColorStop(1,"#09090b"),e.fillStyle=r,e.fill(),e.lineWidth=2,e.strokeStyle="#dc2626",e.stroke(),e.restore();for(const p of[-1,1])e.beginPath(),e.moveTo(p*s*.94,-t*.08),e.lineTo(p*s*1.26,-t*.34),e.lineTo(p*s*.98,t*.22),e.closePath(),e.fillStyle="#e2e8f0",e.fill(),e.lineWidth=1.5,e.strokeStyle="#475569",e.stroke();const n=e.createRadialGradient(0,-t*.12,s*.15,0,0,Math.max(s,t)*1.05);n.addColorStop(0,"rgba(241, 245, 249, 0.38)"),n.addColorStop(.65,"rgba(203, 213, 225, 0.32)"),n.addColorStop(.92,"rgba(30, 27, 75, 0.35)"),n.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=n,e.beginPath(),e.ellipse(0,0,s*1.02,t*1.04,0,0,Math.PI*2),e.fill(),e.fillStyle="#09090b",e.beginPath(),e.moveTo(-s*.65,-t*.78),e.quadraticCurveTo(-s*.2,-t*.82,0,-t*.62),e.quadraticCurveTo(s*.2,-t*.82,s*.65,-t*.78),e.quadraticCurveTo(0,-t*1.05,-s*.65,-t*.78),e.fill(),e.restore();for(let p=0;p<2;p++){const u=a.eyes[p],m=p===0?-1:1;e.save();const v=e.createRadialGradient(u.x,u.y,u.r*.2,u.x,u.y,u.r*1.6);v.addColorStop(0,"rgba(76, 5, 25, 0.78)"),v.addColorStop(.6,"rgba(49, 16, 47, 0.45)"),v.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=v,e.beginPath(),e.arc(u.x,u.y,u.r*1.6,0,Math.PI*2),e.fill(),e.strokeStyle="#09090b",e.lineWidth=Math.max(2.5,u.r*.22),e.lineCap="round",e.beginPath(),e.moveTo(u.x-m*u.r*.95,u.y-u.r*.65),e.quadraticCurveTo(u.x+m*u.r*.2,u.y-u.r*1.25,u.x+m*u.r*1.1,u.y-u.r*.55),e.stroke(),e.fillStyle="#f8fafc",e.beginPath(),e.ellipse(u.x,u.y,u.r*.9,u.r*.56,a.roll,0,Math.PI*2),e.fill();const y=u.x+u.gx*u.r*.35,b=u.y+u.gy*u.r*.28,T=e.createRadialGradient(y,b,u.r*.05,y,b,u.r*.48);T.addColorStop(0,"#fca5a5"),T.addColorStop(.45,"#ef4444"),T.addColorStop(1,"#7f1d1d"),e.fillStyle=T,e.beginPath(),e.arc(y,b,u.r*.46,0,Math.PI*2),e.fill(),e.fillStyle="#050505",e.beginPath(),e.ellipse(y,b,u.r*.11,u.r*.38,a.roll,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255, 255, 255, 0.92)",e.beginPath(),e.arc(y-u.r*.14,b-u.r*.14,u.r*.1,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const c=a.mouth.w*1.12,h=Math.max(c*.14,a.mouth.open*c*.72);e.fillStyle="#280509",e.beginPath(),e.ellipse(0,h*.1,c*.54,h*.58,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(2.5,c*.06),e.strokeStyle="#991b1b",e.stroke();const d=c*(.24+Math.min(.18,a.mouth.open*.3));for(const p of[-1,1]){const u=p*c*.29,m=-h*.28;e.beginPath(),e.moveTo(u-c*.055,m),e.lineTo(u,m+d),e.lineTo(u+c*.055,m),e.closePath(),e.fillStyle="#ffffff",e.fill(),e.lineWidth=1.2,e.strokeStyle="#cbd5e1",e.stroke()}e.fillStyle="#dc2626",e.beginPath(),e.moveTo(c*.34,h*.15),e.quadraticCurveTo(c*.37,h*.45,c*.35,h*.65),e.arc(c*.35,h*.68,c*.032,0,Math.PI*2),e.fill(),e.restore()}stepBats(e,a,o,l,i){const s=o?o.cx/l:.5,t=o?(o.cy-o.ry*.35)/i:.38;for(let r=0;r<this.bats.length;r++){const n=this.bats[r];n.wingPhase+=n.wingSpeed*e,r%3===0?(n.orbitAngle+=(.9+r%4*.35)*e*(r%2===0?1:-1),n.x=s+Math.cos(n.orbitAngle)*n.orbitRadius*1.4,n.y=t+Math.sin(n.orbitAngle*2)*n.orbitRadius*.65):(n.x+=n.vx*e,n.y+=(n.vy+Math.sin(a*3.2+r)*.06)*e,n.x<-.15&&(n.x=1.15),n.x>1.15&&(n.x=-.15),n.y<.04&&(n.vy=Math.abs(n.vy)),n.y>.92&&(n.vy=-Math.abs(n.vy)))}}drawBatsLayer(e,a,o,l,i,s){const t=Math.min(a,o)*.042;for(const r of this.bats){if(r.z<i||r.z>=s)continue;const n=r.x*a,c=r.y*o,h=t*r.z,d=Math.sin(r.wingPhase),p=Math.atan2(r.vy,r.vx||.1)*.25;e.save(),e.translate(n,c),e.rotate(p),e.globalAlpha=Math.min(.96,.45+r.z*.38),e.fillStyle="#09090d",e.strokeStyle="#27272a",e.lineWidth=Math.max(1,h*.04);for(const u of[-1,1]){const m=u*h*1.75,v=-d*h*.95,y=u*h*.85,b=-d*h*.45-h*.35;e.beginPath(),e.moveTo(0,-h*.12),e.quadraticCurveTo(y,b,m,v),e.quadraticCurveTo(u*h*1.25,v+h*.48,u*h*.92,v*.5+h*.32),e.quadraticCurveTo(u*h*.55,h*.42,u*h*.15,h*.25),e.closePath(),e.fill(),e.stroke()}e.beginPath(),e.ellipse(0,0,h*.22,h*.34,0,0,Math.PI*2),e.fill(),e.beginPath(),e.moveTo(-h*.16,-h*.24),e.lineTo(-h*.24,-h*.52),e.lineTo(-h*.04,-h*.3),e.moveTo(h*.16,-h*.24),e.lineTo(h*.24,-h*.52),e.lineTo(h*.04,-h*.3),e.fill(),e.fillStyle=r.eyeColor,e.beginPath(),e.arc(-h*.07,-h*.18,Math.max(1.2,h*.065),0,Math.PI*2),e.arc(h*.07,-h*.18,Math.max(1.2,h*.065),0,Math.PI*2),e.fill(),e.restore()}}drawDimLightsFoundFootage(e,a,o,l,i,s){const t=a?a.cx/o:.5,r=a?a.cy/l:.46,n=1-Math.exp(-i*8.5);this.beamX+=(t-this.beamX)*n,this.beamY+=(r-this.beamY)*n;const c=(Math.sin(s*7.3)*.008+Math.cos(s*19.1)*.003)*o,h=(Math.cos(s*6.1)*.008+Math.sin(s*17.7)*.003)*l,d=this.beamX*o+c,p=this.beamY*l+h,u=Math.min(o,l)*.44;e.save(),e.globalCompositeOperation="screen";const m=e.createRadialGradient(d,p,u*.04,d,p,u*.85);m.addColorStop(0,"rgba(220, 245, 235, 0.34)"),m.addColorStop(.38,"rgba(167, 243, 208, 0.14)"),m.addColorStop(.75,"rgba(20, 83, 45, 0.04)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.fillRect(0,0,o,l),e.globalCompositeOperation="source-over";const v=e.createRadialGradient(d,p,u*.18,d,p,u*1.45);v.addColorStop(0,"rgba(0, 0, 0, 0.0)"),v.addColorStop(.42,"rgba(2, 8, 6, 0.38)"),v.addColorStop(.72,"rgba(2, 6, 5, 0.82)"),v.addColorStop(1,"rgba(1, 3, 3, 0.96)"),e.fillStyle=v,e.fillRect(0,0,o,l);for(const k of this.dust){k.x+=k.vx*i,k.y+=k.vy*i,k.y<0&&(k.y=1),k.x<0&&(k.x=1),k.x>1&&(k.x=0);const M=k.x*o,w=k.y*l,E=Math.hypot(M-d,w-p);if(E<u*1.05){const A=Math.max(0,1-E/(u*1.05));e.fillStyle=`rgba(215, 250, 235, ${k.alpha*A*.85})`,e.beginPath(),e.arc(M,w,k.size,0,Math.PI*2),e.fill()}}e.fillStyle="rgba(16, 185, 129, 0.035)";for(let k=0;k<l;k+=4)e.fillRect(0,k,o,1);const y=Math.max(12,o*.035),b=Math.max(14,o*.04);e.strokeStyle="rgba(226, 232, 240, 0.48)",e.lineWidth=1.8,e.beginPath(),e.moveTo(y,y+b),e.lineTo(y,y),e.lineTo(y+b,y),e.moveTo(o-y-b,y),e.lineTo(o-y,y),e.lineTo(o-y,y+b),e.moveTo(y,l-y-b),e.lineTo(y,l-y),e.lineTo(y+b,l-y),e.moveTo(o-y-b,l-y),e.lineTo(o-y,l-y),e.lineTo(o-y,l-y-b),e.stroke();const T=Math.max(10,Math.round(o*.024));e.font=`700 ${T}px "Courier New", monospace`,Math.floor(s*2)%2===0&&(e.fillStyle="#ef4444",e.beginPath(),e.arc(y+T*.8,y+T*1.15,T*.36,0,Math.PI*2),e.fill()),e.fillStyle="rgba(248, 250, 252, 0.82)",e.fillText("REC  NIGHT-CAM // IR BEAM ON",y+T*1.5,y+T*1.5);const R=String(Math.floor(s/60)%60).padStart(2,"0"),x=String(Math.floor(s)%60).padStart(2,"0"),S=String(Math.floor(s%1*24)).padStart(2,"0");e.fillStyle="rgba(167, 243, 208, 0.78)",e.fillText(`OCT 31  02:${R}:${x}:${S}  ISO 12800`,y+T*.5,l-y-T*.5),e.restore()}dispose(){this.worker.dispose();try{this.sync?.dispose()}catch{}this.sync=null,this.tracks=[]}}const J=new Set(["jackolantern","ghostface","zombie","werewolf","vampire","bats","dimlights"]),_t=[{id:"none",label:"Off",icon:"🚫",blurb:"No lens"},{id:"jackolantern",label:"Jack-o'-Lantern",icon:"🎃",blurb:"Carved 3D pumpkin head + talking fire jaw"},{id:"ghostface",label:"Ghost Face",icon:"👻",blurb:"Shrouded phantom scream visage"},{id:"zombie",label:"Zombie",icon:"🧟",blurb:"Necrotic undead veins, cataract eyes & jaw"},{id:"werewolf",label:"Werewolf",icon:"🐺",blurb:"Lupine fur, glowing amber eyes & fangs"},{id:"vampire",label:"Vampire",icon:"🧛",blurb:"Pale Nosferatu skin, crimson eyes & fangs"},{id:"bats",label:"Bat Swarm",icon:"🦇",blurb:"3D nocturnal bats circling your head"},{id:"dimlights",label:"Dim the Lights",icon:"🔦",blurb:"Found-footage night cam & flashlight beam"},{id:"googly",label:"Googly eyes",icon:"👀",blurb:"Wobbly plastic eyes"},{id:"bigface",label:"Big eyes & mouth",icon:"🤪",blurb:"Faces only — goofy caricature"},{id:"cardboard",label:"South Park",icon:"✂️",blurb:"Jointed paper cut-out puppet of you"},{id:"comic",label:"Comic book",icon:"💥",blurb:"Ink, Ben-Day dots, speed lines"},{id:"matrix",label:"The Matrix",icon:"🟩",blurb:"The world rebuilt from falling code"},{id:"colorize",label:"Colorize",icon:"🎨",blurb:"Believable colour for black & white film"},{id:"silent",label:"Silent film",icon:"🎩",blurb:"1910s hand-cranked nitrate"},{id:"grindhouse",label:"Grindhouse",icon:"🎞️",blurb:"Burns, splices, reel changes"},{id:"vhs",label:"VHS camcorder",icon:"📼",blurb:"80s/90s home tape + date stamp"},{id:"foundfootage",label:"Found footage",icon:"🎥",blurb:"Shaky cam that reacts to you"},{id:"pixel",label:"Pixel art",icon:"👾",blurb:"Sprite palette, depth planes"},{id:"ascii",label:"ASCII",icon:"🔤",blurb:"Live terminal art, traced edges"},{id:"night",label:"Night vision",icon:"🌙",blurb:"Goggle phosphor + grain"},{id:"heat",label:"Heat map",icon:"🔥",blurb:"Thermal camera"},{id:"aura",label:"Aura",icon:"🔮",blurb:"Emotion glow + orbs to collect"}],Mt={matrix:He,comic:Ye,southpark:$e,bigface:Oe,night:ze,heat:We,aura:qe,silent:Ke,grindhouse:Je,vhs:Qe,found:Ze,pixel:je,ascii:Ve,colorize:at,colorizeA:et},St=["uTex","uGlyph","uMask","uRes","uT","uCell","uBoil","uHasMask","uMapA","uMapB","uBulge","uN","uAuraA","uAuraB","uAuraAmt","uSeed","uEvt","uReel","uCam","uVel","uFocus","uExpo","uGlitch","uDepth","uHasDepth","uPlate","uHasPlate","uMotion","uPal","uPalN","uGrid","uPrev","uCut","uStock","uFace","uLip","uNF","uChroma","uCRes","uAmt","uSeg","uMatPal","uHasSeg","uSegRect","uSegOff","uSegTrust","uWard","uLook","uGrade"],Et=["southpark","matrix","comic","night","heat","aura","silent","grindhouse","vhs","found","pixel","ascii","colorize"],Rt=["matrix","comic","southpark","pixel","ascii"],Q=new Set(["matrix","comic","pixel","ascii","colorize"]),me=new Set(["cardboard","comic","matrix","heat","aura","pixel","ascii","colorize"]),pe={panchromatic:[.2126,.7152,.0722],orthochromatic:[.06,.5,.44]},Me="plajah.lens.filmStock";let V=(()=>{try{return localStorage.getItem(Me)==="orthochromatic"?"orthochromatic":"panchromatic"}catch{return"panchromatic"}})();function It(){return V}function Dt(f){V=f;try{localStorage.setItem(Me,f)}catch{}}const At={cardboard:12,silent:16,grindhouse:24},ve=["0d0b14","241a2e","3b2a45","5c3c55","8a2f3c","c4423f","e8784a","f5b06a","f9dc8a","fff6d6","2c4a2e","3f7a3a","6aab45","a8d35f","1f4f5a","2f8a8a","56c4b5","a7ecd9","1a2a5c","2e4fa3","4f86d9","8fc0f2","4a2a6e","7a46a8","b47ed6","4a2f22","7a4b32","b07a52","dba980","f2d2b3","6e6a78","a9a4b2"],Pt=[" ",".","`",":","-","=","+","*","o","#","%","@","|","_","/","\\"],W=()=>typeof navigator<"u"&&!!navigator.gpu,Lt=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],F=()=>typeof navigator<"u"&&/Android/i.test(navigator.userAgent);function j(f,e,a,o,l){const i=l==="cover"?Math.max(f/a,e/o):Math.min(f/a,e/o);return{s:i,ox:(f-a*i)/2,oy:(e-o*i)/2}}const ge=(f,e,a,o=0,l=0)=>({x:f,y:e,r:a,tx:f,ty:e,tr:a,vx:0,vy:0,ax:0,ay:0,px:0,py:.5,pvx:0,pvy:0,gx:o,gy:l,tgx:o,tgy:l,o:.3,to:.3}),Se=.44,Z=1-Se,Ct=26,ye=.55;class Gt{constructor(e={}){this.lens="none",this.note="",this.glc=document.createElement("canvas"),this.gl=null,this.progs={},this.quad=null,this.srcTex=null,this.maskTex=null,this.glyphTex=null,this.maskStamp=-1,this.tainted=!1,this.worker=new ee,this.sync=null,this.faceBlend=!1,this.emotion=new Ne,this.orbs=new Be,this.auraState=this.emotion.get(),this.feed=new Te,this.faceState="idle",this.lastSend=-1e9,this.lastTs=-1,this.lastSync=-1e9,this.tracks=[],this.lastApply=0,this.matte=new Ge,this.hold=document.createElement("canvas"),this.holdAt=0,this.holdGap=83,this.frameNo=0,this.motion=new ft,this.pointer=new mt,this.depth=new pt,this.sam=new vt,this.depthTex=null,this.depthStamp=-1,this.plateTex=null,this.palTex=null,this.asciiTex=null,this.noPersonSince=0,this.personSeen=!1,this.samStamp=-1,this.plate=document.createElement("canvas"),this.plateTmp=document.createElement("canvas"),this.plateAlpha=document.createElement("canvas"),this.plateStamp=-1,this.plateReady=!1,this.pose=null,this.poseState="idle",this.poseTs=0,this.lastPose=null,this.colours={skin:"rgb(242,206,170)",hair:"rgb(90,60,40)",shirt:"rgb(60,110,200)",pants:"rgb(60,70,120)",glove:"rgb(200,40,40)"},this.coloursAt=0,this.swatch=document.createElement("canvas"),this.startedAt=0,this.freeze=document.createElement("canvas"),this.evt={type:0,start:0,dur:0,seed:0},this.nextEvtAt=0,this.reel=[.3,.5,.3,1],this.vhsYear=1994,this.track={amt:0,pos:.8,until:0,next:0},this.rig={x:0,y:0,r:0,z:1.12,vx:0,vy:0,vr:0,vz:0,px:0,py:0,panic:0,focus:0,expo:1,glitch:0,punch:0},this.cz=null,this.stock=V,this.seg=new ht,this.segTex=null,this.matPalTex=null,this.matPalStamp=-1,this.colorScript=new ut,this.lookahead=null,this.laShot=-1,this.driftKey=null,this.driftAt=0,this.drift={dx:0,dy:0,agree:1},this.segObj=null,this.gradeOverride=null,this.filmTime=null,this.halloweenEngine=null,this.auraA=[.48,.36,1],this.auraB=[.18,.9,.84],this.auraAmt=.3,this.presenceStamp=-1,this.freezeAt=-1,this.frameAspect=9/16,this.models=e.models!==!1,this.segment=e.segment??this.models,this.initGL()}setColorScript(e){this.colorScript.set(e),this.cz&&(this.cz.fresh=!0),e&&this.segment&&W()&&!F()&&!this.lookahead&&this.seg.setTier("remaster")}setLookahead(e){this.lookahead=e,this.laShot=-1,this.driftKey=null,this.seg.setTier(e?"live":this.colorScript.get()&&W()&&!F()?"remaster":"live")}setColorGrade(e){this.gradeOverride=e}setFilmTime(e){this.filmTime=e}getLens(){return this.lens}getStatus(){if(this.lens==="none"||J.has(this.lens))return"";if(this.tainted&&this.lens!=="googly")return"this video blocks filters (cross-origin)";if(this.lens!=="googly"&&!this.gl)return"GPU filters unavailable on this device";if(this.lens==="googly"||this.lens==="cardboard"||this.lens==="bigface"||this.lens==="aura"){if(this.faceState==="loading")return"loading face tracker…";if(this.faceState==="failed")return"face tracker unavailable on this device";if(this.tracks.length===0)return"looking for a face…"}if(me.has(this.lens)&&this.lens!=="heat"&&this.lens!=="aura"&&this.matte.state==="loading")return"loading cut-out model…";if(Q.has(this.lens)&&this.depth.state()==="loading")return"loading depth model…";if(this.lens==="colorize"&&this.lookahead){const e=this.lookahead.status();if(e)return e}return this.lens==="cardboard"&&this.poseState==="loading"?"loading body tracker…":this.note}setLens(e){if(e!==this.lens){if(this.lens=e,this.note="",J.has(e)){this.halloweenEngine||(this.halloweenEngine=new de),e==="dimlights"?(this.halloweenEngine.setFilter("none"),this.halloweenEngine.setDimLights(!0)):(this.halloweenEngine.setDimLights(!1),this.halloweenEngine.setFilter(e));return}this.models&&(e==="googly"||e==="cardboard"||e==="bigface"||e==="aura"||e==="colorize")&&this.startFace(e==="aura"),this.models&&me.has(e)&&this.matte.init(),this.models&&Q.has(e)&&W()&&!F()&&this.depth.init(),this.segment&&e==="colorize"&&W()&&!F()&&this.seg.init(),this.models&&e==="cardboard"&&this.startPose(),e==="foundfootage"?this.pointer.start():this.pointer.stop(),e!=="googly"&&e!=="cardboard"&&e!=="bigface"&&e!=="aura"&&e!=="colorize"&&(this.tracks=[]),this.cz&&(this.cz.fresh=!0),e!=="aura"&&this.orbs.reset(),this.holdAt=0,this.frameNo=0,this.startedAt=0,this.evt.type=0,this.nextEvtAt=0,this.plateReady=!1,this.plateStamp=-1,this.vhsYear=1986+Math.floor(Math.random()*12),this.rig={x:0,y:0,r:0,z:1.12,vx:0,vy:0,vr:0,vz:0,px:0,py:0,panic:0,focus:.6,expo:1,glitch:0,punch:0}}}initGL(){try{const e=this.glc.getContext("webgl2",{alpha:!1,preserveDrawingBuffer:!1,premultipliedAlpha:!1,antialias:!1});if(!e)throw new Error("no webgl2");this.glc.addEventListener("webglcontextlost",l=>{l.preventDefault(),this.gl=null,this.progs={},this.cz=null,this.segTex=null,this.matPalTex=null},!1),this.glc.addEventListener("webglcontextrestored",()=>{this.initGL()},!1);const a=e.createBuffer();this.quad=a,e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);const o=l=>{const i=e.createTexture();return e.bindTexture(e.TEXTURE_2D,i),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,l),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),i};this.srcTex=o(e.LINEAR),this.maskTex=o(e.LINEAR),this.maskStamp=-1,e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,e.R8,1,1,0,e.RED,e.UNSIGNED_BYTE,new Uint8Array([0])),e.pixelStorei(e.UNPACK_ALIGNMENT,4),this.depthTex=o(e.LINEAR),this.depthStamp=-1,e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([128,128,128,255])),this.plateTex=o(e.LINEAR_MIPMAP_LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.generateMipmap(e.TEXTURE_2D),this.glyphTex=null,this.palTex=null,this.asciiTex=null,this.gl=e}catch(e){console.warn("[lens] WebGL2 unavailable — shader lenses pass through:",e),this.gl=null}}program(e){const a=this.gl;if(!a)return null;const o=this.progs[e];if(o)return o;try{const l=a.createShader(a.VERTEX_SHADER);a.shaderSource(l,Xe),a.compileShader(l);const i=a.createShader(a.FRAGMENT_SHADER);if(a.shaderSource(i,Mt[e]),a.compileShader(i),!a.getShaderParameter(i,a.COMPILE_STATUS))throw new Error(a.getShaderInfoLog(i)||"fragment shader");const s=a.createProgram();if(a.attachShader(s,l),a.attachShader(s,i),a.bindAttribLocation(s,0,"p"),a.linkProgram(s),!a.getProgramParameter(s,a.LINK_STATUS))throw new Error(a.getProgramInfoLog(s)||"link");const t={};for(const r of St)t[r]=a.getUniformLocation(s,r);return this.progs[e]={prog:s,u:t}}catch(l){return console.warn(`[lens] ${e} shader failed:`,l),this.gl=null,null}}ensureGlyphs(){const e=this.gl;if(!e||this.glyphTex)return;const a=512,o=a/8,l=document.createElement("canvas");l.width=l.height=a;const i=l.getContext("2d");i.fillStyle="#000",i.fillRect(0,0,a,a),i.fillStyle="#fff",i.textAlign="center",i.textBaseline="middle",i.font=`700 ${Math.round(o*.78)}px "MS Gothic","Noto Sans Mono CJK JP","Noto Sans JP","Hiragino Kaku Gothic ProN",monospace`;const s=[];for(let r=65382;r<=65437;r++)s.push(String.fromCharCode(r));for(const r of"0123456789")s.push(r);s.slice(0,64).forEach((r,n)=>i.fillText(r,n%8*o+o/2,Math.floor(n/8)*o+o/2+2));const t=e.createTexture();e.bindTexture(e.TEXTURE_2D,t),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,l),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.glyphTex=t}bindMatte(e,a,o,l,i,s,t){const r=this.gl,n=this.matte.update(a,i),c=!!n&&n.w>0;r.activeTexture(r.TEXTURE0+t),r.bindTexture(r.TEXTURE_2D,this.maskTex),c&&n.stamp!==this.maskStamp&&(r.pixelStorei(r.UNPACK_ALIGNMENT,1),r.texImage2D(r.TEXTURE_2D,0,r.R8,n.w,n.h,0,r.RED,r.UNSIGNED_BYTE,n.data),r.pixelStorei(r.UNPACK_ALIGNMENT,4),this.maskStamp=n.stamp),r.uniform1i(e.u.uMask,t),r.uniform1f(e.u.uHasMask,c?1:0);const h=a.videoWidth||o,d=a.videoHeight||l,p=j(o,l,h,d,s);r.uniform2f(e.u.uMapA,o/(h*p.s),l/(d*p.s)),r.uniform2f(e.u.uMapB,-p.ox/(h*p.s),-p.oy/(d*p.s)),r.activeTexture(r.TEXTURE0)}setAuraUniforms(e){const a=this.gl;a.uniform3f(e.u.uAuraA,...this.auraA),a.uniform3f(e.u.uAuraB,...this.auraB),a.uniform1f(e.u.uAuraAmt,this.auraAmt)}ensureAscii(){const e=this.gl;if(!e||this.asciiTex)return;const a=512,o=a/4,l=document.createElement("canvas");l.width=l.height=a;const i=l.getContext("2d");i.fillStyle="#000",i.fillRect(0,0,a,a),i.fillStyle="#fff",i.textAlign="center",i.textBaseline="middle",i.font=`700 ${Math.round(o*.92)}px "Consolas","Menlo","DejaVu Sans Mono","Courier New",monospace`,Pt.forEach((t,r)=>{i.save(),i.translate(r%4*o+o/2,Math.floor(r/4)*o+o/2+o*.04),i.scale(1.45,1),i.fillText(t,0,0),i.restore()});const s=e.createTexture();e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,l),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.asciiTex=s}ensurePalette(){const e=this.gl;if(!e||this.palTex)return;const a=new Uint8Array(128);ve.forEach((l,i)=>{a[i*4]=parseInt(l.slice(0,2),16),a[i*4+1]=parseInt(l.slice(2,4),16),a[i*4+2]=parseInt(l.slice(4,6),16),a[i*4+3]=255});const o=e.createTexture();e.bindTexture(e.TEXTURE_2D,o),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,32,1,0,e.RGBA,e.UNSIGNED_BYTE,a),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this.palTex=o}bindSubject(e,a,o,l,i,s,t){const r=this.gl,n=this.matte.update(a,i);if(n&&n.stamp!==this.presenceStamp){this.presenceStamp=n.stamp;let T=0,R=0;for(let x=0;x<n.data.length;x+=61)R++,n.data[x]>140&&T++;this.personSeen=T/Math.max(1,R)>.015,this.personSeen?this.noPersonSince=0:this.noPersonSince||(this.noPersonSince=i)}if(!(this.lens!=="cardboard"&&this.matte.state==="ready"&&!this.personSeen&&this.noPersonSince>0&&i-this.noPersonSince>2500&&W()&&!F())){this.bindMatte(e,a,o,l,i,s,t);return}this.sam.init();const h=a.videoWidth||o,d=a.videoHeight||l,p=j(o,l,h,d,s),u=(.5+(this.motion.cx-.5)*.6)*o,m=(.5+(this.motion.cy-.5)*.6)*l,v=Math.max(.02,Math.min(.98,(u-p.ox)/(h*p.s))),y=Math.max(.02,Math.min(.98,(m-p.oy)/(d*p.s))),b=this.sam.update(a,i,v,y);if(!b){this.bindMatte(e,a,o,l,i,s,t);return}r.activeTexture(r.TEXTURE0+t),r.bindTexture(r.TEXTURE_2D,this.maskTex),this.sam.stamp!==this.samStamp&&(r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,b),this.samStamp=this.sam.stamp,this.maskStamp=-1),r.uniform1i(e.u.uMask,t),r.uniform1f(e.u.uHasMask,1),r.uniform2f(e.u.uMapA,o/(h*p.s),l/(d*p.s)),r.uniform2f(e.u.uMapB,-p.ox/(h*p.s),-p.oy/(d*p.s)),r.activeTexture(r.TEXTURE0)}bindDepth(e,a,o,l){const i=this.gl,s=Q.has(this.lens)?this.depth.update(a,o):null;if(i.activeTexture(i.TEXTURE0+l),i.bindTexture(i.TEXTURE_2D,this.depthTex),s&&this.depth.stamp!==this.depthStamp)try{i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,s),this.depthStamp=this.depth.stamp}catch{}i.uniform1i(e.u.uDepth,l),i.uniform1f(e.u.uHasDepth,s&&this.depthStamp>=0?1:0),i.activeTexture(i.TEXTURE0)}shade(e,a,o,l,i,s){const t=this.gl;if(!t||this.tainted)return;const r=this.program(e);if(!r||!this.gl)return;const n=o.width,c=o.height;(this.glc.width!==n||this.glc.height!==c)&&(this.glc.width=n,this.glc.height=c),t.viewport(0,0,n,c),t.useProgram(r.prog),t.bindBuffer(t.ARRAY_BUFFER,this.quad),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTex);try{t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,o)}catch{this.tainted=!0;return}if(Et.includes(e)?(t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR)):t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.uniform1i(r.u.uTex,0),t.uniform2f(r.u.uRes,n,c),t.uniform1f(r.u.uT,i/1e3),t.uniform1f(r.u.uSeed,this.frameNo),t.uniform1f(r.u.uBoil,Math.floor(i/83)),Rt.includes(e)&&(this.bindSubject(r,l,n,c,i,s,2),this.bindDepth(r,l,i,3)),e==="matrix")this.ensureGlyphs(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.glyphTex),t.uniform1i(r.u.uGlyph,1),t.uniform1f(r.u.uCell,Math.max(8,Math.round(n/62)));else if(e==="ascii")this.ensureAscii(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.asciiTex),t.uniform1i(r.u.uGlyph,1),t.uniform1f(r.u.uCell,Math.max(9,Math.round(c/50)));else if(e==="pixel")this.ensurePalette(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.palTex),t.uniform1i(r.u.uPal,1),t.uniform1f(r.u.uPalN,ve.length),t.uniform1f(r.u.uGrid,Math.max(4,Math.round(Math.max(n,c)/170)));else if(e==="comic")t.uniform3f(r.u.uMotion,this.motion.energy,this.motion.cx,this.motion.cy);else if(e==="southpark")t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.plateTex),t.uniform1i(r.u.uPlate,1),t.uniform1f(r.u.uHasPlate,this.plateReady&&this.tracks.some(h=>h.alpha>.3)?1:0);else if(e==="grindhouse"){const h=this.evt;t.uniform4f(r.u.uEvt,h.type,h.type?Math.min(1,(i-h.start)/h.dur):0,h.seed,1),t.uniform4f(r.u.uReel,...this.reel)}else if(e==="vhs")t.uniform4f(r.u.uEvt,this.track.amt,this.track.pos,0,0);else if(e==="found"){const h=this.rig;t.uniform4f(r.u.uCam,h.x,h.y,h.r,h.z),t.uniform2f(r.u.uVel,h.px,h.py),t.uniform1f(r.u.uFocus,h.focus),t.uniform1f(r.u.uExpo,h.expo),t.uniform1f(r.u.uGlitch,h.glitch)}else if(e==="bigface"){const h=new Float32Array(36);let d=0;for(const p of this.tracks){if(p.alpha<.3||d>6)continue;const u=Math.min(1,p.alpha);for(const v of p.eyes)h.set([v.x,v.y,Math.max(6,v.r*2.3),.72*u],4*d++);const m=p.mouth;h.set([m.x,m.y,Math.max(8,m.w*(.95+m.open*.5)),(.5+Math.min(.2,m.open*.6))*u],4*d++)}t.uniform4fv(r.u.uBulge,h),t.uniform1i(r.u.uN,d)}else if(e==="colorize"){const h=this.analyzeColour(l,o,n,c,i,s);if(!h)return;t.useProgram(r.prog),t.viewport(0,0,n,c),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,h.tex[h.cur]),t.uniform1i(r.u.uChroma,1),t.uniform2f(r.u.uCRes,h.w,h.h),t.uniform3f(r.u.uStock,...pe[this.stock]),t.uniform1f(r.u.uAmt,1),t.uniform1f(r.u.uGrade,this.gradeOverride??this.colorScript.grade()),t.activeTexture(t.TEXTURE0)}else(e==="heat"||e==="aura")&&(this.bindMatte(r,l,n,c,i,s,1),e==="aura"&&this.setAuraUniforms(r));t.drawArrays(t.TRIANGLES,0,3),a.drawImage(this.glc,0,0,n,c)}bindScene(e,a,o,l){const i=this.gl,s=()=>{const d=i.createTexture();return i.bindTexture(i.TEXTURE_2D,d),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),d},t=this.filmTime??(Number.isFinite(o.currentTime)?o.currentTime:0);let r=null,n=!1,c=[0,0],h=1;if(this.lookahead){this.lookahead.follow(t);const d=this.lookahead.mapAt(t);if(d){if(r=d.map,d.key!==this.driftKey||l-this.driftAt>100){try{this.drift=this.lookahead.drift(a,d.key)}catch{this.drift={dx:0,dy:0,agree:.5}}this.driftKey=d.key,this.driftAt=l}c=[this.drift.dx,this.drift.dy],h=this.drift.agree,d.shot!==this.laShot&&(n=this.laShot>=0,this.laShot=d.shot),this.drift.agree<.3&&(r=null,h=1,c=[0,0])}}return!r&&this.segment&&(r=this.seg.update(a,l)),i.activeTexture(i.TEXTURE4),this.segTex||(this.segTex=s(),this.segObj=null),i.bindTexture(i.TEXTURE_2D,this.segTex),r&&r!==this.segObj&&(i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.texImage2D(i.TEXTURE_2D,0,i.RG8,r.w,r.h,0,i.RG,i.UNSIGNED_BYTE,r.data),i.pixelStorei(i.UNPACK_ALIGNMENT,4),this.segObj=r),i.uniform1i(e.u.uSeg,4),i.uniform1f(e.u.uHasSeg,r?1:0),r&&i.uniform4f(e.u.uSegRect,...r.rect),i.uniform2f(e.u.uSegOff,c[0],c[1]),i.uniform1f(e.u.uSegTrust,h),this.colorScript.update(t),i.activeTexture(i.TEXTURE5),this.matPalTex||(this.matPalTex=s(),this.matPalStamp=-1),i.bindTexture(i.TEXTURE_2D,this.matPalTex),this.matPalStamp!==this.colorScript.stamp&&(i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,32,2,0,i.RGBA,i.UNSIGNED_BYTE,this.colorScript.palettePixels()),this.matPalStamp=this.colorScript.stamp),i.uniform1i(e.u.uMatPal,5),i.activeTexture(i.TEXTURE0),n}analyzeColour(e,a,o,l,i,s){const t=this.gl,r=this.program("colorizeA");if(!r||!this.gl)return null;const n=Math.max(8,Math.round(o/8)),c=Math.max(8,Math.round(l/8));let h=this.cz;if(!h||h.w!==n||h.h!==c){h&&(h.tex.forEach(M=>t.deleteTexture(M)),h.fbo.forEach(M=>t.deleteFramebuffer(M)));const x=()=>{const M=t.createTexture();t.bindTexture(t.TEXTURE_2D,M),t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,n,c,0,t.RGBA,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const w=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,w),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,M,0),[M,w]},S=x(),k=x();h=this.cz={tex:[S[0],k[0]],fbo:[S[1],k[1]],w:n,h:c,cur:0,fresh:!0},t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTex)}const d=h.cur;h.cur^=1,t.bindFramebuffer(t.FRAMEBUFFER,h.fbo[h.cur]),t.viewport(0,0,n,c),t.useProgram(r.prog),t.uniform1i(r.u.uTex,0),t.uniform2f(r.u.uRes,o,l),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,h.tex[d]),t.uniform1i(r.u.uPrev,1);const p=this.colorScript.stock()??V;this.stock!==p&&(this.stock=p,h.fresh=!0),t.uniform1f(r.u.uCut,h.fresh||this.motion.burst>.45?1:0),h.fresh=!1,t.uniform3f(r.u.uStock,...pe[this.stock]),this.bindMatte(r,e,o,l,i,s,2),this.bindDepth(r,e,i,3);const u=new Float32Array(12),m=new Float32Array(12),v=new Float32Array(12),y=new Float32Array(12);let b=0;const T=this.tracks.filter(x=>x.alpha>=.3).sort((x,S)=>x.head.x-S.head.x).slice(0,3),R=this.colorScript.peopleCount()===1&&T.length>1?T.reduce((x,S,k)=>S.head.rx>T[x].head.rx?k:x,0):-1;for(const x of T){const S=Math.min(1,x.alpha);u.set([x.head.x/o,x.head.y/l,x.head.rx/o,x.head.ry/l],4*b),m.set([x.mouth.x/o,x.mouth.y/l,x.mouth.w/o,S],4*b);const k=R<0?b:b===R?0:-1;v.set(this.colorScript.wardrobe(k),4*b),y.set(this.colorScript.look(k),4*b),b++}return t.uniform4fv(r.u.uFace,u),t.uniform4fv(r.u.uLip,m),t.uniform1i(r.u.uNF,b),t.uniform4fv(r.u.uWard,v),t.uniform4fv(r.u.uLook,y),this.bindScene(r,a,e,i)&&t.uniform1f(r.u.uCut,1),t.drawArrays(t.TRIANGLES,0,3),t.bindFramebuffer(t.FRAMEBUFFER,null),t.activeTexture(t.TEXTURE0),h}startPose(){if(this.poseState!=="idle")return;this.poseState="loading";const e=new wt;e.init().then(a=>{a?(this.pose=e,this.poseState="ready"):this.poseState="failed"})}feedPose(e,a,o,l){if(!this.pose||e.readyState<2||!e.videoWidth)return;this.poseTs=Math.max(this.poseTs+1,Math.round(performance.now()));const i=this.pose.detect(this.feed.src(e),this.poseTs);if(!i){this.lastPose=null;return}const s=e.videoWidth,t=e.videoHeight,r=j(a,o,s,t,l),n=c=>{const h=i.pts[c];return h?{x:h.x*s*r.s+r.ox,y:h.y*t*r.s+r.oy,v:h.v}:void 0};this.lastPose={shoulderL:n(G.shoulderL),shoulderR:n(G.shoulderR),elbowL:n(G.elbowL),elbowR:n(G.elbowR),wristL:n(G.wristL),wristR:n(G.wristR)}}updatePlate(e,a){const o=this.gl;if(!o)return;const l=this.matte.update(e,a);if(!l||l.stamp===this.plateStamp||!e.videoWidth)return;this.plateStamp=l.stamp;const i=192,s=Math.max(2,Math.round(192*e.videoHeight/e.videoWidth));for(const m of[this.plate,this.plateTmp,this.plateAlpha])(m.width!==i||m.height!==s)&&(m.width=i,m.height=s,m===this.plate&&(this.plateReady=!1));const t=this.plateAlpha.getContext("2d"),r=t.createImageData(i,s),n=r.data,c=l.w/i,h=l.h/s,d=3;for(let m=0;m<s;m++)for(let v=0;v<i;v++){let y=0;for(let b=-d;b<=d;b+=d)for(let T=-d;T<=d;T+=d){const R=Math.min(l.w-1,Math.max(0,Math.round((v+T)*c))),x=Math.min(l.h-1,Math.max(0,Math.round((m+b)*h)));y=Math.max(y,l.data[x*l.w+R])}n[(m*i+v)*4+3]=y>70?0:255}t.putImageData(r,0,0);const p=this.plateTmp.getContext("2d");p.globalCompositeOperation="copy",p.drawImage(e,0,0,i,s),p.globalCompositeOperation="destination-in",p.drawImage(this.plateAlpha,0,0),p.globalCompositeOperation="source-over";const u=this.plate.getContext("2d");u.globalAlpha=this.plateReady?.35:1,u.drawImage(this.plateTmp,0,0),u.globalAlpha=1,this.plateReady=!0,o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,this.plateTex),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),o.texImage2D(o.TEXTURE_2D,0,o.RGBA,o.RGBA,o.UNSIGNED_BYTE,this.plate),o.pixelStorei(o.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),o.generateMipmap(o.TEXTURE_2D),o.activeTexture(o.TEXTURE0)}sampleColours(e,a){if(a-this.coloursAt<400)return;const o=this.tracks.find(v=>v.alpha>.3);if(!o)return;this.coloursAt=a;const l=e.width,i=e.height,s=this.swatch;s.width=s.height=1;const t=s.getContext("2d",{willReadFrequently:!0}),r=(v,y,b)=>{if(v<0||y<0||v>=l||y>=i)return null;t.drawImage(e,Math.max(0,v-b),Math.max(0,y-b),b*2,b*2,0,0,1,1);const T=t.getImageData(0,0,1,1).data;return[T[0],T[1],T[2]]},n=(o.eyes[0].x+o.eyes[1].x)/2,c=(o.eyes[0].y+o.eyes[1].y)/2,h=Math.max(o.head.rx,o.head.ry),d=Math.max(2,h*.12),p=(v,y,b)=>y?yt(gt(y,b)):v,u=this.lastPose,m=u?.shoulderL&&u.shoulderR&&u.shoulderL.v>.5&&u.shoulderR.v>.5?{x:(u.shoulderL.x+u.shoulderR.x)/2,y:(u.shoulderL.y+u.shoulderR.y)/2+Math.abs(u.shoulderL.x-u.shoulderR.x)*.3}:{x:o.head.x,y:o.head.y+o.head.ry*1.9};this.colours={skin:p(this.colours.skin,r((n+o.mouth.x)/2,(c+o.mouth.y)/2,d),.3),hair:p(this.colours.hair,r(o.head.x,o.head.y-o.head.ry*.92,d),.12),shirt:p(this.colours.shirt,r(m.x,Math.min(i-d-1,m.y),d*2)),pants:this.colours.pants,glove:this.colours.glove}}stepGrindhouse(e){const a=this.evt;if(a.type&&e-a.start>a.dur&&((a.type===4||a.type===1)&&(this.reel=[Math.random()*.7,Math.random(),Math.random()*.6,Math.random()*10]),a.type=0,this.nextEvtAt=e+2500+Math.random()*6e3),this.nextEvtAt||(this.nextEvtAt=e+2e3),!a.type&&e>this.nextEvtAt){const o=Math.random(),[l,i]=o<.24?[2,650]:o<.48?[3,260]:o<.68?[5,900]:o<.88?[4,1100]:[1,2600];Object.assign(a,{type:l,start:e,dur:i,seed:Math.random()*100})}}stepVhs(e,a){const o=this.track;o.next||(o.next=e+4e3+Math.random()*6e3),e>o.next&&(o.until=e+700+Math.random()*1600,o.next=o.until+5e3+Math.random()*9e3,o.pos=.95);const l=e<o.until?1:0;o.amt+=(l-o.amt)*(1-Math.exp(-a*6)),o.pos-=a*.25*o.amt,o.pos<.05&&(o.pos=.95)}drawVhsStamp(e,a,o,l){const i=new Date,s=Math.round(o/15);e.save(),e.font=`700 ${s}px "VCR OSD Mono","Consolas","Courier New",monospace`,e.textBaseline="alphabetic";const t=(d,p,u,m="left")=>{e.textAlign=m,e.fillStyle="rgba(0,0,0,0.7)",e.fillText(d,p+s*.07,u+s*.07),e.fillStyle="#f4f4ee",e.fillText(d,p,u)};l-this.startedAt<4500&&t("PLAY ▶",a*.07,o*.12);const r=i.getHours(),n=r<12?"AM":"PM",c=r%12||12,h=d=>String(d).padStart(2,"0");t(`${n} ${c}:${h(i.getMinutes())}`,a*.07,o*.86),t(`${Lt[i.getMonth()]}. ${h(i.getDate())} ${this.vhsYear}`,a*.07,o*.86+s*1.15),l-this.startedAt>4500&&t("SP",a*.93,o*.12,"right"),e.restore()}stepRig(e,a){const o=this.rig,l=a/1e3;this.pointer.step(e);const i=typeof window<"u"&&window.innerWidth||1280,s=typeof window<"u"&&window.innerHeight||720,t=this.pointer.vx/i,r=this.pointer.vy/s,n=Math.min(1,this.pointer.speed/Math.max(i,s)*.9),c=this.pointer.takeClicks(),h=Math.min(1,this.motion.energy*1.7),d=this.motion.burst,p=Math.min(1,h*.8+n*.9);o.panic+=(p-o.panic)*(1-Math.exp(-e*(p>o.panic?6:.7)));const u=o.panic,m=(w,E)=>(Math.sin(l*w+E)+Math.sin(l*w*1.73+E*2.1)*.6)/1.6;let v=m(.9,1)*.006+m(11,3)*(.0012+u*.022)-t*.025+(this.motion.cx-.5)*.06*u,y=m(.7,5)*.008+m(13,7)*(.0012+u*.026)-r*.025+(this.motion.cy-.5)*.05*u;v=Math.max(-.07,Math.min(.07,v)),y=Math.max(-.07,Math.min(.07,y));const b=m(.5,9)*.008+m(9,2)*u*.045-t*.02;d>.35&&o.punch<=0&&(o.punch=1.2),o.punch=Math.max(0,o.punch-e);const T=1.12+m(.15,4)*.025+(o.punch>0?.28:0)+u*.04;c&&(o.vx+=(Math.random()-.5)*1.6,o.vy+=.6+Math.random()*1.2,o.vr+=(Math.random()-.5)*3,o.glitch=1,o.focus=1);const R=o.x,x=o.y,S=(w,E,A,P,L)=>(E+=(P*(A-w)-L*E)*e,[w+E*e,E]);[o.x,o.vx]=S(o.x,o.vx,v,90,11),[o.y,o.vy]=S(o.y,o.vy,y,90,11),[o.r,o.vr]=S(o.r,o.vr,b,70,10),[o.z,o.vz]=S(o.z,o.vz,T,o.punch>0?160:25,o.punch>0?14:9),o.px=Math.max(-.05,Math.min(.05,o.x-R)),o.py=Math.max(-.05,Math.min(.05,o.y-x));const k=Math.hypot(o.px,o.py)*40+Math.abs(o.vz)*.4;o.focus=Math.max(o.focus*Math.exp(-e*1.6),Math.min(1,k*.6)),o.focus=Math.min(1,o.focus*(.85+.15*Math.abs(Math.sin(l*7))));const M=Math.max(.75,Math.min(1.8,.46/Math.max(.05,this.motion.luma)));o.expo+=(M-o.expo)*(1-Math.exp(-e*1.4)),o.glitch=Math.max(o.glitch*Math.exp(-e*3),u>.75&&Math.random()<.04?.6:0)}drawViewfinder(e,a,o,l){const i=Math.round(o/22),s=o*.06,t=Math.max(0,(l-this.startedAt)/1e3),r=v=>String(Math.floor(v)).padStart(2,"0");e.save(),e.font=`600 ${i}px "Consolas","Courier New",monospace`,e.textBaseline="middle",e.shadowColor="rgba(0,0,0,0.6)",e.shadowBlur=2,e.fillStyle="rgba(255,255,255,0.88)",e.strokeStyle="rgba(255,255,255,0.75)",e.lineWidth=Math.max(1.5,o/360),Math.floor(l/600)%2===0&&(e.fillStyle="#ff2a2a",e.beginPath(),e.arc(s+i*.4,s+i*.5,i*.32,0,Math.PI*2),e.fill()),e.fillStyle="rgba(255,255,255,0.88)",e.textAlign="left",e.fillText("REC",s+i,s+i*.5),e.fillText(`SP ${r(t/3600)}:${r(t/60%60)}:${r(t%60)}`,s,o-s-i*.5);const n=i*1.6,c=i*.75,h=a-s-n,d=s+i*.12;e.strokeRect(h,d,n,c),e.fillRect(h+n,d+c*.3,c*.18,c*.4);const p=Math.floor(l/4e3)%9<7?2:1;for(let v=0;v<p;v++)e.fillRect(h+3+v*(n-6)/3,d+3,(n-6)/3-2,c-6);const u=o*.07,m=o*.035;e.beginPath();for(const[v,y,b,T]of[[m,m,1,1],[a-m,m,-1,1],[m,o-m,1,-1],[a-m,o-m,-1,-1]])e.moveTo(v,y+T*u),e.lineTo(v,y),e.lineTo(v+b*u,y);e.stroke(),e.restore()}startFace(e=!1){if(e&&!this.faceBlend&&(this.faceState==="worker"||this.faceState==="sync"||this.faceState==="failed")){this.worker.dispose(),this.worker=new ee;try{this.sync?.dispose()}catch{}this.sync=null,this.faceState="idle"}if(this.faceState!=="idle")return;this.faceState="loading",this.faceBlend=e;const a={numFaces:2,blendshapes:e};this.worker.init(a).then(async o=>{if(o){this.faceState="worker";return}const l=new be;await l.init(a)?(this.sync=l,this.faceState="sync"):this.faceState="failed"})}feedFaces(e,a,o,l,i){if(e.readyState<2||!e.videoWidth)return;const s=F()?1e3/18:1e3/30;let t=null,r=!1;if(this.faceState==="worker"){a-this.lastSend>=s&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),this.worker.send(this.feed.src(e),this.lastTs),this.lastSend=a);const n=this.worker.poll();r=n.fresh,t=n.frame}else this.faceState==="sync"&&this.sync&&a-this.lastSync>=100&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),t=this.sync.detect(this.feed.src(e),this.lastTs),this.lastSync=a,r=!0);r&&(this.lens==="aura"&&this.emotion.push(t&&Object.keys(t.blendshapes).length?Fe(t.blendshapes):null,s/1e3),this.ingest(t?.faces??[],e,a,o,l,i))}ingest(e,a,o,l,i,s){const t=a.videoWidth,r=a.videoHeight,n=j(l,i,t,r,s),c=new Set;for(const h of e){const d=h.eyes.map(x=>({x:x.cx*t*n.s+n.ox,y:x.cy*r*n.s+n.oy,r:Math.hypot(x.dx*t,x.dy*r)*n.s*.95,gx:x.gx,gy:x.gy,open:x.open})),p=h.mouth,u=h.bbox,m={x:p.cx*t*n.s+n.ox,y:p.cy*r*n.s+n.oy,w:Math.hypot(p.dx*t,p.dy*r)*n.s,open:p.open},v={x:(u.x+u.w/2)*t*n.s+n.ox,y:(u.y+u.h/2)*r*n.s+n.oy,rx:u.w*t*n.s/2*1.02,ry:u.h*r*n.s/2*1.05},y=(d[0].x+d[1].x)/2,b=(d[0].y+d[1].y)/2;let T=null,R=l*.3;for(const x of this.tracks){if(c.has(x))continue;const S=Math.hypot(x.cx-y,x.cy-b);S<R&&(R=S,T=x)}if(!T){if(this.tracks.length>=3)continue;T={cx:y,cy:b,seen:o,alpha:0,eyes:[ge(d[0].x,d[0].y,d[0].r,d[0].gx,d[0].gy),ge(d[1].x,d[1].y,d[1].r,d[1].gx,d[1].gy)],mouth:{...m,tx:m.x,ty:m.y,tw:m.w,topen:m.open},head:{...v,tx:v.x,ty:v.y,trx:v.rx,try_:v.ry}},this.tracks.push(T)}c.add(T),T.cx=y,T.cy=b,T.seen=o,T.eyes.forEach((x,S)=>{x.tx=d[S].x,x.ty=d[S].y,x.tr=d[S].r,x.tgx=d[S].gx,x.tgy=d[S].gy,x.to=d[S].open}),T.mouth.tx=m.x,T.mouth.ty=m.y,T.mouth.tw=m.w,T.mouth.topen=m.open,T.head.tx=v.x,T.head.ty=v.y,T.head.trx=v.rx,T.head.try_=v.ry}}stepTracks(e,a){const o=1-Math.exp(-e*20),l=1-Math.exp(-e*28),i=[];for(const s of this.tracks){const t=a-s.seen;if(s.alpha+=((t<350?1:0)-s.alpha)*(1-Math.exp(-e*10)),t>900&&s.alpha<.02)continue;i.push(s);for(const c of s.eyes){const h=c.x,d=c.y;c.x+=(c.tx-c.x)*o,c.y+=(c.ty-c.y)*o,c.r+=(c.tr-c.r)*o,c.gx+=(c.tgx-c.gx)*o,c.gy+=(c.tgy-c.gy)*o,c.o+=(c.to-c.o)*l;const p=(c.x-h)/e,u=(c.y-d)/e,m=Math.max(-1,Math.min(1,(p-c.vx)/e/(c.r*120))),v=Math.max(-1,Math.min(1,(u-c.vy)/e/(c.r*120)));c.vx=p,c.vy=u,c.ax+=(m-c.ax)*.35,c.ay+=(v-c.ay)*.35}const r=s.mouth;r.x+=(r.tx-r.x)*o,r.y+=(r.ty-r.y)*o,r.w+=(r.tw-r.w)*o,r.open+=(r.topen-r.open)*l;const n=s.head;n.x+=(n.tx-n.x)*o,n.y+=(n.ty-n.y)*o,n.rx+=(n.trx-n.rx)*o,n.ry+=(n.try_-n.ry)*o}this.tracks=i}drawGoogly(e,a){for(const o of this.tracks)if(!(o.alpha<.02))for(const l of o.eyes){const i=-l.ax*120,s=Ct-l.ay*120;l.pvx+=i*a,l.pvy+=s*a;const t=Math.exp(-1.3*a);l.pvx*=t,l.pvy*=t,l.px+=l.pvx*a,l.py+=l.pvy*a;const r=Math.hypot(l.px,l.py);if(r>Z){const n=l.px/r,c=l.py/r;l.px=n*Z,l.py=c*Z;const h=l.pvx*n+l.pvy*c;h>0&&(l.pvx-=(1+ye)*h*n,l.pvy-=(1+ye)*h*c)}l.r<3||this.paintEye(e,l,o.alpha)}}paintPuppets(e){this.tracks.filter(a=>a.alpha>.3).slice(0,2).forEach((a,o)=>{const l=Math.atan2(a.eyes[1].y-a.eyes[0].y,a.eyes[1].x-a.eyes[0].x),i=Math.atan2(Math.sin(l),Math.cos(l)),s=Math.abs(i)>Math.PI/2?i-Math.sign(i)*Math.PI:i,[t,r]=a.eyes[0].x<=a.eyes[1].x?[a.eyes[0],a.eyes[1]]:[a.eyes[1],a.eyes[0]];xt(e,{x:a.head.x,y:a.head.y-a.head.ry*.08,r:Math.max(a.head.rx,a.head.ry)*1.3,roll:s,eyes:[t,r].map(n=>({x:n.x,y:n.y,gx:n.gx,gy:n.gy,open:n.o})),mouthOpen:a.mouth.open},o===0?this.lastPose:null,this.colours,Math.min(1,a.alpha))})}holdFrame(e,a,o,l){const i=this.hold;if(i.width===a&&i.height===o&&this.holdAt&&l-this.holdAt<this.holdGap)return e.drawImage(i,0,0,a,o),!0;this.holdAt=l,this.frameNo++;const s=1e3/(At[this.lens]??30);return this.holdGap=s*(this.lens==="silent"?.85+Math.random()*.35:this.lens==="grindhouse"&&Math.random()<.08?2:1),!1}keepHold(e,a,o){const l=this.hold;(l.width!==a||l.height!==o)&&(l.width=a,l.height=o),l.getContext("2d").drawImage(e,0,0,a,o)}paintEye(e,a,o){const{x:l,y:i,r:s}=a;e.save(),e.globalAlpha=o,e.fillStyle="rgba(0,0,0,0.28)",e.beginPath(),e.ellipse(l+s*.07,i+s*.13,s*1.04,s*1,0,0,Math.PI*2),e.fill();const t=e.createRadialGradient(l-s*.3,i-s*.35,s*.1,l,i,s);t.addColorStop(0,"#ffffff"),t.addColorStop(.75,"#f4f4f2"),t.addColorStop(1,"#cfcfcc"),e.fillStyle=t,e.beginPath(),e.arc(l,i,s,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,s*.09),e.strokeStyle="#141414",e.stroke();const r=s*Se,n=l+a.px*s,c=i+a.py*s;e.fillStyle="#0b0b0b",e.beginPath(),e.arc(n,c,r,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255,255,255,0.85)",e.beginPath(),e.arc(n-r*.32,c-r*.34,r*.24,0,Math.PI*2),e.fill(),e.restore()}apply(e,a,o,l,i="cover"){if(this.lens==="none")return;if(J.has(this.lens)){this.halloweenEngine||(this.halloweenEngine=new de,this.lens==="dimlights"?(this.halloweenEngine.setFilter("none"),this.halloweenEngine.setDimLights(!0)):(this.halloweenEngine.setDimLights(!1),this.halloweenEngine.setFilter(this.lens))),this.halloweenEngine.apply(e,a,o,l);return}const s=Math.max(1/120,Math.min(.1,this.lastApply?(l-this.lastApply)/1e3:1/30));this.lastApply=l,e.globalAlpha=1;const t=a.width,r=a.height;if(this.lens==="googly")this.feedFaces(o,l,t,r,i),this.stepTracks(s,l),this.drawGoogly(e,s);else if(this.lens==="aura")this.feedFaces(o,l,t,r,i),this.stepTracks(s,l),this.updateAura(l),this.shade("aura",e,a,o,l,i),this.orbs.update(s,l),this.orbs.draw(e,t,r,l),this.frameAspect=t/r;else if(this.lens==="bigface")this.feedFaces(o,l,t,r,i),this.stepTracks(s,l),this.tracks.some(n=>n.alpha>.3)&&this.shade("bigface",e,a,o,l,i);else if(this.lens==="cardboard"){if(this.feedFaces(o,l,t,r,i),this.stepTracks(s,l),this.holdFrame(e,t,r,l)||(this.feedPose(o,t,r,i),this.sampleColours(a,l),this.updatePlate(o,l),this.shade("southpark",e,a,o,l,i),!this.gl||this.tainted))return;this.paintPuppets(e),this.keepHold(a,t,r)}else if(this.lens==="silent"||this.lens==="grindhouse"){if(this.lens==="grindhouse"&&this.stepGrindhouse(l),this.holdFrame(e,t,r,l))return;if(this.lens==="grindhouse"&&this.evt.type===1){const n=this.freeze;(this.freezeAt!==this.evt.start||n.width!==t||n.height!==r)&&(n.width=t,n.height=r,n.getContext("2d").drawImage(a,0,0,t,r),this.freezeAt=this.evt.start),e.drawImage(n,0,0,t,r)}this.shade(this.lens,e,a,o,l,i),this.keepHold(a,t,r)}else this.lens==="vhs"?(this.startedAt||(this.startedAt=l),this.frameNo++,this.stepVhs(l,s),this.drawVhsStamp(e,t,r,l),this.shade("vhs",e,a,o,l,i)):this.lens==="colorize"?(this.motion.update(a),this.feedFaces(o,l,t,r,i),this.stepTracks(s,l),this.shade("colorize",e,a,o,l,i)):this.lens==="foundfootage"?(this.startedAt||(this.startedAt=l),this.frameNo++,this.motion.update(a),this.stepRig(s,l),this.shade("found",e,a,o,l,i),this.gl&&!this.tainted&&this.drawViewfinder(e,t,r,l)):((this.lens==="comic"||(++this.frameNo&3)===0)&&this.motion.update(a),this.shade(this.lens,e,a,o,l,i))}updateAura(e){const a=this.auraState=this.emotion.get();let o=a.a,l=a.b,i=a.intensity;const s=this.orbs.lastCollect;if(s&&e-s.at<2200){const t=(1-(e-s.at)/2200)*.7,r=B[s.emo];o=o.map((n,c)=>n+(r.a[c]-n)*t),l=l.map((n,c)=>n+(r.b[c]-n)*t),i=Math.min(1,i+t*.6)}this.auraA=o,this.auraB=l,this.auraAmt=i}tap(e,a,o){return this.lens==="aura"?this.orbs.tap(e,a,o,this.frameAspect,performance.now()):!1}setOrbListener(e){this.orbs.onCollect=e}getAuraInfo(){const e=this.auraState,a=B[e.dominant];return{emotion:e.dominant,label:a.label,icon:a.icon,intensity:e.intensity,leaderboard:this.orbs.leaderboard(5),orbsOnScreen:this.orbs.orbs.length}}dispose(){this.worker.dispose();try{this.sync?.dispose()}catch{}this.halloweenEngine?.dispose(),this.halloweenEngine=null,this.matte.dispose(),this.pointer.stop(),this.pose?.dispose(),this.pose=null,this.poseState="idle";const e=this.gl;if(e){for(const a of[this.srcTex,this.maskTex,this.glyphTex,this.depthTex,this.plateTex,this.palTex,this.asciiTex])a&&e.deleteTexture(a);for(const a of Object.values(this.progs))a&&e.deleteProgram(a.prog);this.cz&&(this.cz.tex.forEach(a=>e.deleteTexture(a)),this.cz.fbo.forEach(a=>e.deleteFramebuffer(a)));for(const a of[this.segTex,this.matPalTex])a&&e.deleteTexture(a);e.getExtension("WEBGL_lose_context")?.loseContext()}this.gl=null,this.progs={},this.tracks=[],this.cz=null,this.segTex=null,this.matPalTex=null}}export{pe as FILM_STOCKS,_t as LENSES,Gt as LensEngine,It as getFilmStock,Dt as setFilmStock};
