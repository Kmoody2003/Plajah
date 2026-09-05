// broadcastTemplateFactory — turns a broadcast identity into its nine editable on-air formats.
//
// Every pack in broadcastPacks.ts is a real brief: a premise, a motion grammar, a typographic
// direction, an image treatment, a four-colour palette, and a named Council of Art Directors
// member. This file is what makes those words draw something.
//
// It did not used to. The previous version carried three comment blocks describing how the
// council was meant to drive the render — which geometric primitive each grid and mark produces,
// which filter each texture produces — and implemented only the font rule. Geometry was picked by
// `hash(pack.id) % 8`, so a pack's structure had no relationship to its own art direction, and
// all 74 identities shared a single hard-coded grain filter. The council spec was never imported.
//
// The division of labour, now actually implemented:
//   the COUNCIL supplies STRUCTURE — which primitive, which texture, how heavy the line,
//   the PACK supplies IDENTITY — palette, premise, typography, image treatment, guardrails.
//
// So four packs that share an art director share a structural vocabulary, the way work from one
// studio does, while remaining unmistakably themselves. Per-pack variation (counts, angles,
// density) is seeded from the pack id inside that shared family.
import {
  FABULA_BROADCAST_PACKS,
  type FabulaBroadcastAssetKind,
  type FabulaBroadcastPack,
} from './broadcastPacks';
import { DATA_VIZ_ART_DIRECTIONS, type DataVizArtDirection } from './dataVizArtDirection';

export interface FabulaBroadcastTemplateControls {
  title:string; subtitle:string; eyebrow:string; scoreHome:string; scoreAway:string;
  accent:string; secondary:string; foreground:string; background:string;
  texture:number; motionSpeed:number; imageUrl?:string;
}
export interface FabulaBroadcastLayer {
  id:string; type:'BACKGROUND'|'MOTIF'|'IMAGE'|'TITLE'|'SUBTITLE'|'DATA'|'TEXTURE';
  editable:boolean; role:string;
}
export interface FabulaBroadcastTemplate {
  id:string; packId:string; packName:string; family:FabulaBroadcastPack['family']; kind:FabulaBroadcastAssetKind;
  name:string; width:number; height:number; durationMs:number;
  controls:FabulaBroadcastTemplateControls; layers:FabulaBroadcastLayer[];
  motion:{entry:string;hold:string;exit:string;easing:string};
  typography:string; imageTreatment:string; guardrail?:string; collaborationRequired?:boolean;
  /** Which art director's structure this format is built on. */
  councilStyle:FabulaBroadcastPack['councilStyle'];
  /** The primitive and surface the council resolved to — surfaced so the UI can explain itself. */
  structure:{motif:BroadcastMotif;texture:DataVizArtDirection['texture'];lineWidth:number};
}

export type BroadcastMotif='circles'|'orbit'|'paths'|'slashes'|'frames'|'lattice'|'columns'|'collage'|'crosshair';

const SIZE:Record<FabulaBroadcastAssetKind,[number,number,number]>={
  OPENER:[1920,1080,8000],LOWER_THIRD:[1920,1080,6500],FULL_PAGE:[1920,1080,10000],BUG:[600,600,12000],
  STINGER:[1920,1080,1800],TRANSITION:[1920,1080,1400],SCORE_STRIP:[1920,240,12000],OVERLAY:[1920,1080,12000],CREDITS:[1920,1080,15000],
};
const esc=(s:string)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const hash=(s:string)=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const council=(pack:FabulaBroadcastPack):DataVizArtDirection=>DATA_VIZ_ART_DIRECTIONS[pack.councilStyle];

