/** Simplified grounded-player catch model; not a full foot-contact/officiating simulation. */
export function resolveCatch(ball:{x:number;y:number;z:number},receiver:{x:number;z:number},defenders:{x:number;z:number}[],width:number) {
  const inbounds=(p:{x:number;z:number})=>Math.abs(p.x)<=width/2-.25 && p.z>=-59.75 && p.z<=59.75;
  if(!inbounds(ball)||ball.y<.3||ball.y>3.1) return 'INCOMPLETE' as const;
  const receiverDistance=Math.hypot(ball.x-receiver.x,ball.z-receiver.z);
  const defenderDistance=Math.min(...defenders.filter(inbounds).map(d=>Math.hypot(ball.x-d.x,ball.z-d.z)));
  if(defenderDistance<.85 && defenderDistance+.25<receiverDistance) return 'INTERCEPTION' as const;
  if(!inbounds(receiver)||receiverDistance>1.65) return 'INCOMPLETE' as const;
  if(defenderDistance<.7 && receiverDistance>.7) return 'INCOMPLETE' as const;
  return 'COMPLETE' as const;
}
