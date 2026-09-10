// New concepts, independent of the earlier Field/Lattice/Tunnel/Aurora catalog.
// Sound articulates geometry; the camera remains a stable viewing position.
import type { SceneInst } from './flux';

export function atelier(T:any, renderer:any) {
  const owned=new Set<any>(),scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1,.1,180);
  const own=<A,>(a:A):A=>{owned.add(a);return a;};
  const mesh=(g:any,m:any,parent=scene)=>{const o=new T.Mesh(own(g),m);parent.add(o);return o;};
  const room=new T.Scene();
  const roomGeo=new T.BoxGeometry(60,40,60),roomMat=new T.MeshBasicMaterial({color:0x777983,side:T.BackSide});
  room.add(new T.Mesh(roomGeo,roomMat));
  const panels:any[]=[];
  for(const [x,y,z,sx,sy,c] of [[-12,8,4,7,15,0xffe2c7],[12,6,-5,5,18,0xb8dce5],[0,17,0,18,7,0xffffff]]){
    const g=new T.PlaneGeometry(sx,sy),m=new T.MeshBasicMaterial({color:c});
    const p=new T.Mesh(g,m);p.position.set(x,y,z);p.lookAt(0,0,0);room.add(p);panels.push(g,m);
  }
  const pmrem=new T.PMREMGenerator(renderer),target=own(pmrem.fromScene(room,.06));
  scene.environment=target.texture;pmrem.dispose();roomGeo.dispose();roomMat.dispose();panels.forEach(p=>p.dispose());
  scene.add(new T.HemisphereLight(0xe9edf1,0x202638,1.6));
  const key=new T.DirectionalLight(0xffe4ce,3.2);key.position.set(-6,12,8);scene.add(key);
  const fill=new T.DirectionalLight(0xa4d6e7,1.8);fill.position.set(9,5,-7);scene.add(fill);
  return {scene,camera,own,mesh,key,dispose:()=>{owned.forEach(o=>o.dispose?.());owned.clear();}};
}

/** A ceramic kinetic installation: hundreds of individual scales expose copper
 * at each wave crest. Physical relief, specular glaze and a grounded stone basin. */
