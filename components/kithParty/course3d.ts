import * as T from 'three';

// A continuous, arc-length sampled ribbon: sweeping garden turns, a waterfall
// climb, an elevated crest bridge and a descending return to the starting grove.
const route=new T.CatmullRomCurve3([
 new T.Vector3(0,3,-58),new T.Vector3(43,5,-54),new T.Vector3(69,12,-20),
 new T.Vector3(60,20,20),new T.Vector3(27,24,45),new T.Vector3(4,18,62),
 new T.Vector3(-34,11,59),new T.Vector3(-69,7,28),new T.Vector3(-61,4,-6),
 new T.Vector3(-42,2,-28),new T.Vector3(-29,2,-51),
],true,'catmullrom',.4);
route.arcLengthDivisions=2400;

export function trackBanking(progress:number):number{
 const t=((progress%1)+1)%1;
 const dt=0.003;
 const t1=((t-dt)%1+1)%1, t2=(t+dt)%1;
 const tan1=route.getTangentAt(t1), tan2=route.getTangentAt(t2);
 // Horizontal cross product indicates turning direction and rate
 const turn=(tan2.x*tan1.z - tan2.z*tan1.x)/dt;
 return Math.max(-0.24, Math.min(0.24, -turn * 0.42));
}

export function trackFrame(progress:number,lane=0){
 const t=((progress%1)+1)%1;
 const center=route.getPointAt(t);
 const tangent=route.getTangentAt(t).normalize();
 const bank=trackBanking(t);
 const hRight=new T.Vector3(tangent.z,0,-tangent.x).normalize();
 const right=new T.Vector3(
  hRight.x*Math.cos(bank),
  Math.sin(bank),
  hRight.z*Math.cos(bank)
 ).normalize();
 const normal=new T.Vector3().crossVectors(right,tangent).normalize();
 const position=center.clone().addScaledVector(right,lane*0.18);
 return {position,tangent,right,normal,bankAngle:bank,center};
}

export function worldPoint(progress:number,lane=0,offset=0):T.Vector3{
 const frame=trackFrame(progress,lane);
 if(offset!==0) frame.position.addScaledVector(frame.normal,offset);
 return frame.position;
}
