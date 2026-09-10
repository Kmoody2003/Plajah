/** Audible PCM sent through the same analyser as uploaded music. */
export function createFluxTestWav(sampleRate=24000,duration=12):ArrayBuffer {
  const count=Math.floor(sampleRate*duration),buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
  const str=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+count*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,count*2,true);
  let seed=42;
  for(let i=0;i<count;i++){
    const t=i/sampleRate,active=t-1;let value=0;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
    if(t>=1&&t<duration-1){
      const beat=active%.5,hat=active%.25,snare=(active+.5)%1;
      const kick=Math.sin(2*Math.PI*(48*beat+2.8*(1-Math.exp(-beat/.04))))*Math.exp(-beat*10);
      const chord=[220,277.18,329.63].reduce((sum,f)=>sum+Math.sin(2*Math.PI*f*active),0)/3*Math.exp(-beat*5);
      value=.57*kick+.13*chord+.045*noise*Math.exp(-hat*95)+.14*noise*Math.exp(-snare*32);
    }
    v.setInt16(44+i*2,Math.max(-32767,Math.min(32767,Math.round(value*32767))),true);
  }
  return buffer;
}