export function buildPorcelainTide(T:any,renderer:any):SceneInst {
  const s=atelier(T,renderer),{scene,camera,own,mesh}=s;
  const ceramic=own(new T.MeshStandardMaterial({color:0xe0e5df,metalness:.08,roughness:.23}));
  const copper=own(new T.MeshStandardMaterial({color:0x925933,metalness:.82,roughness:.28,emissive:0x542210,emissiveIntensity:.15}));
  const stone=own(new T.MeshStandardMaterial({color:0x0c2830,metalness:.25,roughness:.36}));
  const basin=mesh(new T.BoxGeometry(22,.7,17.5),stone);basin.position.y=-1;
  const rim=own(new T.MeshStandardMaterial({color:0xaa7845,metalness:.7,roughness:.3}));
  for(const side of [-1,1]){
    mesh(new T.BoxGeometry(22,.04,.045),rim).position.set(0,-.63,side*8.7);
    mesh(new T.BoxGeometry(.045,.04,17.5),rim).position.set(side*10.9,-.63,0);
  }
  const floor=mesh(new T.PlaneGeometry(160,160),own(new T.MeshStandardMaterial({color:0x10151d,roughness:.8})));floor.rotation.x=-Math.PI/2;floor.position.y=-1.4;
  const shape=new T.Shape();
  shape.moveTo(-.20,-.24);shape.lineTo(.20,-.24);shape.quadraticCurveTo(.26,-.24,.26,-.18);
  shape.lineTo(.26,.18);shape.quadraticCurveTo(.26,.24,.20,.24);shape.lineTo(-.20,.24);
  shape.quadraticCurveTo(-.26,.24,-.26,.18);shape.lineTo(-.26,-.18);shape.quadraticCurveTo(-.26,-.24,-.20,-.24);
  const g=own(new T.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025}));g.rotateX(-Math.PI/2);
  const NX=38,NZ=29,tiles=new T.InstancedMesh(g,[ceramic,copper],NX*NZ);scene.add(tiles);
  // Deformation exceeds the undeformed mesh's bounds; avoid incorrect CPU frustum culling.
  tiles.frustumCulled=false;
  const pose=new T.Object3D(),color=new T.Color();
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    color.setHSL(.50+.04*Math.sin(i*.11+j*.17),.08+.10*(j/NZ),.68+.1*Math.sin(i*.3+j*.13));tiles.setColorAt(j*NX+i,color);
  }
  return {scene,camera,cam:{target:[0,.5,0],radius:35,pitch:39,yaw:23,fov:42},grain:.0005,exposure:1.03,brightThreshold:1.2,
    update(t,a){
      const amp=.16+Math.min(1.4,a.bass)*2.45,fold=a.mid*.64;
      for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
        const x=(i-(NX-1)/2)*.55,z=(j-(NZ-1)/2)*.55;
        const phase=x*.42+z*.3-t*1.15;
        const crest=Math.sin(phase),second=Math.sin(z*.67-x*.15+t*.6);
        const y=.35+amp*(.6+.50*crest)+fold*(.5+.5*second);
        pose.position.set(x,y,z);
        pose.rotation.set(Math.cos(phase)*amp*.23+Math.cos(z*.67+t*.6)*fold*.6,0,-Math.cos(phase)*amp*.20);
        pose.scale.set(1,1,1);pose.updateMatrix();tiles.setMatrixAt(j*NX+i,pose.matrix);
      }
      tiles.instanceMatrix.needsUpdate=true;copper.emissiveIntensity=.08+a.tre*.55;
      s.key.intensity=2.6+a.energy*.8;
    },bloom:a=>.12+a.tre*.12,dispose:s.dispose};
}

const PETAL_VERTEX=`
uniform float time,bass,mid,angle,size,seed;varying vec2 q;varying vec3 world;
void main(){q=uv;float u=uv.y,v=uv.x*2.-1.;
  float openness=.54+bass*.46;
  float radius=.42+u*size*openness;
  float width=pow(max(.001,sin(u*3.14159)),.7)*size*.27;
  float phi=angle+u*u*(.3+mid*.75)+.035*sin(time*.4+seed);
  vec2 radial=vec2(cos(phi),sin(phi)),tangent=vec2(-radial.y,radial.x);
  vec2 xy=radial*radius+tangent*v*width;
  float pleat=sin(v*28.+u*4.)*.085*sin(u*3.14159);
  float z=sin(u*3.14159)*(1.1+(1.-openness)*2.)+pow(u,5.)*(.2+mid*.75)+pleat;
  z+=.15*sin(u*9.-time*.45+seed)*sin(u*3.14159);
  vec4 wp=modelMatrix*vec4(xy,z,1.);world=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`;
const PETAL_FRAGMENT=`
uniform float tre,hue,seed;varying vec2 q;varying vec3 world;
void main(){vec3 n=normalize(cross(dFdx(world),dFdy(world)));if(!gl_FrontFacing)n=-n;
  vec3 eye=normalize(cameraPosition-world),key=normalize(vec3(-.5,.7,1.));
  float diffuse=.25+.75*abs(dot(n,key));float rim=pow(1.-abs(dot(n,eye)),2.7);
  float sheen=pow(max(0.,dot(reflect(-key,n),eye)),24.);
  float ribs=.5+.5*sin(q.x*56.+q.y*4.);
  vec3 velvet=mix(vec3(.17,.006,.028),vec3(.55,.028,.085),diffuse);
  velvet=mix(velvet,vec3(.56,.20,.14),smoothstep(.75,1.,q.y)*.36);
  velvet=mix(velvet,velvet.bgr,abs(hue-.5)*.35);
  vec3 c=velvet*(.66+.34*ribs)+vec3(.84,.38,.32)*(sheen*.5+rim*(.35+tre*.65));
  float edge=smoothstep(.94,1.,abs(q.x*2.-1.));c+=edge*vec3(.52,.19,.08)*(.25+tre*.7);
  gl_FragColor=vec4(c,1.);}`;

