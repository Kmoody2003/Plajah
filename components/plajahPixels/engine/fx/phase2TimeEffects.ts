// phase2TimeEffects.ts — the TIME unit (Continuum Time / Sapphire Time / Universe time tools).
// Every effect here is `temporal: true`: it reads `prev(uv)` (its own previous output) and/or
// `prevSrc(uv)` (the previous source frame) and `uDeltaT` (0 on the first frame or after a
// time jump, so every effect below degrades to a clean single-frame result on cuts/scrubs).
// Deterministic: the offline renderer steps frames in order, so exports match playback.
import type { FxEffect } from './effects';

const T = (e: Omit<FxEffect, 'temporal' | 'category'>): FxEffect => ({ ...e, temporal: true, category: 'time' });
const T4 = (e: Omit<FxEffect, 'temporal' | 'category'>): FxEffect => ({ ...e, temporal: 4, category: 'time' });

export const PHASE2_TIME_EFFECTS: FxEffect[] = [
  T4({
    id: 'temporalmedian', name: 'Temporal Median', version: 1,
    summary: 'Median of the current frame and up to four previous frames — removes rain, dust, sensor noise and brief occluders without smearing still detail.',
    params: [
      { key: 'frames', label: 'History Frames', min: 1, max: 4, default: 4, step: 1 },
      { key: 'strength', label: 'Strength', min: 0, max: 1, default: 1, step: .01 },
      { key: 'motionGuard', label: 'Motion Guard', min: 0, max: 1, default: .35, step: .01 },
      { key: 'radius', label: 'Spatial Radius', min: 0, max: 2, default: 0, step: 1, unit: 'px' },
    ],
    presets: [
      { id: 'denoise', name: 'Temporal Denoise', description: 'Full history, guarded against motion.', params: { frames: 4, strength: 1, motionGuard: .45, radius: 0 } },
      { id: 'rain', name: 'Rain & Dust', description: 'Median across 4 frames, weak guard so streaks vanish.', params: { frames: 4, strength: 1, motionGuard: .15, radius: 1 } },
      { id: 'gentle', name: 'Gentle', description: 'Two frames, blended half strength.', params: { frames: 2, strength: .5, motionGuard: .5, radius: 0 } },
    ],
    glsl: `void srt(inout vec3 a, inout vec3 b){ vec3 lo=min(a,b), hi=max(a,b); a=lo; b=hi; } vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; int n=int(clamp(P0,1.0,4.0)+0.5); vec2 px=P3/uResolution; vec3 s0=c.rgb, s1=prevSrcN(1,uv).rgb, s2=n>=2?prevSrcN(2,uv).rgb:s0, s3=n>=3?prevSrcN(3,uv).rgb:s1, s4=n>=4?prevSrcN(4,uv).rgb:s2; if(P3>0.5){ s1=(s1+prevSrcN(1,uv+vec2(px.x,0.)).rgb+prevSrcN(1,uv-vec2(px.x,0.)).rgb)/3.0; } srt(s0,s1); srt(s3,s4); srt(s0,s3); srt(s1,s4); srt(s1,s2); srt(s2,s3); srt(s1,s2); vec3 med=s2; float motion=length(c.rgb-prevSrcN(1,uv).rgb); float lo=mix(1.0,0.02,P2); float guard=1.0-smoothstep(lo,lo+0.1,motion); return vec4(mix(c.rgb,med,P1*guard),c.a); }`,
  }),
  T4({
    id: 'objectremover', name: 'Object Remover', version: 1,
    summary: 'Clean-plate removal of moving objects: inside the effect mask, each pixel shows the background as seen across the last four frames (median or oldest), so a passer-by or a rig sweep disappears over a still background.',
    params: [
      { key: 'mode', label: 'Fill (0 median · 1 oldest · 2 most stable)', min: 0, max: 2, default: 0, step: 1 },
      { key: 'threshold', label: 'Motion Threshold', min: 0, max: .6, default: .12, step: .005 },
      { key: 'blend', label: 'Blend', min: 0, max: 1, default: 1, step: .01 },
      { key: 'hold', label: 'Hold Plate', min: 0, max: 1, default: .85, step: .01 },
    ],
    presets: [
      { id: 'passer-by', name: 'Passer-by', description: 'Median plate, moderate threshold — add a polygon mask around the person.', params: { mode: 0, threshold: .12, blend: 1, hold: .85 } },
      { id: 'rig-sweep', name: 'Rig Sweep', description: 'Oldest-frame plate for fast intrusions.', params: { mode: 1, threshold: .08, blend: 1, hold: .9 } },
      { id: 'stable-plate', name: 'Stable Plate', description: 'Picks the most stable history sample per pixel.', params: { mode: 2, threshold: .1, blend: 1, hold: .95 } },
    ],
    glsl: `void srt2(inout vec3 a, inout vec3 b){ vec3 lo=min(a,b), hi=max(a,b); a=lo; b=hi; } vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec3 s1=prevSrcN(1,uv).rgb, s2=prevSrcN(2,uv).rgb, s3=prevSrcN(3,uv).rgb, s4=prevSrcN(4,uv).rgb; vec3 plate; if(P0<0.5){ vec3 a=s1,b=s2,d=s3,e=s4; srt2(a,b); srt2(d,e); srt2(a,d); srt2(b,e); srt2(b,d); plate=(b+d)*0.5; } else if(P0<1.5){ plate=s4; } else { float d12=length(s1-s2), d23=length(s2-s3), d34=length(s3-s4); plate = d12<=d23 && d12<=d34 ? (s1+s2)*0.5 : (d23<=d34 ? (s2+s3)*0.5 : (s3+s4)*0.5); } float motion=length(c.rgb-plate); float k=smoothstep(P1*0.5,P1*1.5+0.01,motion); vec3 held=mix(c.rgb,prev(uv).rgb,P3*(1.0-k)*0.0); vec3 o=mix(c.rgb,plate,k*P2); o=mix(o,prev(uv).rgb,P3*0.35*k); return vec4(o,c.a); }`,
  }),
  T({
    id: 'trails', name: 'Trails', version: 1,
    summary: 'Light-painting trails: bright motion leaves a decaying luminous wake.',
    params: [
      { key: 'decay', label: 'Decay', min: .5, max: .995, default: .9, step: .005 },
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: .45, step: .01 },
      { key: 'amount', label: 'Amount', min: 0, max: 2, default: 1, step: .01 },
      { key: 'mode', label: 'Blend (0 max · 1 add · 2 screen)', min: 0, max: 2, default: 0, step: 1 },
      { key: 'driftX', label: 'Drift X', min: -20, max: 20, default: 0, step: .5, unit: 'px' },
      { key: 'driftY', label: 'Drift Y', min: -20, max: 20, default: 0, step: .5, unit: 'px' },
      { key: 'hue', label: 'Hue Drift', min: -.5, max: .5, default: 0, step: .01 },
    ],
    presets: [
      { id: 'light-paint', name: 'Light Paint', description: 'Long, clean trails from practicals and specular highlights.', params: { decay: .94, threshold: .55, amount: 1.1, mode: 0, driftX: 0, driftY: 0, hue: 0 } },
      { id: 'comet', name: 'Comet', description: 'Trails that drift downward and fade quickly.', params: { decay: .86, threshold: .4, amount: 1.2, mode: 1, driftX: 0, driftY: 3, hue: 0 } },
      { id: 'rainbow-echo', name: 'Rainbow Echo', description: 'Hue shifts along the trail for a prismatic wake.', params: { decay: .92, threshold: .35, amount: 1, mode: 2, driftX: 1, driftY: 0, hue: .08 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); vec2 d=vec2(P4,P5)/uResolution; vec4 p=prev(uv-d); float dec=uDeltaT>0.0?P0:0.0; vec3 t=p.rgb*dec; if(abs(P6)>1e-4){vec3 h=rgb2hsv(t);h.x=fract(h.x+P6*uDeltaT*24.0);t=hsv2rgb(h);} float l=dot(c.rgb,vec3(.2126,.7152,.0722)); vec3 bright=c.rgb*smoothstep(P1-.1,P1+.1,l); vec3 acc= P3<.5?max(t,bright):(P3<1.5?t+bright:(t+bright-t*bright)); vec3 outc=P3<.5?max(c.rgb,acc*P2):c.rgb+ (acc-bright)*P2; return vec4(clamp(outc,0.0,1.0),c.a); }`,
  }),
  T({
    id: 'echo', name: 'Echo', version: 1,
    summary: 'Recursive frame echo with offset, decay and colour shift — the classic video echo / Echospace-style multiples.',
    params: [
      { key: 'decay', label: 'Decay', min: .1, max: .98, default: .72, step: .01 },
      { key: 'offsetX', label: 'Offset X', min: -100, max: 100, default: 8, step: 1, unit: 'px' },
      { key: 'offsetY', label: 'Offset Y', min: -100, max: 100, default: 0, step: 1, unit: 'px' },
      { key: 'scale', label: 'Scale Step', min: .9, max: 1.1, default: 1, step: .005 },
      { key: 'rotate', label: 'Rotate Step', min: -10, max: 10, default: 0, step: .1, unit: 'deg' },
      { key: 'hue', label: 'Hue Step', min: -.5, max: .5, default: 0, step: .01 },
      { key: 'mode', label: 'Blend (0 over · 1 add · 2 screen)', min: 0, max: 2, default: 0, step: 1 },
    ],
    presets: [
      { id: 'video-echo', name: 'Video Echo', description: 'Straight offset echoes that fade behind the subject.', params: { decay: .7, offsetX: 10, offsetY: 0, scale: 1, rotate: 0, hue: 0, mode: 0 } },
      { id: 'spiral', name: 'Spiral', description: 'Each echo rotates and shrinks toward the centre.', params: { decay: .82, offsetX: 0, offsetY: 0, scale: .975, rotate: 3, hue: 0, mode: 2 } },
      { id: 'prism-multiples', name: 'Prism Multiples', description: 'Additive echoes stepping through hue.', params: { decay: .78, offsetX: 6, offsetY: -4, scale: 1, rotate: 0, hue: .12, mode: 1 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec2 q=uv-.5; float r=radians(P4); float cs=cos(r),sn=sin(r); q=mat2(cs,-sn,sn,cs)*q; q=q/P3+.5-vec2(P1,P2)/uResolution; vec4 p=prev(q); float inb=step(0.0,q.x)*step(q.x,1.0)*step(0.0,q.y)*step(q.y,1.0); vec3 e=p.rgb*P0*inb; if(abs(P5)>1e-4){vec3 h=rgb2hsv(e);h.x=fract(h.x+P5);e=hsv2rgb(h);} float ea=p.a*P0*inb; vec3 o; if(P6<.5){ o=mix(e,c.rgb,c.a); } else if(P6<1.5){ o=c.rgb+e; } else { o=c.rgb+e-c.rgb*e; } return vec4(clamp(o,0.0,1.0),max(c.a,ea)); }`,
  }),
  T({
    id: 'temporalblur', name: 'Temporal Blur', version: 1,
    summary: 'Long-exposure smoothing across frames; still areas sharpen, moving areas smear.',
    params: [
      { key: 'weight', label: 'History Weight', min: 0, max: .97, default: .6, step: .01 },
      { key: 'motionGate', label: 'Motion Gate', min: 0, max: 1, default: 0, step: .01 },
      { key: 'gain', label: 'Gain', min: .5, max: 2, default: 1, step: .01 },
    ],
    presets: [
      { id: 'long-exposure', name: 'Long Exposure', description: 'Heavy accumulation: crowds and traffic dissolve into flow.', params: { weight: .9, motionGate: 0, gain: 1 } },
      { id: 'video-lag', name: 'Video Lag', description: 'Soft, dreamy lag like an old tube camera.', params: { weight: .55, motionGate: 0, gain: 1 } },
      { id: 'still-smoother', name: 'Still Smoother', description: 'Averages only where nothing moves — temporal noise reduction.', params: { weight: .8, motionGate: .35, gain: 1 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec4 p=prev(uv); float m=length(c.rgb-prevSrc(uv).rgb); float w=P0*(P1>0.0?1.0-smoothstep(P1*.15,P1*.6,m):1.0); return vec4(clamp(mix(c.rgb,p.rgb,w)*P2,0.0,1.0),c.a); }`,
  }),
  T({
    id: 'motiondetect', name: 'Motion Detect', version: 1,
    summary: 'Frame-difference motion: overlay, matte or heat map of what moved since the last frame.',
    params: [
      { key: 'gain', label: 'Gain', min: .5, max: 12, default: 4, step: .1 },
      { key: 'threshold', label: 'Threshold', min: 0, max: .5, default: .04, step: .005 },
      { key: 'mode', label: 'Mode (0 overlay · 1 matte · 2 heat · 3 alpha)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'hold', label: 'Hold', min: 0, max: .98, default: .6, step: .01 },
      { key: 'hue', label: 'Overlay Hue', min: 0, max: 1, default: .55, step: .01 },
    ],
    presets: [
      { id: 'security-overlay', name: 'Security Overlay', description: 'Cyan highlight on moving pixels over the picture.', params: { gain: 4, threshold: .05, mode: 0, hold: .5, hue: .5 } },
      { id: 'motion-matte', name: 'Motion Matte', description: 'White-on-black motion matte for downstream keys.', params: { gain: 6, threshold: .04, mode: 1, hold: .7, hue: 0 } },
      { id: 'heat-map', name: 'Heat Map', description: 'Thermal-style ramp from cold stillness to hot movement.', params: { gain: 5, threshold: .02, mode: 2, hold: .85, hue: 0 } },
    ],
    glsl: `vec3 heat(float t){ return clamp(vec3(t*3.0-1.0, t*3.0-.5, 1.0-abs(t*3.0-1.5)*.7)+vec3(0.0,0.0,.2)*(1.0-t),0.0,1.0); } vec4 fx(vec2 uv){ vec4 c=inp(uv); float d=uDeltaT>0.0?length(c.rgb-prevSrc(uv).rgb):0.0; float m=clamp((d-P1)*P0,0.0,1.0); float held=uDeltaT>0.0?prev(uv).a*P3:0.0; m=max(m,held); if(P2<.5){ vec3 col=hsv2rgb(vec3(P4,1.0,1.0)); return vec4(mix(c.rgb,col,m*.85),m); } if(P2<1.5) return vec4(vec3(m),m); if(P2<2.5) return vec4(heat(m),m); return vec4(c.rgb,m); }`,
  }),
  T({
    id: 'deflicker', name: 'Deflicker', version: 1,
    summary: 'Removes frame-to-frame brightness flicker (timelapse, LED lights, archive film) by tracking a running exposure.',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 1, default: .85, step: .01 },
      { key: 'response', label: 'Response', min: .02, max: .6, default: .12, step: .01 },
      { key: 'chroma', label: 'Colour Flicker', min: 0, max: 1, default: .5, step: .01 },
      { key: 'maxGain', label: 'Max Correction', min: 1, max: 2.5, default: 1.5, step: .05 },
    ],
    presets: [
      { id: 'timelapse', name: 'Timelapse', description: 'Strong, slow-tracking correction for exposure hunting.', params: { strength: .95, response: .08, chroma: .6, maxGain: 1.8 } },
      { id: 'led-flicker', name: 'LED Flicker', description: 'Fast response for rolling LED banding brightness.', params: { strength: .8, response: .3, chroma: .7, maxGain: 1.4 } },
      { id: 'archive-film', name: 'Archive Film', description: 'Gentle luminance-only smoothing for scanned film.', params: { strength: .7, response: .15, chroma: .1, maxGain: 1.3 } },
    ],
    // prev().a stores the running mean luma; rgb stores the running mean colour (both 0..1).
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); vec3 lumw=vec3(.2126,.7152,.0722); vec3 sum=vec3(0.0); for(int i=0;i<5;i++)for(int j=0;j<5;j++){ sum+=src(vec2(.1+float(i)*.2,.1+float(j)*.2)).rgb; } vec3 meanNow=sum/25.0; float lNow=dot(meanNow,lumw); vec3 meanPrev=meanNow; float lPrev=lNow; if(uDeltaT>0.0){ vec4 h=prev(vec2(.5)); meanPrev=mix(meanNow,h.rgb,1.0-P1); lPrev=mix(lNow,h.a,1.0-P1);} float g=clamp(lPrev/max(lNow,1e-3),1.0/P3,P3); vec3 gc=clamp(meanPrev/max(meanNow,vec3(1e-3)),vec3(1.0/P3),vec3(P3)); vec3 gain=mix(vec3(g),gc,P2); vec3 o=mix(c.rgb,c.rgb*gain,P0); return vec4(clamp(o,0.0,1.0),c.a*0.0+lPrev)*vec4(1.0,1.0,1.0,1.0) + vec4(0.0); }`,
  }),
  T({
    id: 'datamosh', name: 'Datamosh', version: 1,
    summary: 'Codec-style mosh: still regions hold the previous frame while motion smears blocks across it.',
    params: [
      { key: 'threshold', label: 'Motion Threshold', min: 0, max: .5, default: .08, step: .005 },
      { key: 'block', label: 'Block Size', min: 2, max: 64, default: 16, step: 1, unit: 'px' },
      { key: 'hold', label: 'Hold', min: 0, max: 1, default: .85, step: .01 },
      { key: 'smear', label: 'Smear', min: 0, max: 40, default: 12, step: .5, unit: 'px' },
      { key: 'bleed', label: 'Colour Bleed', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'classic-mosh', name: 'Classic Mosh', description: 'Blocks smear through held frames like a broken I-frame.', params: { threshold: .08, block: 16, hold: .9, smear: 14, bleed: .35 } },
      { id: 'fine-melt', name: 'Fine Melt', description: 'Small blocks and gentle hold for a melting look.', params: { threshold: .05, block: 6, hold: .7, smear: 6, bleed: .5 } },
      { id: 'brutal', name: 'Brutal', description: 'Large blocks, near-total hold, long smears.', params: { threshold: .12, block: 40, hold: .98, smear: 30, bleed: .2 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec2 b=P1/uResolution; vec2 cell=(floor(uv/b)+.5)*b; vec3 dc=c.rgb-prevSrc(cell).rgb; float m=length(inp(cell).rgb-prevSrc(cell).rgb); float moving=smoothstep(P0,P0*2.0+.02,m); vec2 dir=normalize(vec2(dc.r-dc.g,dc.b-dc.g)+1e-4); vec4 held=prev(uv-dir*P3/uResolution*moving); vec3 o=mix(held.rgb,c.rgb,moving*(1.0-P2)+ (1.0-P2)*.15); o=mix(o,mix(o,c.rgb,.5),P4*moving); return vec4(o,c.a); }`,
  }),
  T({
    id: 'frameblend', name: 'Frame Blend', version: 1,
    summary: 'Two-frame blend / ghosting: mixes the previous source frame into the current one.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'offsetX', label: 'Ghost Offset X', min: -40, max: 40, default: 0, step: .5, unit: 'px' },
      { key: 'offsetY', label: 'Ghost Offset Y', min: -40, max: 40, default: 0, step: .5, unit: 'px' },
      { key: 'mode', label: 'Blend (0 mix · 1 screen · 2 difference)', min: 0, max: 2, default: 0, step: 1 },
    ],
    presets: [
      { id: 'pulldown-blend', name: 'Pulldown Blend', description: 'Even 50/50 frame blend like a converted broadcast.', params: { amount: .5, offsetX: 0, offsetY: 0, mode: 0 } },
      { id: 'ghost', name: 'Ghost', description: 'Offset screened ghost of the previous frame.', params: { amount: .55, offsetX: 6, offsetY: 2, mode: 1 } },
      { id: 'motion-edges', name: 'Motion Edges', description: 'Difference blend reveals only what changed.', params: { amount: 1, offsetX: 0, offsetY: 0, mode: 2 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec4 p=prevSrc(uv-vec2(P1,P2)/uResolution); vec3 o; if(P3<.5) o=mix(c.rgb,p.rgb,P0); else if(P3<1.5) o=mix(c.rgb,c.rgb+p.rgb-c.rgb*p.rgb,P0); else o=mix(c.rgb,abs(c.rgb-p.rgb),P0); return vec4(clamp(o,0.0,1.0),c.a); }`,
  }),
  T({
    id: 'strobefreeze', name: 'Strobe & Freeze', version: 1,
    summary: 'Holds every Nth frame (posterize time) with an optional strobe flash on updates.',
    params: [
      { key: 'interval', label: 'Hold Frames', min: 1, max: 24, default: 4, step: 1 },
      { key: 'flash', label: 'Update Flash', min: 0, max: 1, default: 0, step: .01 },
      { key: 'mixLive', label: 'Live Mix', min: 0, max: 1, default: 0, step: .01 },
    ],
    presets: [
      { id: 'posterize-12', name: 'Posterize 12fps', description: 'Holds two frames at 24fps for a stop-motion cadence.', params: { interval: 2, flash: 0, mixLive: 0 } },
      { id: 'stop-motion', name: 'Stop Motion', description: 'Holds four frames — animation on fours.', params: { interval: 4, flash: 0, mixLive: 0 } },
      { id: 'strobe', name: 'Strobe', description: 'Long holds with a white flash on every update.', params: { interval: 8, flash: .6, mixLive: .15 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); float n=max(1.0,floor(P0+.5)); float k=mod(uFrame,n); bool update=uDeltaT<=0.0||k<.5; vec4 h=update?c:prev(uv); vec3 o=mix(h.rgb,c.rgb,P2); if(update&&uDeltaT>0.0) o=mix(o,vec3(1.0),P1); return vec4(clamp(o,0.0,1.0),c.a); }`,
  }),
  T({
    id: 'timedisplace', name: 'Time Displace', version: 1,
    summary: 'Regions lag behind by a luma or auxiliary map — the slit-scan / time-ripple look.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .7, step: .01 },
      { key: 'source', label: 'Map (0 luma · 1 vertical · 2 horizontal · 3 aux)', min: 0, max: 3, default: 1, step: 1 },
      { key: 'gamma', label: 'Map Gamma', min: .3, max: 3, default: 1, step: .05 },
      { key: 'invert', label: 'Invert Map', min: 0, max: 1, default: 0, step: 1 },
    ],
    auxInput: { label: 'Time map', optional: true },
    presets: [
      { id: 'slit-scan', name: 'Slit Scan', description: 'Bottom of frame lags progressively behind the top.', params: { amount: .85, source: 1, gamma: 1, invert: 0 } },
      { id: 'luma-lag', name: 'Luma Lag', description: 'Dark regions lag, highlights stay live.', params: { amount: .7, source: 0, gamma: 1.4, invert: 1 } },
      { id: 'wipe-lag', name: 'Wipe Lag', description: 'Left-to-right time gradient.', params: { amount: .9, source: 2, gamma: 1, invert: 0 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; float m; if(P1<.5) m=dot(c.rgb,vec3(.2126,.7152,.0722)); else if(P1<1.5) m=uv.y; else if(P1<2.5) m=uv.x; else m=dot(aux(uv).rgb,vec3(.333)); m=pow(clamp(m,0.0,1.0),P2); if(P3>.5) m=1.0-m; return vec4(mix(c.rgb,prev(uv).rgb,m*P0),c.a); }`,
  }),
  T({
    id: 'temporalrepair', name: 'Dust & Dropout Fix', version: 1,
    summary: 'Repairs single-frame dust, scratches and dropouts by borrowing from the previous frame where a defect is isolated in time.',
    params: [
      { key: 'sensitivity', label: 'Sensitivity', min: 0, max: 1, default: .5, step: .01 },
      { key: 'size', label: 'Defect Size', min: 1, max: 12, default: 3, step: .5, unit: 'px' },
      { key: 'motionGuard', label: 'Motion Guard', min: 0, max: 1, default: .6, step: .01 },
      { key: 'strength', label: 'Strength', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'film-dust', name: 'Film Dust', description: 'Small bright/dark specks on scanned film.', params: { sensitivity: .55, size: 2.5, motionGuard: .6, strength: 1 } },
      { id: 'tape-dropout', name: 'Tape Dropout', description: 'Wider horizontal dropouts from analogue tape.', params: { sensitivity: .45, size: 8, motionGuard: .7, strength: 1 } },
      { id: 'gentle', name: 'Gentle', description: 'Conservative: only obvious isolated defects.', params: { sensitivity: .3, size: 2, motionGuard: .8, strength: .8 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); if(uDeltaT<=0.0) return c; vec2 px=P1/uResolution; vec3 n=(inp(uv+vec2(px.x,0.)).rgb+inp(uv-vec2(px.x,0.)).rgb+inp(uv+vec2(0.,px.y)).rgb+inp(uv-vec2(0.,px.y)).rgb)*.25; vec3 p=prevSrc(uv).rgb; float spatial=length(c.rgb-n); float temporal=length(c.rgb-p); float neighbourStable=length(n-(prevSrc(uv+vec2(px.x,0.)).rgb+prevSrc(uv-vec2(px.x,0.)).rgb+prevSrc(uv+vec2(0.,px.y)).rgb+prevSrc(uv-vec2(0.,px.y)).rgb)*.25); float thr=mix(.35,.06,P0); float defect=smoothstep(thr,thr*2.0,spatial)*smoothstep(thr,thr*2.0,temporal)*(1.0-smoothstep(thr*.5,thr*1.5,neighbourStable)*P2); return vec4(mix(c.rgb,p,defect*P3),c.a); }`,
  }),
];
