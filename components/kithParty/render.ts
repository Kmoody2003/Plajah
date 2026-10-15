import {CHARACTERS, characterById, portrait} from './catalog';
import {type State, trackPoint, bumpers, TAU} from './engine';
export function loadPortraits() {const images=new Map<string,HTMLImageElement>();CHARACTERS.forEach(c=>{const im=new Image();im.src=portrait(c);images.set(c.id,im);});return images;}
const text=(c:CanvasRenderingContext2D,t:string,x:number,y:number,size=18,color='#f1e7ff')=>{c.fillStyle=color;c.font=`800 ${size}px "Trebuchet MS",sans-serif`;c.textAlign='center';c.fillText(t,x,y);};
function circle(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
function flower(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string){for(let i=0;i<5;i++)circle(c,x+Math.cos(i*TAU/5)*r*.55,y+Math.sin(i*TAU/5)*r*.55,r*.48,color);circle(c,x,y,r*.32,'#fff3bf');}
function diamond(c:CanvasRenderingContext2D,x:number,y:number,size:number,color:string){c.fillStyle=color;c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size*.7,y);c.lineTo(x,y+size);c.lineTo(x-size*.7,y);c.fill();c.fillStyle='#ffffff88';c.beginPath();c.moveTo(x,y-size);c.lineTo(x,y);c.lineTo(x-size*.7,y);c.fill();}
function avatar(c:CanvasRenderingContext2D,images:Map<string,HTMLImageElement>,id:string,x:number,y:number,size:number){const im=images.get(id);if(im?.complete&&im.naturalWidth)c.drawImage(im,x-size/2,y-size*.85,size,size);else circle(c,x,y,size*.3,characterById(id).color);}
function track(c:CanvasRenderingContext2D,width:number,color:string){c.beginPath();for(let i=0;i<=200;i++){const p=trackPoint(i/200);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);}c.closePath();c.lineWidth=width;c.strokeStyle=color;c.stroke();}

function drawRacket(c:CanvasRenderingContext2D,x:number,y:number,angle:number,accent:string,smash:boolean){
 c.save();
 c.translate(x,y);
 c.rotate(angle);
 // Grip & throat
 c.strokeStyle='#f5ead8';
 c.lineWidth=4;
 c.beginPath();c.moveTo(0,0);c.lineTo(18,-14);c.stroke();
 // Racket head hoop
 c.translate(28,-22);
 c.rotate(-0.6);
 c.fillStyle=smash?'rgba(255,210,70,0.45)':'rgba(255,255,255,0.22)';
 c.strokeStyle=smash?'#ffae00':accent;
 c.lineWidth=3.5;
 c.beginPath();c.ellipse(0,0,13,17,0,0,TAU);c.fill();c.stroke();
 // Strings
 c.strokeStyle='rgba(255,255,255,0.48)';
 c.lineWidth=1;
 for(let s=-8;s<=8;s+=4){
  c.beginPath();c.moveTo(s,-14);c.lineTo(s,14);c.stroke();
  c.beginPath();c.moveTo(-10,s);c.lineTo(10,s);c.stroke();
 }
 c.restore();
}