/* ─── Legibility ──────────────────────────────────────────────────────────────────────────── */
// A four-colour palette has no guarantee that entry [2] reads against entry [3], and the title
// was taking [2] regardless of what it landed on. On several identities that put a mid ochre on
// a mid ochre ground. Broadcast type has to be readable before it is expressive, so the ink is
// CHOSEN: the palette's best contrast wins, and only if the whole palette fails does it fall back
// to plain white or near-black.
const relLum=(hex:string)=>{
  const v=hex.replace('#','');
  const ch=(i:number)=>{const c=parseInt(v.slice(i,i+2),16)/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  return .2126*ch(0)+.7152*ch(2)+.0722*ch(4);
};
const contrast=(a:string,b:string)=>{const l1=relLum(a),l2=relLum(b);const [hi,lo]=l1>=l2?[l1,l2]:[l2,l1];return (hi+.05)/(lo+.05)};
/** The most readable ink for this ground, preferring the identity's own palette. */
function inkOn(ground:string,pack:FabulaBroadcastPack,min=3.6){
  const best=[...pack.palette].sort((x,y)=>contrast(y,ground)-contrast(x,ground))[0];
  if(contrast(best,ground)>=min) return best;
  return contrast('#FFFFFF',ground)>=contrast('#111111',ground)?'#FFFFFF':'#111111';
}

/* ─── Structure: the council decides, the pack varies within it ───────────────────────────── */

/**
 * The primitive a council member's grid and mark resolve to. This is the mapping the previous
 * version documented in a comment and then ignored in favour of a hash.
 *
 * Grid says how space is organised; mark disambiguates where one grid can go two ways — RULES
 * with a TICK is a column series, RULES with anything else is a set of frames.
 */
/**
 * The second composition axis: what the frame is *of*.
 *
 * The motif comes from the council and answers "what geometry". It cannot answer "what is this
 * shot", and two packs that land on the same director with a similar palette were coming out as
 * near-identical frames — Arena Carbon and Tale of the Tape differed only in hex. So the pack's
 * own words decide the arrangement: a comparison format sets two picture zones against each
 * other, a portrait format gives the figure a tall column, a panorama lets the picture run full
 * bleed under a band. Nothing here is random; it is read from copy the pack already carries.
 */
export type BroadcastEmphasis='COMPARISON'|'PORTRAIT'|'PANORAMA'|'INSET';
export function emphasisFor(pack:FabulaBroadcastPack):BroadcastEmphasis{
  const t=`${pack.premise} ${pack.imageTreatment} ${pack.motionGrammar}`.toLowerCase();
  // Word boundaries are not optional here: an unanchored /table/ matched the word "editable",
  // which appears in almost every imageTreatment, and swept two thirds of the library into one
  // arrangement. Every token below is anchored and unambiguous.
  if(/\bversus\b|\bvs\b|head[- ]to[- ]head|match[- ]?up|\bcompar|tale of the tape|\bbracket|\bstandings\b|side[- ]by[- ]side|two[- ]up|\bopponent|\brival/.test(t)) return 'COMPARISON';
  if(/\bportrait|\bprofile\b|\bface\b|\bfigure\b|\bcast\b|\bcharacter|\bhost\b|\binterview|\btalent\b|player card|\bbust\b|\bsilhouette|\bsubject\b/.test(t)) return 'PORTRAIT';
  if(/\barena\b|\bstadium\b|\bspectacle\b|\bpanoram|\blandscape\b|\bhorizon\b|\bvista\b|establishing|wide shot|\bexpanse\b|\bskyline\b|\baerial\b|\bscenery\b|\bterrain\b/.test(t)) return 'PANORAMA';
  return 'INSET';
}

export function motifFor(ad:DataVizArtDirection):BroadcastMotif{
  switch(ad.grid){
    case 'RADIAL':    return ad.mark==='DOT'||ad.mark==='ROUNDED'?'circles':'orbit';
    case 'RULES':     return ad.mark==='TICK'?'columns':'frames';
    case 'CONTOUR':   return 'paths';
    case 'DOTS':      return 'lattice';
    case 'CROSSHAIR': return 'crosshair';
    default:          // NONE — the mark carries the whole structure
      return ad.mark==='CAPSULE'||ad.mark==='FACET'?'collage':ad.mark==='DOT'?'circles':ad.mark==='TICK'?'columns':'slashes';
  }
}

/* Council font preferences:
 * serif -> EDITORIAL, INK, CEREMONIAL, CLASSICAL, BAROQUE
 * mono -> MONO
 * narrow -> NEON, SPORTS, REBEL
 * sans -> PLAJAH, SWISS, BAUHAUS, GLASS, TOPOGRAPHIC, BROADCAST, FUTURIST, WORLD_ATLAS, RADICAL_MINIMAL
 * The pack's own typography line wins where it is explicit; the council is the fallback.
 */
const fontFor=(pack:FabulaBroadcastPack)=>{
  if(/serif|didone|mincho|slab|engraved|song|baskerville/i.test(pack.typography)) return 'Georgia,Times New Roman,serif';
  if(/mono|technical|code|typewriter/i.test(pack.typography)) return 'Courier New,monospace';
  if(/condensed|narrow|compressed|grotesk display/i.test(pack.typography)) return 'Arial Narrow,Impact,sans-serif';
  return council(pack).font;
};

/* ─── Motion, read from the pack's own motion grammar ─────────────────────────────────────── */

interface MotionProfile{easing:string;scale:number}
/**
 * Each pack states in words how it should move. Rather than give all 74 the same easing curve,
 * read the grammar it wrote for itself: a system whose forms "drift" and rely on "pauses" must
 * not use the same curve as one that "strikes".
 */
function motionProfile(pack:FabulaBroadcastPack):MotionProfile{
  const g=`${pack.motionGrammar} ${pack.premise}`.toLowerCase();
  if(/strike|impact|snap|velocity|explod|slam|whip|kinetic|aggress/.test(g)) return {easing:'cubic-bezier(.16,.9,.24,1)',scale:.62};
  if(/drift|pause|still|breath|slow|quiet|settle|calm|negative space|ma\b/.test(g)) return {easing:'cubic-bezier(.33,0,.2,1)',scale:1.55};
  if(/assemble|construct|lock|module|interlock|grid|register|hairline/.test(g)) return {easing:'cubic-bezier(.5,0,.2,1)',scale:1};
  if(/travel|sweep|cross|slide|pass|flow|band/.test(g)) return {easing:'cubic-bezier(.4,0,.25,1)',scale:1.2};
  return {easing:'cubic-bezier(.2,.78,.18,1)',scale:1};
}

export function makeBroadcastTemplate(pack:FabulaBroadcastPack,kind:FabulaBroadcastAssetKind):FabulaBroadcastTemplate{
  const [width,height,durationMs]=SIZE[kind];
  const ad=council(pack);
  return {
    id:`${pack.id}__${kind.toLowerCase()}`,packId:pack.id,packName:pack.name,family:pack.family,kind,
    name:`${pack.name} · ${kind.replaceAll('_',' ')}`,width,height,durationMs,
    controls:{title:pack.name,subtitle:kind==='SCORE_STRIP'?'LIVE · 04:27':'Replaceable secondary information',eyebrow:kind.replaceAll('_',' '),scoreHome:'104',scoreAway:'98',accent:pack.palette[0],secondary:pack.palette[1],foreground:pack.palette[2],background:pack.palette[3],texture:.45,motionSpeed:1},
    layers:[
      {id:'background',type:'BACKGROUND',editable:true,role:'base field and color'},
      {id:'motif',type:'MOTIF',editable:true,role:`identity geometry · ${motifFor(ad)}`},
      {id:'image',type:'IMAGE',editable:true,role:'user image/video drop zone'},
      {id:'title',type:'TITLE',editable:true,role:'primary typography'},
      {id:'subtitle',type:'SUBTITLE',editable:true,role:'secondary typography'},
      {id:'data',type:'DATA',editable:true,role:'scores, labels, or live fields'},
      {id:'texture',type:'TEXTURE',editable:true,role:`human material trace · ${ad.texture.toLowerCase()}`},
    ],
    motion:{entry:entryFor(kind),hold:holdFor(pack),exit:exitFor(kind),easing:motionProfile(pack).easing},
    typography:pack.typography,imageTreatment:pack.imageTreatment,guardrail:pack.guardrail,collaborationRequired:pack.collaborationRequired,
    councilStyle:pack.councilStyle,
    structure:{motif:motifFor(ad),texture:ad.texture,lineWidth:ad.lineWidth},
  };
}

const entryFor=(kind:FabulaBroadcastAssetKind)=>({OPENER:'staged depth assembly',LOWER_THIRD:'directional strap reveal',FULL_PAGE:'editorial field construction',BUG:'mark resolve',STINGER:'high-velocity identity strike',TRANSITION:'full-frame material passage',SCORE_STRIP:'live data lockup',OVERLAY:'spatial panel reveal',CREDITS:'measured vertical procession'}[kind]);
const exitFor=(kind:FabulaBroadcastAssetKind)=>kind==='STINGER'||kind==='TRANSITION'?'complete frame wipe':kind==='BUG'||kind==='SCORE_STRIP'?'persistent live hold':'deconstruct in reverse hierarchy';
const holdFor=(pack:FabulaBroadcastPack)=>pack.motionGrammar.split(/[.;]/)[0].trim();

export const FABULA_BROADCAST_TEMPLATES:FabulaBroadcastTemplate[]=FABULA_BROADCAST_PACKS.flatMap(pack=>pack.assets.map(kind=>makeBroadcastTemplate(pack,kind)));

/* ─── Geometry ────────────────────────────────────────────────────────────────────────────── */

/**
 * The identity's structural motif. Which primitive is the council's decision; how many, how
 * dense and at what angle is seeded from the pack, so an art director's four systems share a
 * vocabulary without being the same picture.
 */
function geometry(pack:FabulaBroadcastPack,w:number,h:number,opacity=.72){
  const ad=council(pack);
  const seed=hash(pack.id);
  const rnd=(i:number)=>((seed>>((i*5)%27))&1023)/1023;      // stable per pack and index
  const a=pack.palette[0],b=pack.palette[1],c=pack.palette[2];
  const lw=Math.max(1.5,ad.lineWidth*(Math.min(w,h)/540));    // the council's weight, at this size
  const pick=(i:number)=>[a,b,c][i%3];

  switch(motifFor(ad)){
    case 'circles':{
      const n=5+Math.round(rnd(1)*4);
      return Array.from({length:n},(_,i)=>{
        const r=Math.min(w,h)*(.06+rnd(i+2)*.16);
        return `<circle cx="${(w*(.08+rnd(i+3)*.84)).toFixed(1)}" cy="${(h*(.1+rnd(i+7)*.8)).toFixed(1)}" r="${r.toFixed(1)}" fill="${pick(i)}" opacity="${(opacity*(.4+rnd(i+11)*.5)).toFixed(3)}"/>`;
      }).join('');
    }
    case 'orbit':{
      const n=3+Math.round(rnd(2)*3),cx=w*(.4+rnd(4)*.3),cy=h*(.36+rnd(5)*.28);
      return Array.from({length:n},(_,i)=>`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(w*(.1+i*.075+rnd(i)*.03)).toFixed(1)}" ry="${(h*(.08+i*.06)).toFixed(1)}" fill="none" stroke="${pick(i)}" stroke-width="${lw.toFixed(1)}" transform="rotate(${(rnd(i+9)*70-35+i*23).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" opacity="${opacity}"/>`).join('');
    }
    case 'paths':{
      const n=4+Math.round(rnd(3)*4);
      return Array.from({length:n},(_,i)=>`<path d="M${(-w*.1).toFixed(0)} ${(h*(.14+i*.14)).toFixed(1)} Q${(w*.26).toFixed(0)} ${(h*(.06+rnd(i+1)*.8)).toFixed(1)} ${(w*.54).toFixed(0)} ${(h*(.18+i*.13)).toFixed(1)} T${(w*1.1).toFixed(0)} ${(h*(.12+i*.15)).toFixed(1)}" fill="none" stroke="${pick(i)}" stroke-width="${(lw*(1+i*.25)).toFixed(1)}" opacity="${(opacity*.85).toFixed(3)}"/>`).join('');
    }
    case 'slashes':{
      const n=5+Math.round(rnd(4)*3),lean=w*(.1+rnd(6)*.14);
      return Array.from({length:n},(_,i)=>{const x=i*w/(n-.4)-w*.12;return `<path d="M${x.toFixed(1)} 0h${(w*.09).toFixed(1)}L${(x+lean).toFixed(1)} ${h}h-${(w*.09).toFixed(1)}Z" fill="${pick(i)}" opacity="${(opacity*(.34+(i%3)*.16)).toFixed(3)}"/>`;}).join('');
    }
    case 'frames':{
      const n=3+Math.round(rnd(5)*2);
      return Array.from({length:n},(_,i)=>`<rect x="${(w*(.04+i*.038)).toFixed(1)}" y="${(h*(.05+i*.042)).toFixed(1)}" width="${(w*(.92-i*.076)).toFixed(1)}" height="${(h*(.9-i*.084)).toFixed(1)}" fill="none" stroke="${pick(i)}" stroke-width="${lw.toFixed(1)}" opacity="${opacity}"/>`).join('');
    }
    case 'lattice':{
      const cols=9+Math.round(rnd(6)*7),rows=Math.max(3,Math.round(cols*h/w));
      let out='';
      for(let x=1;x<=cols;x++)for(let y=1;y<=rows;y++){
        out+=`<circle cx="${(w*x/(cols+1)).toFixed(1)}" cy="${(h*y/(rows+1)).toFixed(1)}" r="${(lw*.9).toFixed(1)}" fill="${pick(x+y)}" opacity="${(opacity*.5).toFixed(3)}"/>`;
      }
      return out;
    }
    case 'columns':{
      const n=6+Math.round(rnd(7)*6);
      return Array.from({length:n},(_,i)=>{const cw=w*.82/n,x=w*.09+cw*i;const ch=h*(.2+rnd(i+13)*.62);
        return `<rect x="${(x+cw*.22).toFixed(1)}" y="${(h*.9-ch).toFixed(1)}" width="${(cw*.5).toFixed(1)}" height="${ch.toFixed(1)}" fill="${pick(i)}" opacity="${(opacity*(.42+(i%3)*.14)).toFixed(3)}"/>`;}).join('');
    }
    case 'crosshair':{
      const cx=w*(.42+rnd(8)*.18),cy=h*(.42+rnd(9)*.16),tl=Math.min(w,h)*.09;
      const ticks=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],i)=>`<path d="M${(cx+sx*w*.36-tl/2).toFixed(1)} ${(cy+sy*h*.36).toFixed(1)}h${tl.toFixed(1)}M${(cx+sx*w*.36).toFixed(1)} ${(cy+sy*h*.36-tl/2).toFixed(1)}v${tl.toFixed(1)}" stroke="${pick(i)}" stroke-width="${lw.toFixed(1)}" opacity="${opacity}"/>`).join('');
      return `<path d="M0 ${cy.toFixed(1)}H${w}M${cx.toFixed(1)} 0V${h}" stroke="${a}" stroke-width="${(lw*.7).toFixed(1)}" opacity="${(opacity*.55).toFixed(3)}"/>${ticks}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(Math.min(w,h)*.16).toFixed(1)}" fill="none" stroke="${b}" stroke-width="${lw.toFixed(1)}" opacity="${opacity}"/>`;
    }
    default:{ // collage
      const rot=(rnd(10)*14-7).toFixed(1);
      return `<rect x="${(w*.04).toFixed(0)}" y="${(h*.12).toFixed(0)}" width="${(w*(.34+rnd(11)*.14)).toFixed(0)}" height="${(h*.34).toFixed(0)}" fill="${a}" transform="rotate(${rot} ${(w*.04).toFixed(0)} ${(h*.12).toFixed(0)})" opacity="${opacity}"/><circle cx="${(w*(.68+rnd(12)*.14)).toFixed(0)}" cy="${(h*.3).toFixed(0)}" r="${(h*(.14+rnd(13)*.1)).toFixed(0)}" fill="${b}" opacity="${opacity}"/><rect x="${(w*.32).toFixed(0)}" y="${(h*.48).toFixed(0)}" width="${(w*.58).toFixed(0)}" height="${(h*.38).toFixed(0)}" fill="${c}" transform="rotate(${(-Number(rot)).toFixed(1)} ${(w*.32).toFixed(0)} ${(h*.48).toFixed(0)})" opacity="${(opacity*.68).toFixed(3)}"/>`;
    }
  }
}

