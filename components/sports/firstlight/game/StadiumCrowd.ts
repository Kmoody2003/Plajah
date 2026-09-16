import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Seated human silhouettes, four shared draws, with animation entirely on the GPU. */
export class StadiumCrowd {
  readonly group = new THREE.Group();
  private time = {value:0};
  private energy = {value:0};
  constructor(seats: THREE.Vector3[]) {
    seats=seats.filter((_,i)=>i%2===0); // Keep detailed silhouettes within the browser geometry budget.
    const piece = (g:THREE.BufferGeometry,x:number,y:number,z:number,sx=1,sy=1,sz=1) => {
      g.scale(sx,sy,sz);g.translate(x,y,z);return g;
    };
    const shirt = [piece(new THREE.CylinderGeometry(.21,.16,.49,8),0,.35,0,1,1,.7)];
    for(const side of [-1,1]) shirt.push(piece(new THREE.CapsuleGeometry(.075,.3,2,6),side*.23,.27,.04));
    const trousers:THREE.BufferGeometry[]=[];
    for(const side of [-1,1]) {
      trousers.push(piece(new THREE.CapsuleGeometry(.095,.24,2,6),side*.11,-.01,.14,1,.7,1.7));
      trousers.push(piece(new THREE.CylinderGeometry(.08,.06,.36,6),side*.11,-.25,.3));
      trousers.push(piece(new THREE.BoxGeometry(.14,.09,.25),side*.11,-.46,.35));
    }
    const skin=[piece(new THREE.SphereGeometry(.125,6,4),0,.76,.025,.85,1.18,.93),piece(new THREE.CylinderGeometry(.065,.07,.14,6),0,.61,0)];
    for(const side of [-1,1]) skin.push(piece(new THREE.SphereGeometry(.07,6,4),side*.23,.045,.11,1,.8,1.4));
    const hair=[piece(new THREE.SphereGeometry(.127,6,3,0,Math.PI*2,0,Math.PI*.56),0,.79,.015,.87,1.05,1)];
    const palettes=[['#302d48','#535964','#18434f','#8b8990','#60364c','#252a32','#8b695c'],['#232b36','#36404a','#49464a'],['#d6a17f','#a96e4e','#714832','#e2b899','#4d3024'],['#231c1a','#4e3827','#746452','#a39d93']];
    [shirt,trousers,skin,hair].forEach((parts,part)=>{
      const geometry=mergeGeometries(parts)!; parts.forEach(g=>g.dispose());
      const material=new THREE.MeshStandardMaterial({roughness:part===2?.83:.98});
      material.onBeforeCompile=shader=>{
        shader.uniforms.crowdTime=this.time;shader.uniforms.crowdEnergy=this.energy;
        shader.vertexShader='uniform float crowdTime; uniform float crowdEnergy;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float phase=instanceMatrix[3].x*1.73+instanceMatrix[3].z*2.19;
          float upper=smoothstep(-0.05,0.7,position.y);
          transformed.x+=sin(crowdTime*1.3+phase)*0.025*upper;
          transformed.y+=max(0.0,sin(crowdTime*3.0+phase))*crowdEnergy*0.12*upper;
        `);
      };
      material.customProgramCacheKey=()=> 'firstlight-seated-crowd-v1';
      const mesh=new THREE.InstancedMesh(geometry,material,seats.length);
      const dummy=new THREE.Object3D(); const color=new THREE.Color();
      seats.forEach((p,i)=>{
        const hash=((Math.imul(i+1,1664525)+1013904223)>>>0);
        dummy.position.copy(p); dummy.position.y-=.1;
        dummy.scale.setScalar(.92+(hash%17)/100);dummy.lookAt(0,p.y-.1,0);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,color.set(palettes[part][(hash>>>8)%palettes[part].length]));
      });
      mesh.computeBoundingSphere();this.group.add(mesh);
    });
  }
  update(time:number,excitement:number) {this.time.value=time;this.energy.value=Math.max(0,excitement-1);}
}
