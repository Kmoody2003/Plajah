import * as THREE from 'three';
import { Player3D } from '../types';
export const TARGET_COLORS = ['#38bdf8','#fbbf24','#f472b6','#34d399'];
export function orderedTargets(players:Player3D[]) {
  return players.filter(p=>p.route).sort((a,b)=>Number(a.route!.targetKey)-Number(b.route!.targetKey));
}
export class RouteOverlay {
  readonly group=new THREE.Group();
  build(players:Player3D[]) {
    this.group.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose();if(m.material)(m.material as THREE.Material).dispose();});
    this.group.clear();
    orderedTargets(players).forEach(p=>{
      const points=[new THREE.Vector3(p.x,.09,p.z),...p.route!.waypoints.map(w=>new THREE.Vector3(w.x,.09,w.z))];
      const mat=new THREE.MeshBasicMaterial({color:TARGET_COLORS[Number(p.route!.targetKey)-1],transparent:true,opacity:.7,depthWrite:false});
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i];if(a.distanceTo(b)<.01)continue;
        const line=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,a.distanceTo(b),6),mat.clone());
        line.position.copy(a).add(b).multiplyScalar(.5);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
        line.userData.target=p.id;this.group.add(line);
      }
      if(points.length>1) {
        const end=points.at(-1)!,prev=points.at(-2)!;
        const arrow=new THREE.Mesh(new THREE.ConeGeometry(.42,1,3),mat);arrow.position.copy(end);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(prev).normalize());arrow.userData.target=p.id;this.group.add(arrow);
      }else mat.dispose();
    });
  }
  update(selected:string|undefined,visible:boolean) {
    this.group.visible=visible;
    this.group.children.forEach(o=>{((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity=o.userData.target===selected?1:.45;});
  }
}