/* ─── Surface: the council's texture, as a real filter each ───────────────────────────────── */

/**
 * Eight textures, eight filters. The previous version documented this mapping and then gave all
 * 74 identities the same `feTurbulence baseFrequency=".55"`, so a printmaker's ink and a
 * broadcaster's clean screen were the same surface.
 */
function textureFilter(ad:DataVizArtDirection,amount:number,seed:number){
  const s=seed%97;
  switch(ad.texture){
    case 'PAPER': // fine long fibre, barely there
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".9 .35" numOctaves="4" seed="${s}"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .32 0 0 0 0 .28 0 0 0 ${(amount*.20).toFixed(3)} 0"/></filter>`;
    case 'GRAIN': // coarse film grain
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="${s}"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${(amount*.30).toFixed(3)} 0"/></filter>`;
    case 'INK': // blotted, high-contrast bleed
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".28" numOctaves="3" seed="${s}"/><feComponentTransfer><feFuncA type="discrete" tableValues="0 0 ${(amount*.5).toFixed(2)} ${(amount*.34).toFixed(2)} 0"/></feComponentTransfer><feColorMatrix values="0 0 0 0 .06 0 0 0 0 .07 0 0 0 0 .07 0 0 0 1 0"/></filter>`;
    case 'SCAN': // horizontal broadcast lines
      return `<filter id="surface"><feTurbulence type="turbulence" baseFrequency="0 .9" numOctaves="1" seed="${s}"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${(amount*.22).toFixed(3)} 0"/></filter>`;
    case 'GLOW': // soft emissive bloom rather than dirt
      return `<filter id="surface" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="${(6+amount*16).toFixed(1)}" result="b"/><feColorMatrix in="b" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${(amount*.75).toFixed(3)} 0"/></filter>`;
    case 'GLASS': // refracted displacement
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="2" seed="${s}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${(amount*26).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    case 'TOPO': // banded contour, like an elevation map
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="4" seed="${s}"/><feComponentTransfer><feFuncA type="discrete" tableValues="0 ${(amount*.34).toFixed(2)} 0 ${(amount*.24).toFixed(2)} 0 ${(amount*.16).toFixed(2)}"/></feComponentTransfer><feColorMatrix values="0 0 0 0 .1 0 0 0 0 .12 0 0 0 0 .11 0 0 0 1 0"/></filter>`;
    default: // CLEAN — a print-clean surface still needs a filter id, so make it an honest no-op
      return `<filter id="surface"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="${s}"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${(amount*.05).toFixed(3)} 0"/></filter>`;
  }
}
/** GLASS displaces the artwork itself; every other texture is an overlay laid on top of it. */
const textureIsOverlay=(ad:DataVizArtDirection)=>ad.texture!=='GLASS';