/** Pleated couture as a kinetic sculpture. Opening is an actual bass-driven
 * change of silhouette and depth, not a time animation with a brightness knob. */
export function buildVelvetBloom(T:any,renderer:any):SceneInst {
  const s=atelier(T,renderer),{scene,camera,own,mesh}=s;
  const materials:any[]=[];
  const petalG=own(new T.PlaneGeometry(1,1,64,64));
  for(let layer=0;layer<2;layer++)for(let i=0;i<(layer?7:11);i++){
    const n=layer?7:11,seed=i+layer*17;
    const m=own(new T.ShaderMaterial({side:T.DoubleSide,uniforms:{time:{value:0},bass:{value:0},mid:{value:0},tre:{value:0},hue:{value:.5},angle:{value:i/n*Math.PI*2+layer*.31},size:{value:layer?3.05:5.7},seed:{value:seed}},vertexShader:PETAL_VERTEX,fragmentShader:PETAL_FRAGMENT}));
    materials.push(m);const p=new T.Mesh(petalG,m);p.frustumCulled=false;p.position.z=layer*.65;scene.add(p);
  }
  const brass=own(new T.MeshStandardMaterial({color:0xb27844,metalness:.8,roughness:.28}));
  const heart=mesh(new T.IcosahedronGeometry(.46,2),brass);heart.position.z=1.9;
  const halo=mesh(new T.TorusGeometry(.63,.028,8,96),brass);halo.position.z=1.6;
  const plinth=own(new T.MeshStandardMaterial({color:0x15151d,metalness:.2,roughness:.45}));
  mesh(new T.CylinderGeometry(2.2,2.4,.4,64),plinth).position.set(0,-5.25,-.5);
  const stem=mesh(new T.CylinderGeometry(.075,.14,4.8,20),brass);stem.position.set(0,-2.7,-.8);
  const backdrop=mesh(new T.PlaneGeometry(100,70),own(new T.MeshStandardMaterial({color:0x211b25,roughness:.9})));backdrop.position.z=-5;
  return {scene,camera,cam:{target:[0,-.15,0],radius:22.5,pitch:8,yaw:-7,fov:43},grain:.0005,exposure:1.08,brightThreshold:1.1,
    update(t,a,spec){materials.forEach(m=>{const u=m.uniforms;u.time.value=t;u.bass.value=Math.min(1.35,a.bass);u.mid.value=a.mid;u.tre.value=a.tre;u.hue.value=spec.hue;});heart.rotation.z=t*.09+a.mid*.3;heart.scale.setScalar(.85+a.kick*.35);},
    bloom:a=>.14+a.tre*.14,dispose:s.dispose};
}

/** A hanging archive of optically patterned glass. Each page is a separate
 * rigid volume, with a coordinated analytic light projection on its plinth. */
