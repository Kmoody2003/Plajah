// Equal topology lets every ornament transform continuously into every other seed.
export const DECO_SEEDS=['Solar Palace','Gilded Crown','Peacock Court','Lotus Pool','Cathedral Gates','Emerald Arcade','Diamond Cascade','Ziggurat City','Chevron Rain','Scarab Wings','Papyrus Garden','Fountain Court','Chrysler Spires','Metropolis','Radiant Boulevard','Moon Scales','Pearl Vault','Celestial Lace','Silk Guilloche','Serpentine Ribbon','Infinity Brocade','Star Compass','Prismatic Rose','Eclipse Mosaic'] as const;
export const DECO_PATHS=144,DECO_POINTS=49;
export function decoPoint(seed:number,path:number,u:number):[number,number,number]{
 const family=Math.floor(seed/3),v=seed%3,k=path%12,row=Math.floor(path/12),r=(k+1)/12,a=u*Math.PI*2;
 let x=0,y=0,z=0;
 const cx=((row%4)-1.5)*3.15,cy=(Math.floor(row/4)-1)*2.6;
 if(family===0){ // monument, crown, peacock: broad, bilateral architecture
   const angle=Math.PI*u,rad=.3+r*2.8;
   x=Math.cos(angle)*rad*(v===2?1.15:1);y=(v===1?1-Math.abs(Math.cos(angle)):Math.sin(angle))*rad;
   if(v===2){y+=Math.sin(angle*7)*.6*r;x*=.72;y*=1.3;}
   x+=((row%3)-1)*4.0;y+=Math.floor(row/3)*.22-2.8;
 }else if(family===1){ // interleaved lotus, gothic arch, rectangular arcade
   x=cx+Math.cos(a)*(1.38*r);y=cy+Math.sin(a)*1.1*r;
   if(v===0){const petal=.65+.35*Math.cos(a*5);x=cx+(x-cx)*petal;y=cy+(y-cy)*petal;}
   if(v===1){x=cx+(u*2-1)*r*1.3;y=cy+(1-Math.abs(u*2-1))*r*2-1;}
   if(v===2){const d=Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));x=cx+Math.cos(a)/d*r*1.35;y=cy+Math.sin(a)/d*r;}
 }else if(family===2){ // diamonds, terraced city, chevrons
   x=(u*2-1)*6.2;y=-3.5+(path/143)*7;
   if(v===0){x=cx+Math.cos(a)/(Math.abs(Math.cos(a))+Math.abs(Math.sin(a)))*r*1.5;y=cy+Math.sin(a)/(Math.abs(Math.cos(a))+Math.abs(Math.sin(a)))*r*1.2;}
   if(v===1)y+=Math.round(Math.cos(x*.8+row)*3)*.14;
   if(v===2)y+=Math.abs(Math.sin(x*1.1+row*.28))*.65;
 }else if(family===3){ // scarab feather, papyrus, fountains
   const side=row%2?1:-1,t=u*Math.PI;
   x=side*(.25+Math.floor(row/2)*.85+Math.sin(t)*r*.7);
   y=-3.4+u*6.5;
   if(v===0)x=side*(.3+u*5.7),y=(Math.sin(t)*2.8-r*2.2)*(row/12+.25);
   if(v===1)x+=side*Math.sin(t*2)*r*.6,y=-3.2+Math.sin(t*.5)*(1+r*5.5);
   if(v===2)x=side*(u*u*(.3+row*.35)+r*.2),y=-3.4+Math.sin(t)*(2+r*4.5);
 }else if(family===4){ // skyscrapers, perspective city, boulevard
   const tower=(row-5.5)*1.04,height=2+3*Math.cos(tower*.25);
   x=tower+(u*2-1)*r*.48;y=-3.5+(1-Math.abs(u*2-1))*height-r*.2;
   if(v===1){x=tower+(u*2-1)*r*.5;y=-3.3+Math.sin(u*Math.PI)*height; x*=.55+y*.08;}
   if(v===2){x=(u*2-1)*6.2;y=Math.sin(u*Math.PI)*r*5.5-3.2+row*.09;}
 }else if(family===5){ // overlapping scales, vaulted pearls, lace
   x=cx+Math.cos(a)*r*1.6;y=cy+Math.sin(a)*r*1.45;
   if(v===0){x=cx+Math.cos(u*Math.PI)*r*1.7;y=cy+Math.sin(u*Math.PI)*r*1.8;}
   if(v===1){x=cx+Math.cos(a)*r*(.65+.25*Math.cos(a*4));y=cy+Math.sin(a)*r*1.3;}
   if(v===2){x=cx+Math.cos(a)*r*(1+.28*Math.cos(a*8));y=cy+Math.sin(a)*r*(1+.28*Math.cos(a*8));}
 }else if(family===6){ // fine interwoven guilloche, horizontal silk, infinity knots
   const phase=path/144*Math.PI*2;
   x=Math.cos(a)*5.5;y=Math.sin(a*3+phase)*2.9;
   if(v===1){x=(u*2-1)*6.2;y=Math.sin(u*Math.PI*4+row*.38)*(.3+r)+ (row-5.5)*.43;}
   if(v===2){x=cx+Math.cos(a)*1.45*r;y=cy+Math.sin(a*2)*r;}
 }else{ // compass stars, prismatic rose, orbit mosaic
   const petals=v===0?4:v===1?8:12,rad=(.55+.45*Math.abs(Math.cos(a*petals/2)))*r;
   x=Math.cos(a)*rad*6;y=Math.sin(a)*rad*3.65;
   if(v===1){x=cx+Math.cos(a)*rad*1.65;y=cy+Math.sin(a)*rad*1.3;}
   if(v===2){x=Math.cos(a+row*.12)*(1+r*4.8);y=Math.sin(a+row*.12)*(1+r*2.5);}
 }
 if(seed===8){const old=x;x=y;y=old;}
 if(seed===6){x*=.75;y*=.8;y+=Math.sin(row*1.7)*.6;}
 if(seed===17){const old=x;x=y*1.45;y=old*.48;}
 if(seed===22){x=Math.cos(a+row*.22)*(.4+r*(1+row*.4));y=Math.sin(a+row*.22)*(.3+r*(.5+row*.24));}
 return [x,y,z];
}
export function makeDecoSeed(seed:number){const out=new Float32Array(DECO_PATHS*DECO_POINTS*3);for(let p=0;p<DECO_PATHS;p++)for(let i=0;i<DECO_POINTS;i++)out.set(decoPoint(seed,p,i/(DECO_POINTS-1)),(p*DECO_POINTS+i)*3);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let i=0;i<out.length;i+=3){minX=Math.min(minX,out[i]);maxX=Math.max(maxX,out[i]);minY=Math.min(minY,out[i+1]);maxY=Math.max(maxY,out[i+1]);}for(let i=0;i<out.length;i+=3){out[i]=(out[i]-(minX+maxX)/2)*12/(maxX-minX);out[i+1]=(out[i+1]-(minY+maxY)/2)*6.6/(maxY-minY);}return out;}