/* ─── The user's image, treated the way the pack says it should be ────────────────────────── */

function imageDefs(pack:FabulaBroadcastPack){
  const t=pack.imageTreatment.toLowerCase();
  if(/posteriz|three .*value|value band/.test(t))
    return `<filter id="imgfx"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .45 .8 1"/><feFuncG type="discrete" tableValues="0 .42 .78 1"/><feFuncB type="discrete" tableValues="0 .4 .76 1"/></feComponentTransfer></filter>`;
  if(/ink|capillar|dissolve|feather/.test(t))
    return `<filter id="imgfx"><feTurbulence baseFrequency=".02" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".6"/></filter>`;
  if(/mist|atmospher|plane|depth/.test(t))
    return `<filter id="imgfx"><feGaussianBlur stdDeviation="2.4" result="s"/><feComponentTransfer in="s"><feFuncA type="linear" slope=".88"/></feComponentTransfer></filter>`;
  if(/bloom|edge bloom|spectral|rim/.test(t))
    return `<filter id="imgfx" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7" result="b"/><feBlend in="SourceGraphic" in2="b" mode="screen"/></filter>`;
  if(/photocopi|posterized|torn|overprint|xerox|grit/.test(t))
    return `<filter id="imgfx"><feColorMatrix type="saturate" values=".15"/><feComponentTransfer><feFuncR type="linear" slope="2.4" intercept="-.7"/><feFuncG type="linear" slope="2.4" intercept="-.7"/><feFuncB type="linear" slope="2.4" intercept="-.7"/></feComponentTransfer></filter>`;
  if(/relief|shadow|earthen|concrete/.test(t))
    return `<filter id="imgfx"><feGaussianBlur stdDeviation="1.2" result="b"/><feSpecularLighting in="b" surfaceScale="3" specularConstant=".6" specularExponent="18" lighting-color="#fff" result="sp"><feDistantLight azimuth="215" elevation="52"/></feSpecularLighting><feComposite in="sp" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3=".35" k4="0"/></filter>`;
  return '';
}

