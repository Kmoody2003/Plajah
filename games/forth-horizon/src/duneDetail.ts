import * as THREE from 'three';

/** Marram/beach-grass clumps on sandy coastal ground. Does not change drivable heights. */
export async function duneDetail(options: {
  width: number; depth: number; albedo: string;
  ground: (x: number, z: number) => number;
  clear: (x: number, z: number) => boolean;
}): Promise<THREE.Group> {
  const image = new Image(); image.src = options.albedo; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, 512, 512);
  const pixels = context.getImageData(0, 0, 512, 512).data;
  let seed = 9137;
  const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const placements: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < 90000 && placements.length < 12000; i++) {
    const x = (random() - 0.5) * options.width, z = (random() - 0.5) * options.depth;
    if (x > -2500) continue; // the western dune coast, never downtown or the harbor
    const u = Math.floor((x / options.width + 0.5) * 511), v = Math.floor((z / options.depth + 0.5) * 511), index = (v * 512 + u) * 4;
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    if (r < 100 || r < g * 1.025 || g < b * 1.08 || r - b < 20) continue;
    const y = options.ground(x, z);
    if (y < 2 || !options.clear(x, z)) continue;
    const slope = Math.max(Math.abs(options.ground(x + 1, z) - y), Math.abs(options.ground(x, z + 1) - y));
    if (slope > 0.75 || Math.sin(x * 0.024) * Math.cos(z * 0.031) < -0.15) continue;
    const scale = 0.5 + random() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
    placements.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.035, z), q, new THREE.Vector3(scale, scale, scale)));
    colors.push(new THREE.Color().setRGB(0.27 + random() * 0.12, 0.29 + random() * 0.1, 0.12 + random() * 0.09));
  }
  const positions: number[] = [], indices: number[] = [];
  for (let blade = 0; blade < 9; blade++) {
    const angle = blade * 2.399, height = 0.45 + random() * 0.5, bend = 0.16 + random() * 0.25;
    const dx = Math.cos(angle), dz = Math.sin(angle), ox = dx * random() * 0.13, oz = dz * random() * 0.13, base = positions.length / 3;
    for (let j = 0; j <= 3; j++) {
      const t = j / 3, w = 0.019 * (1 - t) + 0.001, x = ox + dx * bend * t * t, z = oz + dz * bend * t * t;
      positions.push(x - dz * w, height * t, z + dx * w, x + dz * w, height * t, z - dx * w);
      if (j < 3) { const k = base + j * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      float duneFade = smoothstep(180.0, 320.0, length(vViewPosition));
      float duneNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (duneNoise < duneFade) discard;`);
  };
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colors[i]); });
  mesh.computeBoundingSphere();
  const group = new THREE.Group(); group.name = 'Coastal marram grass'; group.add(mesh);
  group.userData.clumps = placements.length;
  return group;
}