export function render(c:CanvasRenderingContext2D,s:State,images:Map<string,HTMLImageElement>,pressed:boolean[][]) {
 c.clearRect(0,0,960,560);
 if(s.game==='circuit') {
  c.fillStyle='#a6c88a';c.fillRect(0,0,960,560);
  for(let i=0;i<55;i++){const x=(i*193)%960,y=(i*137)%560;circle(c,x,y,3,'#87b374');}
  track(c,134,'#7f9e69');track(c,121,'#f9f2d9');track(c,109,'#d98669');track(c,96,'#656b70');
  c.setLineDash([12,14]);track(c,2,'#b9bcac');c.setLineDash([]);
  for(const t of [.17,.49,.78]) {const p=trackPoint(t),q=trackPoint(t+.002);c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(q.y-p.y,q.x-p.x));c.fillStyle='#f8c868';c.fillRect(-15,-23,30,46);text(c,'»',0,10,30,'#7e5e31');c.restore();}
  const start=trackPoint(0);for(let y=0;y<6;y++)for(let x=0;x<2;x++){c.fillStyle=(x+y)%2?'#f7f1de':'#323b42';c.fillRect(start.x-10+x*10,start.y-48+y*16,10,16);}
  circle(c,460,290,83,'#8bb8a5');circle(c,460,290,69,'#a6d6cd');
  text(c,'KITH',480,241,39,'#f8f3dc');text(c,'MEADOW CIRCUIT',480,266,12,'#385c47');
  for(let i=0;i<12;i++){const a=i*2.4,x=480+Math.cos(a)*168,y=280+Math.sin(a)*68;flower(c,x,y,8,i%2?'#f4dc83':'#edd1bd');}
  for(const [x,y] of [[60,58],[888,67],[72,482],[882,490],[395,292],[555,307]]){circle(c,x,y+12,24,'#769b67');circle(c,x,y,28,'#4e8861');circle(c,x-7,y-7,17,'#6fa77c');}
  [...s.players].sort((a,b)=>a.y-b.y).forEach(p=>{const pos=trackPoint(p.progress,p.lane),ahead=trackPoint(p.progress+.003,p.lane),angle=Math.atan2(ahead.y-pos.y,ahead.x-pos.x);c.save();c.translate(pos.x,pos.y);c.rotate(angle);if(p.boost>0){c.fillStyle='#ffdc79';c.beginPath();c.moveTo(-12,-9);c.lineTo(-40-Math.sin(s.time*50)*8,0);c.lineTo(-12,9);c.fill();}c.fillStyle='#27343b';c.fillRect(-14,-20,12,9);c.fillRect(-14,11,12,9);c.fillRect(7,-20,12,9);c.fillRect(7,11,12,9);c.fillStyle=characterById(p.character).accent;c.beginPath();c.roundRect(-20,-14,44,28,10);c.fill();c.restore();avatar(c,images,p.character,pos.x,pos.y+5,46);if(p.human){text(c,`P${s.players.indexOf(p)+1}`,pos.x,pos.y-40,12);if(p.feedbackTime>0)text(c,p.feedback,pos.x,pos.y-59,13,'#9b432b');}});
 } else if(s.game==='crystals') {
  c.fillStyle='#1c0c2c';c.fillRect(0,0,960,560);
  c.fillStyle='#160a22';c.beginPath();c.roundRect(30,50,900,470,40);c.fill();c.fillStyle='#342044';c.beginPath();c.roundRect(40,40,880,470,40);c.fill();
  for(let i=0;i<60;i++){circle(c,65+(i*139)%830,70+(i*97)%410,2,'#553563');}
  text(c,'THE SPARKLE COMMONS',480,73,13,'#bc9ed2');
  s.crystals.filter(x=>x.active).forEach((p,i)=>{circle(c,p.x,p.y+10,12,'#432052');diamond(c,p.x,p.y+Math.sin(s.time*3+i)*3,13,i%3?'#9c7cba':'#e3a644');});
  bumpers(s.time).forEach(b=>{circle(c,b.x,b.y+8,24,'#e3c0a4');circle(c,b.x,b.y,24,'#eaa16d');circle(c,b.x-7,b.y-6,8,'#ffd298');text(c,'×',b.x,b.y+9,28,'#925d4b');});
  [...s.players].sort((a,b)=>a.y-b.y).forEach(p=>{if(p.invincible>0){c.strokeStyle='#b5d783';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,32,0,TAU);c.stroke();}avatar(c,images,p.character,p.x,p.y+15+Math.sin(s.time*8)*2,65);text(c,p.human?`P${s.players.indexOf(p)+1}`:characterById(p.character).name,p.x,p.y-49,12);if(p.feedbackTime>0)text(c,p.feedback,p.x,p.y-67,19,p.feedback==='+1'?'#438274':'#b45b45');});
 } else if(s.game==='tennis') {
  // ==========================================================================
  // KITH TENNIS — GRAND STADIUM COURT RALLY
  // ==========================================================================
  const b=s.tennis;
  // Stadium surround & royal clay apron
  c.fillStyle='#14243b';c.fillRect(0,0,960,560);
  c.fillStyle='#1f5c58';c.beginPath();c.roundRect(36,28,888,504,34);c.fill();
  c.fillStyle='#297a74';c.beginPath();c.roundRect(52,40,856,480,28);c.fill();

  // Perspective Stadium Court (trapezoid hardcourt with crisp white lines)
  c.save();
  c.fillStyle='#1f6eb5';
  c.beginPath();
  c.moveTo(205,72);c.lineTo(755,72);c.lineTo(820,508);c.lineTo(140,508);c.closePath();
  c.fill();
  // Inner singles/service court
  c.fillStyle='#2884d4';
  c.beginPath();
  c.moveTo(245,72);c.lineTo(715,72);c.lineTo(770,508);c.lineTo(190,508);c.closePath();
  c.fill();

  // Crisp white court markings
  c.strokeStyle='#f5fbff';c.lineWidth=3;
  // Outer doubles boundary
  c.beginPath();c.moveTo(205,72);c.lineTo(755,72);c.lineTo(820,508);c.lineTo(140,508);c.closePath();c.stroke();
  // Singles sidelines
  c.beginPath();c.moveTo(245,72);c.lineTo(190,508);c.moveTo(715,72);c.lineTo(770,508);c.stroke();
  // Service lines (top & bottom) and center service line
  c.beginPath();
  c.moveTo(224,174);c.lineTo(736,174);
  c.moveTo(208,392);c.lineTo(752,392);
  c.moveTo(480,174);c.lineTo(480,392);
  c.stroke();
  // Center baseline ticks
  c.beginPath();c.moveTo(480,72);c.lineTo(480,82);c.moveTo(480,498);c.lineTo(480,508);c.stroke();
  c.restore();

  // Stadium header & live rally counter
  text(c,'GRAND KITH STADIUM · COURT RALLY',480,58,13,'#b8f2e6');
  if(b.rally>0){
   text(c,`RALLY ×${b.rally}`,845,62,18,b.shotType==='smash'?'#ffcf48':'#ffffff');
  }

  // Bounce ring ripple on court
  if(b.bounceTime>0){
   c.strokeStyle=`rgba(255,245,160,${b.bounceTime*2.2})`;
   c.lineWidth=3;
   c.beginPath();c.ellipse(b.bounceX,b.bounceY,(0.4-b.bounceTime)*48,(0.4-b.bounceTime)*24,0,0,TAU);c.stroke();
  }

  // Target Star Zone (shows where power shots are headed)
  const targetY=b.vy<0?145:425;
  const targetX=Math.max(210,Math.min(750,b.x+b.vx*0.35));
  c.strokeStyle=b.shotType==='smash'?'rgba(255,190,40,0.65)':'rgba(180,245,255,0.45)';
  c.lineWidth=2.5;
  c.beginPath();c.ellipse(targetX,targetY,24+Math.sin(s.time*10)*4,12+Math.sin(s.time*10)*2,0,0,TAU);c.stroke();
  text(c,'✦',targetX,targetY+5,14,b.shotType==='smash'?'#ffd24d':'#bef5ff');

  // Render Top-Court Players (behind the net: y < 278)
  const drawCourtPlayer=(p:typeof s.players[0])=>{
   const idx=s.players.indexOf(p);
   const ch=characterById(p.character);
   circle(c,p.x,p.y+10,22,'rgba(12,26,44,0.38)');
   if(p.boost>0||p.shotPower>1.1){
    c.strokeStyle=p.boost>0?'#ffcf48':ch.accent;
    c.lineWidth=3;
    c.beginPath();c.ellipse(p.x,p.y+8,30,15,0,0,TAU);c.stroke();
   }
   avatar(c,images,p.character,p.x,p.y+14+Math.sin(s.time*9+idx)*2,64);
   const swingAng=p.swingTimer>0?-1.2+Math.sin((0.32-p.swingTimer)*18)*1.6:Math.sin(s.time*4+idx)*0.18;
   drawRacket(c,p.x+(idx%2===0?22:-22),p.y-8,swingAng,ch.accent,p.swingTimer>0&&b.shotType==='smash');
   text(c,p.human?`P${idx+1} · ${ch.name}`:ch.name,p.x,p.y-48,12,'#eff8ff');
   if(p.feedbackTime>0) text(c,p.feedback,p.x,p.y-66,17,p.feedback.includes('SMASH')||p.feedback.includes('WINNER')?'#ffd24d':'#9ef7d6');
  };

  s.players.filter(p=>p.y<278).sort((a,b2)=>a.y-b2.y).forEach(drawCourtPlayer);

  // Tennis Net across center court (y = 278)
  c.fillStyle='#16283d';
  c.fillRect(156,252,10,32);c.fillRect(794,252,10,32);
  c.fillStyle='rgba(20,38,62,0.52)';
  c.fillRect(164,258,632,22);
  c.strokeStyle='rgba(255,255,255,0.35)';c.lineWidth=1;
  for(let nx=172;nx<792;nx+=14){c.beginPath();c.moveTo(nx,258);c.lineTo(nx,280);c.stroke();}
  c.fillStyle='#ffffff';
  c.fillRect(160,254,640,5);

  // Render Tennis Ball Shadow & 3D Arcing Ball + Comet Trail
  circle(c,b.x,b.y,Math.max(4,10-b.z*0.08),'rgba(10,20,35,0.45)');
  b.trail.forEach((tp,ti)=>{
   const alpha=(ti+1)/b.trail.length*0.55;
   circle(c,tp.x,tp.y-tp.z*0.85,3+ti*0.5,b.shotType==='smash'?`rgba(255,165,30,${alpha})`:`rgba(195,255,90,${alpha})`);
  });
  const ballScreenY=b.y-b.z*0.85;
  circle(c,b.x,ballScreenY,b.shotType==='smash'?11:9,b.shotType==='smash'?'#ffae00':'#d8ff3e');
  circle(c,b.x-2.5,ballScreenY-2.5,3.5,'#ffffff');

  // Render Bottom-Court Players (in front of the net: y >= 278)
  s.players.filter(p=>p.y>=278).sort((a,b2)=>a.y-b2.y).forEach(drawCourtPlayer);
 } else {
  c.fillStyle='#230e30';c.fillRect(0,0,960,560);
  for(let i=0;i<12;i++)flower(c,25+(i*173)%920,30+(i*131)%510,18,'#662b58');
  const humans=s.players.filter(p=>p.human);
  humans.forEach((p,pi)=>{const left=humans.length===1?290:pi*470+64;const width=humans.length===1?380:360;const laneW=width/4;
   c.fillStyle='#3b194b';c.beginPath();c.roundRect(left-12,35,width+24,470,25);c.fill();
   for(let lane=0;lane<4;lane++){const x=left+laneW*(lane+.5);c.strokeStyle='#633764';c.lineWidth=2;c.beginPath();c.moveTo(x,62);c.lineTo(x,463);c.stroke();circle(c,x,448,25,pressed[pi]?.[lane]?'#ff8c00':'#6a3767');c.strokeStyle='#c76fa2';c.lineWidth=2;c.beginPath();c.arc(x,448,25,0,TAU);c.stroke();text(c,(pi===0?['1','2','3','4']:['7','8','9','0'])[lane],x,455,22,'#f8e6fb');}
   s.notes.filter(n=>!n.judged[pi]&&n.time-s.time<2.5&&n.time-s.time>-.2).forEach(n=>flower(c,left+laneW*(n.lane+.5),448-(n.time-s.time)*160,20,['#b286bd','#dea061','#7daf93','#749bb6'][n.lane]));
   text(c,`${p.combo} COMBO`,left+width/2,535,21,'#ddadf0');if(p.feedbackTime>0)text(c,p.feedback,left+width/2,310,28,'#ffb35a');
   if(humans.length===1){avatar(c,images,p.character,155,345,165);text(c,'FIND YOUR FLOW',155,388,13,'#a2765e');avatar(c,images,'chora',802,345+Math.sin(s.time*11)*5,175);}
  });
 }
 if(s.time<0) {c.fillStyle='#252a3d55';c.fillRect(0,0,960,560);circle(c,480,280,67,'#fff4dc');text(c,String(Math.ceil(-s.time)),480,300,61,'#28352c');}
}