function imageZone(t:FabulaBroadcastTemplate,pack:FabulaBroadcastPack,x:number,y:number,w:number,h:number,shape='rect'){
  const treated=imageDefs(pack)?' filter="url(#imgfx)"':'';
  const clip=shape==='circle'
    ? `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape==='soft'?Math.min(w,h)*.12:0}"/>`;
  const body=t.controls.imageUrl
    ? `<image href="${esc(t.controls.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)"${treated}/>`
    : `<g clip-path="url(#imageClip)"${treated}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${t.controls.secondary}" opacity=".38"/><path d="M${x} ${y+h}L${x+w*.38} ${y+h*.28} ${x+w*.62} ${y+h*.72} ${x+w} ${y+h*.14}V${y+h}Z" fill="${t.controls.foreground}" opacity=".28"/></g>`;
  return `<defs><clipPath id="imageClip">${clip}</clipPath>${imageDefs(pack)}</defs>${body}`;
}

/** Two picture zones under one clip path, for the comparison arrangement. */
function imageZone2(t:FabulaBroadcastTemplate,pack:FabulaBroadcastPack,boxes:[number,number,number,number][],shape='rect'){
  const treated=imageDefs(pack)?' filter="url(#imgfx)"':'';
  const r=shape==='soft'?Math.min(boxes[0][2],boxes[0][3])*.1:0;
  const clip=boxes.map(([x,y,bw,bh])=>`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}"/>`).join('');
  const body=t.controls.imageUrl
    ? boxes.map(([x,y,bw,bh])=>`<image href="${esc(t.controls.imageUrl!)}" x="${x}" y="${y}" width="${bw}" height="${bh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#imageClip)"${treated}/>`).join('')
    : `<g clip-path="url(#imageClip)"${treated}>`+boxes.map(([x,y,bw,bh],i)=>
        `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${t.controls.secondary}" opacity="${i?'.30':'.38'}"/>`
        +`<path d="M${x} ${y+bh}L${x+bw*.38} ${y+bh*.3} ${x+bw*.63} ${y+bh*.7} ${x+bw} ${y+bh*.16}V${y+bh}Z" fill="${t.controls.foreground}" opacity="${i?'.22':'.28'}"/>`).join('')+`</g>`;
  return `<defs><clipPath id="imageClip">${clip}</clipPath>${imageDefs(pack)}</defs>${body}`;
}

/* ─── Render ──────────────────────────────────────────────────────────────────────────────── */

type TextFn=(x:number,y:number,size:number,anchor?:string)=>string;
type SubFn=(x:number,y:number,anchor?:string)=>string;