export function buildPrismArchive(T:any,renderer:any):SceneInst {
  const s=atelier(T,renderer),{scene,camera,own,mesh}=s;
  const glassG=own(new T.BoxGeometry(2.7,6.4,.10));
  const edgesG=own(new T.EdgesGeometry(glassG));
  const edgeMat=own(new T.LineBasicMaterial({color:0xb9d6db,transparent:true,opacity:.62}));
  const metal=own(new T.MeshStandardMaterial({color:0x75888f,metalness:.88,roughness:.2}));
  const pages:{group:any;mat:any;wire:any;index:number}[]=[];
  for(let i=0;i<15;i++){
    const m=own(new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
      uniforms:{time:{value:0},mid:{value:0},tre:{value:0},hue:{value:.5},index:{value:i}},
      vertexShader:'varying vec2 q;varying vec3 n,w;void main(){q=uv;n=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader:`uniform float time,mid,tre,hue,index;varying vec2 q;varying vec3 n,w;
      void main(){float f=pow(1.-abs(dot(normalize(n),normalize(cameraPosition-w))),2.);
        float spectrum=q.x*.65+index*.067+hue*.3+mid*.12;
        vec3 c=.5+.5*cos(6.28318*(spectrum+vec3(0.,.33,.67)));
        float lines=pow(.5+.5*sin(q.y*180.+sin(q.x*9.+time*.3)*2.),18.);
        float border=1.-smoothstep(0.,.025,min(min(q.x,1.-q.x),min(q.y,1.-q.y)));
        float etched=step(.82,q.y)*(.5+.5*sin(q.x*160.));
        c=c*(.30+mid*.45)+vec3(.46,.65,.72)*(f*.45+lines*(.12+tre*.38)+border*.5+etched*.12);
        gl_FragColor=vec4(c,.22+f*.28+border*.35);}` }));
    const group=new T.Group();scene.add(group);group.add(new T.Mesh(glassG,m));group.add(new T.LineSegments(edgesG,edgeMat));
    // Header and foot keep each delicate page readable as an object.
    for(const y of [-3.25,3.25])mesh(new T.BoxGeometry(2.78,.035,.15),metal,group).position.y=y;
    const wire=mesh(new T.CylinderGeometry(.009,.009,2.4,5),metal);pages.push({group,mat:m,wire,index:i});
  }
  const base=own(new T.MeshStandardMaterial({color:0x101820,metalness:.65,roughness:.22}));
  mesh(new T.BoxGeometry(21,.5,9),base).position.y=-3.8;
  mesh(new T.BoxGeometry(21,.06,.09),metal).position.set(0,6,0);
  const floorMat=own(new T.ShaderMaterial({uniforms:{time:{value:0},bass:{value:0},tre:{value:0}},
    vertexShader:'varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 q;uniform float time,bass,tre;void main(){vec2 p=(q-.5)*vec2(21.,9.);
      float streak=pow(.5+.5*sin(p.x*(2.6-bass*.35)+p.y*.55+sin(time*.3)*.3),10.);
      float fade=exp(-p.y*p.y*.12)*(1.-smoothstep(7.5,10.5,abs(p.x)));
      vec3 col=.5+.5*cos(p.x*.6+vec3(0.,2.,4.));
      gl_FragColor=vec4(vec3(.007,.012,.018)+col*streak*fade*(.08+bass*.27+tre*.12),1.);}` }));
  const reflection=mesh(new T.PlaneGeometry(20.9,8.9),floorMat);reflection.rotation.x=-Math.PI/2;reflection.position.y=-3.535;
  const back=mesh(new T.PlaneGeometry(100,70),own(new T.MeshStandardMaterial({color:0x111b25,roughness:.75})));back.position.z=-7;
  return {scene,camera,cam:{target:[0,.4,0],radius:25,pitch:14,yaw:-13,fov:43},grain:.0005,exposure:1.03,brightThreshold:.7,
    update(t,a,spec){pages.forEach(({group,mat,wire,index})=>{
      const p=(index-7)/7;
      group.position.set(p*(4.3+a.bass*3.7),.24*Math.sin(index*.6+t*.4)*a.mid,-Math.cos(p*1.3)*1.4);
      group.rotation.y=p*(.25+a.bass*1.05)+Math.sin(t*.45+index*.7)*a.mid*.24;
      group.rotation.z=Math.sin(index*.45+t*.5)*a.tre*.035;
      wire.position.set(group.position.x,4.7,group.position.z);
      mat.uniforms.time.value=t;mat.uniforms.mid.value=a.mid;mat.uniforms.tre.value=a.tre;mat.uniforms.hue.value=spec.hue;
    });const u=floorMat.uniforms;u.time.value=t;u.bass.value=a.bass;u.tre.value=a.tre;edgeMat.opacity=.35+a.tre*.55;},
    bloom:a=>.25+a.tre*.25,dispose:s.dispose};
}
