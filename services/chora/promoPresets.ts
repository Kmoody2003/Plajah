import QRCode from 'qrcode';
import type { TelaDoc, TelaGradientPaint, TelaVectorDevice, TelaVectorObject } from '../../types';
import { measureText } from '../tela/telaText';
import { objectsToSvg } from '../tela/telaSvg';
import { promoDestination, safePromoUrl } from './promoGeneratorService';
import { PROMO_FORMATS, ALL_PROMO_SUITES, REVIEW_PROMO_SUITES, type PromoFormat, type PromoRecipe, type PromoRelease, type PromoTemplateId } from './promoTypes';

/** Canonical Plajah brand, matching styles/plajah-ds.css. Exported graphics
 * deliberately keep brand colors across application themes. */
export const PROMO_BRAND = { ink: '#100B17', white: '#FAF5FF', purple: '#6B0099', magenta: '#D40055', orange: '#FF8C00', cyan: '#00DAF3', lilac: '#D0BCFF' } as const;
const C = PROMO_BRAND;
const gradient = (colors: string[], kind: 'LINEAR' | 'RADIAL' = 'LINEAR', angle = 45): TelaGradientPaint =>
  ({ kind, angle, stops: colors.map((color, i) => ({ color, offset: i / (colors.length - 1) })) });
const WARM = gradient([C.purple, C.magenta, C.orange]);
const SPATIAL = gradient([C.purple, C.cyan]);
export interface PromoScene {
  template: PromoTemplateId;
  format: PromoFormat;
  width: number;
  height: number;
  objects: TelaVectorObject[];
  destination: string;
}
export interface PromoArtwork { url: string; width: number; height: number; }
export interface PromoReviewMotionTrack { objectId: string; property: 'rotation'|'x'|'y'|'opacity'; from: number; to: number; delay: number; duration: number; }
/** Gallery choreography targets ornaments only; audio, titles and the QR remain readable. Milliseconds. */
export function promoReviewMotion(scene: PromoScene): { duration: number; tracks: PromoReviewMotionTrack[] } {
  const tracks: PromoReviewMotionTrack[]=[];
  const scale=scene.width/(scene.format==='landscape'?640:400);
  for(const o of scene.objects){
    const label=o.objectLabel||'';
    const index=tracks.length;
    if(label.startsWith('Pressed botanical leaf')) tracks.push({objectId:o.id,property:'rotation',from:o.rotation-3,to:o.rotation+3,delay:index*140,duration:4200});
    else if(label.startsWith('Signal bars')) tracks.push({objectId:o.id,property:'opacity',from:.08,to:.3,delay:index*180,duration:1200});
    else if(label.startsWith('Atlas meridian')) tracks.push({objectId:o.id,property:'opacity',from:.08,to:.28,delay:index*350,duration:3800});
    else if(label.startsWith('Star chart')&&Number(label.split(' ').at(-1))%3===0) tracks.push({objectId:o.id,property:'opacity',from:.35,to:.85,delay:index*80,duration:3000});
    else if(label.startsWith('Reflective current')) tracks.push({objectId:o.id,property:'x',from:o.x-7*scale,to:o.x+7*scale,delay:index*230,duration:2700});
    else if(label==='Paper arch'||label==='Paper arch shadow') tracks.push({objectId:o.id,property:'rotation',from:o.rotation-2,to:o.rotation+2,delay:index*300,duration:5000});
    else if(label==='Issue index panel') tracks.push({objectId:o.id,property:'opacity',from:.65,to:1,delay:0,duration:3600});
  }
  return {duration:10000,tracks};
}

export function qrPath(url: string): { path: string; size: number } {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  let path = '';
  for (let row = 0; row < qr.modules.size; row++) for (let col = 0; col < qr.modules.size; col++) {
    if (qr.modules.get(row, col)) path += 'M' + (col + 4) + ' ' + (row + 4) + 'h1v1h-1z';
  }
  return { path, size: qr.modules.size + 8 };
}

/** Actual layers, not a flattened screenshot. Coordinates are composed in a
 * 400-unit artboard then scaled to exact export dimensions. Every layer is Tela-native. */