/**
 * Where the picture sits and what the type aligns to, decided by the council's motif family.
 *
 * A radial director centres and orbits. A ruled director builds a framed panel and hangs type off
 * a rule. A contour director works in horizon bands. Giving all of them the same slots would make
 * the art direction wallpaper — visible only in the background, never in the layout.
 *
 * The entry offset is deliberately small: a broadcast template is browsed as a poster frame long
 * before it is played, and an 18% slide meant every thumbnail showed a word cut in half.
 */
function openerFor(t:FabulaBroadcastTemplate,pack:FabulaBroadcastPack,ad:DataVizArtDirection,g:string,dur:number,text:TextFn,sub:SubFn){
  const {width:w,height:h}=t,{accent:a,secondary:b,background:d}=t.controls;
  const enter=(inner:string,dx=w*.035)=>`<g><animateTransform attributeName="transform" type="translate" values="-${dx} 0;0 0" dur="${dur}s" fill="freeze"/>${inner}</g>`;
  const line=Math.max(2,ad.lineWidth);
  // The pack's own subject wins over the council's default arrangement, because two identities on
  // the same director must still read as two identities.
  switch(emphasisFor(pack)){
    case 'COMPARISON':   // two zones argue across a centre rule; type sits under the argument
      return `<g opacity=".72">${g}</g>`
        +imageZone2(t,pack,[[w*.055,h*.14,w*.4,h*.5],[w*.545,h*.14,w*.4,h*.5]],ad.mark==='ROUNDED'?'soft':'rect')
        +`<path d="M${w/2} ${h*.1}V${h*.68}" stroke="${a}" stroke-width="${line}" opacity=".85"/>`
        +`<rect y="${h*.7}" width="${w}" height="${h*.3}" fill="${d}" opacity=".93"/>`
        +enter(`${text(w/2,h*.85,h*.078,'middle')}${sub(w/2,h*.92,'middle')}`,w*.015);
    case 'PORTRAIT':     // a tall column for the figure, the type stacked beside it
      return `<g opacity=".8">${g}</g>`
        +`<rect x="${w*.06}" y="${h*.1}" width="${w*.46}" height="${h*.8}" fill="${d}" opacity=".9"/>`
        +imageZone(t,pack,w*.57,h*.08,w*.37,h*.84,ad.mark==='ROUNDED'||ad.mark==='CAPSULE'?'soft':'rect')
        +`<path d="M${w*.1} ${h*.55}h${w*.34}" stroke="${a}" stroke-width="${line}"/>`
        +enter(`${text(w*.1,h*.5,h*.088)}${sub(w*.103,h*.63)}`);
    case 'PANORAMA':     // the picture runs the full width; type rides a band at the foot
      return `${imageZone(t,pack,0,0,w,h*.72,'rect')}<g opacity=".55">${g}</g>`
        +`<rect y="${h*.66}" width="${w}" height="${h*.34}" fill="${d}" opacity=".94"/>`
        +`<path d="M0 ${h*.66}H${w}" stroke="${a}" stroke-width="${line*1.5}"/>`
        +enter(`${text(w*.06,h*.83,h*.092)}${sub(w*.063,h*.91)}`);
    default: break;
  }
  switch(motifFor(ad)){
    case 'circles': case 'orbit':   // centre the subject and let the structure turn around it
      return `<g opacity=".8">${g}</g>${imageZone(t,pack,w*.34,h*.1,w*.32,h*.56,'circle')}`
        +enter(`${text(w/2,h*.8,h*.085,'middle')}${sub(w/2,h*.87,'middle')}`,w*.02);
    case 'paths':                   // horizon bands: the picture is a landscape strip
      return `<g opacity=".85">${g}</g>${imageZone(t,pack,0,h*.16,w,h*.42,'rect')}`
        +`<rect y="${h*.58}" width="${w}" height="${h*.42}" fill="${d}" opacity=".9"/>`
        +enter(`${text(w*.07,h*.76,h*.088)}${sub(w*.073,h*.84)}`);
    case 'crosshair':               // instrument framing: subject centred under the reticle
      return `${imageZone(t,pack,w*.28,h*.12,w*.44,h*.6,'rect')}<g opacity=".9">${g}</g>`
        +`<rect y="${h*.76}" width="${w}" height="${h*.24}" fill="${d}" opacity=".92"/>`
        +enter(`${text(w*.06,h*.9,h*.075)}${sub(w*.063,h*.96)}`);
    case 'slashes':                 // the cut is the composition: type over a hard slab
      return `<g opacity=".9">${g}</g>${imageZone(t,pack,w*.46,h*.06,w*.5,h*.88,'rect')}`
        +`<path d="M0 ${h*.44}H${w*.52}L${w*.44} ${h*.82}H0Z" fill="${d}" opacity=".94"/>`
        +enter(`${text(w*.05,h*.66,h*.082)}${sub(w*.053,h*.74)}`);
    case 'collage':                 // overlapping planes, type on the topmost one
      return `<g opacity=".85">${g}</g>${imageZone(t,pack,w*.08,h*.2,w*.44,h*.56,'soft')}`
        +`<rect x="${w*.4}" y="${h*.54}" width="${w*.56}" height="${h*.3}" fill="${d}" opacity=".93" transform="rotate(-3 ${w*.4} ${h*.54})"/>`
        +enter(`<g transform="rotate(-3 ${w*.4} ${h*.54})">${text(w*.44,h*.7,h*.072)}${sub(w*.443,h*.78)}</g>`);
    case 'lattice':                 // the picture arrives behind the aperture field
      return `${imageZone(t,pack,w*.1,h*.1,w*.8,h*.62,'rect')}<g opacity=".95">${g}</g>`
        +`<rect y="${h*.74}" width="${w}" height="${h*.26}" fill="${d}" opacity=".9"/>`
        +enter(`${text(w*.5,h*.88,h*.076,'middle')}${sub(w*.5,h*.95,'middle')}`,w*.015);
    default:                        // frames and columns: a measured panel, type on a rule
      return `<g opacity=".7">${g}</g>${imageZone(t,pack,w*.55,h*.12,w*.34,h*.76,'soft')}`
        +`<path d="M${w*.07} ${h*.68}H${w*.46}" stroke="${a}" stroke-width="${Math.max(2,ad.lineWidth)}"/>`
        +enter(`${text(w*.07,h*.63,h*.095)}${sub(w*.073,h*.75)}`);
  }
}

