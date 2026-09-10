// Council collection: actual geometry, shared Flux camera/audio/bloom contract.
// The earlier Lattice/Tunnel/Aurora studies remain available in the catalog.
// Tapestry II now lives in its own transforming-embroidery implementation.
import type { SceneInst } from './flux';

function stage(T: any) {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(43, 1, 0.1, 240);
  const owned = new Set<any>();
  const own = <A,>(x: A): A => { owned.add(x); return x; };
  const mesh = (g: any, m: any, parent = scene) => { const o = new T.Mesh(own(g), m); parent.add(o); return o; };
  const line = (points: number[][], material: any, parent = scene) => {
    const g = own(new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(...p))));
    const o = new T.Line(g, material); parent.add(o); return o;
  };
  return { scene, camera, own, mesh, line, dispose: () => { owned.forEach(o => o.dispose?.()); owned.clear(); } };
}

export { buildTapestryII } from './decoTapestryII';

/** FUTURIST / RADICAL_MINIMAL + GENERATIVE: a navigable orbital instrument. */
export function buildLattice(T: any): SceneInst {
  const s=stage(T),{scene,camera,own,mesh,line}=s;
  scene.add(new T.HemisphereLight(0xe0f6ee,0x1b1236,2));
  const light=new T.PointLight(0xffb888,120,40);light.position.set(6,5,8);scene.add(light);
  const shell=own(new T.MeshStandardMaterial({color:0x344552,metalness:.4,roughness:.36,emissive:0x11212c,emissiveIntensity:.2}));
  const pearl=own(new T.MeshStandardMaterial({color:0xd2d9cc,metalness:.3,roughness:.28,emissive:0x718e87,emissiveIntensity:.1}));
  const copper=own(new T.LineBasicMaterial({color:0xd7a17b,transparent:true,opacity:.72}));
  const mint=own(new T.LineBasicMaterial({color:0x8ad5c5,transparent:true,opacity:.65}));
  const root=new T.Group();scene.add(root);
  const core=mesh(new T.IcosahedronGeometry(1.65,4),shell,root);
  const inner=own(new T.MeshStandardMaterial({color:0x9d7654,metalness:.6,roughness:.3,emissive:0x62452a,emissiveIntensity:.3}));
  for(let j=0;j<3;j++) {
    const ring=mesh(new T.TorusGeometry(1.85+j*.14,.022,8,128),inner,root);
    ring.rotation.set(j*.7,.4+j*.6,.3);
  }
  const rings:any[]=[];
  for(let j=0;j<24;j++) {
    const g=new T.Group();root.add(g);rings.push(g);
    const r=3.1+.22*Math.sin(j*2.399);
    const pts=Array.from({length:193},(_,i)=>{const a=i/192*Math.PI*2;return [r*Math.cos(a),r*Math.sin(a),0];});
    line(pts,j%3?mint:copper,g);
    g.rotation.y=j*Math.PI/24;g.rotation.x=.28*Math.sin(j);
  }
  // The pearls are instanced: hundreds of physical beads, one draw call.
  const n=320, beads=new T.InstancedMesh(own(new T.SphereGeometry(.037,8,6)),pearl,n);
  const dummy=new T.Object3D();
  for(let i=0;i<n;i++) {const y=1-2*(i+.5)/n,a=i*2.399963,r=3.13;dummy.position.set(r*Math.sqrt(1-y*y)*Math.cos(a),r*y,r*Math.sqrt(1-y*y)*Math.sin(a));dummy.updateMatrix();beads.setMatrixAt(i,dummy.matrix);}
  root.add(beads);
  for(let j=0;j<3;j++) {
    const orbit=new T.Group();root.add(orbit);orbit.rotation.set(.6+j*.8,j*.5,.4);
    const torus=mesh(new T.TorusGeometry(4+j*.27,.018,6,192),pearl,orbit);
    torus.scale.y=.75;
  }
  return {scene,camera,cam:{target:[0,0,0],radius:13.8,pitch:12,yaw:0,fov:43},
    exposure:.95, brightThreshold:1.0,grain:.0008,
    update(t,a,spec){root.rotation.y=t*Math.PI/32;root.rotation.z=.12*Math.sin(t*Math.PI/16);
      core.rotation.y=-t*.07;rings.forEach((g,j)=>{g.rotation.x=.28*Math.sin(j+t*Math.PI/16);});
      pearl.emissiveIntensity=.12+a.tre*.7;inner.emissiveIntensity=.15+a.bass*.65;mint.opacity=.35+a.mid*.4;copper.opacity=.45+a.bass*.5;
      mint.color.setHSL(.46+(spec.hue-.5)*.25,.42,.62);light.intensity=90+a.kick*55;
    },bloom:a=>.27+a.energy*.23,dispose:s.dispose};
}

