/** Sequential demux/decode proxy with audio retained; never accept silent track loss. */
export async function buildEditingProxy(blob: Blob): Promise<Blob|null> {
 const {Input,ALL_FORMATS,BlobSource,Output,BufferTarget,Mp4OutputFormat,Conversion}=await import('mediabunny');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob)});
 try {
  if(await input.computeDuration()>300)return null;
  const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const conversion=await Conversion.init({input,output,video:{width:960,height:540,fit:'contain',codec:'avc',bitrate:2000000,keyFrameInterval:.5,allowRotationMetadata:false},audio:{codec:'aac',bitrate:128000}});
  if(!conversion.isValid || conversion.discardedTracks.length){await conversion.cancel();return null;}
  await conversion.execute();
  return target.buffer?new Blob([target.buffer],{type:'video/mp4'}):null;
 }catch {return null;}finally{input.dispose();}
}