function fullPageFor(t:FabulaBroadcastTemplate,pack:FabulaBroadcastPack,ad:DataVizArtDirection,g:string,dur:number,text:TextFn,sub:SubFn){
  const {width:w,height:h}=t,{accent:a,secondary:b,background:d}=t.controls;
  const fade=(inner:string)=>`<g><animate attributeName="opacity" values="0;1" dur="${dur}s" fill="freeze"/>${inner}</g>`;
  const rules=`<path d="M${w*.1} ${h*.42}h${w*.32}M${w*.1} ${h*.49}h${w*.25}M${w*.1} ${h*.56}h${w*.29}" stroke="${b}" stroke-width="${h*.012}" opacity=".45"/>`;
  switch(motifFor(ad)){
    case 'circles': case 'orbit':
      return `<g opacity=".45">${g}</g><circle cx="${w/2}" cy="${h*.46}" r="${h*.34}" fill="${d}" opacity=".9" stroke="${a}" stroke-width="${ad.lineWidth}"/>`
        +imageZone(t,pack,w*.36,h*.18,w*.28,h*.42,'circle')
        +fade(`${text(w/2,h*.78,h*.07,'middle')}${sub(w/2,h*.85,'middle')}`);
    case 'paths':
      return `<g opacity=".5">${g}</g>${imageZone(t,pack,0,h*.1,w,h*.44,'rect')}`
        +`<rect y="${h*.54}" width="${w}" height="${h*.46}" fill="${d}" opacity=".92"/>`
        +fade(`${text(w*.1,h*.68,h*.072)}${sub(w*.103,h*.75)}${rules}`);
    case 'slashes':
      return `<g opacity=".55">${g}</g><path d="M0 0H${w*.58}L${w*.44} ${h}H0Z" fill="${d}" opacity=".93"/>`
        +imageZone(t,pack,w*.56,h*.08,w*.4,h*.84,'rect')
        +fade(`${text(w*.07,h*.36,h*.076)}${sub(w*.073,h*.44)}`);
    case 'lattice': case 'crosshair':
      return `${imageZone(t,pack,w*.06,h*.06,w*.88,h*.56,'rect')}<g opacity=".85">${g}</g>`
        +`<rect y="${h*.64}" width="${w}" height="${h*.36}" fill="${d}" opacity=".92"/>`
        +fade(`${text(w*.5,h*.78,h*.07,'middle')}${sub(w*.5,h*.86,'middle')}`);
    default:
      return `<g opacity=".3">${g}</g><rect x="${w*.055}" y="${h*.08}" width="${w*.89}" height="${h*.84}" fill="${d}" opacity=".88" stroke="${a}" stroke-width="${ad.lineWidth}"/>`
        +imageZone(t,pack,w*.54,h*.16,w*.34,h*.64,'soft')
        +fade(`${text(w*.1,h*.28,h*.078)}${sub(w*.103,h*.35)}${rules}`);
  }
}

