import * as THREE from 'three';

/** Yard-scale open-air bowl. Repeated seats and structural members are instanced. */
export function buildStadiumArchitecture(group: THREE.Group): THREE.Vector3[] {
  const concrete = new THREE.MeshStandardMaterial({ color: '#66717c', roughness: .94 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c6cbd1', metalness: .72, roughness: .34 });
  const glass = new THREE.MeshStandardMaterial({ color: '#253d50', metalness: .65, roughness: .16 });
  const spectators: THREE.Vector3[] = [];
  const point = (a: number, offset: number, y: number) => new THREE.Vector3(
    Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), .55) * (35 + offset), y,
    Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), .55) * (69 + offset));
  const ring = (inner: number, outer: number, y: number, material: THREE.Material, rise = 0) => {
    const vertices: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 192; i++) {
      const a = i / 192 * Math.PI * 2;
      vertices.push(...point(a, inner, y).toArray(), ...point(a, outer, y + rise).toArray());
      if (i < 192) { const n = i * 2; indices.push(n, n+2, n+1, n+1, n+2, n+3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; group.add(mesh);
  };
  const seatMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let tier = 0; tier < 3; tier++) {
    const base = tier * 14, elevation = 2 + tier * 10;
    for (let row = 0; row < 12; row++) {
      const offset = base + row * .95, y = elevation + row * .62;
      ring(offset, offset + .95, y, concrete);
      ring(offset, offset + .01, y - .62, concrete, .62);
      for (let j = 0; j < 512; j++) {
        if (j % 32 < 3) continue; // radial circulation aisles
        const p = point(j / 512 * Math.PI * 2, offset + .48, y + .3);
        dummy.position.copy(p); dummy.lookAt(0, p.y, 0); dummy.updateMatrix(); seatMatrices.push(dummy.matrix.clone());
        if ((j + row) % 3 !== 0) spectators.push(p.clone().add(new THREE.Vector3(0,.55,0)));
      }
    }
    ring(base + 11.5, base + 14, elevation + 7, concrete);
    ring(base + 12, base + 12.02, elevation + 7.1, glass, 2.1);
    ring(base, base + .03, elevation - .6, new THREE.MeshBasicMaterial({ color: tier === 1 ? '#56a6c9' : '#806ba0' }), .55);
  }
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(.58,.5,.58), new THREE.MeshStandardMaterial({ color: '#263a51', roughness: .7 }), seatMatrices.length);
  seatMatrices.forEach((m,i) => seats.setMatrixAt(i,m)); group.add(seats);
  ring(29, 49, 35, new THREE.MeshStandardMaterial({ color: '#c4c8cc', side: THREE.DoubleSide, metalness: .45, roughness: .5 }), 2);
  const beams: THREE.Matrix4[] = [];
  const beam = (a: THREE.Vector3,b: THREE.Vector3) => {
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize());
    dummy.scale.set(.22,a.distanceTo(b),.22); dummy.updateMatrix(); beams.push(dummy.matrix.clone());
  };
  for (let i = 0; i < 64; i++) {
    const a = i/64*Math.PI*2;
    beam(point(a,46,0),point(a,46,38));
    beam(point(a,46,38),point(a,28,34.7));
    beam(point(a,46,29),point(a,28,34.7));
    beam(point(a,46,37),point(a+Math.PI/32,46,29));
  }
  const trusses = new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,6), steel, beams.length);
  beams.forEach((m,i)=>trusses.setMatrixAt(i,m)); group.add(trusses);
  // Field apron, padded perimeter and team benches.
  ring(-4,0,.015,new THREE.MeshStandardMaterial({color:'#414b4b',roughness:1}));
  ring(0,.04,.2,new THREE.MeshStandardMaterial({color:'#162532',roughness:.85}),1.3);
  for (const side of [-1,1]) for(let i=0;i<5;i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1,.55,5),steel);
    bench.position.set(side*30,.6,(i-2)*8); group.add(bench);
  }
  return spectators;
}
