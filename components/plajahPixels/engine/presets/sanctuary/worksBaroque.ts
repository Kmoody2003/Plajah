// Series VIII · Sanctuary Light — the Baroque Dramatist: chiaroscuro, drama,
// gilding, painted heavens.
import type { SanctuaryWorkDef } from './prelude';

export const BAROQUE_WORKS: SanctuaryWorkDef[] = [
  {
    id: 'sanct-glory-clouds',
    name: 'Glory Clouds',
    line: 'A painted ceiling opens: billowing heavens part and golden sunbeams pour through the break.',
    director: 'Baroque Dramatist',
    energy: 'calm',
    lighting: 'Key: low sun behind the cloud break, 3800K gold on sun-facing edges; cool 7500K sky fill in the shadows; aerial haze carries the shafts.',
    use: 'Call to worship, opening songs, Easter and Ascension, benediction.',
    glsl: `
float cdens(vec2 p, float t){                 // billowing cumulus field
  vec2 q=p+vec2(t,0.);
  vec2 w=vec2(fbm2(q*.7+vec2(0.,t*.4)),fbm2(q*.7+vec2(5.2,1.3-t*.3)));
  return fbm2(q*1.3+w*1.3);
}
float ccheap(vec2 p, float t){                // 3-octave stand-in for the shafts
  vec2 q=(p+vec2(t,0.))*1.3; float v=.5*n2(q)+.25*n2(q*2.03+3.1)+.125*n2(q*4.1+7.7); return v/.875;
}
float coverage(vec2 p, vec2 sun){             // the break around the sun, heavier cloud below and at the edges
  vec2 d=(p-sun)*vec2(.75,1.1);
  return -.30*exp(-dot(d,d)/.05)+.10*smoothstep(.15,-.55,p.y)+.06*smoothstep(.5,1.,abs(p.x));
}
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.018*motion(), s=swell();
  vec2 sun=vec2(.16,.30);
  vec3 sunC=vec3(1.,.72,.40)*(1.+.15*chordMaj());
  float ds=length(uv-sun);
  // heaven beyond: deep lapis, warming to gold only right round the sun
  vec3 col=mix(vec3(.05,.12,.32),vec3(.02,.05,.17),smoothstep(-.3,.6,uv.y+.3*uv.x));
  col=mix(col,vec3(.55,.42,.32),exp(-ds*5.));
  col+=sunC*(.25*exp(-ds*4.)+1.4*exp(-ds*ds*300.));
  col+=vec3(1.,.95,.85)*smoothstep(.024,.014,ds)*1.5;
  // two cloud decks: far (small, hazy) then near (large, sculpted)
  for(int L=0;L<2;L++){
    float fl=float(L);
    float sc=mix(1.8,1.,fl), sp=mix(.6,1.,fl);
    vec2 off=vec2(fl*3.7,fl*1.9);
    vec2 p=uv*sc+off;
    float cov=coverage(uv,sun)+mix(-.03,0.,fl);
    float raw=cdens(p,t*sp)+cov;
    float dens=smoothstep(.47,.60,raw);
    if(dens<.002) continue;
    vec2 ld=normalize(sun-uv+vec2(0.,.001));
    float r1=cdens(p+ld*.035*sc,t*sp)+cov;
    float r2=cdens(p+ld*.11*sc,t*sp)+cov;
    float grad=clamp(.55+(raw-r1)*7.,0.,1.);          // sun-facing slopes catch the key
    float lit=grad*exp(-2.2*smoothstep(.45,.75,r2));  // self-shadow from the mass between it and the sun
    float near=exp(-ds*2.4);
    vec3 shadow=mix(vec3(.13,.16,.28),vec3(.22,.24,.34),smoothstep(-.5,.4,uv.y));
    vec3 warm=mix(vec3(.95,.80,.72),sunC*1.7,near);
    vec3 cc=mix(shadow,warm,smoothstep(.0,1.,lit));
    float edge=smoothstep(.0,.3,dens)*(1.-smoothstep(.3,.9,dens));
    cc+=sunC*edge*near*1.8*(.8+.3*s);                  // gilt lining round the break
    cc=mix(cc,col,mix(.40,.0,fl)*(1.-dens*.4));        // far deck sits back in the haze
    col=mix(col,cc,dens);
  }
  // god rays: march from pixel towards the sun through the cheap cloud mask
  vec2 dv=(sun-uv)/24.; vec2 pp=uv; float acc=0.;
  for(int i=0;i<24;i++){
    pp+=dv; float m=smoothstep(.45,.62,ccheap(pp,t)+coverage(pp,sun));
    acc+=1.-m;
  }
  float shafts=pow(acc/24.,3.)*exp(-ds*2.)*(1.-.4*smoothstep(-.1,-.5,uv.y));
  col+=sunC*shafts*(.45+.2*s);
  // keep the lyric band a touch quieter
  col*=1.-.15*exp(-pow((uv.y+.08)/.22,2.));
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-gilded-smoke',
    name: 'Gilded Smoke',
    line: 'Incense rises from an unseen censer, its silk ribbons caught in a single shaft of gold against the dark.',
    director: 'Baroque Dramatist',
    energy: 'tranquil',
    lighting: 'Key: hard side light from frame left, 3000K gold, rakes across the smoke; no fill — chiaroscuro to near-black; the smoke itself is the haze.',
    use: 'Prayer, confession, Lent and Advent, communion meditation.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.10*motion(), s=swell();
  vec3 gold=vec3(1.,.64,.28)*(1.+.12*chordMaj());
  float ax=iResolution.x/iResolution.y*.5;
  // darkness, with the faintest spill where the key enters at frame left
  vec3 col=vec3(.004,.004,.006);
  col+=gold*.04*exp(-pow((uv.x+ax+.1)*2.,2.))*smoothstep(-.7,.4,uv.y);
  // shared flow field: laminar near the censer, curling as it rises
  float dens=0., litS=0.;
  for(int i=0;i<11;i++){
    float fi=float(i);
    float isNear=step(fi,7.5);                       // 8 ribbons near, 3 far right
    float bx=mix(.64,-.40,isNear)+.012*(fi-3.5)*isNear;
    float y0=mix(-.60,-.58,isNear);
    vec2 p=uv;
    float hh=max(p.y-y0,0.);
    float turb=smoothstep(.05,1.,hh);
    vec2 wq=vec2(p.x*1.5,p.y*1.1-t*.9)+fi*vec2(.07,.03);
    vec2 w=vec2(fbm2(wq+vec2(1.3,0.)),fbm2(wq+vec2(7.1,2.9)))-.5;
    p+=w*turb*.30;
    vec2 wq2=p*vec2(4.,3.)+vec2(0.,-t*1.6)+fi*.11;
    p.x+=(fbm2(wq2)-.5)*turb*turb*.10;               // fine curls high up
    hh=max(p.y-y0,0.);
    float cx=bx+.18*hh*hh*sin(hh*2.1+t*.8+fi*1.7)+.06*hh*sin(hh*4.7-t*1.3+fi*2.9)+.12*hh*hh*mix(-1.,1.,isNear);
    float wd=.0035+.032*hh*hh+.002*mod(fi,4.);
    float dx=p.x-cx;
    float strand=exp(-dx*dx/(wd*wd));
    // silk: fine streaks combed along the ribbon
    float sk=fbm2(vec2(dx/wd*.9+fi*4.,hh*7.-t*2.6));
    float silk=.25+1.5*sk*sk;
    float amp=(.50-.22*hh)*smoothstep(1.2,.35,hh)*smoothstep(.0,.06,hh)*mix(.45,1.,isNear)*(.035/(wd+.03));
    float d=strand*silk*amp;
    dens+=d;
    litS+=d*(.2+.8*smoothstep(wd*.8,-wd*1.2,dx));    // faces turned to the key take the gold
  }
  // a soft veil of spent smoke drifting through the shaft
  vec2 vq=uv*vec2(2.2,1.4)+vec2(0.,-t*1.2);
  float veil=fbm2(vq+fbm2(vq*1.3+4.)*.8);
  veil=smoothstep(.45,.85,veil)*exp(-pow((uv.x+.30)*1.5,2.))*smoothstep(-.6,.5,uv.y)*.30;
  float key=.6+.4*smoothstep(.4,-.8,uv.x);             // light falls off away from the source
  vec3 smoke=gold*1.7*litS*key+vec3(.10,.11,.14)*(dens-litS)*.6;
  smoke+=gold*veil*.25*key;
  col+=smoke*(.9+.18*s);
  col+=vec3(1.,.9,.75)*pow(clamp(litS*.8,0.,1.),3.)*.35; // hot sheen on the densest folds
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-crown-of-light',
    name: 'Crown of Light',
    line: 'A gilded glory in the manner of Bernini: blades of gold and fine ivory rays fan from a radiant source through a ring of cloud.',
    director: 'Baroque Dramatist',
    energy: 'calm',
    lighting: 'Key: the aureole itself, ivory 4500K core grading to 3200K gilt; warm umber ground; cloud ring lit from within; motes in the haze catch the rays.',
    use: 'Worship and adoration, Christmas and Easter, scripture of glory, benediction.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float t=iTime*.012*motion(), tm=iTime*motion(), s=swell();
  vec2 src=vec2(.08,.25);
  vec2 d=uv-src; float r=length(d), a=atan(d.y,d.x);
  vec3 gold=vec3(1.,.64,.26), ivory=vec3(1.,.92,.78);
  // ground: warm umber near the glory, falling to deep oxblood-black
  vec3 col=mix(vec3(.050,.026,.016),vec3(.010,.006,.010),smoothstep(.0,.9,r));
  col+=gold*(.30*exp(-r*4.)+.06*exp(-r*1.5));
  // gilt blades: alternating long and short, slowly turning
  float N=28.;
  float ar=a+t;
  float sec=ar*N/6.2831853; float id=floor(sec); float f=fract(sec)-.5;
  float idm=mod(id,N);
  float longB=mod(idm,2.);
  float len=mix(.26,.52,longB)*(.9+.2*h11(idm*1.7+.3));
  float px=(1./iResolution.y)/max(r,.001)*N/6.2831853;   // one pixel in sector units
  float hw=mix(mix(.10,.16,longB),.006,clamp(r/len,0.,1.)); // blade tapers to a point
  float blade=smoothstep(hw+px*1.2,hw-px*1.2,abs(f))*smoothstep(len,len*.7,r)*smoothstep(.04,.10,r);
  float ridge=clamp(1.-abs(f)/max(hw,.001),0.,1.);          // bevelled gilding: bright spine, darker flanks
  float shimmer=.75+.25*sin(r*14.-tm*.45+idm*1.9);          // slow light travelling outward
  vec3 gilt=mix(gold*vec3(.65,.5,.35),ivory,ridge*ridge);
  col+=gilt*blade*(.35+.9*ridge)*shimmer*exp(-r*1.6)*1.3;
  // fine soft rays in the haze, rotating the other way
  vec2 nd=d/max(r,.001);
  float fr=n2(rot(-t*1.6)*nd*34.+3.)*.6+n2(rot(t*.9)*nd*80.+11.)*.4;
  fr=pow(fr,3.)*exp(-r*3.2)*smoothstep(.02,.12,r);
  col+=mix(gold,ivory,.5)*fr*1.2*(.85+.3*s);
  // halo rings, gilt with the faintest prism
  for(int k=0;k<3;k++){
    float fk=float(k);
    float rad=.085+fk*.075+.004*sin(tm*.25+fk);
    float wdt=.004+.003*fk;
    vec3 ring=vec3(exp(-pow((r-rad+.0025)/wdt,2.)),exp(-pow((r-rad)/wdt,2.)),exp(-pow((r-rad-.003)/wdt,2.)));
    col+=ring*mix(ivory,gold,fk*.45)*(.30-.07*fk);
  }
  // ring of cloud round the glory, lit gold from within, cool umber outside
  vec2 cq=rot(t*.5)*d;
  float cn=fbm2(cq*5.+vec2(0.,tm*.01))+.25*fbm2(cq*11.-3.);
  float band=exp(-pow((r-.46)/.13,2.));
  float cloud=smoothstep(.55,.85,cn*band+.30*band);
  float inner=exp(-max(r-.32,0.)*6.);
  vec3 cc=mix(vec3(.10,.06,.06),gold*1.1,inner*smoothstep(.3,.9,cn));
  col=mix(col,cc,cloud*.85);
  // radiant core
  col+=ivory*(exp(-r*24.)*1.6+.008/(r+.02))*(.95+.15*s);
  // gilt motes drifting in the rays
  vec2 g=rot(t*2.)*d*26.+vec2(0.,-tm*.05);
  vec2 cid=floor(g), cf=fract(g)-.5; vec2 rr=h22(cid)-.5;
  float tw=.6+.4*sin(tm*.6+h21(cid)*6.28);
  float mote=smoothstep(.06,.0,length(cf-rr*.7))*step(.86,h21(cid+5.3))*tw;
  col+=ivory*mote*(fr*3.+blade*.6+.12)*exp(-r*2.);
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
  {
    id: 'sanct-cathedral-night',
    name: 'Cathedral Night',
    line: 'Tiers of votive candles recede down a darkened nave, melting into warm bokeh beyond the plane of focus.',
    director: 'Baroque Dramatist',
    energy: 'calm',
    lighting: 'Key: the candles themselves, 2000K; a faint altar glow at the vanishing point; low smoke haze; flicker is soft and per-flame only.',
    use: 'Candlelight services, Christmas Eve, vigils, prayer, memorials.',
    glsl: `
void mainImage(out vec4 o,in vec2 C){
  vec2 uv=(C-.5*iResolution.xy)/iResolution.y;
  float tm=iTime*motion(), s=swell();
  vec3 flameC=vec3(1.,.48,.15);
  vec2 vp=vec2(0.,.10);
  // dark nave, altar glow at the far end of the aisle
  vec3 col=vec3(.006,.006,.010);
  vec2 av=(uv-vp)*vec2(.8,1.8);
  col+=flameC*(.07*exp(-length(av)*3.5)+.02*exp(-length(av)*1.2))*(.9+.15*s);
  float zf=2.3;
  for(int k=0;k<10;k++){
    float fk=float(k);
    float z=.8*pow(1.33,fk);
    float spacing=.15+.02*fk;
    for(int tr=0;tr<2;tr++){
      float Y=-.50+.18*float(tr);                      // two tiers of the votive stand
      float wx=(uv.x-vp.x)*z/.95;                      // world X at this depth
      float c0=floor(wx/spacing);
      for(int j=-1;j<=1;j++){
        float cid=c0+float(j);
        float sd=h21(vec2(cid*1.37,fk*7.1+float(tr)*3.3));
        float X=(cid+.5+.6*(sd-.5))*spacing;
        if(abs(X)<.30+.04*fk||sd<.22) continue;        // aisle down the middle, gaps in the rows
        float Yj=Y+.035*(h11(sd*91.)-.5);
        vec2 sp=vp+vec2(X,Yj)/z*.95;
        float sz=.055/z;                               // flame half-height
        float coc=(1./z-1./zf)*.085; coc=coc>0.?coc:-coc*.55;
        float flick=.88+.12*n2(vec2(tm*1.4,sd*97.));    // soft, per-flame
        float sway=.3*(n2(vec2(tm*.8,sd*53.))-.5);
        vec2 q=uv-sp;
        float l=length(q);
        float R=coc+sz*.4;
        if(l>R*2.5+sz*3.) continue;
        float focus=smoothstep(.009,.002,coc);
        vec3 hue=mix(flameC,vec3(1.,.64,.28),h11(sd*13.));
        // sharp flame: teardrop, narrow at the tip, white-gold core
        vec2 fq=q/sz; fq.x-=sway*max(fq.y+.3,0.);
        fq.x*=2.6+1.4*clamp(fq.y,0.,1.);
        fq.y*=fq.y>0.?.75:1.6;
        float fd=length(fq);
        vec3 flame=mix(hue,vec3(1.,.88,.66),smoothstep(.75,.1,fd))*smoothstep(1.,.5,fd)*1.8;
        // wax body below, lit warm from above
        float wax=smoothstep(sz*.36,sz*.30,abs(q.x))*smoothstep(-sz*.55,-sz*.75,q.y)*smoothstep(-sz*4.,-sz*2.5,q.y);
        flame+=vec3(.55,.34,.20)*wax*smoothstep(-sz*4.,-sz*.7,q.y)*.4;
        // bokeh disc: soft edge, faint bright rim, energy spread over its area
        float disc=smoothstep(R,R-max(1.5/iResolution.y,R*.10),l);
        float rim=smoothstep(R*.6,R*.97,l);
        float amp=clamp(1.1*pow(sz*.5/R,.9),.04,1.2);
        vec3 bok=hue*mix(vec3(1.),vec3(1.,.88,.72),rim)*disc*(.6+.5*rim)*amp;
        float halo=exp(-l/(sz*1.6+coc*.8))*.18;
        col+=(mix(bok,flame,focus)+hue*halo)*flick;
      }
    }
  }
  // low smoke haze drifting over the flames
  float hz=fbm2(uv*vec2(2.,4.)+vec2(tm*.03,0.));
  col+=flameC*.035*hz*smoothstep(.15,-.35,uv.y);
  // keep the aisle (lyric band) quiet
  col*=1.-.20*exp(-pow(uv.x/.35,2.))*exp(-pow((uv.y+.05)/.25,2.));
  o=vec4(sanctFinish(col,C),1.);
}`,
  },
];
