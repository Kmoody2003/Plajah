import type { SceneInst } from './flux';
import { makeDecoSeed,DECO_PATHS,DECO_POINTS } from '../../../../services/fabula/decoPatterns';
import { DecoDirector } from '../../../../services/fabula/decoDirector';

/** Brass and enamel: 24 equal-topology arrangements, continuously conducted by music. */
export function buildTapestryII(T:any):SceneInst{
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(39,1,.1,100),owned:any[]=[];
 const own=(x:any)=>{owned.push(x);return x;};
 const gold=own(new T.MeshStandardMaterial({color:0xd2b274,metalness:.8,roughness:.3,emissive:0x614014,emissiveIntensity:.3}));
 const key=new T.PointLight(0xffdda5,100,40,2);key.position.set(-3,4,8);scene.add(key);
 scene.add(new T.HemisphereLight(0xa6dedb,0x10101a,2));
 const background=own(new T.ShaderMaterial({uniforms:{time:{value:0},energy:{value:0}},vertexShader:'varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:
 'varying vec2 q;uniform float time,energy;void main(){vec2 p=q-.5;float vign=1.-smoothstep(.15,.75,length(p));float silk=pow(.5+.5*sin(q.x*1000.),12.)*pow(.5+.5*sin(q.y*700.),8.);float sheen=pow(.5+.5*sin(q.x*8.+q.y*4.-time*.07),12.);vec3 c=mix(vec3(.007,.015,.025),vec3(.018,.105,.115),vign);c+=silk*.015+sheen*vec3(.012,.025,.022)*(1.+energy);gl_FragColor=vec4(c,1.);}'}));
 const bed=new T.Mesh(own(new T.PlaneGeometry(14.2,8.7)),background);bed.position.z=-.5;scene.add(bed);
 const borderMaterial=own(new T.LineBasicMaterial({color:0xbba06c,transparent:true,opacity:.7}));
 for(let j=0;j<3;j++){const x=7-j*.13,y=4.3-j*.13,c=.3;const points=[[-x+c,-y],[x-c,-y],[x,-y+c],[x,y-c],[x-c,y],[-x+c,y],[-x,y-c],[-x,-y+c],[-x+c,-y]].map(([x,y])=>new T.Vector3(x,y,0));scene.add(new T.Line(own(new T.BufferGeometry().setFromPoints(points)),borderMaterial));}
 const seeds=Array.from({length:24},(_,i)=>makeDecoSeed(i)),director=new DecoDirector();
 const vertices=DECO_PATHS*(DECO_POINTS-1)*2,positions=new Float32Array(vertices*3),colors=new Float32Array(vertices*3);
 const geometry=own(new T.BufferGeometry());geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('color',new T.BufferAttribute(colors,3).setUsage(T.DynamicDrawUsage));
 const material=own(new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));
 const threads=new T.LineSegments(geometry,material);threads.frustumCulled=false;scene.add(threads);
 const gems=new T.InstancedMesh(own(new T.OctahedronGeometry(.065)),gold,72);gems.frustumCulled=false;scene.add(gems);
 const dummy=new T.Object3D(),color=new T.Color();let last=-1,breath=0;
 const mixed=new Float32Array(DECO_PATHS*DECO_POINTS*3);
 return {scene,camera,cam:{target:[0,0,0],radius:16.9,pitch:0,yaw:0,fov:39,lock:true},exposure:1.05,brightThreshold:1.1,grain:.001,
 update(t,a,spec){
  const dt=last<0||t<last||t-last>2?1/60:Math.min(.2,t-last);last=t;
  const d=director.update(dt,a),energy=Math.min(1,a.intensity),voice=a.voice;
  breath+=dt*(.13+energy*.6);background.uniforms.time.value=t;background.uniforms.energy.value=energy;
  const held=typeof spec.decoSeed==='number'&&spec.decoSeed>=0?Math.floor(spec.decoSeed):-1;
  mixed.fill(0);for(let s=0;s<24;s++){const w=held>=0?(s===held?1:0):d.weights[s];if(w<.00001)continue;const seed=seeds[s];for(let i=0;i<mixed.length;i++)mixed[i]+=seed[i]*w;}
  const angle=d.rotation*(.15+energy*.32),ca=Math.cos(angle),sa=Math.sin(angle);
  // Rotate in normalized panel coordinates, retaining the frame at any orientation.
  const scale=(.88+energy*.06+Math.sin(breath)*(.01+voice*.025)+d.impulse*.045)/(Math.abs(ca)+Math.abs(sa));
  for(let p=0;p<DECO_PATHS;p++){
   const row=Math.floor(p/12),k=p%12;
   const detail=.25+.75/(1+Math.exp((k-(3+energy*9+voice*2))*1.5));
   const hue=.105+(spec.hue-.5)*.12+(row%3===0?.32:0)+voice*.025;
   color.setHSL(hue,row%3===0?.3:.5,(.30+energy*.14+a.tre*.09)*detail);
   for(let i=0;i<DECO_POINTS;i++){
    const ix=(p*DECO_POINTS+i)*3,u=i/(DECO_POINTS-1),nx=mixed[ix]/6.5,ny=mixed[ix+1]/3.8;
    const ripple=Math.sin(u*Math.PI)*Math.sin(u*Math.PI*4+row*.7+breath)*(voice*.10+a.mid*.035);
    mixed[ix]=(nx*ca-ny*sa)*6.25*scale;
    mixed[ix+1]=(nx*sa+ny*ca)*3.55*scale+ripple;
    mixed[ix+2]=.12+Math.sin(u*Math.PI)*(.05+voice*.18)+d.impulse*.22*Math.sin(row);
    if(i<DECO_POINTS-1){const dest=(p*(DECO_POINTS-1)*2+i*2)*3;colors[dest]=colors[dest+3]=color.r;colors[dest+1]=colors[dest+4]=color.g;colors[dest+2]=colors[dest+5]=color.b;}
   }
   for(let i=0;i<DECO_POINTS-1;i++){const src=(p*DECO_POINTS+i)*3,dest=(p*(DECO_POINTS-1)*2+i*2)*3;for(let j=0;j<6;j++)positions[dest+j]=mixed[src+j];}
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
  for(let i=0;i<72;i++){
   const p=i*2,point=Math.floor((.5+.4*Math.sin(breath*.35+i*.7))*(DECO_POINTS-1)),ix=(p*DECO_POINTS+point)*3;
   dummy.position.set(mixed[ix],mixed[ix+1],mixed[ix+2]+.06);
   dummy.rotation.set(0,Math.PI/4,angle+i*.4+a.bass*.3);
   dummy.scale.setScalar(.35+energy*.7+a.kick*.25+voice*.25);dummy.updateMatrix();gems.setMatrixAt(i,dummy.matrix);
  }gems.instanceMatrix.needsUpdate=true;
  key.intensity=80+energy*35+d.impulse*30;gold.emissiveIntensity=.2+a.tre*.3;material.opacity=.7+energy*.25;
 },bloom:a=>.15+Math.min(1,a.intensity)*.14,dispose(){owned.forEach(o=>o.dispose());}};
}