export function renderBroadcastTemplateSvg(t:FabulaBroadcastTemplate){
  const pack=FABULA_BROADCAST_PACKS.find(p=>p.id===t.packId)!;
  const ad=council(pack);
  const {width:w,height:h}=t,{accent:a,secondary:b,foreground:c,background:d}=t.controls;
  const font=fontFor(pack);
  const profile=motionProfile(pack);
  const dur=Math.max(.35,(1.25*profile.scale)/t.controls.motionSpeed);
  const g=geometry(pack,w,h),grain=Math.max(0,Math.min(1,t.controls.texture));
  const upper=ad.titleCase==='UPPER',italic=ad.titleCase==='ITALIC';
  const titleText=upper?t.controls.title.toUpperCase():t.controls.title;
  // Type sits on the background panel in every composition, so that is the ground to read against.
  const ink=inkOn(d,pack);
  const inkSub=contrast(b,d)>=3.0?b:inkOn(d,pack,3.0);
  const text=(x:number,y:number,size:number,anchor='start')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${ink}" font-family="${font}" font-size="${size}" font-style="${italic?'italic':'normal'}" font-weight="${/serif/i.test(font)?400:800}" letter-spacing="${upper?Math.max(1,size*.03).toFixed(1):(size>70?-3:1)}">${esc(titleText)}</text>`;
  const sub=(x:number,y:number,anchor='start')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${inkSub}" font-family="${ad.font}" font-size="${Math.max(15,h*.026)}" letter-spacing="3" opacity=".92">${esc(t.controls.subtitle)}</text>`;
  let body='';
  if(t.kind==='OPENER') body=openerFor(t,pack,ad,g,dur,text,sub);
  if(t.kind==='LOWER_THIRD') body=`<g opacity=".24">${g}</g>${imageZone(t,pack,w*.04,h*.55,w*.18,h*.36,'soft')}<g><animateTransform attributeName="transform" type="translate" values="-${w*.7} 0;0 0;0 0;-${w*.8} 0" keyTimes="0;.14;.82;1" dur="${t.durationMs/1000}s" repeatCount="indefinite"/><path d="M${w*.2} ${h*.66}H${w*.79}L${w*.74} ${h*.88}H${w*.2}Z" fill="${d}"/><rect x="${w*.2}" y="${h*.66}" width="${w*.018}" height="${h*.22}" fill="${a}"/>${text(w*.24,h*.77,h*.052)}${sub(w*.242,h*.83)}</g>`;
  if(t.kind==='FULL_PAGE') body=fullPageFor(t,pack,ad,g,dur,text,sub);
  if(t.kind==='BUG') body=`<g transform="translate(${w/2} ${h/2})"><animateTransform attributeName="transform" additive="sum" type="rotate" from="-18" to="0" dur="${dur}s" fill="freeze"/><circle r="${w*.39}" fill="${d}" stroke="${a}" stroke-width="${w*.025}"/><g transform="translate(${-w/2} ${-h/2})">${geometry(pack,w,h,.35)}</g><text text-anchor="middle" y="${h*.02}" fill="${ink}" font-family="${font}" font-weight="800" font-size="${w*.095}">${esc((upper?titleText:t.controls.title).split(/\s/)[0])}</text></g>`;
  if(t.kind==='STINGER') body=`<g><animateTransform attributeName="transform" type="translate" values="-${w} 0;0 0;0 0;${w} 0" keyTimes="0;.32;.7;1" dur="${t.durationMs/1000}s" repeatCount="indefinite"/><rect width="${w}" height="${h}" fill="${a}"/>${g}<path d="M0 ${h*.58}H${w}" stroke="${c}" stroke-width="${h*.11}"/>${text(w/2,h*.62,h*.11,'middle')}</g>`;
  if(t.kind==='TRANSITION') body=`<g><animateTransform attributeName="transform" type="translate" values="-${w*1.4} 0;0 0;${w*1.4} 0" keyTimes="0;.52;1" dur="${t.durationMs/1000}s" repeatCount="indefinite"/><path d="M0 0H${w*.72}L${w} ${h}H0Z" fill="${a}"/>${g}</g><path d="M${w*.48} 0  ${w*.76} ${h}" stroke="${c}" stroke-width="${w*.012}" opacity=".55"/>`;
  if(t.kind==='SCORE_STRIP') body=`<rect width="${w}" height="${h}" fill="${d}"/><g opacity=".22">${g}</g><rect width="${w*.025}" height="${h}" fill="${a}"/><text x="${w*.055}" y="${h*.63}" fill="${ink}" font-family="${font}" font-size="${h*.31}" font-weight="800">${esc(titleText)}</text><g transform="translate(${w*.67} 0)"><text x="0" y="${h*.64}" fill="${ink}" font-family="${ad.font}" font-size="${h*.37}" font-weight="900">${esc(t.controls.scoreHome)}</text><text x="${w*.12}" y="${h*.64}" fill="${b}" font-family="${ad.font}" font-size="${h*.2}">—</text><text x="${w*.17}" y="${h*.64}" fill="${ink}" font-family="${ad.font}" font-size="${h*.37}" font-weight="900">${esc(t.controls.scoreAway)}</text></g>`;
  if(t.kind==='OVERLAY') body=`<g opacity=".2">${g}</g><g><animateTransform attributeName="transform" type="translate" values="${w*.34} 0;0 0" dur="${dur}s" fill="freeze"/><path d="M${w*.68} 0H${w}V${h}H${w*.58}Z" fill="${d}" opacity=".9"/><path d="M${w*.68} 0  ${w*.58} ${h}" stroke="${a}" stroke-width="${w*.012}"/>${text(w*.73,h*.25,h*.055)}${sub(w*.735,h*.31)}<path d="M${w*.73} ${h*.42}h${w*.18}m-${w*.18} ${h*.08}h${w*.14}m-${w*.14} ${h*.08}h${w*.2}" stroke="${b}" stroke-width="${h*.009}" opacity=".5"/></g>`;
  if(t.kind==='CREDITS') body=`<g opacity=".16">${g}</g><g><animateTransform attributeName="transform" type="translate" values="0 ${h*.72};0 -${h*.72}" dur="${t.durationMs/1000}s" repeatCount="indefinite"/>${text(w/2,h*.24,h*.075,'middle')}${sub(w/2,h*.31,'middle')}${Array.from({length:8},(_,i)=>`<text x="${w*.42}" y="${h*(.42+i*.095)}" text-anchor="end" fill="${b}" font-family="${ad.font}" font-size="${h*.025}">ROLE ${String(i+1).padStart(2,'0')}</text><text x="${w*.46}" y="${h*(.42+i*.095)}" fill="${ink}" font-family="${font}" font-size="${h*.035}">Replaceable Name</text>`).join('')}</g>`;

  const filter=textureFilter(ad,grain,hash(pack.id));
  // GLASS refracts the artwork; the other seven sit on top of it.
  const artwork=textureIsOverlay(ad)?body:`<g filter="url(#surface)">${body}</g>`;
  const overlay=textureIsOverlay(ad)?`<rect width="${w}" height="${h}" filter="url(#surface)" opacity="${grain}" pointer-events="none"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs>${filter}</defs><rect width="${w}" height="${h}" fill="${d}"/>${artwork}${overlay}</svg>`;
}

export const broadcastTemplateDataUrl=(template:FabulaBroadcastTemplate)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderBroadcastTemplateSvg(template))}`;
