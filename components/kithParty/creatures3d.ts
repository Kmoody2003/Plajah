import * as T from 'three';
import type {Character} from './catalog';

/** Shared Kith facial language with species-specific volumes, limbs and appendages. */
export function makeCreature(c:Character):T.Group {
 const root=new T.Group();root.name=`kith-${c.id}`;
 const skin=new T.MeshStandardMaterial({color:c.color,roughness:.68});
 const accent=new T.MeshStandardMaterial({color:c.accent,roughness:.58});
 const fin=new T.MeshStandardMaterial({color:c.fin,roughness:.6});
 const pale=new T.MeshStandardMaterial({color:'#f3ece6',roughness:.7});
 const ink=new T.MeshStandardMaterial({color:'#191326',roughness:.3});
 const sphere=new T.SphereGeometry(1,16,12);
 const ell=(x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:T.Material=skin)=>{const m=new T.Mesh(sphere,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;root.add(m);return m;};
 const spike=(x:number,y:number,z:number,r:number,h:number,mat:T.Material=fin,angle=0)=>{const m=new T.Mesh(new T.ConeGeometry(r,h,5),mat);m.position.set(x,y,z);m.rotation.z=angle;m.castShadow=true;root.add(m);return m;};
 const eyeMask=(y:number,z:number,width=.43)=>{ell(0,y,z,width,.31,.12,pale);for(const sign of [-1,1]){const patch=ell(sign*.18,y+.015,z+.10,.145,.16,.045,accent);patch.rotation.z=sign*-.25;ell(sign*.16,y,z+.14,.05,.09,.023,ink);ell(sign*.15-.014,y+.03,z+.16,.015,.024,.008,pale);}ell(0,y-.12,z+.14,.052,.025,.035,ink);};
 if(c.id==='moki') {
  ell(0,.47,-.16,.48,.32,.65);for(const x of [-.29,.29])for(const z of [-.49,.20])ell(x,.15,z,.15,.2,.17);
  ell(0,.87,.3,.48,.42,.37);eyeMask(.84,.58);
  for(const sign of [-1,1]){spike(sign*.32,1.41,.14,.1,.66,accent,sign*-.4);for(let i=0;i<3;i++){const leaf=ell(sign*(.35+i*.10),1.3+i*.14,.15,.13,.24,.065,fin);leaf.rotation.z=sign*-.7;}}
  ell(0,.56,-.91,.16,.31,.12,accent).rotation.x=-.8;
 } else if(c.id==='zippi') {
  ell(0,.5,0,.25,.4,.28);ell(0,.59,.23,.17,.28,.08,accent);ell(0,1,.04,.4,.38,.34);eyeMask(.96,.34,.36);
  for(const sign of [-1,1]){ell(sign*.23,1.56,.04,.12,.49,.11).rotation.z=-sign*.2;ell(sign*.23,1.57,.13,.05,.34,.035,accent).rotation.z=-sign*.2;ell(sign*.24,.12,.2,.23,.12,.36);}
  spike(.22,.7,-.38,.15,.48,fin,-1);spike(.43,.89,-.39,.15,.4,accent,-.4);
 } else if(c.id==='nori') {
  ell(0,.58,0,.34,.32,.52);ell(0,.76,.22,.35,.34,.30);eyeMask(.77,.49,.31);
  for(const sign of [-1,1]){ell(sign*.58,.58,-.04,.64,.1,.46,fin).rotation.z=sign*.16;ell(sign*.57,.61,.01,.48,.05,.27,accent);spike(sign*.2,1.14,.15,.07,.35,fin,sign*-.4);}
  ell(0,.49,-.75,.09,.08,.5);ell(0,.51,-1.13,.25,.06,.21,fin);
 } else if(c.id==='pippa') {
  ell(0,.53,0,.22,.45,.22);ell(0,.95,.1,.33,.30,.27);eyeMask(.93,.33,.3);
  for(const sign of [-1,1]){ell(sign*.55,.84,-.1,.48,.5,.07,fin).rotation.z=-sign*.45;ell(sign*.45,.37,-.08,.36,.3,.07,accent).rotation.z=sign*.4;ell(sign*.55,.88,0,.18,.25,.03,accent);spike(sign*.2,1.39,.1,.03,.5,fin,-sign*.3);ell(sign*.26,1.63,.1,.07,.07,.07,accent);}
  for(let i=0;i<7;i++)ell(Math.sin(i)*.25,.7,Math.cos(i)*.2,.12,.12,.12,pale);
 } else if(c.id==='bram') {
  ell(0,.4,-.1,.64,.35,.7);for(const x of [-.47,.47])for(const z of [-.43,.35])ell(x,.1,z,.23,.18,.24);
  ell(0,.55,.48,.42,.35,.32);eyeMask(.52,.73,.38);
  for(let row=0;row<3;row++)for(const sign of [-1,1]){const rock=new T.Mesh(new T.DodecahedronGeometry(.27,0),row%2?fin:accent);rock.position.set(sign*.28,.74,-.51+row*.3);rock.scale.y=1.1;rock.castShadow=true;root.add(rock);}
 } else if(c.id==='luma') {
  ell(0,.76,0,.34,.55,.29);eyeMask(.91,.24,.3);spike(0,.2,0,.2,.5,fin,Math.PI);
  const crescent=new T.Mesh(new T.TorusGeometry(.4,.07,8,25,Math.PI*1.4),accent);crescent.position.set(0,1.29,0);crescent.rotation.z=-Math.PI*.2;root.add(crescent);
  for(let i=0;i<3;i++)ell(Math.cos(i*2.1)*.61,.7+Math.sin(i*2.1)*.32,0,.07,.07,.07,accent);
 } else if(c.id==='tavi') {
  ell(0,.42,-.11,.4,.39,.59);ell(0,.68,.39,.33,.31,.32);ell(0,.53,.69,.21,.15,.27,pale);eyeMask(.74,.64,.3);
  for(let i=0;i<5;i++)spike(0,.81,-.6+i*.24,.25,.3,i%2?fin:accent,.08);
  const tail=new T.Mesh(new T.TorusGeometry(.32,.1,8,16,Math.PI*1.5),fin);tail.position.set(.08,.44,-.77);tail.rotation.y=Math.PI/2;root.add(tail);
  for(const sign of [-1,1]){ell(sign*.28,.12,.2,.17,.15,.23);const g=new T.Mesh(new T.TorusGeometry(.15,.025,6,16),ink);g.position.set(sign*.18,.77,.76);root.add(g);}
 } else if(c.id==='fenn') {
  ell(0,.45,-.13,.32,.36,.5);ell(0,.9,.29,.37,.36,.31);eyeMask(.86,.55,.36);
  for(const sign of [-1,1]){spike(sign*.26,1.39,.25,.13,.68,skin,-sign*.25);for(let i=0;i<4;i++){const feather=ell(sign*(.35+i*.16),.68+i*.08,-.18-i*.05,.11,.09,.4,i%2?accent:fin);feather.rotation.y=sign*.35;}ell(sign*.23,.1,.1,.18,.12,.28,accent);}
  ell(0,.41,-.88,.18,.15,.5,accent).rotation.x=.3;
 } else {
  ell(0,.48,0,.31,.4,.29);ell(0,.49,.26,.22,.28,.07,accent);ell(0,1,0,.49,.46,.35);eyeMask(.92,.30);
  for(let i=0;i<9;i++){const a=(i/8)*Math.PI;spike(Math.cos(a)*.54,1+Math.sin(a)*.48,-.08,.17,.39,i%2?accent:fin,Math.PI/2-a);}
  for(const sign of [-1,1]){spike(sign*.31,1.5,.05,.13,.56,skin,-sign*.2);ell(sign*.36,.46,.03,.14,.3,.14);ell(sign*.22,.12,.13,.22,.13,.25);}
 }
 root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 return root;
}