export function createPromoScene(release: PromoRelease, recipe: PromoRecipe, template: PromoTemplateId, format: PromoFormat, directUrl: string, artwork?: PromoArtwork): PromoScene {
  const target = PROMO_FORMATS[format];
  const wide = format === 'landscape', square = format === 'square';
  const w = wide ? 640 : 400, h = target.height / target.width * w;
  const compact = square;
  const objects: TelaVectorObject[] = [];
  let serial = 0;
  const add = (kind: TelaVectorObject['kind'], label: string, x: number, y: number, width: number, height: number, fill: string, patch: Partial<TelaVectorObject> = {}) => {
    const obj: TelaVectorObject = { id: template + '-' + format + '-' + serial++, kind, objectLabel: label, x, y, w: width, h: height, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, ...patch };
    objects.push(obj); return obj;
  };
  const box = (label: string, x: number, y: number, width: number, height: number, fill: string, patch: Partial<TelaVectorObject> = {}) => add('RECT', label, x, y, width, height, fill, { rx: 0, ...patch });
  const ellipse = (label: string, cx: number, cy: number, rx: number, ry: number, fill: string, patch: Partial<TelaVectorObject> = {}) => add('ELLIPSE', label, cx-rx, cy-ry, rx*2, ry*2, fill, patch);
  const path = (label: string, d: string, fill: string, patch: Partial<TelaVectorObject> = {}) => add('PATH', label, 0, 0, w, h, fill, { svgPathData: d, pathOriginX: 0, pathOriginY: 0, pathOriginW: w, pathOriginH: h, ...patch });
  const rule = (label: string, x: number, y: number, width: number, color = C.lilac) => box(label, x, y, width, .6, color, { opacity: .3 });
  const text = (label: string, x: number, baseline: number, width: number, value: string, size: number, color: string = C.white, patch: Partial<TelaVectorObject> = {}) => {
    const obj = add('TEXT', label, x, baseline-size, width, size*1.2, color, {
      text: value.replace(/[\r\n]+/g, ' ').trim(), fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: size, lineHeight: 1, wrap: false, ...patch,
    });
    const measured = measureText(obj.text!, obj);
    // A single word can be longer than a full line: shrink instead of clipping.
    if (measured > width) { obj.fontSize = size * width / measured; obj.y = baseline - obj.fontSize; obj.h = obj.fontSize*1.2; }
    return obj;
  };
  const note = (x: number, y: number, width: number, value: string, color: string = C.lilac, patch: Partial<TelaVectorObject> = {}) =>
    text('Release detail', x, y, width, value, 8, color, { fontFamily: 'JetBrains Mono, monospace', fontWeight: 400, letterSpacing: .12, ...patch });
  const artist = (x: number, y: number, width: number, color: string = C.lilac, center = false) => text('Artist name', x, y, width, recipe.artist.toUpperCase(), 11, color, { letterSpacing: .2, textAlign: center ? 'center' : 'left', templateRole: 'DECK' });
  const words = (recipe.title.trim() || release.title || 'Untitled').split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  const titleLines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  const title = (x: number, y: number, width: number, size: number, second: boolean, color: string, patch: Partial<TelaVectorObject> = {}) => text('Release title ' + (second ? '2' : '1'), x, y, width, template === 'harmonia-velvet' ? titleLines[+second] : titleLines[+second].toUpperCase(), size, color, { fontWeight: 900, letterSpacing: -.035, templateRole: 'HEADLINE', ...patch });
  const art = (x: number, y: number, size: number, rotation = 0) => {
    const src = artwork?.url || release.coverImage;
    const sw = Math.max(1, artwork?.width || 1000), sh = Math.max(1, artwork?.height || 1000), crop = Math.min(sw, sh);
    if (src && (/^(https?:|blob:|data:image\/)/.test(src) || src.startsWith('/'))) {
      add('IMAGE', 'Release artwork', x, y, size, size, 'none', { sourceImageSrc: src, sourceCrop: { x: (sw-crop)/2, y: (sh-crop)/2, width: crop, height: crop, sourceWidth: sw, sourceHeight: sh }, rotation, templateRole: 'IMAGE_SLOT', shadow: { x: 0, y: 7, blur: 12, color: 'rgba(0,0,0,0.35)' } });
    } else {
      box('Artwork placeholder', x, y, size, size, C.purple, { gradient: WARM, rotation });
      text('Artwork prompt', x+12, y+size/2, size-24, 'ADD COVER ART', 12, C.white, { textAlign: 'center' });
    }
  };
  const vinyl = (x: number, y: number, r: number) => {
    ellipse('Vinyl record', x, y, r, r, C.ink, { stroke: C.lilac, strokeWidth: .5 });
    for (let i=0;i<25;i++) ellipse('Vinyl groove ' + i, x, y, r*(.35+i*.025), r*(.35+i*.025), 'none', { stroke: i%4===0 ? C.orange : C.lilac, strokeWidth: .6, opacity: i%4===0 ? .23 : .09 });
    ellipse('Record label', x, y, r*.27, r*.27, C.magenta);
    ellipse('Record center', x, y, r*.15, r*.15, C.orange);
    ellipse('Spindle', x, y, 3, 3, C.ink);
  };
  const halo = (x: number, y: number, r: number) => {
    for (let i=0;i<8;i++) ellipse('Spatial orbit ' + i, x, y, r-i*6, r*.35+i*4, 'none', { stroke: i<4 ? C.cyan : C.purple, strokeWidth: i===0?1.5:.6, opacity: .7-i*.07, rotation: -28 });
  };
  const future = !!release.isScheduled && !!release.releaseDate && release.releaseDate > Date.now();
  const dateLabel = future ? 'COMING ' + new Date(release.releaseDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase() : 'NEW RELEASE';
  if(REVIEW_PROMO_SUITES.some(s=>s.id===template)){
    const editorial=template==='editorial-nocturne', botanical=template==='botanical-reverie', brutal=template==='brutalist-signal', celestial=template==='celestial-atlas', chrome=template==='chrome-current';
    const bg=editorial?'#EEE8D9':botanical?'#102D27':brutal?'#DBFF00':celestial?'#101C32':chrome?'#1730BC':'#ECD8D2';
    const ink=editorial||brutal||(!botanical&&!celestial&&!chrome)?'#242224':'#F8F3E5';
    const accent=editorial?'#DF4C32':botanical?'#B6D7AD':brutal?'#242224':celestial?'#D7B878':chrome?'#7AEAFF':'#B93E63';
    const footer=h-(wide?103:111), contentBottom=footer-9;
    box('Collection ground',0,0,w,h,bg,{templateRole:'GROUND'});
    // Each art direction uses authored editable geometry, never a flattened poster.
    if(editorial){
      box('Editorial vermilion margin',0,0,12,h,accent);
      box('Issue index panel',w-73,0,73,63,accent);
      text('Issue number',w-65,47,57,'04',42,'#EEE8D9',{fontFamily:'Georgia, serif',fontWeight:400});
      rule('Editorial hairline',26,61,w-117,'#242224');
      note(26,53,200,'THE SOUND JOURNAL / VOL. 01',ink);
    }else if(botanical){
      for(let i=0;i<9;i++){
        const px=w*(.72+(i%3)*.095),py=64+i*(contentBottom-90)/9;
        ellipse('Pressed botanical leaf '+i,px,py,22+i%3*6,55,'#527D59',{rotation:i%2?42:-38,opacity:.42});
      }
      path('Botanical stem',`M${w*.91} 50 Q${w*.65} ${h*.37} ${w*.84} ${contentBottom}`,'none',{stroke:accent,strokeWidth:1,opacity:.55});
      ellipse('Garden sun',w*.18,contentBottom*.52,49,49,'#D6A55C',{opacity:.12});
    }else if(brutal){
      box('Industrial top band',0,0,w,43,ink);
      for(let i=0;i<12;i++)box('Signal registration '+i,24+i*7,53,i%3===0?4:1,17,ink);
      text('Industrial edition',w-125,67,99,'SIDE / A',12,ink,{fontFamily:'monospace'});
      for(let i=0;i<7;i++)box('Signal bars '+i,w-26-i*8,85,3,contentBottom-100,ink,{opacity:.18});
    }else if(celestial){
      for(let i=0;i<5;i++)ellipse('Atlas meridian '+i,w*.61,contentBottom*.58,44+i*27,44+i*27,'none',{stroke:accent,strokeWidth:.6,opacity:.18});
      for(let i=0;i<22;i++){const sx=24+((i*97)%(w-48)),sy=52+((i*71)%Math.max(1,contentBottom-74));ellipse('Star chart '+i,sx,sy,i%5===0?1.8:.7,i%5===0?1.8:.7,accent,{opacity:.75});}
      rule('Atlas equator',24,contentBottom*.6,w-48,accent);
      note(26,57,200,'RA 22h 14m / DEC +41°',accent);
    }else if(chrome){
      for(let i=0;i<4;i++)path('Reflective current '+i,`M${w*.42+i*18} 48 C${w*1.1} ${contentBottom*.25},${w*.15} ${contentBottom*.62},${w*.89} ${contentBottom-4}`,'none',{stroke:i%2?'#F7FFFF':accent,strokeWidth:20-i*4,opacity:.35+i*.13});
      box('Current capsule',24,49,113,23,'#F7FFFF',{rx:12});
      text('Current edition',33,65,96,'FUTURE / SOUND',8,bg,{fontFamily:'monospace'});
    }else{
      ellipse('Paper arch shadow',w*.67,contentBottom*.62,w*.25,contentBottom*.38,'#B93E63',{opacity:.13,rotation:17});
      ellipse('Paper arch',w*.68,contentBottom*.59,w*.23,contentBottom*.36,'#D6ABA1',{rotation:17});
      path('Folded paper fan',`M${w*.13} ${contentBottom-15} L${w*.07} ${contentBottom*.43} L${w*.4} ${contentBottom*.68} Z`,'#B93E63',{opacity:.33});
      note(26,56,210,'SALON SESSIONS / AN INVITATION',ink);
    }
    note(26,28,w-166,'PLAJAH / CHORA',brutal?bg:ink);
    note(w-137,28,111,dateLabel,brutal?bg:ink,{textAlign:'right'});
    const side=wide||compact, tx=26, tw=wide?310:compact?176:348;
    const titleY=side?111:110, ts=wide?51:compact?36:53;
    const serif=editorial||celestial||template==='paper-salon';
    const tp={fontFamily:serif?'Georgia, serif':'Outfit, sans-serif',fontWeight:serif?400:900,letterSpacing:serif?-.025:-.045,fontStyle:template==='paper-salon'?'italic' as const:'normal' as const};
    title(tx,titleY,tw,ts,false,ink,tp);title(tx,titleY+ts*1.06,tw,ts,true,ink,tp);
    artist(tx,titleY+ts*1.06+25,tw,accent);
    const size=wide?166:compact?143:Math.min(228,contentBottom-241);
    const ax=wide?421:compact?230:(w-size)/2, ay=wide?83:compact?101:218;
    box('Artwork mat',ax-6,ay-6,size+12,size+12,editorial?'#FFFDF6':accent,{opacity:editorial?1:.5});
    art(ax,ay,size);
    const campaignY=side?Math.min(contentBottom-9,257):contentBottom-13;
    text('Campaign line',26,campaignY,side?tw:348,recipe.tagline||REVIEW_PROMO_SUITES.find(s=>s.id===template)!.subtitle,side?11:13,ink,{fontFamily:serif?'Georgia, serif':'Outfit, sans-serif',fontWeight:400});
    // Dark conversion panel retains the same accessible QR and brand lockup.
    box('Conversion panel',0,footer,w,h-footer,C.ink);
  }else if(template==='kinetic-pulse'){
    box('Orange ground',0,0,w,h,C.orange,{templateRole:'GROUND'});
    path('Forward brand ribbon','M'+w*.53+' -50L'+w*1.11+' '+h*.37+'L'+w*.15+' '+h*.94+'L'+(-w*.25)+' '+h*.72+'L'+w*.59+' '+h*.34+'L'+w*.13+' -50Z',C.purple,{gradient:WARM});
    path('Obsidian diagonal','M0 '+h*.59+'L'+w+' '+h*.34+'V'+h+'H0Z',C.ink);
    path('Magenta speed line','M0 '+h*.65+'L'+w+' '+h*.4,'none',{stroke:C.magenta,strokeWidth:5});
    path('Purple speed line','M0 '+h*.67+'L'+w+' '+h*.42,'none',{stroke:C.purple,strokeWidth:2});
    note(25,29,w-160,'PLAJAH / CHORA',C.ink);note(w-145,29,120,dateLabel,C.ink,{textAlign:'right'});
    const tsize=wide?68:compact?70:Math.min(90,h*.127);
    title(23,wide?107:compact?101:h*.184,wide?315:350,tsize,false,C.ink,{fontStyle:'italic'});
    title(23,wide?174:compact?166:h*.31,wide?315:350,tsize,true,C.ink,{fontStyle:'italic'});
    artist(27,wide?200:compact?193:h*.355,wide?300:345,C.ink);
    if(wide) art(402,67,185,-11);
    else if(compact) art(228,177,138,-11);
    else {
      const size=Math.min(234,h*.328), y=h*.418;
      path('Artwork depth plane','M87 '+(y+35)+'L320 '+(y-4)+'L356 '+(y+209)+'L121 '+(y+253)+'Z',C.purple,{opacity:.55});
      art((400-size)/2-5,y,size,-11);
      ellipse('Press play seal',330,y+size-17,30,30,C.orange);
      text('Seal line 1',303,y+size-20,54,'PRESS',10,C.ink,{fontWeight:800,textAlign:'center'});
      text('Seal line 2',303,y+size-6,54,'PLAY.',14,C.ink,{fontWeight:900,textAlign:'center'});
    }
    text('Campaign line',25,wide?247:compact?268:h*.806,wide?310:compact?175:350,recipe.tagline || 'FEEL EVERYTHING.',compact?17:15,C.white,{fontStyle:'italic',fontWeight:800});
  }else if(template==='harmonia-velvet'){
    box('Velvet ground',0,0,w,h,C.purple,{gradient:gradient(['#1a0026',C.purple,'#24082c']),templateRole:'GROUND'});
    ellipse('Ember light',w*.64,h*.49,w*.74,h*.5,C.orange,{gradient:{kind:'RADIAL',stops:[{offset:0,color:C.orange},{offset:.42,color:C.magenta},{offset:1,color:C.purple,opacity:0}]}});
    for(let i=0;i<15;i++) ellipse('Velvet fold '+i,w*.65,h*.45,w*.35+i*9,h*.21+i*5,'none',{stroke:i%3===0?C.orange:C.lilac,strokeWidth:.55,opacity:.18-i*.008,rotation:-32});
    note(25,29,w-190,'PLAJAH / CHORA');note(w-185,29,160,'THE LISTENING ROOM',C.lilac,{textAlign:'right'});
    artist(wide||compact?25:26,wide?72:compact?67:h*.104,wide?290:compact?170:348,C.lilac,!wide&&!compact);
    title(wide||compact?23:26,wide?139:compact?123:h*.208,wide?300:compact?174:348,wide?63:compact?51:Math.min(79,h*.112),false,C.white,{fontWeight:500,textAlign:!wide&&!compact?'center':'left'});
    title(wide||compact?23:26,wide?198:compact?174:h*.31,wide?300:compact?174:348,wide?63:compact?51:Math.min(79,h*.112),true,C.white,{fontWeight:500,textAlign:!wide&&!compact?'center':'left'});
    text('Campaign line',wide||compact?26:26,wide?235:compact?220:h*.357,wide?300:compact?152:348,recipe.tagline || 'Let the outside world wait.',11,'#f0cfe1',{fontFamily:'Inter, sans-serif',fontWeight:400,textAlign:!wide&&!compact?'center':'left'});
    if(wide){vinyl(519,159,97);art(357,97,175,-6);}
    else if(compact){vinyl(308,233,68);art(192,178,129,-6);}
    else {
      const s=Math.min(215,h*.303), cy=h*.565;
      ellipse('Record shadow',209,cy+s*.6,151,15,C.ink,{opacity:.5});
      vinyl(252,cy,Math.min(110,h*.154));art(52,cy-s*.43,s,-6);
      text('Listening room line',26,h*.799,348,'LOSE YOURSELF IN THE SOUND.',10,C.white,{textAlign:'center',letterSpacing:.14});
    }
  }else{
    box('Spatial ground',0,0,w,h,'#090611',{templateRole:'GROUND'});
    path('Spatial glass plane','M'+w*.42+' 0H'+w+'V'+h*.87+'L'+w*.42+' '+h*.58+'Z',C.purple,{gradient:SPATIAL,opacity:.3});
    for(let i=0;i<7;i++) box('Architecture line '+i,w*.07+i*w*.143,0,.5,h,C.lilac,{opacity:.06});
    note(25,29,w-190,'PLAJAH / CHORA');note(w-185,29,160,'ANOTHER DIMENSION',C.cyan,{textAlign:'right'});
    title(24,wide?106:compact?99:h*.167,wide?310:348,wide?68:compact?66:Math.min(85,h*.12),false,C.white);
    title(24,wide?174:compact?161:h*.28,wide?310:348,wide?68:compact?66:Math.min(85,h*.12),true,C.purple,{gradient:SPATIAL});
    artist(27,wide?204:compact?192:h*.329,wide?300:348);
    const x=wide?445:compact?244:160, y=wide?74:compact?194:h*.418, s=wide?151:compact?105:Math.min(184,h*.26);
    if(!wide&&!compact) path('Brand chevron architecture','M85 '+h*.41+'L285 '+h*.59+'L85 '+h*.77,'none',{stroke:C.purple,strokeWidth:45,opacity:.3});
    halo(x+s*.4,y+s*.48,s*.72);
    ellipse('Spatial reflection',x+s*.5,y+s+16,s*.64,15,C.cyan,{opacity:.09});
    box('Monolith edge',x+7,y+8,s,s,C.purple,{gradient:SPATIAL,rotation:-13});
    art(x,y,s,-13);
    text('Campaign line',25,wide?247:compact?267:h*.795,wide?320:compact?174:348,recipe.tagline || 'SOUND. REIMAGINED.',wide?13:17,C.cyan,{fontWeight:800});
  }
  // One legible conversion area shared by every suite, with a real scannable QR.
  const fy = h - (wide ? 73 : 81);
  const destination = promoDestination(directUrl,template,format);
  rule('Conversion divider',25,fy-23,w-50);
  note(26,fy-3,w-130,future?'COMING TO PLAJAH CHORA':'AVAILABLE ON PLAJAH CHORA',C.white);
  box('Chora lockup',24,fy+10,wide?190:230,36,C.ink,{rx:18,stroke:C.magenta,strokeWidth:.8});
  // Exact chevron geometry from components/Logo.tsx; kept as an editable path.
  add('PATH','Plajah chevron',32,fy+16,21,24,'none',{svgPathData:'M30 20 L70 50 L30 80',pathOriginX:20,pathOriginY:10,pathOriginW:60,pathOriginH:80,stroke:C.orange,strokeWidth:5});
  text('Plajah wordmark',60,fy+34,58,'PLAJAH',11,C.white,{fontWeight:700,letterSpacing:.08,templateRole:'LOGO'});
  text('Chora wordmark',124,fy+35,wide?81:106,'CHORA',20,C.white,{fontWeight:900,fontStyle:'italic',templateRole:'LOGO'});
  const qr=qrPath(destination), qsize=wide?51:58, qx=w-25-qsize, qy=fy-7;
  box('QR quiet zone',qx,qy,qsize,qsize,'#ffffff');
  add('PATH','Scannable release QR',qx,qy,qsize,qsize,'#100B17',{svgPathData:qr.path,pathOriginX:0,pathOriginY:0,pathOriginW:qr.size,pathOriginH:qr.size,templateRole:'LOGO'});
  const dsps=Object.entries(recipe.secondaryDsps).filter(([,url])=>!!url&&!!safePromoUrl(url)).map(([name])=>name);
  if(dsps.length) note(26,h-13,w-52,'ALSO ON '+dsps.join(' · '),C.lilac,{fontSize:7,letterSpacing:0});
  else note(26,h-13,w-52,template==='kinetic-pulse'?'THE SOUND MOVES FORWARD.':template==='harmonia-velvet'?'YOURS TO GET LOST IN.':'STEP INTO YOUR NEXT OBSESSION.',C.lilac,{fontSize:7,letterSpacing:.08});
  const scale=target.width/w;
  const scaled=objects.map(o=>({...o,x:o.x*scale,y:o.y*scale,w:o.w*scale,h:o.h*scale,strokeWidth:o.strokeWidth*scale,
    ...(o.fontSize?{fontSize:o.fontSize*scale}:{}),...(o.rx?{rx:o.rx*scale}:{}),
    ...(o.shadow?{shadow:{x:o.shadow.x*scale,y:o.shadow.y*scale,blur:o.shadow.blur*scale,color:o.shadow.color}}:{}),
  }));
  return {template,format,width:target.width,height:target.height,objects:scaled,destination};
}
export function promoSceneSvg(scene: PromoScene): string { return objectsToSvg(scene.objects,scene.width,scene.height); }
export function promoTelaDocument(release: PromoRelease, scenes: PromoScene[], id: string, now=Date.now()): TelaDoc {
  const devices: Record<string,TelaVectorDevice>={};
  let x=0;
  const frames=scenes.map((scene,index)=>{
    const did=id+'-device-'+index, fid=id+'-frame-'+index;
    devices[did]={id:did,type:'VECTOR',name:ALL_PROMO_SUITES.find(s=>s.id===scene.template)!.name+' · '+PROMO_FORMATS[scene.format].label,width:scene.width,height:scene.height,objects:structuredClone(scene.objects)};
    const frame={id:fid,kind:'BOARD' as const,preset:'FREE' as const,x,y:0,w:scene.width,h:scene.height,deviceIds:[did],label:devices[did].name};
    x+=scene.width+100;return frame;
  });
  return {id,ownerId:release.ownerId||'local',title:release.title+' · Chora promo',frames,devices,createdAt:now,updatedAt:now};
}
