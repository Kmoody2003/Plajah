const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/depthMatte-B6VYYJZ_.js","assets/index-Cn_Onjrn.js","assets/samMatte-CQPE_ElI.js"])))=>i.map(i=>d[i]);
import{_ as ae}from"./index-Cn_Onjrn.js";class ee{constructor(){this.w=null,this.ready=!1,this.busy=!1,this.latest=null,this.fresh=!1}async init(e={}){if(this.ready)return!0;if(typeof Worker>"u"||typeof createImageBitmap!="function")return!1;try{this.w=new Worker(new URL("/games/ravencrest/play/assets/faceWorker.worker-c-kn6rxz.js",import.meta.url),{type:"module"})}catch{return!1}const a=await new Promise(s=>{const l=setTimeout(()=>s(!1),2e4);this.w.onmessage=r=>{const o=r.data||{};if(o.type==="ready"){clearTimeout(l),s(!!o.ok);return}o.type==="result"&&(this.busy=!1,o.frame?(this.latest={blendshapes:o.frame.blendshapes,matrix:o.frame.matrix?new Float32Array(o.frame.matrix):null,bbox:o.frame.bbox,faces:o.frame.faces??[]},this.fresh=!0):(this.latest=null,this.fresh=!0))},this.w.onerror=()=>{clearTimeout(l),s(!1)},this.w.postMessage({type:"init",numFaces:e.numFaces??1,blendshapes:e.blendshapes!==!1})});return this.ready=a,a||this.dispose(),a}send(e,a){!this.ready||!this.w||this.busy||(this.busy=!0,createImageBitmap(e).then(s=>{if(!this.w){try{s.close()}catch{}this.busy=!1;return}this.w.postMessage({type:"frame",bitmap:s,ts:a},[s])}).catch(()=>{this.busy=!1}))}take(){return this.fresh?(this.fresh=!1,this.latest):null}poll(){return this.fresh?(this.fresh=!1,{fresh:!0,frame:this.latest}):{fresh:!1,frame:null}}dispose(){try{this.w?.terminate()}catch{}this.w=null,this.ready=!1,this.busy=!1,this.latest=null,this.fresh=!1}get isReady(){return this.ready}}const Ae=[33,133,159,145],Pe=[263,362,386,374];function oe(u,[e,a,s,l],r,o){const t=u[e],i=u[a],n=u[s],c=u[l];if(!t||!i||!n||!c)return null;const h=i.x-t.x,d=i.y-t.y,p=Math.hypot(h*o,d)||1e-6,f=Math.hypot((n.x-c.x)*o,n.y-c.y),m=(t.x+i.x+n.x+c.x)/4,g=(t.y+i.y+n.y+c.y)/4,y=u[r];return{cx:m,cy:g,dx:h,dy:d,open:Math.min(1,f/p),gx:y?Math.max(-1,Math.min(1,(y.x-m)*o/p)):0,gy:y?Math.max(-1,Math.min(1,(y.y-g)/p)):0}}function Le(u,e){const a=u[61],s=u[291],l=u[13],r=u[14];if(!a||!s||!l||!r)return null;const o=s.x-a.x,t=s.y-a.y,i=Math.hypot(o*e,t)||1e-6;return{cx:(a.x+s.x+l.x+r.x)/4,cy:(a.y+s.y+l.y+r.y)/4,dx:o,dy:t,open:Math.min(1,Math.hypot((l.x-r.x)*e,l.y-r.y)/i)}}function Ce(u,e){const a=[];for(const s of u??[]){if(!s||s.length<400)continue;const l=oe(s,Ae,468,e),r=oe(s,Pe,473,e),o=Le(s,e);if(!l||!r||!o)continue;let t=1,i=1,n=0,c=0;for(const h of s)h.x<t&&(t=h.x),h.x>n&&(n=h.x),h.y<i&&(i=h.y),h.y>c&&(c=h.y);a.push({eyes:[l,r],mouth:o,bbox:{x:t,y:i,w:n-t,h:c-i}})}return a}const Ue="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",_e="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",ie=Ue,Ie=_e;class be{constructor(){this.fl=null,this.ready=!1,this.loading=!1,this.blend=!0}async init(e={}){if(this.ready)return!0;if(this.loading)return!1;this.loading=!0,this.blend=e.blendshapes!==!1;try{const a=await import(ie),s=await a.FilesetResolver.forVisionTasks(`${ie}/wasm`);for(const l of["GPU","CPU"])try{this.fl=await a.FaceLandmarker.createFromOptions(s,{baseOptions:{modelAssetPath:Ie,delegate:l},runningMode:"VIDEO",numFaces:e.numFaces??1,outputFaceBlendshapes:this.blend,outputFacialTransformationMatrixes:this.blend});break}catch(r){console.warn(`[vtuber] FaceLandmarker ${l} delegate failed:`,r)}this.ready=!!this.fl}catch(a){console.warn("[vtuber] FaceLandmarker init failed:",a)}finally{this.loading=!1}return this.ready}detect(e,a){if(!this.ready||!this.fl)return null;try{const s=this.fl.detectForVideo(e,a),l=s?.faceBlendshapes?.[0]?.categories;if(this.blend?!l||!l.length:!s?.faceLandmarks?.[0]?.length)return null;const r={};for(const c of l??[])r[c.categoryName]=c.score;const o=s?.facialTransformationMatrixes?.[0]?.data;let t=null;const i=s?.faceLandmarks?.[0];if(i&&i.length){let c=1,h=1,d=0,p=0;for(const f of i)f.x<c&&(c=f.x),f.x>d&&(d=f.x),f.y<h&&(h=f.y),f.y>p&&(p=f.y);t={x:c,y:h,w:d-c,h:p-h}}const n=(e.videoWidth||e.width||1)/Math.max(1,e.videoHeight||e.height||1);return{blendshapes:r,matrix:o?new Float32Array(o):null,bbox:t,faces:Ce(s?.faceLandmarks,n)}}catch{return null}}dispose(){try{this.fl?.close?.()}catch{}this.fl=null,this.ready=!1}get isReady(){return this.ready}}class Te{constructor(){this.c=document.createElement("canvas"),this.ctx=this.c.getContext("2d",{willReadFrequently:!0}),this.gain=1,this.frame=0}src(e){try{const a=e.videoWidth,s=e.videoHeight;if(!a||!s)return e;const l=Math.min(1,360/Math.min(a,s)),r=Math.max(2,Math.round(a*l)),o=Math.max(2,Math.round(s*l));if((this.c.width!==r||this.c.height!==o)&&(this.c.width=r,this.c.height=o),this.ctx.filter=this.gain>1.03?`brightness(${this.gain.toFixed(2)}) contrast(1.06) saturate(1.05)`:"none",this.ctx.drawImage(e,0,0,r,o),this.ctx.filter="none",this.frame++%15===0){const t=this.ctx.getImageData(0,0,r,o).data;let i=0,n=0;for(let p=0;p<t.length;p+=512)i+=t[p]*.299+t[p+1]*.587+t[p+2]*.114,n++;const c=i/Math.max(1,n)/Math.max(1,this.gain),h=110,d=c<h?Math.min(2.6,h/Math.max(18,c)):1;this.gain+=(d-this.gain)*.35}return this.gain>1.06?this.c:e}catch{return e}}get boost(){return this.gain}}const re="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",De="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";class Fe{constructor(){this.seg=null,this.loading=!1,this.failed=!1,this.mask=null,this.lastRun=0,this.stamp=0}get state(){return this.seg?"ready":this.failed?"failed":this.loading?"loading":"idle"}async init(){if(!(this.seg||this.loading||this.failed)){this.loading=!0;try{const e=await import(re),a=await e.FilesetResolver.forVisionTasks(`${re}/wasm`);this.seg=await e.ImageSegmenter.createFromOptions(a,{baseOptions:{modelAssetPath:De},runningMode:"VIDEO",outputConfidenceMasks:!0})}catch(e){console.warn("[lens] person matte unavailable — rendering without a cut-out:",e),this.failed=!0}this.loading=!1}}update(e,a){if(!this.seg||!e.videoWidth)return this.mask;if(this.mask&&a-this.lastRun<66)return this.mask;this.lastRun=a;try{const s=this.seg.segmentForVideo(e,a),l=s.confidenceMasks?.[0];if(l){const r=l.getAsFloat32Array(),o=l.width,t=l.height;(!this.mask||this.mask.data.length!==r.length)&&(this.mask={data:new Uint8Array(r.length),w:o,h:t,stamp:0});const i=this.mask.data;for(let n=0;n<r.length;n++)i[n]=Math.max(0,Math.min(255,r[n]*255|0));this.mask.w=o,this.mask.h=t,this.mask.stamp=++this.stamp}s.close?.()}catch{}return this.mask}dispose(){try{this.seg?.close?.()}catch{}this.seg=null,this.mask=null,this.loading=!1,this.failed=!1}}const B={joy:{label:"Joyful",icon:"😊",a:[1,.82,.22],b:[1,.36,.72]},calm:{label:"Serene",icon:"😌",a:[.48,.36,1],b:[.18,.9,.84]},sad:{label:"Blue",icon:"😢",a:[.24,.45,1],b:[.14,.14,.55]},anger:{label:"Fired up",icon:"😠",a:[1,.16,.12],b:[1,.55,0]},surprise:{label:"Amazed",icon:"😮",a:[0,.9,1],b:[.95,.98,1]}},q=Object.keys(B),C=(u,e,a)=>((u[e]??0)+(u[a]??0))/2,X=u=>Math.max(0,Math.min(1,u));function Ge(u){const e=C(u,"mouthSmileLeft","mouthSmileRight"),a=C(u,"cheekSquintLeft","cheekSquintRight"),s=C(u,"eyeWideLeft","eyeWideRight"),l=C(u,"browDownLeft","browDownRight"),r=C(u,"noseSneerLeft","noseSneerRight"),o=C(u,"eyeSquintLeft","eyeSquintRight"),t=C(u,"mouthFrownLeft","mouthFrownRight"),i=C(u,"mouthPressLeft","mouthPressRight"),n=u.browInnerUp??0,c=C(u,"browOuterUpLeft","browOuterUpRight"),h=u.jawOpen??0,d=X(e*1.7+a*.5),p=X(s*1.8+n*.5+c*.6+h*.35-d*.6),f=X(l*2.1+r*1.2+i*.5+o*.3-d*.8),m=X(t*2.3+n*.7-s*.8-d*.9),g=X(1-Math.max(d,p,f,m)*1.7)*.9;return{joy:d,calm:g,sad:m,anger:f,surprise:p}}class Ne{constructor(){this.s={joy:0,calm:1,sad:0,anger:0,surprise:0}}push(e,a){const s=e??{joy:0,calm:1,sad:0,anger:0,surprise:0},l=1-Math.exp(-a*3.2);for(const r of q)this.s[r]+=(s[r]-this.s[r])*l}get(){let e="calm",a=-1,s=0;const l={};for(const i of q){const n=this.s[i];n>a&&(a=n,e=i),l[i]=Math.pow(n,1.6)+1e-4,s+=l[i]}const r=[0,0,0],o=[0,0,0];for(const i of q){const n=l[i]/s,c=B[i];for(let h=0;h<3;h++)r[h]+=c.a[h]*n,o[h]+=c.b[h]*n}const t=Math.max(this.s.joy,this.s.sad,this.s.anger,this.s.surprise);return{scores:{...this.s},dominant:e,intensity:t,a:r,b:o}}}class Be{constructor(){this.orbs=[],this.pops=[],this.nextId=1,this.nextSpawn=0,this.scores=new Map,this.lastCollect=null}reset(){this.orbs=[],this.pops=[],this.scores.clear(),this.lastCollect=null,this.nextSpawn=0}leaderboard(e=3){return[...this.scores.entries()].sort((a,s)=>s[1]-a[1]).slice(0,e).map(([a,s])=>({who:a,pts:s}))}totalFor(e){return this.scores.get(e)??0}spawn(e){const a=Math.random()<.5,s=Math.random()<.1;this.orbs.push({id:this.nextId++,emo:q[Math.random()*q.length|0],value:s?5:1,x:a?-.08:1.08,y:.16+Math.random()*.62,vx:(a?1:-1)*(.05+Math.random()*.07),vy:(Math.random()-.5)*.02,r:s?.085:.058+Math.random()*.02,born:e,phase:Math.random()*Math.PI*2})}update(e,a){a>=this.nextSpawn&&this.orbs.length<5&&(this.spawn(a),this.nextSpawn=a+1400+Math.random()*2200);for(const s of this.orbs)s.x+=s.vx*e,s.y+=s.vy*e+Math.sin((a-s.born)/700+s.phase)*.012*e*6;this.orbs=this.orbs.filter(s=>s.x>-.14&&s.x<1.14&&s.y>-.1&&s.y<1.1),this.pops=this.pops.filter(s=>a-s.born<s.ttl);for(const s of this.pops)s.x+=s.vx*e,s.y+=s.vy*e,s.kind==="spark"&&(s.vy+=.4*e)}tap(e,a,s,l,r){let o=null,t=1/0;for(const i of this.orbs){const n=e-i.x,c=(a-i.y)/l,h=Math.hypot(n,c),d=i.r*1.45;h<=d&&h<t&&(t=h,o=i)}if(!o)return!1;this.orbs=this.orbs.filter(i=>i.id!==o.id),this.scores.set(s,(this.scores.get(s)??0)+o.value),this.lastCollect={emo:o.emo,at:r},this.pops.push({kind:"ring",x:o.x,y:o.y,vx:0,vy:0,born:r,ttl:650,hue:o.emo});for(let i=0;i<14;i++){const n=Math.random()*Math.PI*2,c=.15+Math.random()*.25;this.pops.push({kind:"spark",x:o.x,y:o.y,vx:Math.cos(n)*c,vy:Math.sin(n)*c-.1,born:r,ttl:700+Math.random()*400,hue:o.emo})}return this.pops.push({kind:"text",x:o.x,y:o.y-.03,vx:0,vy:-.07,born:r,ttl:1500,hue:o.emo,text:`+${o.value} ${s.split(" ")[0]}`}),this.onCollect?.({who:s,orb:o}),!0}rgb(e,a,s){const l=B[e][a];return`rgba(${l[0]*255|0},${l[1]*255|0},${l[2]*255|0},${s})`}draw(e,a,s,l){e.save();for(const o of this.orbs){const t=o.x*a,i=o.y*s,n=o.r*a,c=1+Math.sin((l-o.born)/380+o.phase)*.06,h=n*c;e.globalCompositeOperation="lighter";const d=e.createRadialGradient(t,i,h*.4,t,i,h*2.6);d.addColorStop(0,this.rgb(o.emo,"a",.55)),d.addColorStop(1,this.rgb(o.emo,"b",0)),e.fillStyle=d,e.beginPath(),e.arc(t,i,h*2.6,0,Math.PI*2),e.fill(),e.globalCompositeOperation="source-over";const p=e.createRadialGradient(t-h*.3,i-h*.35,h*.1,t,i,h);p.addColorStop(0,"rgba(255,255,255,0.95)"),p.addColorStop(.35,this.rgb(o.emo,"a",.95)),p.addColorStop(1,this.rgb(o.emo,"b",.9)),e.fillStyle=p,e.beginPath(),e.arc(t,i,h,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,h*.07),e.strokeStyle="rgba(255,255,255,0.75)",e.stroke(),e.font=`${Math.round(h*1.05)}px serif`,e.textAlign="center",e.textBaseline="middle",e.fillText(B[o.emo].icon,t,i+h*.04),o.value>1&&(e.strokeStyle="rgba(255,225,120,0.9)",e.lineWidth=Math.max(2,h*.08),e.setLineDash([h*.25,h*.2]),e.lineDashOffset=-l/40,e.beginPath(),e.arc(t,i,h*1.35,0,Math.PI*2),e.stroke(),e.setLineDash([]))}for(const o of this.pops){const t=(l-o.born)/o.ttl,i=o.x*a,n=o.y*s;e.globalAlpha=Math.max(0,1-t),o.kind==="ring"?(e.strokeStyle=this.rgb(o.hue,"a",1),e.lineWidth=a*.012*(1-t),e.beginPath(),e.arc(i,n,a*(.05+t*.14),0,Math.PI*2),e.stroke()):o.kind==="spark"?(e.fillStyle=this.rgb(o.hue,"a",1),e.beginPath(),e.arc(i,n,a*.008*(1-t*.6),0,Math.PI*2),e.fill()):(e.font=`800 ${Math.round(a*.05)}px system-ui, sans-serif`,e.textAlign="center",e.textBaseline="middle",e.lineWidth=a*.008,e.strokeStyle="rgba(0,0,0,0.6)",e.strokeText(o.text,i,n),e.fillStyle="#fff",e.fillText(o.text,i,n))}e.globalAlpha=1;const r=this.leaderboard(3);if(r.length){const o=Math.round(a*.03),t=Math.round(a*.04),i=Math.round(s*.1);e.font=`700 ${o}px system-ui, sans-serif`,e.textAlign="left",e.textBaseline="top";const n=r.map((h,d)=>`${["🥇","🥈","🥉"][d]} ${h.who.split(" ")[0].slice(0,12)}  ${h.pts}`),c=Math.max(...n.map(h=>e.measureText(h).width))+o;e.fillStyle="rgba(0,0,0,0.45)",e.fillRect(t-o*.5,i-o*.4,c,n.length*o*1.35+o*.6),e.fillStyle="#fff",n.forEach((h,d)=>e.fillText(h,t,i+d*o*1.35))}e.restore()}}const Xe=`#version 300 es
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
}`,st={live:"Xenova/segformer-b0-finetuned-ade-512-512",remaster:"Xenova/segformer-b2-finetuned-ade-512-512"},le={},_={live:"idle",remaster:"idle"},v={none:0,sky:1,foliage:2,grass:3,earth:4,rock:5,water:6,building:7,plaster:8,floor:9,wood:10,fabric:11,metal:12,person:13,road:14,flower:15,light:16,fire:17,paper:18,animal:19,food:20,glass:21,apparel:22},ne={sky:v.sky,tree:v.foliage,plant:v.foliage,palm:v.foliage,grass:v.grass,field:v.grass,earth:v.earth,sand:v.earth,path:v.earth,land:v.earth,"dirt track":v.earth,mountain:v.rock,rock:v.rock,hill:v.rock,stone:v.rock,water:v.water,sea:v.water,river:v.water,lake:v.water,"swimming pool":v.water,waterfall:v.water,fountain:v.water,building:v.building,house:v.building,skyscraper:v.building,tower:v.building,bridge:v.building,hovel:v.building,column:v.building,wall:v.plaster,ceiling:v.plaster,floor:v.floor,rug:v.floor,stairs:v.floor,stairway:v.floor,step:v.floor,table:v.wood,cabinet:v.wood,chair:v.wood,desk:v.wood,shelf:v.wood,bookcase:v.wood,door:v.wood,"chest of drawers":v.wood,wardrobe:v.wood,bench:v.wood,"coffee table":v.wood,counter:v.wood,buffet:v.wood,barrel:v.wood,fence:v.wood,bannister:v.wood,railing:v.wood,"swivel chair":v.wood,stool:v.wood,box:v.wood,sofa:v.fabric,armchair:v.fabric,cushion:v.fabric,pillow:v.fabric,curtain:v.fabric,blanket:v.fabric,bed:v.fabric,towel:v.fabric,blind:v.fabric,seat:v.fabric,ottoman:v.fabric,awning:v.fabric,tent:v.fabric,canopy:v.fabric,car:v.metal,bus:v.metal,truck:v.metal,van:v.metal,airplane:v.metal,ship:v.metal,boat:v.metal,bicycle:v.metal,minibike:v.metal,streetlight:v.metal,pole:v.metal,radiator:v.metal,stove:v.metal,refrigerator:v.metal,person:v.person,sculpture:v.person,statue:v.person,base:v.apparel,road:v.road,sidewalk:v.road,runway:v.road,flower:v.flower,lamp:v.light,light:v.light,chandelier:v.light,sconce:v.light,fireplace:v.fire,painting:v.paper,poster:v.paper,book:v.paper,signboard:v.paper,"bulletin board":v.paper,flag:v.paper,animal:v.animal,food:v.food,windowpane:v.glass,mirror:v.glass,glass:v.glass,bottle:v.glass,vase:v.glass,apparel:v.apparel,bag:v.apparel};function te(u){const e=le[u];if(e)return e;const a=st[u];_[u]="loading";const s=(async()=>{try{const l=await ae(()=>import("./transformers.web-BUbDYS53.js"),[]),r=typeof navigator<"u"&&!!navigator.gpu,o=await l.AutoProcessor.from_pretrained(a);let t=null;for(const i of r?["webgpu","wasm"]:["wasm"])try{t=await l.AutoModel.from_pretrained(a,{device:i,dtype:i==="webgpu"?"fp32":"q8"});break}catch(n){console.warn("[sceneSegment] device",i,"failed:",n?.message||n)}return _[u]=t?"ready":"failed",t?{model:t,processor:o,tf:l}:null}catch(l){return console.warn("[sceneSegment] load failed:",l?.message||l),_[u]="failed",null}})();return le[u]=s,s}let O=null;function ot(u,e){const[,a,s,l]=u.dims,r=u.data;if(!O||O.length!==a){O=new Uint8Array(a);for(let h=0;h<a;h++){const d=String(e?.[h]??"").toLowerCase();O[h]=ne[d]??ne[d.split(/[,;]/)[0].trim()]??v.none}}const o=new Uint8Array(l*s*2),t=l*s,i=new Float32Array(t).fill(-1e9),n=new Float32Array(t).fill(-1e9),c=new Uint8Array(t);for(let h=0;h<a;h++){const d=h*t;for(let p=0;p<t;p++){const f=r[d+p];f>i[p]?(n[p]=i[p],i[p]=f,c[p]=h):f>n[p]&&(n[p]=f)}}for(let h=0;h<t;h++)o[h*2]=O[c[h]],o[h*2+1]=Math.round(255*(1-Math.exp(n[h]-i[h])));return{data:o,w:l,h:s,stamp:0,rect:[0,0,1,1]}}async function it(u,e){const a=await te(e);if(!a)return null;try{const s=await a.tf.RawImage.fromCanvas(u),l=await a.processor(s),{logits:r}=await a.model(l),o=r.location&&r.location!=="cpu"&&r.getData?await r.getData(!0):null;return ot(o?{dims:r.dims,data:o}:r,a.model.config?.id2label??{})}catch(s){return console.warn("[sceneSegment] segment failed:",s?.message||s),null}}function rt(u,e){e.width=96,e.height=54;const l=e.getContext("2d",{willReadFrequently:!0});l.drawImage(u,0,0,96,54);const r=l.getImageData(0,0,96,54).data,o=d=>{let p=0;for(let f=0;f<54;f++)p+=r[(f*96+d)*4+1];return p/54},t=d=>{let p=0;for(let f=0;f<96;f++)p+=r[(d*96+f)*4+1];return p/96};let i=0,n=95,c=0,h=53;for(;i<96/3&&o(i)<10;)i++;for(;n>192/3&&o(n)<10;)n--;for(;c<54/3&&t(c)<10;)c++;for(;h>108/3&&t(h)<10;)h--;return[i/96,c/54,(n+1)/96,(h+1)/54]}function lt(u){const e=u.getContext("2d",{willReadFrequently:!0}),a=e.getImageData(0,0,u.width,u.height),s=a.data,l=new Uint32Array(256);for(let c=0;c<s.length;c+=16)l[s[c]*77+s[c+1]*150+s[c+2]*29>>8]++;let r=0;for(const c of l)r+=c;let o=0,t=255,i=0;for(let c=0;c<256;c++)if(i+=l[c],i>r*.02){o=c;break}i=0;for(let c=255;c>=0;c--)if(i+=l[c],i>r*.02){t=c;break}if(t-o<24)return;const n=255/(t-o);for(let c=0;c<s.length;c+=4)s[c]=(s[c]-o)*n,s[c+1]=(s[c+1]-o)*n,s[c+2]=(s[c+2]-o)*n;e.putImageData(a,0,0)}function nt(u,e,a,s,l,r){const o=rt(u,r),t=(o[2]-o[0])*e,i=(o[3]-o[1])*a;return l.width=512,l.height=Math.max(2,Math.round(512*i/t)),l.getContext("2d").drawImage(u,o[0]*e,o[1]*a,t,i,0,0,l.width,l.height),lt(l),it(l,s).then(n=>(n&&(n.rect=o),n))}class ht{constructor(e="live"){this.tier=e,this.map=null,this.busy=!1,this.last=0,this.frame=document.createElement("canvas"),this.probe=document.createElement("canvas"),this.stamp=0}setTier(e){e!==this.tier&&(this.tier=e,_[e]==="idle"&&te(e))}init(){te(this.tier)}state(){return _[this.tier]==="ready"||_.live!=="ready"?_[this.tier]:"ready"}update(e,a){const s=_[this.tier]==="ready"?this.tier:_.live==="ready"?"live":null;if(!s)return this.map;if(!this.busy&&a-this.last>(s==="live"?330:120)){const l=e.videoWidth||e.width||0,r=e.videoHeight||e.height||0;if(!l||!r)return this.map;this.busy=!0,this.last=a;try{nt(e,l,r,s,this.frame,this.probe).then(o=>{o&&(o.stamp=++this.stamp,this.map=o)}).finally(()=>{this.busy=!1})}catch{this.busy=!1}}return this.map}}const we={[v.sky]:{dark:[240,.075,.45],bright:[252,.03,.92],trust:.9},[v.foliage]:{dark:[165,.05,.15],bright:[120,.085,.55],trust:.85,flag:.25},[v.grass]:{dark:[145,.06,.15],bright:[115,.1,.6],trust:.85},[v.earth]:{dark:[58,.035,.15],bright:[75,.045,.7],trust:.7},[v.rock]:{dark:[70,.012,.2],bright:[82,.02,.8],trust:.6},[v.water]:{dark:[232,.045,.2],bright:[205,.03,.8],trust:.8},[v.building]:{dark:[62,.022,.2],bright:[80,.028,.8],trust:.6},[v.plaster]:{dark:[75,.02,.3],bright:[86,.028,.85],trust:.6},[v.floor]:{dark:[52,.045,.15],bright:[70,.04,.6],trust:.6},[v.wood]:{dark:[50,.06,.1],bright:[66,.05,.6],trust:.7},[v.fabric]:{dark:[22,.055,.15],bright:[45,.035,.7],trust:.5},[v.metal]:{dark:[250,.01,.1],bright:[240,.008,.9],trust:.6},[v.person]:{dark:[42,.085,.35],bright:[58,.06,.8],trust:0,flag:1},[v.road]:{dark:[75,.006,.2],bright:[82,.01,.8],trust:.7},[v.flower]:{dark:[18,.12,.2],bright:[92,.1,.8],trust:.7},[v.light]:{dark:[70,.09,.5],bright:[88,.04,.98],trust:.8},[v.fire]:{dark:[42,.14,.35],bright:[82,.09,.95],trust:.9},[v.paper]:{dark:[80,.02,.3],bright:[90,.016,.9],trust:.5},[v.animal]:{dark:[58,.04,.15],bright:[70,.035,.75],trust:.6},[v.food]:{dark:[55,.06,.2],bright:[82,.06,.8],trust:.6},[v.glass]:{dark:[230,.015,.2],bright:[220,.01,.9],trust:.5},[v.apparel]:{dark:[255,.03,.1],bright:[80,.02,.85],trust:.4,flag:.5}},he=u=>Math.max(0,Math.min(255,Math.round((u*2+.5)*255))),ce=u=>Math.max(0,Math.min(255,Math.round(u*255)));function ue(u=we){const e=new Uint8Array(256);for(const[a,s]of Object.entries(u)){const l=Number(a);if(!s||l<0||l>=32)continue;[s.dark,s.bright].forEach(([o,t,i],n)=>{const c=(n*32+l)*4,h=o*Math.PI/180;e[c]=he(Math.cos(h)*t),e[c+1]=he(Math.sin(h)*t),e[c+2]=ce(i),e[c+3]=ce(n===0?s.trust:s.flag??0)})}return e}function ct(u,[e,a]){return{...u,dark:[e,a*1.1,u.dark[2]],bright:[e,a*.75,u.bright[2]],trust:Math.max(u.trust,.85)}}class ut{constructor(){this.script=null,this.shotIdx=-2,this.palette=ue(),this.stamp=0}set(e){this.script=e,this.shotIdx=-2,this.rebuild(null)}get(){return this.script}shotAt(e){const a=this.script?.shots;if(!a?.length)return-1;let s=0,l=a.length-1;for(;s<=l;){const r=s+l>>1;if(e<a[r].t0)l=r-1;else if(e>=a[r].t1)s=r+1;else return r}return-1}rebuild(e){const a={...we},s=l=>{for(const[r,o]of Object.entries(l||{})){const t=v[r],i=a[t];o&&i&&(a[t]=ct(i,o))}};s(this.script?.materials),s(e?.materials),this.palette=ue(a),this.stamp++}update(e){const a=this.shotAt(e);return a===this.shotIdx?!1:(this.shotIdx=a,this.rebuild(a>=0?this.script.shots[a]:null),!0)}palettePixels(){return this.palette}peopleCount(){return this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.length??0:0}wardrobe(e){const a=e<0?void 0:this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.[e]:void 0;return[a?.top?.[0]??0,a?.top?.[1]??0,a?.bottom?.[0]??0,a?.bottom?.[1]??0]}look(e){const a=e<0?void 0:this.shotIdx>=0?this.script?.shots?.[this.shotIdx]?.people?.[e]?.who:void 0,s=a?this.script?.cast?.find(l=>l.name===a):void 0;return[s?.skin?.[0]??0,s?.skin?.[1]??0,s?.hair?.[0]??0,s?.hair?.[1]??0]}stock(){return this.script?.stock}grade(){return this.script?.grade??0}}const I=48,z=27;class ft{constructor(){this.c=document.createElement("canvas"),this.x=this.c.getContext("2d",{willReadFrequently:!0}),this.prev=null,this.energy=0,this.burst=0,this.cx=.5,this.cy=.5,this.luma=.5,this.c.width=I,this.c.height=z}update(e){try{this.x.drawImage(e,0,0,I,z)}catch{return}const a=this.x.getImageData(0,0,I,z).data,s=new Float32Array(I*z);let l=0,r=0,o=0,t=0;for(let n=0,c=0;c<s.length;n+=4,c++){const h=(a[n]*.299+a[n+1]*.587+a[n+2]*.114)/255;if(s[c]=h,l+=h,this.prev){const d=Math.abs(h-this.prev[c]),p=d>.06?d:0;r+=p,o+=p*(c%I),t+=p*Math.floor(c/I)}}this.luma=l/s.length;const i=this.prev?Math.min(1,r/s.length*9):0;this.burst=i,this.energy+=(i-this.energy)*(i>this.energy?.45:.08),r>.5&&(this.cx+=(o/r/(I-1)-this.cx)*.3,this.cy+=(t/r/(z-1)-this.cy)*.3),this.prev=s}}class dt{constructor(){this.vx=0,this.vy=0,this.speed=0,this.clicks=0,this.lx=NaN,this.ly=NaN,this.lt=0,this.users=0,this.onMove=e=>{const a=e.timeStamp||performance.now();if(!Number.isNaN(this.lx)&&a>this.lt){const s=Math.max(4,a-this.lt)/1e3,l=(e.clientX-this.lx)/s,r=(e.clientY-this.ly)/s;this.vx+=(l-this.vx)*.5,this.vy+=(r-this.vy)*.5}this.lx=e.clientX,this.ly=e.clientY,this.lt=a},this.onDown=()=>{this.clicks++}}attach(){this.users++===0&&typeof window<"u"&&(window.addEventListener("pointermove",this.onMove,{passive:!0}),window.addEventListener("pointerdown",this.onDown,{passive:!0}))}detach(){--this.users===0&&typeof window<"u"&&(window.removeEventListener("pointermove",this.onMove),window.removeEventListener("pointerdown",this.onDown))}step(e){const a=Math.exp(-e*7);this.vx*=a,this.vy*=a,this.speed+=(Math.hypot(this.vx,this.vy)-this.speed)*(1-Math.exp(-e*12))}}const U=new dt;class mt{constructor(){this.attached=!1,this.seenClicks=0}get vx(){return U.vx}get vy(){return U.vy}get speed(){return U.speed}start(){this.attached||(this.attached=!0,U.attach(),this.seenClicks=U.clicks)}stop(){this.attached&&(this.attached=!1,U.detach())}step(e){U.step(e)}takeClicks(){const e=U.clicks-this.seenClicks;return this.seenClicks=U.clicks,e}}class pt{constructor(){this.mod=null,this.loading=!1,this.canvas=null,this.lastPull=0,this.stamp=0}state(){return this.mod?this.mod.depthMatteStatus():this.loading?"loading":"idle"}init(){this.mod||this.loading||(this.loading=!0,ae(()=>import("./depthMatte-B6VYYJZ_.js"),__vite__mapDeps([0,1])).then(e=>{this.mod=e,e.loadDepthEstimator()}).catch(()=>{}).finally(()=>{this.loading=!1}))}update(e,a){if(!this.mod||this.mod.depthMatteStatus()!=="ready")return null;if(a-this.lastPull>120){this.lastPull=a;const s=this.mod.estimateDepthLatest(e,256,Math.max(2,Math.round(256*(e.videoHeight||9)/(e.videoWidth||16))));s&&(this.canvas=s,this.stamp++)}return this.canvas}}class gt{constructor(){this.mod=null,this.loading=!1,this.canvas=null,this.lastPull=0,this.stamp=0}init(){this.mod||this.loading||(this.loading=!0,ae(()=>import("./samMatte-CQPE_ElI.js"),__vite__mapDeps([2,1])).then(e=>{this.mod=e,e.loadSam()}).catch(()=>{}).finally(()=>{this.loading=!1}))}get active(){return!!this.mod||this.loading}update(e,a,s,l){if(!this.mod||this.mod.samMatteStatus()!=="ready")return null;if(a-this.lastPull>150){this.lastPull=a;const r=192,o=Math.max(2,Math.round(192*(e.videoHeight||9)/(e.videoWidth||16))),t=this.mod.segmentSamLatest(e,{x:s,y:l},r,o,.01);t&&(this.canvas=t,this.stamp++)}return this.canvas}}const N="#0b0a0a";function vt(u,e=.18){let[a,s,l]=u.map(n=>n/255);const r=.299*a+.587*s+.114*l,o=1.35;a=r+(a-r)*o,s=r+(s-r)*o,l=r+(l-r)*o;const t=r<e?e-r:0,i=n=>Math.round(Math.max(0,Math.min(1,n+t))*12)/12;return[i(a)*255,i(s)*255,i(l)*255]}const yt=u=>`rgb(${u[0]|0},${u[1]|0},${u[2]|0})`,bt=(u,e)=>{const a=/rgb\((\d+),(\d+),(\d+)\)/.exec(u);return a?`rgb(${+a[1]*e|0},${+a[2]*e|0},${+a[3]*e|0})`:u};function D(u,e,a,s){u.save(),u.shadowColor="rgba(0,0,0,0.28)",u.shadowOffsetX=s*.9,u.shadowOffsetY=s*1.3,u.shadowBlur=0,u.fillStyle=a,u.beginPath(),e(),u.fill(),u.restore(),u.lineWidth=s,u.strokeStyle=N,u.lineJoin="round",u.beginPath(),e(),u.stroke()}function Tt(u,e,a,s,l,r,o,t){u.save(),u.lineCap="round",u.strokeStyle="rgba(0,0,0,0.28)",u.lineWidth=r+t*2,u.beginPath(),u.moveTo(e+t,a+t*1.3),u.lineTo(s+t,l+t*1.3),u.stroke(),u.strokeStyle=N,u.lineWidth=r+t*2,u.beginPath(),u.moveTo(e,a),u.lineTo(s,l),u.stroke(),u.strokeStyle=o,u.lineWidth=r,u.beginPath(),u.moveTo(e,a),u.lineTo(s,l),u.stroke(),u.restore()}function xt(u,e,a,s,l){const r=e.r,o=r*2,t=Math.max(2,r*.045);u.save(),u.globalAlpha=l;let i=e.roll*.4;if(a?.shoulderL&&a.shoulderR&&a.shoulderL.v>.5&&a.shoulderR.v>.5){const w=Math.atan2(a.shoulderL.y-a.shoulderR.y,a.shoulderL.x-a.shoulderR.x),E=Math.atan2(Math.sin(w),Math.cos(w));i=Math.max(-.3,Math.min(.3,Math.abs(E)>Math.PI/2?E-Math.sign(E)*Math.PI:E))}const n=e.x-Math.sin(e.roll)*r*.78,c=e.y+Math.cos(e.roll)*r*.78,h=o*.92,d=o*.6,p=o*.16;u.save(),u.translate(n,c),u.rotate(i);for(const w of[-1,1])D(u,()=>{u.rect(w*h*.2-h*.14,d*.9,h*.28,p)},s.pants,t),D(u,()=>{u.ellipse(w*h*.24,d*.9+p,h*.2,o*.06,0,0,Math.PI*2)},"#111111",t);D(u,()=>{u.moveTo(-h*.36,0),u.quadraticCurveTo(-h*.5,d*.45,-h*.5,d*.95),u.lineTo(h*.5,d*.95),u.quadraticCurveTo(h*.5,d*.45,h*.36,0),u.closePath()},s.shirt,t),u.strokeStyle=bt(s.shirt,.55),u.lineWidth=t*.8,u.beginPath(),u.moveTo(0,d*.12),u.lineTo(0,d*.93),u.stroke(),u.restore();const f=Math.cos(i),m=Math.sin(i),g=(w,E)=>({x:n+w*f-E*m,y:c+w*m+E*f}),y=o*.4,b=o*.13;for(const w of[-1,1]){const E=g(w*h*.4,d*.22),A=w<0?a?.wristR&&a.wristR.x<n?a.wristR:a?.wristL&&a.wristL.x<n?a.wristL:null:a?.wristL&&a.wristL.x>=n?a.wristL:a?.wristR&&a.wristR.x>=n?a.wristR:null;let P=Math.PI/2+w*-.35+i;A&&A.v>.45&&(P=Math.atan2(A.y-E.y,A.x-E.x));const L=E.x+Math.cos(P)*y,$=E.y+Math.sin(P)*y;Tt(u,E.x,E.y,L,$,b,s.shirt,t),D(u,()=>{u.arc(L,$,o*.075,0,Math.PI*2)},s.glove,t)}u.save(),u.translate(e.x,e.y),u.rotate(e.roll);const T=r*1.04,R=r*.94;D(u,()=>{u.ellipse(0,0,T,R,0,0,Math.PI*2)},s.skin,t),D(u,()=>{u.ellipse(0,-R*.02,T*1.02,R*.98,0,Math.PI*1.08,Math.PI*1.92);const w=6;for(let E=0;E<=w;E++){const A=E/w,P=T*.86-A*T*1.72,L=-R*.38+Math.sin(A*Math.PI*w)*R*.04-Math.sin(A*Math.PI)*R*.1;u.lineTo(P,L)}u.closePath()},s.hair,t),u.restore();const x=r*.27,S=r*.33;for(let w=0;w<2;w++){const E=w===0?-1:1,A=e.eyes[w]||e.eyes[0],P=E*r*.26,L=-r*.02,$=e.x+P*Math.cos(e.roll)-L*Math.sin(e.roll),Ee=e.y+P*Math.sin(e.roll)+L*Math.cos(e.roll);if(u.save(),u.translate($,Ee),u.rotate(e.roll+E*.22),D(u,()=>{u.ellipse(0,0,x,S,0,0,Math.PI*2)},"#ffffff",t*.9),A&&A.open<.12)u.strokeStyle=N,u.lineWidth=t,u.beginPath(),u.moveTo(-x*.8,0),u.lineTo(x*.8,0),u.stroke();else{const se=Re=>Math.max(-.5,Math.min(.5,Re*3));u.fillStyle=N,u.beginPath(),u.arc(-E*x*.18+se(A?.gx??0)*x,se(A?.gy??0)*S,Math.max(1.5,r*.055),0,Math.PI*2),u.fill()}u.restore()}u.save(),u.translate(e.x,e.y),u.rotate(e.roll);const k=r*.5,M=r*.5;if(u.fillStyle=N,u.strokeStyle=N,e.mouthOpen<.07)u.lineWidth=Math.max(2,t*1.1),u.lineCap="round",u.beginPath(),u.moveTo(-k/2,M),u.quadraticCurveTo(0,M+k*.14,k/2,M),u.stroke();else{const w=Math.min(k*.9,e.mouthOpen*k*1.8);u.beginPath(),u.moveTo(-k/2,M),u.lineTo(k/2,M),u.ellipse(0,M,k/2,w,0,0,Math.PI),u.closePath(),u.fill(),w>k*.4&&(u.save(),u.clip(),u.fillStyle="#d9526b",u.beginPath(),u.ellipse(0,M+w*.95,k*.28,w*.38,0,0,Math.PI*2),u.fill(),u.restore())}u.restore(),u.restore()}const F={shoulderL:11,shoulderR:12,elbowL:13,elbowR:14,wristL:15,wristR:16},fe="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",kt="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",wt="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";class Mt{constructor(){this.pl=null,this.ready=!1,this.loading=!1,this.wantMask=!1}async init(e={}){if(this.ready)return!0;if(this.loading)return!1;this.loading=!0;try{const a=await import(fe),s=await a.FilesetResolver.forVisionTasks(`${fe}/wasm`);for(const l of["GPU","CPU"])try{this.pl=await a.PoseLandmarker.createFromOptions(s,{baseOptions:{modelAssetPath:e.full?wt:kt,delegate:l},runningMode:"VIDEO",numPoses:1,outputSegmentationMasks:!!e.segmentation});break}catch(r){console.warn(`[vtuber] PoseLandmarker ${l} delegate failed:`,r)}this.ready=!!this.pl,this.wantMask=!!e.segmentation}catch(a){console.warn("[vtuber] PoseLandmarker init failed:",a)}finally{this.loading=!1}return this.ready}detect(e,a){if(!this.ready||!this.pl)return null;try{const s=this.pl.detectForVideo(e,a),l=s?.landmarks?.[0],r=s?.segmentationMasks;let o;if(this.wantMask&&r?.[0]){try{const i=r[0];o={data:new Float32Array(i.getAsFloat32Array()),w:i.width,h:i.height}}catch{}for(const i of r)try{i.close()}catch{}}if(!l||!l.length)return null;const t=s?.worldLandmarks?.[0];return{pts:l.map(i=>({x:i.x,y:i.y,v:i.visibility??1})),world:t?.map((i,n)=>({x:i.x,y:i.y,z:i.z,v:l[n]?.visibility??1})),mask:o}}catch{return null}}dispose(){try{this.pl?.close?.()}catch{}this.pl=null,this.ready=!1}get isReady(){return this.ready}}class de{constructor(e={}){this.filter="jackolantern",this.dimLights=!1,this.batSwarm=!1,this.audioMouthBoost=0,this.mirrored=!1,this.faceLayer=null,this.blendshapes=null,this.headMatrix=null,this.blendAt=-1e9,this.worker=new ee,this.sync=null,this.feed=new Te,this.faceState="idle",this.lastSend=-1e9,this.lastTs=-1,this.lastSync=-1e9,this.lastApply=0,this.tracks=[],this.bats=[],this.dust=[],this.beamX=.5,this.beamY=.46,this.expressions=!!e.expressions,this.initBats(),this.initDust(),this.ensureFaceTracker()}initBats(){const e=["#f97316","#ef4444","#fbbf24","#a855f7"];this.bats=Array.from({length:22},(a,s)=>{const l=.3+s/22*1.35;return{x:Math.random(),y:.12+Math.random()*.72,z:l,vx:(Math.random()>.5?1:-1)*(.08+Math.random()*.18)*l,vy:(Math.random()-.5)*.08,wingPhase:Math.random()*Math.PI*2,wingSpeed:11+Math.random()*8,orbitAngle:s/22*Math.PI*2,orbitRadius:.14+s%5*.055,eyeColor:e[s%e.length]}})}initDust(){this.dust=Array.from({length:38},()=>({x:Math.random(),y:Math.random(),vx:(Math.random()-.5)*.025,vy:-.015-Math.random()*.025,size:1+Math.random()*2.4,alpha:.2+Math.random()*.55}))}ensureFaceTracker(){if(this.faceState!=="idle")return;this.faceState="loading";const e=this.expressions?{numFaces:1,blendshapes:!0}:{numFaces:2,blendshapes:!1};this.worker.init(e).then(async a=>{if(a){this.faceState="worker";return}const s=new be;await s.init(e)?(this.sync=s,this.faceState="sync"):this.faceState="failed"})}setFilter(e){this.filter=e,e!=="none"&&this.ensureFaceTracker()}getFilter(){return this.filter}getTrackingStatus(e=performance.now()){return{state:this.faceState,locked:this.tracks.some(a=>e-a.seenAt<650)}}setFaceLayer(e){this.faceLayer=e,e&&this.ensureFaceTracker()}setMirrored(e){this.mirrored=e}setDimLights(e){this.dimLights=e}getDimLights(){return this.dimLights}setBatSwarm(e){this.batSwarm=e}getBatSwarm(){return this.batSwarm}setAudioLevel(e){this.audioMouthBoost=Math.max(0,Math.min(1,e))}feedVideoFaces(e,a,s,l){if(e.readyState<2||!e.videoWidth)return;const r=1e3/28;let o=null,t=!1;if(this.faceState==="worker"){a-this.lastSend>=r&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),this.worker.send(this.feed.src(e),this.lastTs),this.lastSend=a);const i=this.worker.poll();t=i.fresh,o=i.frame}else this.faceState==="sync"&&this.sync&&a-this.lastSync>=90&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),o=this.sync.detect(this.feed.src(e),this.lastTs),this.lastSync=a,t=!0);t&&o?.blendshapes&&Object.keys(o.blendshapes).length&&(this.blendshapes=o.blendshapes,this.headMatrix=o.matrix??null,this.blendAt=a),t&&o?.faces&&o.faces.length>0&&this.ingestDetectedFaces(o.faces,e.videoWidth,e.videoHeight,s,l,a)}ingestDetectedFaces(e,a,s,l,r,o){const t=Math.max(l/a,r/s),i=(l-a*t)/2,n=(r-s*t)/2,c=d=>this.mirrored?l-(d*a*t+i):d*a*t+i,h=this.mirrored?-1:1;for(const d of e){const p={x:c(d.eyes[0].cx),y:d.eyes[0].cy*s*t+n,r:Math.hypot(d.eyes[0].dx*a,d.eyes[0].dy*s)*t*.65,gx:h*d.eyes[0].gx,gy:d.eyes[0].gy,open:d.eyes[0].open},f={x:c(d.eyes[1].cx),y:d.eyes[1].cy*s*t+n,r:Math.hypot(d.eyes[1].dx*a,d.eyes[1].dy*s)*t*.65,gx:h*d.eyes[1].gx,gy:d.eyes[1].gy,open:d.eyes[1].open},[m,g]=p.x<=f.x?[p,f]:[f,p],y=Math.atan2(g.y-m.y,g.x-m.x),b={x:c(d.mouth.cx),y:d.mouth.cy*s*t+n,w:Math.hypot(d.mouth.dx*a,d.mouth.dy*s)*t,open:Math.max(d.mouth.open,this.audioMouthBoost*.55)},T=d.bbox,R=c(T.x+T.w/2),x=(T.y+T.h/2)*s*t+n,S=T.w*a*t*.5*1.12,k=T.h*s*t*.5*1.18;let M=this.tracks[0];M?(M.seenAt=o,M.tcx=R,M.tcy=x,M.trx=S,M.try_=k,M.troll=y,M.teyes=[{...m},{...g}],M.tmouth={...b}):(M={cx:R,cy:x,rx:S,ry:k,roll:y,eyes:[{...m},{...g}],mouth:{...b},seenAt:o,alpha:1,tcx:R,tcy:x,trx:S,try_:k,troll:y,teyes:[{...m},{...g}],tmouth:{...b}},this.tracks.push(M))}}stepAndEnsureTracks(e,a,s,l){const r=a/1e3;if(!this.tracks.some(n=>a-n.seenAt<650)){const n=Math.sin(r*1.15)*s*.025+Math.cos(r*2.3)*s*.008,c=Math.sin(r*1.7)*l*.016,h=s*.5+n,d=l*.45+c,p=Math.min(s,l)*.21,f=p*1.24,m=Math.sin(r*.95)*.065,g=Math.max(0,Math.sin(r*6.8)*.6+Math.sin(r*11.3)*.4)*(.35+.65*Math.max(0,Math.sin(r*1.6))),y=Math.max(this.audioMouthBoost*.65,g*.42),b=Math.sin(r*.8)*.22,T=Math.cos(r*1.1)*.12,R=p*.41,x=-f*.12,S=p*.21,k={x:h-R,y:d+x,r:S,gx:b,gy:T,open:.3},M={x:h+R,y:d+x,r:S,gx:b,gy:T,open:.3},w={x:h,y:d+f*.42,w:p*.82,open:y};if(this.tracks.length===0)this.tracks.push({cx:h,cy:d,rx:p,ry:f,roll:m,eyes:[k,M],mouth:w,seenAt:a-700,alpha:1,tcx:h,tcy:d,trx:p,try_:f,troll:m,teyes:[k,M],tmouth:w});else{const E=this.tracks[0];E.tcx=h,E.tcy=d,E.trx=p,E.try_=f,E.troll=m,E.teyes=[k,M],E.tmouth=w,E.alpha=1}}const t=1-Math.exp(-e*20),i=1-Math.exp(-e*30);for(const n of this.tracks){n.cx+=(n.tcx-n.cx)*t,n.cy+=(n.tcy-n.cy)*t,n.rx+=(n.trx-n.rx)*t,n.ry+=(n.try_-n.ry)*t,n.roll+=(n.troll-n.roll)*t;for(let h=0;h<2;h++)n.eyes[h].x+=(n.teyes[h].x-n.eyes[h].x)*t,n.eyes[h].y+=(n.teyes[h].y-n.eyes[h].y)*t,n.eyes[h].r+=(n.teyes[h].r-n.eyes[h].r)*t,n.eyes[h].gx+=(n.teyes[h].gx-n.eyes[h].gx)*t,n.eyes[h].gy+=(n.teyes[h].gy-n.eyes[h].gy)*t;n.mouth.x+=(n.tmouth.x-n.mouth.x)*t,n.mouth.y+=(n.tmouth.y-n.mouth.y)*t,n.mouth.w+=(n.tmouth.w-n.mouth.w)*t;const c=Math.max(n.tmouth.open,this.audioMouthBoost*.65);n.mouth.open+=(c-n.mouth.open)*i}}apply(e,a,s,l){const r=a.width,o=a.height;if(!r||!o)return;const t=Math.max(1/120,Math.min(.1,this.lastApply?(l-this.lastApply)/1e3:1/30));this.lastApply=l,s&&this.feedVideoFaces(s,l,r,o),this.stepAndEnsureTracks(t,l,r,o);const i=this.tracks[0],n=l/1e3,c=this.filter==="bats"||this.batSwarm;if(c&&(this.stepBats(t,n,i,r,o),this.drawBatsLayer(e,r,o,n,0,.85)),i&&this.faceLayer){const h=St(i),d=l-i.seenAt<650&&l-this.blendAt<650;h.blendshapes=d?this.blendshapes:null,h.headMatrix=d?this.headMatrix:null,this.faceLayer(e,h,r,o,l)}else if(i)switch(this.filter){case"jackolantern":this.drawJackOLantern(e,i,r,o,n);break;case"ghostface":this.drawGhostFace(e,i,r,o,n);break;case"zombie":this.drawZombieFace(e,i,r,o,n);break;case"werewolf":this.drawWerewolfFace(e,i,r,o,n);break;case"vampire":this.drawVampireFace(e,i,r,o,n);break}c&&this.drawBatsLayer(e,r,o,n,.85,2.5),this.dimLights&&this.drawDimLightsFoundFootage(e,i,r,o,t,n)}drawJackOLantern(e,a,s,l,r){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const o=a.rx*1.18,t=a.ry*.98,i=Math.min(t*.45,a.mouth.open*t*.92),n=.88+.12*Math.sin(r*23)*Math.cos(r*14.7),c=e.createRadialGradient(0,t*.85,o*.1,0,t*1.15,o*1.65);c.addColorStop(0,`rgba(251, 146, 60, ${.42*n})`),c.addColorStop(.5,`rgba(234, 88, 12, ${.18*n})`),c.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=c,e.beginPath(),e.ellipse(0,t*1,o*1.6,t*.9,0,0,Math.PI*2),e.fill(),e.fillStyle="rgba(0, 0, 0, 0.65)",e.beginPath(),e.ellipse(0,t*.08+i*.3,o*1.08,t*1.04+i*.4,0,0,Math.PI*2),e.fill(),e.save(),e.beginPath(),e.moveTo(-o*.16,-t*.86),e.bezierCurveTo(-o*.22,-t*1.24,o*.04,-t*1.38,o*.24,-t*1.28),e.bezierCurveTo(o*.16,-t*1.12,o*.14,-t*.96,o*.18,-t*.85),e.closePath();const h=e.createLinearGradient(-o*.2,-t*1.3,o*.2,-t*.85);h.addColorStop(0,"#3f2e1e"),h.addColorStop(.5,"#293818"),h.addColorStop(1,"#1c1917"),e.fillStyle=h,e.fill(),e.lineWidth=Math.max(2,o*.025),e.strokeStyle="#0c0a09",e.stroke(),e.restore();const d=[{ox:-.74,w:.42,h:.9,shade:-.28},{ox:.74,w:.42,h:.9,shade:-.28},{ox:-.46,w:.46,h:.97,shade:-.12},{ox:.46,w:.46,h:.97,shade:-.12},{ox:-.21,w:.44,h:1.02,shade:.04},{ox:.21,w:.44,h:1.02,shade:.04},{ox:0,w:.46,h:1.04,shade:.14}];for(const x of d){const S=x.ox*o,k=x.w*o,M=x.h*t+i*(1-Math.abs(x.ox)*.65),w=e.createRadialGradient(S-k*.22,-M*.28,k*.08,S,M*.1,Math.max(k,M)*1.15);x.shade>0?(w.addColorStop(0,"#fdba74"),w.addColorStop(.32,"#f97316"),w.addColorStop(.76,"#c2410c"),w.addColorStop(1,"#431407")):x.shade>-.2?(w.addColorStop(0,"#fb923c"),w.addColorStop(.4,"#ea580c"),w.addColorStop(.8,"#9a3412"),w.addColorStop(1,"#3b0f04")):(w.addColorStop(0,"#ea580c"),w.addColorStop(.45,"#b45309"),w.addColorStop(.85,"#7c2d12"),w.addColorStop(1,"#270902")),e.fillStyle=w,e.beginPath(),e.ellipse(S,i*.22,k,M,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,o*.022),e.strokeStyle="rgba(28, 10, 3, 0.72)",e.stroke()}e.fillStyle="rgba(40, 12, 3, 0.18)";for(let x=0;x<9;x++){const S=x/9*Math.PI*2+.4,k=Math.cos(S)*o*.62,M=Math.sin(S)*t*.58;e.beginPath(),e.ellipse(k,M,o*.06,t*.04,S,0,Math.PI*2),e.fill()}const p=(x,S)=>{e.save(),e.translate(0,S),x(),e.fillStyle="#d97706",e.fill(),e.lineWidth=Math.max(2.5,o*.04),e.strokeStyle="#78350f",e.stroke(),e.restore(),e.save(),x(),e.clip();const k=e.createRadialGradient(0,t*.25+Math.sin(r*19)*t*.04,o*.04,0,0,o*.95);k.addColorStop(0,`rgba(255, 255, 240, ${.98*n})`),k.addColorStop(.28,`rgba(253, 224, 71, ${.96*n})`),k.addColorStop(.62,`rgba(249, 115, 22, ${.92*n})`),k.addColorStop(1,"#450a0a"),e.fillStyle=k,e.fillRect(-o,-t,o*2,t*2.5);for(let M=-2;M<=2;M++){const w=M*o*.22+Math.sin(r*14+M*2.1)*o*.05,E=t*(.35+.15*Math.sin(r*21+M)),A=e.createLinearGradient(w,t*.6,w,-E);A.addColorStop(0,"rgba(254, 240, 138, 0.85)"),A.addColorStop(.6,"rgba(249, 115, 22, 0.55)"),A.addColorStop(1,"rgba(239, 68, 68, 0)"),e.fillStyle=A,e.beginPath(),e.ellipse(w,t*.2,o*.12,E,0,0,Math.PI*2),e.fill()}e.restore(),x(),e.lineWidth=Math.max(2,o*.025),e.strokeStyle="#1c0a00",e.stroke()},f=o*.36,m=-t*.16,g=o*.27,y=t*.25;p(()=>{e.beginPath(),e.moveTo(-f-g*.85,m+y*.38),e.lineTo(-f-g*.08,m-y*.82),e.lineTo(-f+g*.78,m+y*.22),e.lineTo(-f+g*.12,m+y*.45),e.closePath()},t*.035),p(()=>{e.beginPath(),e.moveTo(f+g*.85,m+y*.38),e.lineTo(f+g*.08,m-y*.82),e.lineTo(f-g*.78,m+y*.22),e.lineTo(f-g*.12,m+y*.45),e.closePath()},t*.035),p(()=>{e.beginPath(),e.moveTo(0,-t*.02),e.lineTo(-o*.12,t*.19),e.lineTo(o*.12,t*.19),e.closePath()},t*.028);const b=t*.36,T=o*.72,R=t*.13+i*.88;p(()=>{e.beginPath(),e.moveTo(-T,b-t*.12),e.lineTo(-T*.68,b+t*.04),e.lineTo(-T*.52,b-t*.06),e.lineTo(-T*.28,b+t*.08),e.lineTo(-T*.14,b-t*.03),e.lineTo(T*.14,b-t*.03),e.lineTo(T*.28,b+t*.08),e.lineTo(T*.52,b-t*.06),e.lineTo(T*.68,b+t*.04),e.lineTo(T,b-t*.12),e.lineTo(T*.76,b+R*.82),e.lineTo(T*.46,b+R*.48),e.lineTo(T*.32,b+R*.98),e.lineTo(0,b+R*1.05),e.lineTo(-T*.32,b+R*.98),e.lineTo(-T*.46,b+R*.48),e.lineTo(-T*.76,b+R*.82),e.closePath()},-t*.032),e.restore()}drawGhostFace(e,a,s,l,r){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const o=a.rx*1.08,t=a.ry*1.15,i=Math.min(t*.68,a.mouth.open*t*1.25),n=e.createRadialGradient(0,-t*.1,o*.6,0,t*.2,o*1.65);n.addColorStop(0,"#090a0f"),n.addColorStop(.7,"#030407"),n.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=n,e.beginPath(),e.moveTo(0,-t*1.32),e.bezierCurveTo(o*1.45,-t*1.15,o*1.55,t*.55,o*1.15,t*1.45+i),e.lineTo(-o*1.15,t*1.45+i),e.bezierCurveTo(-o*1.55,t*.55,-o*1.45,-t*1.15,0,-t*1.32),e.closePath(),e.fill(),e.beginPath(),e.moveTo(0,-t*.94),e.bezierCurveTo(o*.88,-t*.92,o*.92,-t*.18,o*.68,t*.18),e.bezierCurveTo(o*.42,t*.54,o*.44,t*.96+i,0,t*1.06+i),e.bezierCurveTo(-o*.44,t*.96+i,-o*.42,t*.54,-o*.68,t*.18),e.bezierCurveTo(-o*.92,-t*.18,-o*.88,-t*.92,0,-t*.94),e.closePath();const c=e.createRadialGradient(-o*.18,-t*.25,o*.1,0,t*.2,t*1.3);c.addColorStop(0,"#f8fafc"),c.addColorStop(.55,"#e2e8f0"),c.addColorStop(.85,"#94a3b8"),c.addColorStop(1,"#334155"),e.fillStyle=c,e.fill(),e.lineWidth=Math.max(2,o*.03),e.strokeStyle="#0f172a",e.stroke(),e.fillStyle="rgba(15, 23, 42, 0.22)",e.beginPath(),e.ellipse(-o*.46,t*.24,o*.14,t*.28,.25,0,Math.PI*2),e.ellipse(o*.46,t*.24,o*.14,t*.28,-.25,0,Math.PI*2),e.fill();for(const g of[-1,1]){e.save(),e.beginPath(),e.moveTo(g*o*.14,-t*.22),e.bezierCurveTo(g*o*.42,-t*.36,g*o*.68,-t*.12,g*o*.54,t*.14),e.bezierCurveTo(g*o*.38,t*.32,g*o*.12,t*.08,g*o*.14,-t*.22),e.closePath(),e.fillStyle="#050508",e.fill();const y=g<0?0:1,b=a.eyes[y].gx*o*.08,T=a.eyes[y].gy*t*.08;e.fillStyle="rgba(165, 243, 252, 0.45)",e.beginPath(),e.arc(g*o*.36+b,-t*.04+T,Math.max(1.5,o*.025),0,Math.PI*2),e.fill(),e.restore()}e.fillStyle="#090d16",e.beginPath(),e.ellipse(-o*.055,t*.16,o*.032,t*.065,.2,0,Math.PI*2),e.ellipse(o*.055,t*.16,o*.032,t*.065,-.2,0,Math.PI*2),e.fill();const h=t*.34,d=t*.72+i*.95,p=(h+d)*.5,f=o*(.19+a.mouth.open*.08),m=Math.max(t*.16,(d-h)*.52);if(e.beginPath(),e.ellipse(0,p,f,m,0,0,Math.PI*2),e.fillStyle="#030407",e.fill(),e.lineWidth=Math.max(2,o*.025),e.strokeStyle="rgba(51, 65, 85, 0.7)",e.stroke(),a.mouth.open>.08)for(let g=0;g<4;g++){const y=p+Math.sin(r*4+g*1.7)*m*.6,b=Math.cos(r*3.2+g)*f*1.4,T=e.createRadialGradient(b,y,2,b,y,o*.28);T.addColorStop(0,`rgba(186, 230, 253, ${Math.min(.32,a.mouth.open*.5)})`),T.addColorStop(1,"rgba(186, 230, 253, 0)"),e.fillStyle=T,e.beginPath(),e.arc(b,y,o*.28,0,Math.PI*2),e.fill()}e.restore()}drawZombieFace(e,a,s,l,r){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const o=a.rx,t=a.ry;e.save();const i=e.createRadialGradient(0,-t*.1,o*.2,0,0,Math.max(o,t)*1.15);i.addColorStop(0,"rgba(132, 155, 118, 0.52)"),i.addColorStop(.65,"rgba(78, 95, 68, 0.62)"),i.addColorStop(.92,"rgba(35, 42, 30, 0.45)"),i.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=i,e.beginPath(),e.ellipse(0,0,o*1.06,t*1.08,0,0,Math.PI*2),e.fill(),e.restore();for(const f of[-1,1]){const m=e.createRadialGradient(f*o*.58,t*.14,o*.04,f*o*.58,t*.14,o*.34);m.addColorStop(0,"rgba(42, 18, 21, 0.72)"),m.addColorStop(.6,"rgba(63, 29, 36, 0.38)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.beginPath(),e.arc(f*o*.58,t*.14,o*.34,0,Math.PI*2),e.fill()}e.strokeStyle="rgba(58, 12, 24, 0.68)",e.lineCap="round";const n=[{x:-o*.72,y:-t*.35,dx:.22,dy:.18},{x:o*.72,y:-t*.35,dx:-.22,dy:.18},{x:-o*.54,y:t*.18,dx:.18,dy:-.14},{x:o*.54,y:t*.18,dx:-.18,dy:-.14}];for(const f of n){e.lineWidth=Math.max(1.4,o*.018),e.beginPath(),e.moveTo(f.x,f.y);const m=f.x+f.dx*o,g=f.y+f.dy*t;e.quadraticCurveTo(f.x+f.dx*o*.5,f.y,m,g),e.stroke(),e.lineWidth=Math.max(1,o*.011),e.beginPath(),e.moveTo(m,g),e.lineTo(m+f.dx*o*.55,g-f.dy*t*.6),e.moveTo(m,g),e.lineTo(m+f.dx*o*.45,g+f.dy*t*.75),e.stroke()}e.save(),e.beginPath(),e.moveTo(-o*.48,-t*.56),e.quadraticCurveTo(-o*.15,-t*.46,o*.18,-t*.62),e.lineWidth=Math.max(3.5,o*.042),e.strokeStyle="#450a0a",e.stroke(),e.lineWidth=Math.max(1.5,o*.018),e.strokeStyle="#991b1b",e.stroke(),e.strokeStyle="#1c1917",e.lineWidth=Math.max(1.2,o*.014);for(let f=.15;f<=.85;f+=.18){const m=-o*.48+f*o*.66,g=-t*.56+Math.sin(f*Math.PI)*t*.05;e.beginPath(),e.moveTo(m-o*.02,g-t*.04),e.lineTo(m+o*.02,g+t*.04),e.stroke()}e.restore(),e.restore();for(const f of a.eyes){e.save();const m=e.createRadialGradient(f.x,f.y,f.r*.3,f.x,f.y,f.r*1.65);m.addColorStop(0,"rgba(30, 10, 18, 0.85)"),m.addColorStop(.65,"rgba(68, 18, 30, 0.55)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.beginPath(),e.arc(f.x,f.y,f.r*1.65,0,Math.PI*2),e.fill(),e.fillStyle="#d9f99d",e.beginPath(),e.ellipse(f.x,f.y,f.r*.92,f.r*.64,a.roll,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,f.r*.12),e.strokeStyle="#450a0a",e.stroke();const g=f.x+f.gx*f.r*.38,y=f.y+f.gy*f.r*.32;e.fillStyle="#94a3b8",e.beginPath(),e.arc(g,y,f.r*.42,0,Math.PI*2),e.fill(),e.fillStyle="#1e293b",e.beginPath(),e.arc(g,y,f.r*.16,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const c=a.mouth.w*1.25,h=Math.max(c*.24,a.mouth.open*c*.85);e.fillStyle="#2a080c",e.beginPath(),e.ellipse(0,h*.15,c*.62,h*.72,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(2,c*.05),e.strokeStyle="#450a0a",e.stroke();const d=6,p=c*.88/d;for(let f=0;f<d;f++){const m=-c*.44+f*p+p*.1,g=f*37%5*.03*c;e.fillStyle=f%2===0?"#fef08a":"#d6d3d1",e.strokeStyle="#451a03",e.lineWidth=1.2,e.beginPath(),e.roundRect(m,-h*.38,p*.78,h*.36+g,2),e.fill(),e.stroke(),e.beginPath(),e.roundRect(m,h*.12,p*.78,h*.36-g*.5,2),e.fill(),e.stroke()}e.restore()}drawWerewolfFace(e,a,s,l,r){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const o=a.rx*1.15,t=a.ry*1.12,i=Math.sin(r*5.2)*.05;for(const m of[-1,1])e.save(),e.translate(m*o*.68,-t*.72),e.rotate(m*(.28+i)),e.beginPath(),e.moveTo(-o*.22,t*.18),e.lineTo(0,-t*.56),e.lineTo(o*.22,t*.18),e.closePath(),e.fillStyle="#27201c",e.fill(),e.lineWidth=Math.max(2,o*.025),e.strokeStyle="#0c0a09",e.stroke(),e.beginPath(),e.moveTo(-o*.11,t*.12),e.lineTo(0,-t*.36),e.lineTo(o*.11,t*.12),e.closePath(),e.fillStyle="#573b32",e.fill(),e.restore();const n=38;e.beginPath();for(let m=0;m<=n;m++){const g=m/n*Math.PI*2,y=Math.sin(g)>-.25,b=(m%2===0?1.24:1.04)*(y?1.12:.96),T=Math.cos(g)*o*b,R=Math.sin(g)*t*(m%2===0?1.12:.96);m===0?e.moveTo(T,R):e.lineTo(T,R)}e.closePath();const c=e.createRadialGradient(0,0,o*.45,0,0,o*1.35);c.addColorStop(0,"rgba(41, 32, 26, 0.22)"),c.addColorStop(.55,"rgba(48, 37, 29, 0.86)"),c.addColorStop(.85,"rgba(28, 22, 18, 0.96)"),c.addColorStop(1,"#0c0a09"),e.fillStyle=c,e.fill(),e.strokeStyle="rgba(168, 142, 118, 0.45)",e.lineWidth=Math.max(1.5,o*.016);for(let m=0;m<28;m++){const g=m/28*Math.PI*2,y=.72,b=1.08+m%3*.06;e.beginPath(),e.moveTo(Math.cos(g)*o*y,Math.sin(g)*t*y),e.lineTo(Math.cos(g)*o*b,Math.sin(g)*t*b),e.stroke()}const h=e.createLinearGradient(0,-t*.22,0,t*.28);h.addColorStop(0,"rgba(28, 22, 18, 0.75)"),h.addColorStop(1,"rgba(18, 14, 12, 0.92)"),e.fillStyle=h,e.beginPath(),e.moveTo(-o*.22,-t*.18),e.lineTo(o*.22,-t*.18),e.lineTo(o*.28,t*.22),e.lineTo(-o*.28,t*.22),e.closePath(),e.fill(),e.fillStyle="#09090b",e.beginPath(),e.moveTo(-o*.18,t*.08),e.quadraticCurveTo(0,t*.02,o*.18,t*.08),e.lineTo(0,t*.26),e.closePath(),e.fill(),e.fillStyle="rgba(255,255,255,0.45)",e.beginPath(),e.ellipse(-o*.05,t*.11,o*.045,t*.02,-.2,0,Math.PI*2),e.fill(),e.restore();for(const m of a.eyes){e.save(),e.fillStyle="#09090b",e.beginPath(),e.ellipse(m.x,m.y,m.r*.98,m.r*.62,a.roll,0,Math.PI*2),e.fill();const g=m.x+m.gx*m.r*.35,y=m.y+m.gy*m.r*.3,b=e.createRadialGradient(g,y,m.r*.05,g,y,m.r*.56);b.addColorStop(0,"#fef08a"),b.addColorStop(.55,"#f59e0b"),b.addColorStop(1,"#b45309"),e.fillStyle=b,e.beginPath(),e.arc(g,y,m.r*.52,0,Math.PI*2),e.fill(),e.fillStyle="#000000",e.beginPath(),e.ellipse(g,y,m.r*.14,m.r*.42,a.roll,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255, 255, 255, 0.9)",e.beginPath(),e.arc(g-m.r*.15,y-m.r*.15,m.r*.11,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const d=a.mouth.w*1.32,p=Math.max(d*.18,a.mouth.open*d*.92);e.fillStyle="#180508",e.beginPath(),e.ellipse(0,p*.2,d*.64,p*.65,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(3,d*.06),e.strokeStyle="#09090b",e.stroke();const f=(m,g,y,b,T)=>{e.beginPath(),e.moveTo(m-y*.5,g),e.quadraticCurveTo(m,g+(T?-b:b),m+y*.1,g+(T?-b:b)),e.quadraticCurveTo(m+y*.35,g,m+y*.5,g),e.closePath();const R=e.createLinearGradient(m,g,m,g+(T?-b:b));R.addColorStop(0,"#fde68a"),R.addColorStop(.4,"#fafaf9"),R.addColorStop(1,"#e7e5e4"),e.fillStyle=R,e.fill(),e.lineWidth=1.4,e.strokeStyle="#292524",e.stroke()};f(-d*.38,-p*.25,d*.15,d*.34,!1),f(d*.38,-p*.25,d*.15,d*.34,!1);for(let m=-2;m<=2;m++)f(m*d*.1,-p*.28,d*.08,d*.16,!1);f(-d*.31,p*.55,d*.13,d*.28,!0),f(d*.31,p*.55,d*.13,d*.28,!0),e.restore()}drawVampireFace(e,a,s,l,r){e.save(),e.translate(a.cx,a.cy),e.rotate(a.roll);const o=a.rx,t=a.ry;e.save(),e.beginPath(),e.moveTo(-o*1.38,t*.45),e.lineTo(-o*.95,-t*.35),e.lineTo(-o*.55,t*1.15),e.lineTo(o*.55,t*1.15),e.lineTo(o*.95,-t*.35),e.lineTo(o*1.38,t*.45),e.closePath();const i=e.createLinearGradient(0,-t*.35,0,t*1.15);i.addColorStop(0,"#7f1d1d"),i.addColorStop(.5,"#450a0a"),i.addColorStop(1,"#09090b"),e.fillStyle=i,e.fill(),e.lineWidth=2,e.strokeStyle="#dc2626",e.stroke(),e.restore();for(const p of[-1,1])e.beginPath(),e.moveTo(p*o*.94,-t*.08),e.lineTo(p*o*1.26,-t*.34),e.lineTo(p*o*.98,t*.22),e.closePath(),e.fillStyle="#e2e8f0",e.fill(),e.lineWidth=1.5,e.strokeStyle="#475569",e.stroke();const n=e.createRadialGradient(0,-t*.12,o*.15,0,0,Math.max(o,t)*1.05);n.addColorStop(0,"rgba(241, 245, 249, 0.38)"),n.addColorStop(.65,"rgba(203, 213, 225, 0.32)"),n.addColorStop(.92,"rgba(30, 27, 75, 0.35)"),n.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=n,e.beginPath(),e.ellipse(0,0,o*1.02,t*1.04,0,0,Math.PI*2),e.fill(),e.fillStyle="#09090b",e.beginPath(),e.moveTo(-o*.65,-t*.78),e.quadraticCurveTo(-o*.2,-t*.82,0,-t*.62),e.quadraticCurveTo(o*.2,-t*.82,o*.65,-t*.78),e.quadraticCurveTo(0,-t*1.05,-o*.65,-t*.78),e.fill(),e.restore();for(let p=0;p<2;p++){const f=a.eyes[p],m=p===0?-1:1;e.save();const g=e.createRadialGradient(f.x,f.y,f.r*.2,f.x,f.y,f.r*1.6);g.addColorStop(0,"rgba(76, 5, 25, 0.78)"),g.addColorStop(.6,"rgba(49, 16, 47, 0.45)"),g.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=g,e.beginPath(),e.arc(f.x,f.y,f.r*1.6,0,Math.PI*2),e.fill(),e.strokeStyle="#09090b",e.lineWidth=Math.max(2.5,f.r*.22),e.lineCap="round",e.beginPath(),e.moveTo(f.x-m*f.r*.95,f.y-f.r*.65),e.quadraticCurveTo(f.x+m*f.r*.2,f.y-f.r*1.25,f.x+m*f.r*1.1,f.y-f.r*.55),e.stroke(),e.fillStyle="#f8fafc",e.beginPath(),e.ellipse(f.x,f.y,f.r*.9,f.r*.56,a.roll,0,Math.PI*2),e.fill();const y=f.x+f.gx*f.r*.35,b=f.y+f.gy*f.r*.28,T=e.createRadialGradient(y,b,f.r*.05,y,b,f.r*.48);T.addColorStop(0,"#fca5a5"),T.addColorStop(.45,"#ef4444"),T.addColorStop(1,"#7f1d1d"),e.fillStyle=T,e.beginPath(),e.arc(y,b,f.r*.46,0,Math.PI*2),e.fill(),e.fillStyle="#050505",e.beginPath(),e.ellipse(y,b,f.r*.11,f.r*.38,a.roll,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255, 255, 255, 0.92)",e.beginPath(),e.arc(y-f.r*.14,b-f.r*.14,f.r*.1,0,Math.PI*2),e.fill(),e.restore()}e.save(),e.translate(a.mouth.x,a.mouth.y),e.rotate(a.roll);const c=a.mouth.w*1.12,h=Math.max(c*.14,a.mouth.open*c*.72);e.fillStyle="#280509",e.beginPath(),e.ellipse(0,h*.1,c*.54,h*.58,0,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(2.5,c*.06),e.strokeStyle="#991b1b",e.stroke();const d=c*(.24+Math.min(.18,a.mouth.open*.3));for(const p of[-1,1]){const f=p*c*.29,m=-h*.28;e.beginPath(),e.moveTo(f-c*.055,m),e.lineTo(f,m+d),e.lineTo(f+c*.055,m),e.closePath(),e.fillStyle="#ffffff",e.fill(),e.lineWidth=1.2,e.strokeStyle="#cbd5e1",e.stroke()}e.fillStyle="#dc2626",e.beginPath(),e.moveTo(c*.34,h*.15),e.quadraticCurveTo(c*.37,h*.45,c*.35,h*.65),e.arc(c*.35,h*.68,c*.032,0,Math.PI*2),e.fill(),e.restore()}stepBats(e,a,s,l,r){const o=s?s.cx/l:.5,t=s?(s.cy-s.ry*.35)/r:.38;for(let i=0;i<this.bats.length;i++){const n=this.bats[i];n.wingPhase+=n.wingSpeed*e,i%3===0?(n.orbitAngle+=(.9+i%4*.35)*e*(i%2===0?1:-1),n.x=o+Math.cos(n.orbitAngle)*n.orbitRadius*1.4,n.y=t+Math.sin(n.orbitAngle*2)*n.orbitRadius*.65):(n.x+=n.vx*e,n.y+=(n.vy+Math.sin(a*3.2+i)*.06)*e,n.x<-.15&&(n.x=1.15),n.x>1.15&&(n.x=-.15),n.y<.04&&(n.vy=Math.abs(n.vy)),n.y>.92&&(n.vy=-Math.abs(n.vy)))}}drawBatsLayer(e,a,s,l,r,o){const t=Math.min(a,s)*.042;for(const i of this.bats){if(i.z<r||i.z>=o)continue;const n=i.x*a,c=i.y*s,h=t*i.z,d=Math.sin(i.wingPhase),p=Math.atan2(i.vy,i.vx||.1)*.25;e.save(),e.translate(n,c),e.rotate(p),e.globalAlpha=Math.min(.96,.45+i.z*.38),e.fillStyle="#09090d",e.strokeStyle="#27272a",e.lineWidth=Math.max(1,h*.04);for(const f of[-1,1]){const m=f*h*1.75,g=-d*h*.95,y=f*h*.85,b=-d*h*.45-h*.35;e.beginPath(),e.moveTo(0,-h*.12),e.quadraticCurveTo(y,b,m,g),e.quadraticCurveTo(f*h*1.25,g+h*.48,f*h*.92,g*.5+h*.32),e.quadraticCurveTo(f*h*.55,h*.42,f*h*.15,h*.25),e.closePath(),e.fill(),e.stroke()}e.beginPath(),e.ellipse(0,0,h*.22,h*.34,0,0,Math.PI*2),e.fill(),e.beginPath(),e.moveTo(-h*.16,-h*.24),e.lineTo(-h*.24,-h*.52),e.lineTo(-h*.04,-h*.3),e.moveTo(h*.16,-h*.24),e.lineTo(h*.24,-h*.52),e.lineTo(h*.04,-h*.3),e.fill(),e.fillStyle=i.eyeColor,e.beginPath(),e.arc(-h*.07,-h*.18,Math.max(1.2,h*.065),0,Math.PI*2),e.arc(h*.07,-h*.18,Math.max(1.2,h*.065),0,Math.PI*2),e.fill(),e.restore()}}drawDimLightsFoundFootage(e,a,s,l,r,o){const t=a?a.cx/s:.5,i=a?a.cy/l:.46,n=1-Math.exp(-r*8.5);this.beamX+=(t-this.beamX)*n,this.beamY+=(i-this.beamY)*n;const c=(Math.sin(o*7.3)*.008+Math.cos(o*19.1)*.003)*s,h=(Math.cos(o*6.1)*.008+Math.sin(o*17.7)*.003)*l,d=this.beamX*s+c,p=this.beamY*l+h,f=Math.min(s,l)*.44;e.save(),e.globalCompositeOperation="screen";const m=e.createRadialGradient(d,p,f*.04,d,p,f*.85);m.addColorStop(0,"rgba(220, 245, 235, 0.34)"),m.addColorStop(.38,"rgba(167, 243, 208, 0.14)"),m.addColorStop(.75,"rgba(20, 83, 45, 0.04)"),m.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=m,e.fillRect(0,0,s,l),e.globalCompositeOperation="source-over";const g=e.createRadialGradient(d,p,f*.18,d,p,f*1.45);g.addColorStop(0,"rgba(0, 0, 0, 0.0)"),g.addColorStop(.42,"rgba(2, 8, 6, 0.38)"),g.addColorStop(.72,"rgba(2, 6, 5, 0.82)"),g.addColorStop(1,"rgba(1, 3, 3, 0.96)"),e.fillStyle=g,e.fillRect(0,0,s,l);for(const k of this.dust){k.x+=k.vx*r,k.y+=k.vy*r,k.y<0&&(k.y=1),k.x<0&&(k.x=1),k.x>1&&(k.x=0);const M=k.x*s,w=k.y*l,E=Math.hypot(M-d,w-p);if(E<f*1.05){const A=Math.max(0,1-E/(f*1.05));e.fillStyle=`rgba(215, 250, 235, ${k.alpha*A*.85})`,e.beginPath(),e.arc(M,w,k.size,0,Math.PI*2),e.fill()}}e.fillStyle="rgba(16, 185, 129, 0.035)";for(let k=0;k<l;k+=4)e.fillRect(0,k,s,1);const y=Math.max(12,s*.035),b=Math.max(14,s*.04);e.strokeStyle="rgba(226, 232, 240, 0.48)",e.lineWidth=1.8,e.beginPath(),e.moveTo(y,y+b),e.lineTo(y,y),e.lineTo(y+b,y),e.moveTo(s-y-b,y),e.lineTo(s-y,y),e.lineTo(s-y,y+b),e.moveTo(y,l-y-b),e.lineTo(y,l-y),e.lineTo(y+b,l-y),e.moveTo(s-y-b,l-y),e.lineTo(s-y,l-y),e.lineTo(s-y,l-y-b),e.stroke();const T=Math.max(10,Math.round(s*.024));e.font=`700 ${T}px "Courier New", monospace`,Math.floor(o*2)%2===0&&(e.fillStyle="#ef4444",e.beginPath(),e.arc(y+T*.8,y+T*1.15,T*.36,0,Math.PI*2),e.fill()),e.fillStyle="rgba(248, 250, 252, 0.82)",e.fillText("REC  NIGHT-CAM // IR BEAM ON",y+T*1.5,y+T*1.5);const R=String(Math.floor(o/60)%60).padStart(2,"0"),x=String(Math.floor(o)%60).padStart(2,"0"),S=String(Math.floor(o%1*24)).padStart(2,"0");e.fillStyle="rgba(167, 243, 208, 0.78)",e.fillText(`OCT 31  02:${R}:${x}:${S}  ISO 12800`,y+T*.5,l-y-T*.5),e.restore()}dispose(){this.worker.dispose();try{this.sync?.dispose()}catch{}this.sync=null,this.tracks=[]}}function St(u){const e=(u.eyes[0].x+u.eyes[1].x)/2,a=(u.eyes[0].y+u.eyes[1].y)/2,s=l=>Math.max(-.7,Math.min(.7,l));return{cx:u.cx,cy:u.cy,rx:u.rx,ry:u.ry,roll:u.roll,yaw:s((e-u.cx)/Math.max(1,u.rx)*1.6),pitch:s(((a-u.cy)/Math.max(1,u.ry)+.12)*1.5),mouthOpen:u.mouth.open,blendshapes:null,headMatrix:null}}const J=new Set(["jackolantern","ghostface","zombie","werewolf","vampire","bats","dimlights"]),Dt=[{id:"none",label:"Off",icon:"🚫",blurb:"No lens"},{id:"jackolantern",label:"Jack-o'-Lantern",icon:"🎃",blurb:"Carved 3D pumpkin head + talking fire jaw"},{id:"ghostface",label:"Ghost Face",icon:"👻",blurb:"Shrouded phantom scream visage"},{id:"zombie",label:"Zombie",icon:"🧟",blurb:"Necrotic undead veins, cataract eyes & jaw"},{id:"werewolf",label:"Werewolf",icon:"🐺",blurb:"Lupine fur, glowing amber eyes & fangs"},{id:"vampire",label:"Vampire",icon:"🧛",blurb:"Pale Nosferatu skin, crimson eyes & fangs"},{id:"bats",label:"Bat Swarm",icon:"🦇",blurb:"3D nocturnal bats circling your head"},{id:"dimlights",label:"Dim the Lights",icon:"🔦",blurb:"Found-footage night cam & flashlight beam"},{id:"googly",label:"Googly eyes",icon:"👀",blurb:"Wobbly plastic eyes"},{id:"bigface",label:"Big eyes & mouth",icon:"🤪",blurb:"Faces only — goofy caricature"},{id:"cardboard",label:"South Park",icon:"✂️",blurb:"Jointed paper cut-out puppet of you"},{id:"comic",label:"Comic book",icon:"💥",blurb:"Ink, Ben-Day dots, speed lines"},{id:"matrix",label:"The Matrix",icon:"🟩",blurb:"The world rebuilt from falling code"},{id:"colorize",label:"Colorize",icon:"🎨",blurb:"Believable colour for black & white film"},{id:"silent",label:"Silent film",icon:"🎩",blurb:"1910s hand-cranked nitrate"},{id:"grindhouse",label:"Grindhouse",icon:"🎞️",blurb:"Burns, splices, reel changes"},{id:"vhs",label:"VHS camcorder",icon:"📼",blurb:"80s/90s home tape + date stamp"},{id:"foundfootage",label:"Found footage",icon:"🎥",blurb:"Shaky cam that reacts to you"},{id:"pixel",label:"Pixel art",icon:"👾",blurb:"Sprite palette, depth planes"},{id:"ascii",label:"ASCII",icon:"🔤",blurb:"Live terminal art, traced edges"},{id:"night",label:"Night vision",icon:"🌙",blurb:"Goggle phosphor + grain"},{id:"heat",label:"Heat map",icon:"🔥",blurb:"Thermal camera"},{id:"aura",label:"Aura",icon:"🔮",blurb:"Emotion glow + orbs to collect"}],Et={matrix:He,comic:Ye,southpark:$e,bigface:Oe,night:ze,heat:We,aura:qe,silent:Ke,grindhouse:Je,vhs:Qe,found:Ze,pixel:je,ascii:Ve,colorize:at,colorizeA:et},Rt=["uTex","uGlyph","uMask","uRes","uT","uCell","uBoil","uHasMask","uMapA","uMapB","uBulge","uN","uAuraA","uAuraB","uAuraAmt","uSeed","uEvt","uReel","uCam","uVel","uFocus","uExpo","uGlitch","uDepth","uHasDepth","uPlate","uHasPlate","uMotion","uPal","uPalN","uGrid","uPrev","uCut","uStock","uFace","uLip","uNF","uChroma","uCRes","uAmt","uSeg","uMatPal","uHasSeg","uSegRect","uSegOff","uSegTrust","uWard","uLook","uGrade"],At=["southpark","matrix","comic","night","heat","aura","silent","grindhouse","vhs","found","pixel","ascii","colorize"],Pt=["matrix","comic","southpark","pixel","ascii"],Q=new Set(["matrix","comic","pixel","ascii","colorize"]),me=new Set(["cardboard","comic","matrix","heat","aura","pixel","ascii","colorize"]),pe={panchromatic:[.2126,.7152,.0722],orthochromatic:[.06,.5,.44]},Me="plajah.lens.filmStock";let V=(()=>{try{return localStorage.getItem(Me)==="orthochromatic"?"orthochromatic":"panchromatic"}catch{return"panchromatic"}})();function Ft(){return V}function Gt(u){V=u;try{localStorage.setItem(Me,u)}catch{}}const Lt={cardboard:12,silent:16,grindhouse:24},ge=["0d0b14","241a2e","3b2a45","5c3c55","8a2f3c","c4423f","e8784a","f5b06a","f9dc8a","fff6d6","2c4a2e","3f7a3a","6aab45","a8d35f","1f4f5a","2f8a8a","56c4b5","a7ecd9","1a2a5c","2e4fa3","4f86d9","8fc0f2","4a2a6e","7a46a8","b47ed6","4a2f22","7a4b32","b07a52","dba980","f2d2b3","6e6a78","a9a4b2"],Ct=[" ",".","`",":","-","=","+","*","o","#","%","@","|","_","/","\\"],W=()=>typeof navigator<"u"&&!!navigator.gpu,Ut=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],G=()=>typeof navigator<"u"&&/Android/i.test(navigator.userAgent);function j(u,e,a,s,l){const r=l==="cover"?Math.max(u/a,e/s):Math.min(u/a,e/s);return{s:r,ox:(u-a*r)/2,oy:(e-s*r)/2}}const ve=(u,e,a,s=0,l=0)=>({x:u,y:e,r:a,tx:u,ty:e,tr:a,vx:0,vy:0,ax:0,ay:0,px:0,py:.5,pvx:0,pvy:0,gx:s,gy:l,tgx:s,tgy:l,o:.3,to:.3}),Se=.44,Z=1-Se,_t=26,ye=.55;class Nt{constructor(e={}){this.lens="none",this.note="",this.glc=document.createElement("canvas"),this.gl=null,this.progs={},this.quad=null,this.srcTex=null,this.maskTex=null,this.glyphTex=null,this.maskStamp=-1,this.tainted=!1,this.worker=new ee,this.sync=null,this.faceBlend=!1,this.emotion=new Ne,this.orbs=new Be,this.auraState=this.emotion.get(),this.feed=new Te,this.faceState="idle",this.lastSend=-1e9,this.lastTs=-1,this.lastSync=-1e9,this.tracks=[],this.lastApply=0,this.matte=new Fe,this.hold=document.createElement("canvas"),this.holdAt=0,this.holdGap=83,this.frameNo=0,this.motion=new ft,this.pointer=new mt,this.depth=new pt,this.sam=new gt,this.depthTex=null,this.depthStamp=-1,this.plateTex=null,this.palTex=null,this.asciiTex=null,this.noPersonSince=0,this.personSeen=!1,this.samStamp=-1,this.plate=document.createElement("canvas"),this.plateTmp=document.createElement("canvas"),this.plateAlpha=document.createElement("canvas"),this.plateStamp=-1,this.plateReady=!1,this.pose=null,this.poseState="idle",this.poseTs=0,this.lastPose=null,this.colours={skin:"rgb(242,206,170)",hair:"rgb(90,60,40)",shirt:"rgb(60,110,200)",pants:"rgb(60,70,120)",glove:"rgb(200,40,40)"},this.coloursAt=0,this.swatch=document.createElement("canvas"),this.startedAt=0,this.freeze=document.createElement("canvas"),this.evt={type:0,start:0,dur:0,seed:0},this.nextEvtAt=0,this.reel=[.3,.5,.3,1],this.vhsYear=1994,this.track={amt:0,pos:.8,until:0,next:0},this.rig={x:0,y:0,r:0,z:1.12,vx:0,vy:0,vr:0,vz:0,px:0,py:0,panic:0,focus:0,expo:1,glitch:0,punch:0},this.cz=null,this.stock=V,this.seg=new ht,this.segTex=null,this.matPalTex=null,this.matPalStamp=-1,this.colorScript=new ut,this.lookahead=null,this.laShot=-1,this.driftKey=null,this.driftAt=0,this.drift={dx:0,dy:0,agree:1},this.segObj=null,this.gradeOverride=null,this.filmTime=null,this.halloweenEngine=null,this.auraA=[.48,.36,1],this.auraB=[.18,.9,.84],this.auraAmt=.3,this.presenceStamp=-1,this.freezeAt=-1,this.frameAspect=9/16,this.models=e.models!==!1,this.segment=e.segment??this.models,this.initGL()}setColorScript(e){this.colorScript.set(e),this.cz&&(this.cz.fresh=!0),e&&this.segment&&W()&&!G()&&!this.lookahead&&this.seg.setTier("remaster")}setLookahead(e){this.lookahead=e,this.laShot=-1,this.driftKey=null,this.seg.setTier(e?"live":this.colorScript.get()&&W()&&!G()?"remaster":"live")}setColorGrade(e){this.gradeOverride=e}setFilmTime(e){this.filmTime=e}getLens(){return this.lens}getStatus(){if(this.lens==="none"||J.has(this.lens))return"";if(this.tainted&&this.lens!=="googly")return"this video blocks filters (cross-origin)";if(this.lens!=="googly"&&!this.gl)return"GPU filters unavailable on this device";if(this.lens==="googly"||this.lens==="cardboard"||this.lens==="bigface"||this.lens==="aura"){if(this.faceState==="loading")return"loading face tracker…";if(this.faceState==="failed")return"face tracker unavailable on this device";if(this.tracks.length===0)return"looking for a face…"}if(me.has(this.lens)&&this.lens!=="heat"&&this.lens!=="aura"&&this.matte.state==="loading")return"loading cut-out model…";if(Q.has(this.lens)&&this.depth.state()==="loading")return"loading depth model…";if(this.lens==="colorize"&&this.lookahead){const e=this.lookahead.status();if(e)return e}return this.lens==="cardboard"&&this.poseState==="loading"?"loading body tracker…":this.note}setLens(e){if(e!==this.lens){if(this.lens=e,this.note="",J.has(e)){this.halloweenEngine||(this.halloweenEngine=new de),e==="dimlights"?(this.halloweenEngine.setFilter("none"),this.halloweenEngine.setDimLights(!0)):(this.halloweenEngine.setDimLights(!1),this.halloweenEngine.setFilter(e));return}this.models&&(e==="googly"||e==="cardboard"||e==="bigface"||e==="aura"||e==="colorize")&&this.startFace(e==="aura"),this.models&&me.has(e)&&this.matte.init(),this.models&&Q.has(e)&&W()&&!G()&&this.depth.init(),this.segment&&e==="colorize"&&W()&&!G()&&this.seg.init(),this.models&&e==="cardboard"&&this.startPose(),e==="foundfootage"?this.pointer.start():this.pointer.stop(),e!=="googly"&&e!=="cardboard"&&e!=="bigface"&&e!=="aura"&&e!=="colorize"&&(this.tracks=[]),this.cz&&(this.cz.fresh=!0),e!=="aura"&&this.orbs.reset(),this.holdAt=0,this.frameNo=0,this.startedAt=0,this.evt.type=0,this.nextEvtAt=0,this.plateReady=!1,this.plateStamp=-1,this.vhsYear=1986+Math.floor(Math.random()*12),this.rig={x:0,y:0,r:0,z:1.12,vx:0,vy:0,vr:0,vz:0,px:0,py:0,panic:0,focus:.6,expo:1,glitch:0,punch:0}}}initGL(){try{const e=this.glc.getContext("webgl2",{alpha:!1,preserveDrawingBuffer:!1,premultipliedAlpha:!1,antialias:!1});if(!e)throw new Error("no webgl2");this.glc.addEventListener("webglcontextlost",l=>{l.preventDefault(),this.gl=null,this.progs={},this.cz=null,this.segTex=null,this.matPalTex=null},!1),this.glc.addEventListener("webglcontextrestored",()=>{this.initGL()},!1);const a=e.createBuffer();this.quad=a,e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);const s=l=>{const r=e.createTexture();return e.bindTexture(e.TEXTURE_2D,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,l),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),r};this.srcTex=s(e.LINEAR),this.maskTex=s(e.LINEAR),this.maskStamp=-1,e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,e.R8,1,1,0,e.RED,e.UNSIGNED_BYTE,new Uint8Array([0])),e.pixelStorei(e.UNPACK_ALIGNMENT,4),this.depthTex=s(e.LINEAR),this.depthStamp=-1,e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([128,128,128,255])),this.plateTex=s(e.LINEAR_MIPMAP_LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.generateMipmap(e.TEXTURE_2D),this.glyphTex=null,this.palTex=null,this.asciiTex=null,this.gl=e}catch(e){console.warn("[lens] WebGL2 unavailable — shader lenses pass through:",e),this.gl=null}}program(e){const a=this.gl;if(!a)return null;const s=this.progs[e];if(s)return s;try{const l=a.createShader(a.VERTEX_SHADER);a.shaderSource(l,Xe),a.compileShader(l);const r=a.createShader(a.FRAGMENT_SHADER);if(a.shaderSource(r,Et[e]),a.compileShader(r),!a.getShaderParameter(r,a.COMPILE_STATUS))throw new Error(a.getShaderInfoLog(r)||"fragment shader");const o=a.createProgram();if(a.attachShader(o,l),a.attachShader(o,r),a.bindAttribLocation(o,0,"p"),a.linkProgram(o),!a.getProgramParameter(o,a.LINK_STATUS))throw new Error(a.getProgramInfoLog(o)||"link");const t={};for(const i of Rt)t[i]=a.getUniformLocation(o,i);return this.progs[e]={prog:o,u:t}}catch(l){return console.warn(`[lens] ${e} shader failed:`,l),this.gl=null,null}}ensureGlyphs(){const e=this.gl;if(!e||this.glyphTex)return;const a=512,s=a/8,l=document.createElement("canvas");l.width=l.height=a;const r=l.getContext("2d");r.fillStyle="#000",r.fillRect(0,0,a,a),r.fillStyle="#fff",r.textAlign="center",r.textBaseline="middle",r.font=`700 ${Math.round(s*.78)}px "MS Gothic","Noto Sans Mono CJK JP","Noto Sans JP","Hiragino Kaku Gothic ProN",monospace`;const o=[];for(let i=65382;i<=65437;i++)o.push(String.fromCharCode(i));for(const i of"0123456789")o.push(i);o.slice(0,64).forEach((i,n)=>r.fillText(i,n%8*s+s/2,Math.floor(n/8)*s+s/2+2));const t=e.createTexture();e.bindTexture(e.TEXTURE_2D,t),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,l),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.glyphTex=t}bindMatte(e,a,s,l,r,o,t){const i=this.gl,n=this.matte.update(a,r),c=!!n&&n.w>0;i.activeTexture(i.TEXTURE0+t),i.bindTexture(i.TEXTURE_2D,this.maskTex),c&&n.stamp!==this.maskStamp&&(i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.texImage2D(i.TEXTURE_2D,0,i.R8,n.w,n.h,0,i.RED,i.UNSIGNED_BYTE,n.data),i.pixelStorei(i.UNPACK_ALIGNMENT,4),this.maskStamp=n.stamp),i.uniform1i(e.u.uMask,t),i.uniform1f(e.u.uHasMask,c?1:0);const h=a.videoWidth||s,d=a.videoHeight||l,p=j(s,l,h,d,o);i.uniform2f(e.u.uMapA,s/(h*p.s),l/(d*p.s)),i.uniform2f(e.u.uMapB,-p.ox/(h*p.s),-p.oy/(d*p.s)),i.activeTexture(i.TEXTURE0)}setAuraUniforms(e){const a=this.gl;a.uniform3f(e.u.uAuraA,...this.auraA),a.uniform3f(e.u.uAuraB,...this.auraB),a.uniform1f(e.u.uAuraAmt,this.auraAmt)}ensureAscii(){const e=this.gl;if(!e||this.asciiTex)return;const a=512,s=a/4,l=document.createElement("canvas");l.width=l.height=a;const r=l.getContext("2d");r.fillStyle="#000",r.fillRect(0,0,a,a),r.fillStyle="#fff",r.textAlign="center",r.textBaseline="middle",r.font=`700 ${Math.round(s*.92)}px "Consolas","Menlo","DejaVu Sans Mono","Courier New",monospace`,Ct.forEach((t,i)=>{r.save(),r.translate(i%4*s+s/2,Math.floor(i/4)*s+s/2+s*.04),r.scale(1.45,1),r.fillText(t,0,0),r.restore()});const o=e.createTexture();e.bindTexture(e.TEXTURE_2D,o),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,l),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.asciiTex=o}ensurePalette(){const e=this.gl;if(!e||this.palTex)return;const a=new Uint8Array(128);ge.forEach((l,r)=>{a[r*4]=parseInt(l.slice(0,2),16),a[r*4+1]=parseInt(l.slice(2,4),16),a[r*4+2]=parseInt(l.slice(4,6),16),a[r*4+3]=255});const s=e.createTexture();e.bindTexture(e.TEXTURE_2D,s),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,32,1,0,e.RGBA,e.UNSIGNED_BYTE,a),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this.palTex=s}bindSubject(e,a,s,l,r,o,t){const i=this.gl,n=this.matte.update(a,r);if(n&&n.stamp!==this.presenceStamp){this.presenceStamp=n.stamp;let T=0,R=0;for(let x=0;x<n.data.length;x+=61)R++,n.data[x]>140&&T++;this.personSeen=T/Math.max(1,R)>.015,this.personSeen?this.noPersonSince=0:this.noPersonSince||(this.noPersonSince=r)}if(!(this.lens!=="cardboard"&&this.matte.state==="ready"&&!this.personSeen&&this.noPersonSince>0&&r-this.noPersonSince>2500&&W()&&!G())){this.bindMatte(e,a,s,l,r,o,t);return}this.sam.init();const h=a.videoWidth||s,d=a.videoHeight||l,p=j(s,l,h,d,o),f=(.5+(this.motion.cx-.5)*.6)*s,m=(.5+(this.motion.cy-.5)*.6)*l,g=Math.max(.02,Math.min(.98,(f-p.ox)/(h*p.s))),y=Math.max(.02,Math.min(.98,(m-p.oy)/(d*p.s))),b=this.sam.update(a,r,g,y);if(!b){this.bindMatte(e,a,s,l,r,o,t);return}i.activeTexture(i.TEXTURE0+t),i.bindTexture(i.TEXTURE_2D,this.maskTex),this.sam.stamp!==this.samStamp&&(i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,b),this.samStamp=this.sam.stamp,this.maskStamp=-1),i.uniform1i(e.u.uMask,t),i.uniform1f(e.u.uHasMask,1),i.uniform2f(e.u.uMapA,s/(h*p.s),l/(d*p.s)),i.uniform2f(e.u.uMapB,-p.ox/(h*p.s),-p.oy/(d*p.s)),i.activeTexture(i.TEXTURE0)}bindDepth(e,a,s,l){const r=this.gl,o=Q.has(this.lens)?this.depth.update(a,s):null;if(r.activeTexture(r.TEXTURE0+l),r.bindTexture(r.TEXTURE_2D,this.depthTex),o&&this.depth.stamp!==this.depthStamp)try{r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,o),this.depthStamp=this.depth.stamp}catch{}r.uniform1i(e.u.uDepth,l),r.uniform1f(e.u.uHasDepth,o&&this.depthStamp>=0?1:0),r.activeTexture(r.TEXTURE0)}shade(e,a,s,l,r,o){const t=this.gl;if(!t||this.tainted)return;const i=this.program(e);if(!i||!this.gl)return;const n=s.width,c=s.height;(this.glc.width!==n||this.glc.height!==c)&&(this.glc.width=n,this.glc.height=c),t.viewport(0,0,n,c),t.useProgram(i.prog),t.bindBuffer(t.ARRAY_BUFFER,this.quad),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTex);try{t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,s)}catch{this.tainted=!0;return}if(At.includes(e)?(t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR)):t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.uniform1i(i.u.uTex,0),t.uniform2f(i.u.uRes,n,c),t.uniform1f(i.u.uT,r/1e3),t.uniform1f(i.u.uSeed,this.frameNo),t.uniform1f(i.u.uBoil,Math.floor(r/83)),Pt.includes(e)&&(this.bindSubject(i,l,n,c,r,o,2),this.bindDepth(i,l,r,3)),e==="matrix")this.ensureGlyphs(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.glyphTex),t.uniform1i(i.u.uGlyph,1),t.uniform1f(i.u.uCell,Math.max(8,Math.round(n/62)));else if(e==="ascii")this.ensureAscii(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.asciiTex),t.uniform1i(i.u.uGlyph,1),t.uniform1f(i.u.uCell,Math.max(9,Math.round(c/50)));else if(e==="pixel")this.ensurePalette(),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.palTex),t.uniform1i(i.u.uPal,1),t.uniform1f(i.u.uPalN,ge.length),t.uniform1f(i.u.uGrid,Math.max(4,Math.round(Math.max(n,c)/170)));else if(e==="comic")t.uniform3f(i.u.uMotion,this.motion.energy,this.motion.cx,this.motion.cy);else if(e==="southpark")t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,this.plateTex),t.uniform1i(i.u.uPlate,1),t.uniform1f(i.u.uHasPlate,this.plateReady&&this.tracks.some(h=>h.alpha>.3)?1:0);else if(e==="grindhouse"){const h=this.evt;t.uniform4f(i.u.uEvt,h.type,h.type?Math.min(1,(r-h.start)/h.dur):0,h.seed,1),t.uniform4f(i.u.uReel,...this.reel)}else if(e==="vhs")t.uniform4f(i.u.uEvt,this.track.amt,this.track.pos,0,0);else if(e==="found"){const h=this.rig;t.uniform4f(i.u.uCam,h.x,h.y,h.r,h.z),t.uniform2f(i.u.uVel,h.px,h.py),t.uniform1f(i.u.uFocus,h.focus),t.uniform1f(i.u.uExpo,h.expo),t.uniform1f(i.u.uGlitch,h.glitch)}else if(e==="bigface"){const h=new Float32Array(36);let d=0;for(const p of this.tracks){if(p.alpha<.3||d>6)continue;const f=Math.min(1,p.alpha);for(const g of p.eyes)h.set([g.x,g.y,Math.max(6,g.r*2.3),.72*f],4*d++);const m=p.mouth;h.set([m.x,m.y,Math.max(8,m.w*(.95+m.open*.5)),(.5+Math.min(.2,m.open*.6))*f],4*d++)}t.uniform4fv(i.u.uBulge,h),t.uniform1i(i.u.uN,d)}else if(e==="colorize"){const h=this.analyzeColour(l,s,n,c,r,o);if(!h)return;t.useProgram(i.prog),t.viewport(0,0,n,c),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,h.tex[h.cur]),t.uniform1i(i.u.uChroma,1),t.uniform2f(i.u.uCRes,h.w,h.h),t.uniform3f(i.u.uStock,...pe[this.stock]),t.uniform1f(i.u.uAmt,1),t.uniform1f(i.u.uGrade,this.gradeOverride??this.colorScript.grade()),t.activeTexture(t.TEXTURE0)}else(e==="heat"||e==="aura")&&(this.bindMatte(i,l,n,c,r,o,1),e==="aura"&&this.setAuraUniforms(i));t.drawArrays(t.TRIANGLES,0,3),a.drawImage(this.glc,0,0,n,c)}bindScene(e,a,s,l){const r=this.gl,o=()=>{const d=r.createTexture();return r.bindTexture(r.TEXTURE_2D,d),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),d},t=this.filmTime??(Number.isFinite(s.currentTime)?s.currentTime:0);let i=null,n=!1,c=[0,0],h=1;if(this.lookahead){this.lookahead.follow(t);const d=this.lookahead.mapAt(t);if(d){if(i=d.map,d.key!==this.driftKey||l-this.driftAt>100){try{this.drift=this.lookahead.drift(a,d.key)}catch{this.drift={dx:0,dy:0,agree:.5}}this.driftKey=d.key,this.driftAt=l}c=[this.drift.dx,this.drift.dy],h=this.drift.agree,d.shot!==this.laShot&&(n=this.laShot>=0,this.laShot=d.shot),this.drift.agree<.3&&(i=null,h=1,c=[0,0])}}return!i&&this.segment&&(i=this.seg.update(a,l)),r.activeTexture(r.TEXTURE4),this.segTex||(this.segTex=o(),this.segObj=null),r.bindTexture(r.TEXTURE_2D,this.segTex),i&&i!==this.segObj&&(r.pixelStorei(r.UNPACK_ALIGNMENT,1),r.texImage2D(r.TEXTURE_2D,0,r.RG8,i.w,i.h,0,r.RG,r.UNSIGNED_BYTE,i.data),r.pixelStorei(r.UNPACK_ALIGNMENT,4),this.segObj=i),r.uniform1i(e.u.uSeg,4),r.uniform1f(e.u.uHasSeg,i?1:0),i&&r.uniform4f(e.u.uSegRect,...i.rect),r.uniform2f(e.u.uSegOff,c[0],c[1]),r.uniform1f(e.u.uSegTrust,h),this.colorScript.update(t),r.activeTexture(r.TEXTURE5),this.matPalTex||(this.matPalTex=o(),this.matPalStamp=-1),r.bindTexture(r.TEXTURE_2D,this.matPalTex),this.matPalStamp!==this.colorScript.stamp&&(r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,32,2,0,r.RGBA,r.UNSIGNED_BYTE,this.colorScript.palettePixels()),this.matPalStamp=this.colorScript.stamp),r.uniform1i(e.u.uMatPal,5),r.activeTexture(r.TEXTURE0),n}analyzeColour(e,a,s,l,r,o){const t=this.gl,i=this.program("colorizeA");if(!i||!this.gl)return null;const n=Math.max(8,Math.round(s/8)),c=Math.max(8,Math.round(l/8));let h=this.cz;if(!h||h.w!==n||h.h!==c){h&&(h.tex.forEach(M=>t.deleteTexture(M)),h.fbo.forEach(M=>t.deleteFramebuffer(M)));const x=()=>{const M=t.createTexture();t.bindTexture(t.TEXTURE_2D,M),t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,n,c,0,t.RGBA,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const w=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,w),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,M,0),[M,w]},S=x(),k=x();h=this.cz={tex:[S[0],k[0]],fbo:[S[1],k[1]],w:n,h:c,cur:0,fresh:!0},t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.srcTex)}const d=h.cur;h.cur^=1,t.bindFramebuffer(t.FRAMEBUFFER,h.fbo[h.cur]),t.viewport(0,0,n,c),t.useProgram(i.prog),t.uniform1i(i.u.uTex,0),t.uniform2f(i.u.uRes,s,l),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,h.tex[d]),t.uniform1i(i.u.uPrev,1);const p=this.colorScript.stock()??V;this.stock!==p&&(this.stock=p,h.fresh=!0),t.uniform1f(i.u.uCut,h.fresh||this.motion.burst>.45?1:0),h.fresh=!1,t.uniform3f(i.u.uStock,...pe[this.stock]),this.bindMatte(i,e,s,l,r,o,2),this.bindDepth(i,e,r,3);const f=new Float32Array(12),m=new Float32Array(12),g=new Float32Array(12),y=new Float32Array(12);let b=0;const T=this.tracks.filter(x=>x.alpha>=.3).sort((x,S)=>x.head.x-S.head.x).slice(0,3),R=this.colorScript.peopleCount()===1&&T.length>1?T.reduce((x,S,k)=>S.head.rx>T[x].head.rx?k:x,0):-1;for(const x of T){const S=Math.min(1,x.alpha);f.set([x.head.x/s,x.head.y/l,x.head.rx/s,x.head.ry/l],4*b),m.set([x.mouth.x/s,x.mouth.y/l,x.mouth.w/s,S],4*b);const k=R<0?b:b===R?0:-1;g.set(this.colorScript.wardrobe(k),4*b),y.set(this.colorScript.look(k),4*b),b++}return t.uniform4fv(i.u.uFace,f),t.uniform4fv(i.u.uLip,m),t.uniform1i(i.u.uNF,b),t.uniform4fv(i.u.uWard,g),t.uniform4fv(i.u.uLook,y),this.bindScene(i,a,e,r)&&t.uniform1f(i.u.uCut,1),t.drawArrays(t.TRIANGLES,0,3),t.bindFramebuffer(t.FRAMEBUFFER,null),t.activeTexture(t.TEXTURE0),h}startPose(){if(this.poseState!=="idle")return;this.poseState="loading";const e=new Mt;e.init().then(a=>{a?(this.pose=e,this.poseState="ready"):this.poseState="failed"})}feedPose(e,a,s,l){if(!this.pose||e.readyState<2||!e.videoWidth)return;this.poseTs=Math.max(this.poseTs+1,Math.round(performance.now()));const r=this.pose.detect(this.feed.src(e),this.poseTs);if(!r){this.lastPose=null;return}const o=e.videoWidth,t=e.videoHeight,i=j(a,s,o,t,l),n=c=>{const h=r.pts[c];return h?{x:h.x*o*i.s+i.ox,y:h.y*t*i.s+i.oy,v:h.v}:void 0};this.lastPose={shoulderL:n(F.shoulderL),shoulderR:n(F.shoulderR),elbowL:n(F.elbowL),elbowR:n(F.elbowR),wristL:n(F.wristL),wristR:n(F.wristR)}}updatePlate(e,a){const s=this.gl;if(!s)return;const l=this.matte.update(e,a);if(!l||l.stamp===this.plateStamp||!e.videoWidth)return;this.plateStamp=l.stamp;const r=192,o=Math.max(2,Math.round(192*e.videoHeight/e.videoWidth));for(const m of[this.plate,this.plateTmp,this.plateAlpha])(m.width!==r||m.height!==o)&&(m.width=r,m.height=o,m===this.plate&&(this.plateReady=!1));const t=this.plateAlpha.getContext("2d"),i=t.createImageData(r,o),n=i.data,c=l.w/r,h=l.h/o,d=3;for(let m=0;m<o;m++)for(let g=0;g<r;g++){let y=0;for(let b=-d;b<=d;b+=d)for(let T=-d;T<=d;T+=d){const R=Math.min(l.w-1,Math.max(0,Math.round((g+T)*c))),x=Math.min(l.h-1,Math.max(0,Math.round((m+b)*h)));y=Math.max(y,l.data[x*l.w+R])}n[(m*r+g)*4+3]=y>70?0:255}t.putImageData(i,0,0);const p=this.plateTmp.getContext("2d");p.globalCompositeOperation="copy",p.drawImage(e,0,0,r,o),p.globalCompositeOperation="destination-in",p.drawImage(this.plateAlpha,0,0),p.globalCompositeOperation="source-over";const f=this.plate.getContext("2d");f.globalAlpha=this.plateReady?.35:1,f.drawImage(this.plateTmp,0,0),f.globalAlpha=1,this.plateReady=!0,s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,this.plateTex),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!0),s.texImage2D(s.TEXTURE_2D,0,s.RGBA,s.RGBA,s.UNSIGNED_BYTE,this.plate),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),s.generateMipmap(s.TEXTURE_2D),s.activeTexture(s.TEXTURE0)}sampleColours(e,a){if(a-this.coloursAt<400)return;const s=this.tracks.find(g=>g.alpha>.3);if(!s)return;this.coloursAt=a;const l=e.width,r=e.height,o=this.swatch;o.width=o.height=1;const t=o.getContext("2d",{willReadFrequently:!0}),i=(g,y,b)=>{if(g<0||y<0||g>=l||y>=r)return null;t.drawImage(e,Math.max(0,g-b),Math.max(0,y-b),b*2,b*2,0,0,1,1);const T=t.getImageData(0,0,1,1).data;return[T[0],T[1],T[2]]},n=(s.eyes[0].x+s.eyes[1].x)/2,c=(s.eyes[0].y+s.eyes[1].y)/2,h=Math.max(s.head.rx,s.head.ry),d=Math.max(2,h*.12),p=(g,y,b)=>y?yt(vt(y,b)):g,f=this.lastPose,m=f?.shoulderL&&f.shoulderR&&f.shoulderL.v>.5&&f.shoulderR.v>.5?{x:(f.shoulderL.x+f.shoulderR.x)/2,y:(f.shoulderL.y+f.shoulderR.y)/2+Math.abs(f.shoulderL.x-f.shoulderR.x)*.3}:{x:s.head.x,y:s.head.y+s.head.ry*1.9};this.colours={skin:p(this.colours.skin,i((n+s.mouth.x)/2,(c+s.mouth.y)/2,d),.3),hair:p(this.colours.hair,i(s.head.x,s.head.y-s.head.ry*.92,d),.12),shirt:p(this.colours.shirt,i(m.x,Math.min(r-d-1,m.y),d*2)),pants:this.colours.pants,glove:this.colours.glove}}stepGrindhouse(e){const a=this.evt;if(a.type&&e-a.start>a.dur&&((a.type===4||a.type===1)&&(this.reel=[Math.random()*.7,Math.random(),Math.random()*.6,Math.random()*10]),a.type=0,this.nextEvtAt=e+2500+Math.random()*6e3),this.nextEvtAt||(this.nextEvtAt=e+2e3),!a.type&&e>this.nextEvtAt){const s=Math.random(),[l,r]=s<.24?[2,650]:s<.48?[3,260]:s<.68?[5,900]:s<.88?[4,1100]:[1,2600];Object.assign(a,{type:l,start:e,dur:r,seed:Math.random()*100})}}stepVhs(e,a){const s=this.track;s.next||(s.next=e+4e3+Math.random()*6e3),e>s.next&&(s.until=e+700+Math.random()*1600,s.next=s.until+5e3+Math.random()*9e3,s.pos=.95);const l=e<s.until?1:0;s.amt+=(l-s.amt)*(1-Math.exp(-a*6)),s.pos-=a*.25*s.amt,s.pos<.05&&(s.pos=.95)}drawVhsStamp(e,a,s,l){const r=new Date,o=Math.round(s/15);e.save(),e.font=`700 ${o}px "VCR OSD Mono","Consolas","Courier New",monospace`,e.textBaseline="alphabetic";const t=(d,p,f,m="left")=>{e.textAlign=m,e.fillStyle="rgba(0,0,0,0.7)",e.fillText(d,p+o*.07,f+o*.07),e.fillStyle="#f4f4ee",e.fillText(d,p,f)};l-this.startedAt<4500&&t("PLAY ▶",a*.07,s*.12);const i=r.getHours(),n=i<12?"AM":"PM",c=i%12||12,h=d=>String(d).padStart(2,"0");t(`${n} ${c}:${h(r.getMinutes())}`,a*.07,s*.86),t(`${Ut[r.getMonth()]}. ${h(r.getDate())} ${this.vhsYear}`,a*.07,s*.86+o*1.15),l-this.startedAt>4500&&t("SP",a*.93,s*.12,"right"),e.restore()}stepRig(e,a){const s=this.rig,l=a/1e3;this.pointer.step(e);const r=typeof window<"u"&&window.innerWidth||1280,o=typeof window<"u"&&window.innerHeight||720,t=this.pointer.vx/r,i=this.pointer.vy/o,n=Math.min(1,this.pointer.speed/Math.max(r,o)*.9),c=this.pointer.takeClicks(),h=Math.min(1,this.motion.energy*1.7),d=this.motion.burst,p=Math.min(1,h*.8+n*.9);s.panic+=(p-s.panic)*(1-Math.exp(-e*(p>s.panic?6:.7)));const f=s.panic,m=(w,E)=>(Math.sin(l*w+E)+Math.sin(l*w*1.73+E*2.1)*.6)/1.6;let g=m(.9,1)*.006+m(11,3)*(.0012+f*.022)-t*.025+(this.motion.cx-.5)*.06*f,y=m(.7,5)*.008+m(13,7)*(.0012+f*.026)-i*.025+(this.motion.cy-.5)*.05*f;g=Math.max(-.07,Math.min(.07,g)),y=Math.max(-.07,Math.min(.07,y));const b=m(.5,9)*.008+m(9,2)*f*.045-t*.02;d>.35&&s.punch<=0&&(s.punch=1.2),s.punch=Math.max(0,s.punch-e);const T=1.12+m(.15,4)*.025+(s.punch>0?.28:0)+f*.04;c&&(s.vx+=(Math.random()-.5)*1.6,s.vy+=.6+Math.random()*1.2,s.vr+=(Math.random()-.5)*3,s.glitch=1,s.focus=1);const R=s.x,x=s.y,S=(w,E,A,P,L)=>(E+=(P*(A-w)-L*E)*e,[w+E*e,E]);[s.x,s.vx]=S(s.x,s.vx,g,90,11),[s.y,s.vy]=S(s.y,s.vy,y,90,11),[s.r,s.vr]=S(s.r,s.vr,b,70,10),[s.z,s.vz]=S(s.z,s.vz,T,s.punch>0?160:25,s.punch>0?14:9),s.px=Math.max(-.05,Math.min(.05,s.x-R)),s.py=Math.max(-.05,Math.min(.05,s.y-x));const k=Math.hypot(s.px,s.py)*40+Math.abs(s.vz)*.4;s.focus=Math.max(s.focus*Math.exp(-e*1.6),Math.min(1,k*.6)),s.focus=Math.min(1,s.focus*(.85+.15*Math.abs(Math.sin(l*7))));const M=Math.max(.75,Math.min(1.8,.46/Math.max(.05,this.motion.luma)));s.expo+=(M-s.expo)*(1-Math.exp(-e*1.4)),s.glitch=Math.max(s.glitch*Math.exp(-e*3),f>.75&&Math.random()<.04?.6:0)}drawViewfinder(e,a,s,l){const r=Math.round(s/22),o=s*.06,t=Math.max(0,(l-this.startedAt)/1e3),i=g=>String(Math.floor(g)).padStart(2,"0");e.save(),e.font=`600 ${r}px "Consolas","Courier New",monospace`,e.textBaseline="middle",e.shadowColor="rgba(0,0,0,0.6)",e.shadowBlur=2,e.fillStyle="rgba(255,255,255,0.88)",e.strokeStyle="rgba(255,255,255,0.75)",e.lineWidth=Math.max(1.5,s/360),Math.floor(l/600)%2===0&&(e.fillStyle="#ff2a2a",e.beginPath(),e.arc(o+r*.4,o+r*.5,r*.32,0,Math.PI*2),e.fill()),e.fillStyle="rgba(255,255,255,0.88)",e.textAlign="left",e.fillText("REC",o+r,o+r*.5),e.fillText(`SP ${i(t/3600)}:${i(t/60%60)}:${i(t%60)}`,o,s-o-r*.5);const n=r*1.6,c=r*.75,h=a-o-n,d=o+r*.12;e.strokeRect(h,d,n,c),e.fillRect(h+n,d+c*.3,c*.18,c*.4);const p=Math.floor(l/4e3)%9<7?2:1;for(let g=0;g<p;g++)e.fillRect(h+3+g*(n-6)/3,d+3,(n-6)/3-2,c-6);const f=s*.07,m=s*.035;e.beginPath();for(const[g,y,b,T]of[[m,m,1,1],[a-m,m,-1,1],[m,s-m,1,-1],[a-m,s-m,-1,-1]])e.moveTo(g,y+T*f),e.lineTo(g,y),e.lineTo(g+b*f,y);e.stroke(),e.restore()}startFace(e=!1){if(e&&!this.faceBlend&&(this.faceState==="worker"||this.faceState==="sync"||this.faceState==="failed")){this.worker.dispose(),this.worker=new ee;try{this.sync?.dispose()}catch{}this.sync=null,this.faceState="idle"}if(this.faceState!=="idle")return;this.faceState="loading",this.faceBlend=e;const a={numFaces:2,blendshapes:e};this.worker.init(a).then(async s=>{if(s){this.faceState="worker";return}const l=new be;await l.init(a)?(this.sync=l,this.faceState="sync"):this.faceState="failed"})}feedFaces(e,a,s,l,r){if(e.readyState<2||!e.videoWidth)return;const o=G()?1e3/18:1e3/30;let t=null,i=!1;if(this.faceState==="worker"){a-this.lastSend>=o&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),this.worker.send(this.feed.src(e),this.lastTs),this.lastSend=a);const n=this.worker.poll();i=n.fresh,t=n.frame}else this.faceState==="sync"&&this.sync&&a-this.lastSync>=100&&(this.lastTs=Math.max(this.lastTs+1,Math.round(a)),t=this.sync.detect(this.feed.src(e),this.lastTs),this.lastSync=a,i=!0);i&&(this.lens==="aura"&&this.emotion.push(t&&Object.keys(t.blendshapes).length?Ge(t.blendshapes):null,o/1e3),this.ingest(t?.faces??[],e,a,s,l,r))}ingest(e,a,s,l,r,o){const t=a.videoWidth,i=a.videoHeight,n=j(l,r,t,i,o),c=new Set;for(const h of e){const d=h.eyes.map(x=>({x:x.cx*t*n.s+n.ox,y:x.cy*i*n.s+n.oy,r:Math.hypot(x.dx*t,x.dy*i)*n.s*.95,gx:x.gx,gy:x.gy,open:x.open})),p=h.mouth,f=h.bbox,m={x:p.cx*t*n.s+n.ox,y:p.cy*i*n.s+n.oy,w:Math.hypot(p.dx*t,p.dy*i)*n.s,open:p.open},g={x:(f.x+f.w/2)*t*n.s+n.ox,y:(f.y+f.h/2)*i*n.s+n.oy,rx:f.w*t*n.s/2*1.02,ry:f.h*i*n.s/2*1.05},y=(d[0].x+d[1].x)/2,b=(d[0].y+d[1].y)/2;let T=null,R=l*.3;for(const x of this.tracks){if(c.has(x))continue;const S=Math.hypot(x.cx-y,x.cy-b);S<R&&(R=S,T=x)}if(!T){if(this.tracks.length>=3)continue;T={cx:y,cy:b,seen:s,alpha:0,eyes:[ve(d[0].x,d[0].y,d[0].r,d[0].gx,d[0].gy),ve(d[1].x,d[1].y,d[1].r,d[1].gx,d[1].gy)],mouth:{...m,tx:m.x,ty:m.y,tw:m.w,topen:m.open},head:{...g,tx:g.x,ty:g.y,trx:g.rx,try_:g.ry}},this.tracks.push(T)}c.add(T),T.cx=y,T.cy=b,T.seen=s,T.eyes.forEach((x,S)=>{x.tx=d[S].x,x.ty=d[S].y,x.tr=d[S].r,x.tgx=d[S].gx,x.tgy=d[S].gy,x.to=d[S].open}),T.mouth.tx=m.x,T.mouth.ty=m.y,T.mouth.tw=m.w,T.mouth.topen=m.open,T.head.tx=g.x,T.head.ty=g.y,T.head.trx=g.rx,T.head.try_=g.ry}}stepTracks(e,a){const s=1-Math.exp(-e*20),l=1-Math.exp(-e*28),r=[];for(const o of this.tracks){const t=a-o.seen;if(o.alpha+=((t<350?1:0)-o.alpha)*(1-Math.exp(-e*10)),t>900&&o.alpha<.02)continue;r.push(o);for(const c of o.eyes){const h=c.x,d=c.y;c.x+=(c.tx-c.x)*s,c.y+=(c.ty-c.y)*s,c.r+=(c.tr-c.r)*s,c.gx+=(c.tgx-c.gx)*s,c.gy+=(c.tgy-c.gy)*s,c.o+=(c.to-c.o)*l;const p=(c.x-h)/e,f=(c.y-d)/e,m=Math.max(-1,Math.min(1,(p-c.vx)/e/(c.r*120))),g=Math.max(-1,Math.min(1,(f-c.vy)/e/(c.r*120)));c.vx=p,c.vy=f,c.ax+=(m-c.ax)*.35,c.ay+=(g-c.ay)*.35}const i=o.mouth;i.x+=(i.tx-i.x)*s,i.y+=(i.ty-i.y)*s,i.w+=(i.tw-i.w)*s,i.open+=(i.topen-i.open)*l;const n=o.head;n.x+=(n.tx-n.x)*s,n.y+=(n.ty-n.y)*s,n.rx+=(n.trx-n.rx)*s,n.ry+=(n.try_-n.ry)*s}this.tracks=r}drawGoogly(e,a){for(const s of this.tracks)if(!(s.alpha<.02))for(const l of s.eyes){const r=-l.ax*120,o=_t-l.ay*120;l.pvx+=r*a,l.pvy+=o*a;const t=Math.exp(-1.3*a);l.pvx*=t,l.pvy*=t,l.px+=l.pvx*a,l.py+=l.pvy*a;const i=Math.hypot(l.px,l.py);if(i>Z){const n=l.px/i,c=l.py/i;l.px=n*Z,l.py=c*Z;const h=l.pvx*n+l.pvy*c;h>0&&(l.pvx-=(1+ye)*h*n,l.pvy-=(1+ye)*h*c)}l.r<3||this.paintEye(e,l,s.alpha)}}paintPuppets(e){this.tracks.filter(a=>a.alpha>.3).slice(0,2).forEach((a,s)=>{const l=Math.atan2(a.eyes[1].y-a.eyes[0].y,a.eyes[1].x-a.eyes[0].x),r=Math.atan2(Math.sin(l),Math.cos(l)),o=Math.abs(r)>Math.PI/2?r-Math.sign(r)*Math.PI:r,[t,i]=a.eyes[0].x<=a.eyes[1].x?[a.eyes[0],a.eyes[1]]:[a.eyes[1],a.eyes[0]];xt(e,{x:a.head.x,y:a.head.y-a.head.ry*.08,r:Math.max(a.head.rx,a.head.ry)*1.3,roll:o,eyes:[t,i].map(n=>({x:n.x,y:n.y,gx:n.gx,gy:n.gy,open:n.o})),mouthOpen:a.mouth.open},s===0?this.lastPose:null,this.colours,Math.min(1,a.alpha))})}holdFrame(e,a,s,l){const r=this.hold;if(r.width===a&&r.height===s&&this.holdAt&&l-this.holdAt<this.holdGap)return e.drawImage(r,0,0,a,s),!0;this.holdAt=l,this.frameNo++;const o=1e3/(Lt[this.lens]??30);return this.holdGap=o*(this.lens==="silent"?.85+Math.random()*.35:this.lens==="grindhouse"&&Math.random()<.08?2:1),!1}keepHold(e,a,s){const l=this.hold;(l.width!==a||l.height!==s)&&(l.width=a,l.height=s),l.getContext("2d").drawImage(e,0,0,a,s)}paintEye(e,a,s){const{x:l,y:r,r:o}=a;e.save(),e.globalAlpha=s,e.fillStyle="rgba(0,0,0,0.28)",e.beginPath(),e.ellipse(l+o*.07,r+o*.13,o*1.04,o*1,0,0,Math.PI*2),e.fill();const t=e.createRadialGradient(l-o*.3,r-o*.35,o*.1,l,r,o);t.addColorStop(0,"#ffffff"),t.addColorStop(.75,"#f4f4f2"),t.addColorStop(1,"#cfcfcc"),e.fillStyle=t,e.beginPath(),e.arc(l,r,o,0,Math.PI*2),e.fill(),e.lineWidth=Math.max(1.5,o*.09),e.strokeStyle="#141414",e.stroke();const i=o*Se,n=l+a.px*o,c=r+a.py*o;e.fillStyle="#0b0b0b",e.beginPath(),e.arc(n,c,i,0,Math.PI*2),e.fill(),e.fillStyle="rgba(255,255,255,0.85)",e.beginPath(),e.arc(n-i*.32,c-i*.34,i*.24,0,Math.PI*2),e.fill(),e.restore()}apply(e,a,s,l,r="cover"){if(this.lens==="none")return;if(J.has(this.lens)){this.halloweenEngine||(this.halloweenEngine=new de,this.lens==="dimlights"?(this.halloweenEngine.setFilter("none"),this.halloweenEngine.setDimLights(!0)):(this.halloweenEngine.setDimLights(!1),this.halloweenEngine.setFilter(this.lens))),this.halloweenEngine.apply(e,a,s,l);return}const o=Math.max(1/120,Math.min(.1,this.lastApply?(l-this.lastApply)/1e3:1/30));this.lastApply=l,e.globalAlpha=1;const t=a.width,i=a.height;if(this.lens==="googly")this.feedFaces(s,l,t,i,r),this.stepTracks(o,l),this.drawGoogly(e,o);else if(this.lens==="aura")this.feedFaces(s,l,t,i,r),this.stepTracks(o,l),this.updateAura(l),this.shade("aura",e,a,s,l,r),this.orbs.update(o,l),this.orbs.draw(e,t,i,l),this.frameAspect=t/i;else if(this.lens==="bigface")this.feedFaces(s,l,t,i,r),this.stepTracks(o,l),this.tracks.some(n=>n.alpha>.3)&&this.shade("bigface",e,a,s,l,r);else if(this.lens==="cardboard"){if(this.feedFaces(s,l,t,i,r),this.stepTracks(o,l),this.holdFrame(e,t,i,l)||(this.feedPose(s,t,i,r),this.sampleColours(a,l),this.updatePlate(s,l),this.shade("southpark",e,a,s,l,r),!this.gl||this.tainted))return;this.paintPuppets(e),this.keepHold(a,t,i)}else if(this.lens==="silent"||this.lens==="grindhouse"){if(this.lens==="grindhouse"&&this.stepGrindhouse(l),this.holdFrame(e,t,i,l))return;if(this.lens==="grindhouse"&&this.evt.type===1){const n=this.freeze;(this.freezeAt!==this.evt.start||n.width!==t||n.height!==i)&&(n.width=t,n.height=i,n.getContext("2d").drawImage(a,0,0,t,i),this.freezeAt=this.evt.start),e.drawImage(n,0,0,t,i)}this.shade(this.lens,e,a,s,l,r),this.keepHold(a,t,i)}else this.lens==="vhs"?(this.startedAt||(this.startedAt=l),this.frameNo++,this.stepVhs(l,o),this.drawVhsStamp(e,t,i,l),this.shade("vhs",e,a,s,l,r)):this.lens==="colorize"?(this.motion.update(a),this.feedFaces(s,l,t,i,r),this.stepTracks(o,l),this.shade("colorize",e,a,s,l,r)):this.lens==="foundfootage"?(this.startedAt||(this.startedAt=l),this.frameNo++,this.motion.update(a),this.stepRig(o,l),this.shade("found",e,a,s,l,r),this.gl&&!this.tainted&&this.drawViewfinder(e,t,i,l)):((this.lens==="comic"||(++this.frameNo&3)===0)&&this.motion.update(a),this.shade(this.lens,e,a,s,l,r))}updateAura(e){const a=this.auraState=this.emotion.get();let s=a.a,l=a.b,r=a.intensity;const o=this.orbs.lastCollect;if(o&&e-o.at<2200){const t=(1-(e-o.at)/2200)*.7,i=B[o.emo];s=s.map((n,c)=>n+(i.a[c]-n)*t),l=l.map((n,c)=>n+(i.b[c]-n)*t),r=Math.min(1,r+t*.6)}this.auraA=s,this.auraB=l,this.auraAmt=r}tap(e,a,s){return this.lens==="aura"?this.orbs.tap(e,a,s,this.frameAspect,performance.now()):!1}setOrbListener(e){this.orbs.onCollect=e}getAuraInfo(){const e=this.auraState,a=B[e.dominant];return{emotion:e.dominant,label:a.label,icon:a.icon,intensity:e.intensity,leaderboard:this.orbs.leaderboard(5),orbsOnScreen:this.orbs.orbs.length}}dispose(){this.worker.dispose();try{this.sync?.dispose()}catch{}this.halloweenEngine?.dispose(),this.halloweenEngine=null,this.matte.dispose(),this.pointer.stop(),this.pose?.dispose(),this.pose=null,this.poseState="idle";const e=this.gl;if(e){for(const a of[this.srcTex,this.maskTex,this.glyphTex,this.depthTex,this.plateTex,this.palTex,this.asciiTex])a&&e.deleteTexture(a);for(const a of Object.values(this.progs))a&&e.deleteProgram(a.prog);this.cz&&(this.cz.tex.forEach(a=>e.deleteTexture(a)),this.cz.fbo.forEach(a=>e.deleteFramebuffer(a)));for(const a of[this.segTex,this.matPalTex])a&&e.deleteTexture(a);e.getExtension("WEBGL_lose_context")?.loseContext()}this.gl=null,this.progs={},this.tracks=[],this.cz=null,this.segTex=null,this.matPalTex=null}}export{pe as FILM_STOCKS,Dt as LENSES,Nt as LensEngine,Ft as getFilmStock,Gt as setFilmStock};
