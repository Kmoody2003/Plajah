import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
const root='/firstlight/assets/';
const maps=new Map<string,THREE.Texture>();
export function pbrMap(kind:'grass'|'fabric',channel:string,repeat=3) {
  const key=kind+channel;
  if(maps.has(key))return maps.get(key)!;
  const name=kind==='grass'?'Grass004':'Fabric030';
  const map=new THREE.TextureLoader().load(`${root}${kind}/${name}_1K-JPG_${channel}.jpg`);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat);map.anisotropy=8;
  if(channel==='Color')map.colorSpace=THREE.SRGBColorSpace;
  maps.set(key,map);return map;
}
export function applyGrassPBR(material:THREE.MeshStandardMaterial) {
  const color=pbrMap('grass','Color',1);
  material.normalMap=pbrMap('grass','NormalGL',35);material.normalMap.repeat.set(35,78);
  material.normalScale.set(.55,.55);
  material.roughnessMap=pbrMap('grass','Roughness',35);material.roughnessMap.repeat.set(35,78);
  material.bumpMap=null;material.color.setHex(0xffffff);
  material.onBeforeCompile=shader=>{
    shader.uniforms.grassAlbedo={value:color};
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.78 + roughnessFactor * 0.2, 0.78, 1.0);');
    shader.fragmentShader='uniform sampler2D grassAlbedo;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      // Paint remains from the regulation field atlas; only green turf receives the tiled albedo.
      if(diffuseColor.g>diffuseColor.r*1.25 && diffuseColor.g>diffuseColor.b*1.15) {
        vec3 grass=texture2D(grassAlbedo,vMapUv*vec2(35.0,78.0)).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,grass*mix(0.75,0.9,step(0.5,fract(vMapUv.y*12.0))),0.88);
      }
    `);
  };
  material.customProgramCacheKey=()=> 'firstlight-grass-pbr-v1';material.needsUpdate=true;
}
export async function loadStadiumEnvironment(renderer:THREE.WebGLRenderer,scene:THREE.Scene) {
  const hdr=await new RGBELoader().loadAsync(root+'stadium-sky.hdr');
  const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromEquirectangular(hdr);
  hdr.dispose();pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=.45;
  return environment;
}
