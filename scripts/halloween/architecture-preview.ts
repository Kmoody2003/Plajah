import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildResidentialCastle } from '../../components/taleo/ravencrest/buildResidentialCastle';
import { RESIDENTIAL_FLOORS, RESIDENTIAL_WORLD_ROOMS, residentialSupportAt, slideCastleCollisions, type CastleCollider } from '../../services/halloween/residentialCastleLayout';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b141d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 400);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
const materials = {
  stone: new THREE.MeshStandardMaterial({ color: '#81909a', roughness: 0.92 }),
  floor: new THREE.MeshStandardMaterial({ color: '#3f515d', roughness: 0.85, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: '#4a3930', roughness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: '#262d32', roughness: 0.65 }),
  carpet: new THREE.MeshStandardMaterial({ color: '#542d36', roughness: 1 }),
};
const colliders: CastleCollider[] = [];
const castle = buildResidentialCastle(materials, (x,y,z,w,h,d) => colliders.push({ minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2 }));
scene.add(castle.group);
const labels: THREE.Object3D[] = [];
for (const room of RESIDENTIAL_WORLD_ROOMS) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(8,18,25,.86)'; context.fillRect(0,0,768,96);
  context.fillStyle = '#eee8d9'; context.font = '32px Georgia'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(room.name,384,48,740);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(10,1.25),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  label.rotation.x = -Math.PI/2;
  label.position.set(room.center[0],room.elevationY+0.08,room.center[2]);
  castle.floorGroups[room.floorIndex].add(label); labels.push(label);
}
scene.add(new THREE.HemisphereLight('#d6e8f4', '#283038', 2));
const key = new THREE.DirectionalLight('#e4edf3', 3.2);
key.position.set(-35, 70, -35); key.target.position.set(0,5,-58);
key.castShadow = true; key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera, { left:-65,right:65,top:65,bottom:-65,near:1,far:160 });
key.shadow.normalBias = 0.03;
scene.add(key, key.target);
const selector = document.querySelector<HTMLSelectElement>('#floor')!;
selector.innerHTML = RESIDENTIAL_FLOORS.map(floor => `<option value="${floor.index}">${floor.name}</option>`).join('');
const status = document.querySelector<HTMLElement>('#status')!;
const location = document.querySelector<HTMLElement>('#location')!;
let selectedFloor = 1, walking = false;
const player = { x:0, y:0, z:-57, yaw:0 };
const keys = new Set<string>();
function cutaway(index: number) {
  selectedFloor = index; walking = false; orbit.enabled = true;
  selector.value = String(index);
  castle.exterior.visible = false;
  labels.forEach(label=>label.visible=true);
  castle.floorGroups.forEach((group,i) => group.visible = i === index);
  castle.stairGroups.forEach(group => group.visible = group.userData.fromFloor === index || group.userData.toFloor === index);
  const floor = RESIDENTIAL_FLOORS[index];
  camera.position.set(38, floor.elevationY + 49, -15);
  orbit.target.set(0, floor.elevationY, -58); orbit.update();
  status.textContent = `${floor.name} · Construction cutaway`;
  location.textContent = RESIDENTIAL_WORLD_ROOMS.filter(room => room.floorIndex === index).map(room => room.name).join(' · ');
}
selector.onchange = () => cutaway(Number(selector.value));
document.querySelector<HTMLButtonElement>('#plan')!.onclick = () => {
  cutaway(selectedFloor);
  camera.position.set(0, RESIDENTIAL_FLOORS[selectedFloor].elevationY + 78, -57.99); orbit.update();
};
document.querySelector<HTMLButtonElement>('#overview')!.onclick = () => {
  walking = false; orbit.enabled = true;
  labels.forEach(label=>label.visible=false);
  castle.exterior.visible = true; castle.floorGroups.forEach(group => group.visible = true); castle.stairGroups.forEach(group => group.visible = true);
  camera.position.set(72,54,16); orbit.target.set(0,7,-58); orbit.update();
  status.textContent = 'Whole castle · Initial massing'; location.textContent = 'Residential footprint, five levels, four tower masses and projecting observatory.';
};
document.querySelector<HTMLButtonElement>('#walk')!.onclick = () => {
  walking = true; orbit.enabled = false;
  labels.forEach(label=>label.visible=false);
  castle.exterior.visible = false; castle.floorGroups.forEach(group => group.visible = true); castle.stairGroups.forEach(group => group.visible = true);
  Object.assign(player, { x:0, z:-57, y:RESIDENTIAL_FLOORS[selectedFloor].elevationY, yaw:0 });
  status.textContent = 'Walking · W/S move, A/D turn';
};
document.querySelector<HTMLButtonElement>('#art')!.onclick = () => window.open(window.location.protocol === 'file:'
  ? new URL('../../public/models/halloween/ravencrest/floorplan_blueprint_2.jpg',window.location.href).href
  : '/models/halloween/ravencrest/floorplan_blueprint_2.jpg', '_blank');
addEventListener('keydown', event => { if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(event.key.toLowerCase())) event.preventDefault(); keys.add(event.key.toLowerCase()); });
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => { renderer.setSize(innerWidth,innerHeight); camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); });
cutaway(1);
let previous = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now-previous)/1000,0.04); previous=now;
  if (walking) {
    player.yaw += ((keys.has('a')||keys.has('arrowleft')?1:0)-(keys.has('d')||keys.has('arrowright')?1:0))*dt*1.8;
    const move = ((keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0))*dt*5;
    const [x,z] = slideCastleCollisions(colliders,player.x-Math.sin(player.yaw)*move,player.z-Math.cos(player.yaw)*move,player.y);
    const support = residentialSupportAt(x,z,player.y);
    if (support) Object.assign(player,{x,z,y:support.y});
    camera.position.set(player.x,player.y+1.7,player.z);
    camera.lookAt(player.x-Math.sin(player.yaw)*5,player.y+1.7,player.z-Math.cos(player.yaw)*5);
    const room = RESIDENTIAL_WORLD_ROOMS.find(room => Math.abs(room.elevationY-player.y)<1.2 && player.x>=room.bounds.minX && player.x<=room.bounds.maxX && player.z>=room.bounds.minZ && player.z<=room.bounds.maxZ);
    location.textContent = room ? `${room.floorLabel} · ${room.name}` : 'Stairs / shared circulation';
  } else orbit.update();
  renderer.render(scene,camera);
});
// Read-only state is exposed for automated architectural review, not gameplay.
Object.assign(window,{ravencrestReview:{castle,player,cutaway}});
