// Series VIII · Sanctuary Light — the Radical Minimalist.
import type { SanctuaryWorkDef } from './prelude';

export const MINIMAL_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-selah',
    name: 'Selah',
    line: 'A single horizon of light breathes above still dark water. Pause, and consider.',
    director: 'Radical Minimalist',
    energy: 'tranquil',
    lighting: 'Key: the line itself, a thin dawn horizon shading rose to warm white to cool blue (4000K at centre); faint haze bloom; mirrored in black water.',
    use: 'Silent prayer, reflection after the sermon, scripture pauses, communion.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell();
  float br=.5-.5*cos(t*6.2831853/9.);            // ~9 s breath
  br=br*br*(3.-2.*br);
  float ly=.17, dy=uv.y-ly;
  // deep indigo night above, near-black water below
  vec3 col=mix(vec3(.010,.010,.026),vec3(.030,.026,.075),smoothstep(ly-.05,.62,uv.y));
  col=mix(vec3(.004,.005,.012),col,smoothstep(ly-.012,ly+.004,uv.y));
  // colour along the line: rose -> warm white -> cool blue
  float xc=.08*sin(t*.06);
  vec3 lc=mix(vec3(1.,.42,.40),vec3(.38,.56,1.),smoothstep(-.85,.85,uv.x));
  lc=mix(lc,vec3(1.,.86,.70),exp(-pow((uv.x-xc)/.30,2.)));
  float env=exp(-pow(uv.x/.78,2.));
  float w=.0019+.0007*br;
  float core=exp(-dy*dy/(w*w));
  float glow1=exp(-abs(dy)/(.014+.006*br));
  float glow2=exp(-abs(dy)/.13);
  float hot=exp(-pow((uv.x-xc)/.18,2.));
  float k=.70+.30*br+.10*s;
  col+=lc*env*(core*(1.1+.8*hot)+glow1*(.28+.2*hot)+glow2*.10)*k;
  // a breath of atmosphere above the horizon
  col+=lc*env*.05*smoothstep(.35,0.,dy)*step(0.,dy)*(.6+.4*fbm2(vec2(uv.x*2.+t*.02,uv.y*6.)));
  // reflection: broken vertical shimmer on still water
  float rd=max(-dy,0.);
  float rip=n2(vec2(uv.x*7.,(rd*90.)/(.15+rd)-t*.25));
  rip=smoothstep(.35,.85,rip);
  float refl=env*exp(-rd/.10)*exp(-pow((uv.x-xc)/(.35+rd*.8),2.))*step(0.,-dy);
  col+=lc*refl*(.06+.22*rip)*k;
  col+=lc*env*exp(-rd/.006)*step(0.,-dy)*.25*k;  // contact glint at the waterline
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-breath',
    name: 'Breath',
    line: 'One luminous orb, gold within teal, filling and emptying at the pace of a slow prayer.',
    director: 'Radical Minimalist',
    energy: 'tranquil',
    lighting: 'Key: the orb, a 3400K gold core; cool teal haze around it carries the glow; no other source.',
    use: 'Breath prayer, guided meditation, silent reflection, Taizé and contemplative services.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell();
  float ph=t*6.2831853/10.;                      // 10 s = 6 breaths a minute at Motion 0.5
  float b=.5-.5*cos(ph); b=b*b*(3.-2.*b);
  vec2 c=vec2(0.,.07);
  vec2 d=uv-c; float r=length(d);
  float R=.15+.055*b+.008*s;
  // luminance field: core, aura, wide haze
  float core=exp(-pow(r/R,2.)*1.7);
  float rim=exp(-pow((r-R*1.02)/(.05*R+.01),2.))*.10;   // soft shell where the light meets the haze
  float aura=exp(-r/(R*1.25))*.36;
  float haze=exp(-r*2.2)*.16*(.75+.5*fbm2(d*2.5+vec2(t*.02,-t*.015)));
  // light inside the orb gently turns, like breath in a lantern
  float swirl=fbm2(rot(t*.03)*d*5./R+3.);
  float L=core*(.82+.28*swirl)+rim+aura+haze;
  L+=.035*smoothstep(.7,-.6,uv.y);                // faint floor of haze
  // duotone: deep teal -> sea glass -> soft gold
  vec3 deep=vec3(.004,.040,.052), sea=vec3(.06,.30,.32), gold=vec3(1.,.80,.50);
  vec3 col=mix(deep,sea,smoothstep(.0,.42,L));
  col=mix(col,gold,smoothstep(.30,1.05,L));
  col*=.55+.75*L;
  col+=vec3(1.,.92,.78)*pow(core,6.)*.25*(.85+.3*b);   // quiet hot centre
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-still-small-voice',
    name: 'Still Small Voice',
    line: 'A few motes of light drift through velvet darkness, near ones soft, far ones barely there.',
    director: 'Radical Minimalist',
    energy: 'tranquil',
    lighting: 'Key: a faint high moonlight wash, 7000K, from upper left; motes are warm 3200K; thick still air, deep plum shadow.',
    use: 'Silent prayer, confession, listening prayer, end of service, 1 Kings 19 readings.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell(), px=1./iResolution.y;
  // velvet ground: plum below, midnight above, faint moon-wash from upper left
  vec3 col=mix(vec3(.030,.012,.030),vec3(.010,.016,.045),smoothstep(-.6,.6,uv.y+.25*uv.x));
  col*=.85+.3*fbm2(uv*1.6+vec2(t*.01,0.));
  float mw=length(uv-vec2(-.75,.55));
  col+=vec3(.30,.36,.55)*.10*exp(-mw*1.8);
  col+=vec3(.20,.22,.38)*.04*fbm2(vec2(uv.x*2.-t*.02,uv.y*3.))*exp(-mw*1.2);
  // three depth planes: far (tiny, dim), focus (crisp), near (big soft bokeh)
  for(int L=0;L<3;L++){
    float fl=float(L);
    float sc=fl==0.?14.:(fl==1.?7.:3.2);
    float sp=fl==0.?.012:(fl==1.?.022:.040);
    vec2 g=uv*sc+vec2(t*sp*.5*sc,t*sp*sc)+fl*13.7;
    vec2 gi=floor(g);
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
      vec2 id=gi+vec2(float(i),float(j));
      float h=h21(id+fl*7.3);
      if(h<(fl==2.?.80:.86)) continue;
      vec2 c=id+.5+(h22(id+fl)-.5)*.8;
      c+=.15*vec2(sin(t*.2+h*30.),cos(t*.17+h*20.));       // tiny wander
      float dd=length(g-c)/sc;                                   // back to screen units
      float tw=.65+.35*sin(t*.35+h*50.);
      vec3 mc=mix(vec3(1.,.82,.58),vec3(.75,.85,1.),step(.95,h));
      if(fl==0.){
        col+=mc*.30*tw*exp(-dd*dd/(2.2*px*px*2.2));
      } else if(fl==1.){
        float rr=1.8*px;
        col+=mc*.70*tw*(exp(-dd*dd/(rr*rr))+.25*exp(-dd/.012));
      } else {
        float rad=.022+.012*fract(h*13.);
        float disc=smoothstep(rad,rad-.006,dd);
        float ring=smoothstep(.006,.0,abs(dd-rad+.004));
        col+=mc*(disc*.07+ring*.04+.03*exp(-dd/.03))*tw*(.9+.2*s);
      }
    }
  }
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-threshold',
    name: 'Threshold',
    line: 'A tall doorway of warm light stands open in the dark; its glow spills across the floor toward you.',
    director: 'Radical Minimalist',
    energy: 'calm',
    lighting: 'Key: unseen source beyond the door, 3000K tungsten-gold; low haze carries a volumetric spill; walls fall to blue-black.',
    use: 'Invitation and response, altar call, walk-in, baptism, Easter morning.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*motion(), s=swell(), aa=1.5/iResolution.y;
  vec3 warm=vec3(1.,.70,.40), hotC=vec3(1.,.90,.72);
  float y0=.02, yb=-.28, yt=.30, hw=.085;
  // slow shifting of the unseen source
  float drift=.5+.5*sin(t*.07);
  float lx=.12*sin(t*.045);
  // dark room: blue-black walls, bounce near the door
  vec2 dc=vec2(0.,(yb+yt)*.5);
  vec2 bd=abs(uv-dc)-vec2(hw,(yt-yb)*.5);
  float box=length(max(bd,0.))+min(max(bd.x,bd.y),0.);
  vec3 col=mix(vec3(.010,.012,.022),vec3(.020,.018,.030),smoothstep(-.5,.5,uv.y));
  col+=warm*.10*exp(-max(box,0.)*7.);
  // door aperture
  float door=smoothstep(aa,-aa,box);
  vec2 dq=(uv-vec2(0.,yb))/vec2(hw,yt-yb);       // 0..1 up the door
  float inner=.80+.25*smoothstep(1.,0.,dq.y)-.12*abs(dq.x);
  inner*=.88+.18*fbm2(vec2(dq.x*1.5+lx*3.,dq.y*2.-t*.03));
  vec3 dl=mix(warm,hotC,smoothstep(1.,.0,dq.y)*.8)*inner*1.35;
  col=mix(col,dl,door);
  // jamb reveal: thin lit edge just inside the frame
  float jamb=smoothstep(.006,.0,abs(box+.004))*door;
  col+=hotC*jamb*.25;
  // floor
  if(uv.y<yb){
    float z=1./(y0-uv.y);                       // camera height 1
    float D=1./(y0-yb);
    float X=uv.x*z, W=hw*D;
    float back=max(D-z,0.);                      // distance in front of the door
    float sxw=W+back*.32;
    float soft=.04+back*.20;
    float sx=X-lx*back*.6;
    float spill=smoothstep(sxw+soft,sxw-soft,abs(sx))*exp(-back*.45)*step(z,D+.02);
    float grain=.85+.15*fbm2(vec2(X*3.,z*3.));
    col+=warm*spill*.75*grain*(.85+.25*drift);
    // polished floor: soft reflection of the doorway
    float ry=yb-(uv.y-yb);
    vec2 rbd=abs(vec2(uv.x,ry)-dc)-vec2(hw,(yt-yb)*.5);
    float rbox=length(max(rbd,0.))+min(max(rbd.x,rbd.y),0.);
    float rfl=exp(-max(rbox,0.)*30.)*exp(-(yb-uv.y)*6.);
    col+=warm*rfl*.22;
    col*=1.-.35*smoothstep(-.3,-.5,uv.y)*(1.-spill);
  }
  // volumetric haze: rays from beyond the door, heavier near the floor
  vec2 S=vec2(lx*.15,.0);
  vec2 v=uv-S; float ang=atan(v.x,-v.y);
  float rays=.55+.45*fbm2(vec2(ang*4.,length(v)*2.-t*.04));
  float vol=exp(-max(box,0.)*4.5)*(1.-door)*rays;
  vol*=.55+.45*smoothstep(.2,-.4,uv.y);
  col+=warm*vol*.22*(.9+.2*s+.15*drift);
  col+=warm*.04*fbm2(uv*2.5+vec2(t*.02,0.))*exp(-max(box,0.)*2.);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
