import { detectBeatsFromBuffer } from '../audioBeatDetection';
self.onmessage=(e:MessageEvent<{samples:Float32Array;sampleRate:number}>)=>{
  try{const {samples,sampleRate}=e.data;const a=detectBeatsFromBuffer(samples,sampleRate,samples.length/sampleRate);
    self.postMessage({bpm:a.bpm,confidence:a.confidence,firstBeatSec:a.firstBeatSec});
  }catch{self.postMessage({bpm:120,confidence:0,firstBeatSec:0});}
};