/** REBEL / CLASSICAL + KINETIC: monumental ribs, a measured procession. */
export function buildTunnel(T:any):SceneInst {
  const s=stage(T),{scene,camera,own,mesh,line}=s;
  scene.fog=new T.FogExp2(0x060c16,.025);
  scene.add(new T.HemisphereLight(0x8eb8da,0x0c101a,1.1));
  const orange=own(new T.MeshStandardMaterial({color:0x8f301b,metalness:.45,roughness:.4,emissive:0xff4922,emissiveIntensity:.5}));
  const cyan=own(new T.LineBasicMaterial({color:0x79b3d5,transparent:true,opacity:.65}));
  const floor=own(new T.MeshStandardMaterial({color:0x081823,metalness:.6,roughness:.32}));
  const road=mesh(new T.BoxGeometry(13,.18,130),floor);road.position.set(0,-4,-49);
  const ribs:any[]=[];
  const beamG=own(new T.BoxGeometry(.14,7.4,.24));
  const roofG=own(new T.BoxGeometry(6.4,.14,.24));
  for(let j=0;j<30;j++) {
    const rib=new T.Group();scene.add(rib);ribs.push(rib);
    for(const side of [-1,1]) {
      const col=new T.Mesh(beamG,orange);col.position.set(side*5,-.2,0);rib.add(col);
      const roof=new T.Mesh(roofG,orange);roof.position.set(side*2.5,4.14,0);roof.rotation.z=-side*.25;rib.add(roof);
    }
    line([[-4.6,-3.8,.2],[-4.6,3.2,.2],[0,4.5,.2],[4.6,3.2,.2],[4.6,-3.8,.2]],cyan,rib);
  }
  for(const x of [-4.6,-3,3,4.6]) line([[x,-3.86,8],[x,-3.86,-120]],cyan);
  const rails=own(new T.LineBasicMaterial({color:0x456276,transparent:true,opacity:.5}));
  for(let i=0;i<40;i++) line([[-6,-3.85,-i*3],[6,-3.85,-i*3]],rails);
  return {scene,camera,cam:{target:[0,.1,-35],radius:43,pitch:0,yaw:0,fov:58},
    exposure:.85,brightThreshold:.85,grain:.0008,
    update(t,a,spec){ribs.forEach((r,j)=>{r.position.z=8-((j*4-t*2)%120+120)%120;r.rotation.z=.075*Math.sin(j*.35+t*Math.PI/16);});
      orange.emissiveIntensity=.36+a.bass*.5+a.kick*.22;
      orange.emissive.setHSL(.035+(spec.hue-.5)*.12,.9,.53);cyan.opacity=.4+a.tre*.4;
    },bloom:a=>.38+a.energy*.22,dispose:s.dispose};
}

/** BAROQUE / RADICAL_MINIMAL + CHARACTER: overlapping arcs, room to breathe. */
export function buildAurora(T:any):SceneInst {
  const s=stage(T),{scene,camera,own,mesh}=s;
  const curtains:any[]=[];
  for(let j=0;j<5;j++) {
    const material=own(new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      uniforms:{time:{value:0},bass:{value:0},mid:{value:0},tre:{value:0},hue:{value:.5},layer:{value:j}},
      vertexShader:`uniform float time,layer;varying vec2 q;varying float fold;
      void main(){q=uv;vec3 p=position;float a=uv.x*9.+time*.19+layer*.8;
        fold=sin(a+sin(uv.x*17.-time*.13)*.6);
        p.z+=fold*1.8+sin(uv.x*36.+layer+time*.11)*.18;
        p.y+=sin(uv.x*7.+time*.21+layer)*.8;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform float time,layer,bass,mid,tre,hue;varying vec2 q;varying float fold;
      void main(){float thread=pow(.5+.5*sin(q.x*850.+sin(q.x*97.)*3.),5.);
        float envelope=smoothstep(0.,.10,q.x)*(1.-smoothstep(.87,1.,q.x));
        float hem=exp(-q.y*5.4),body=sin(q.y*3.14159)*.20;
        float streak=.45+.55*pow(.5+.5*sin(q.x*34.+layer+time*.18),3.);
        vec3 jade=vec3(.12,.82,.47),violet=vec3(.36,.14,.72);
        vec3 c=mix(jade,violet,smoothstep(.05,.85,q.y)+.08*sin(layer));
        c=mix(c,c.bgr,abs(hue-.5)*.6);
        float alpha=envelope*(hem*.72+body)*streak*(.55+thread*.45);
        c*=.7+bass*.28+mid*.4+thread*tre*.5;
        gl_FragColor=vec4(c,alpha*.60);}` }));
    const curtain=mesh(new T.PlaneGeometry(27,7.5,220,30),material);
    curtain.position.set((j-2)*.8,2+j*.55,-j*2.4);curtain.rotation.y=(j-2)*.11;
    curtains.push(material);
  }
  const moonMat=own(new T.MeshBasicMaterial({color:0xc8d9d6}));
  mesh(new T.SphereGeometry(.43,32,24),moonMat).position.set(7.5,7,-20);
  const starsG=own(new T.BufferGeometry());const pos=[];
  for(let i=0;i<220;i++){const h=(n:number)=>{const x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);};pos.push((h(i+1)-.5)*85,h(i+402)*25-2,-30-h(i+800)*40);}
  starsG.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  scene.add(new T.Points(starsG,own(new T.PointsMaterial({color:0x7d9caa,size:.045,transparent:true,opacity:.6}))));
  // Black low-poly silhouette gives the luminous curtains scale.
  const terrain=new T.Shape();terrain.moveTo(-55,-15);terrain.lineTo(-55,-3.6);
  for(let i=0;i<=80;i++) terrain.lineTo(-55+i*110/80,-4+Math.sin(i*.61)*.4+Math.sin(i*1.7)*.22);
  terrain.lineTo(55,-15);terrain.closePath();
  mesh(new T.ShapeGeometry(terrain),own(new T.MeshBasicMaterial({color:0x030911}))).position.z=1;
  return {scene,camera,cam:{target:[0,1,-5],radius:25,pitch:4,yaw:0,fov:46},
    exposure:1.05,brightThreshold:.50,grain:.0008,
    update(t,a,spec){curtains.forEach(m=>{const u=m.uniforms;u.time.value=t;u.bass.value=a.bass;u.mid.value=a.mid;u.tre.value=a.tre;u.hue.value=spec.hue;});},
    bloom:a=>.55+a.mid*.25,dispose:s.dispose};
}
