import { AudioDriverSampler } from '../../components/plajahPixels/engine/audioDrivers';
import { fluxBandsFromFreq, type FluxAudio } from './fluxNode';

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
/** Estimate voiced/harmonic presence using multiple formant regions and harmonic
 * peaks. Broadband noise and lone tones are rejected. Instruments can still
 * resemble vocals; this is explicitly not speech recognition/source separation. */
export function estimateFluxVoice(freq:Uint8Array,sampleRate:number):number {
  const hz=sampleRate/(freq.length*2);
  const peak=(lo:number,hi:number)=>{
    let p=0;for(let i=Math.max(1,Math.floor(lo/hz));i<Math.min(freq.length-1,Math.ceil(hi/hz));i++){
      if(freq[i]>freq[i-1]&&freq[i]>=freq[i+1])p=Math.max(p,(freq[i]-Math.min(freq[i-1],freq[i+1]))/255);
    }return p;
  };
  const first=peak(300,1000),second=peak(1000,2600),third=peak(2600,3600);
  let best=0;
  for(let f0=90;f0<=360;f0+=10){
    let matches=0,total=0;
    for(let h=2;h<=12;h++){
      const f=f0*h;if(f<300||f>3300)continue;
      const i=Math.round(f/hz);if(i<2||i>=freq.length-2)continue;
      const local=Math.max(freq[i-1],freq[i],freq[i+1])/255;
      const valley=(freq[i-2]+freq[i+2])/510;
      total++;if(local>.18&&local-valley>.025)matches++;
    }
    if(total)best=Math.max(best,matches/total);
  }
  let energy=0,count=0;for(let i=Math.max(1,Math.floor(300/hz));i<Math.min(freq.length,Math.ceil(3300/hz));i++){energy+=freq[i]/255;count++;}
  const formants=Math.sqrt(first*second)+third*.2;
  return clamp(formants*7)*clamp((best-.15)*2.2)*clamp(energy/Math.max(1,count)*5);
}

/** Per-host history: one host's song must not set another host's tempo. */
export class FluxMusicSampler {
  private driver=new AudioDriverSampler();
  private last=-1;private phase=0;private onsets=0;private voice=0;private intensity=0;
  reset(){this.driver=new AudioDriverSampler();this.last=-1;this.phase=0;this.onsets=0;this.voice=0;this.intensity=0;}
  sample(freq:Uint8Array,seconds:number,sampleRate=48000):FluxAudio {
    if(this.last>=0&&(seconds<this.last||seconds-this.last>2))this.reset();
    const dt=this.last<0?1/60:Math.max(0,Math.min(.2,seconds-this.last));this.last=seconds;
    this.driver.updateFromArray(freq,seconds*1000,sampleRate);
    if(this.driver.isBeat)this.onsets++;
    const bands=fluxBandsFromFreq(freq,sampleRate);
    const confidence=this.onsets>=4?Math.min(.8,(this.onsets-2)/10):0;
    // Integrating tempo avoids a discontinuity when the estimate changes.
    if(bands.level>.015)this.phase+=dt*this.driver.bpm/60;
    const rawVoice=estimateFluxVoice(freq,sampleRate);
    this.voice+=(rawVoice-this.voice)*(1-Math.exp(-dt/(rawVoice > this.voice ? .10 : .28)));
    this.intensity+=(bands.level-this.intensity)*(1-Math.exp(-dt/(bands.level > this.intensity ? .12 : .6)));
    return {...bands,beat:this.driver.isBeat?1:0,bpm:this.driver.bpm,tempoConfidence:confidence,
      beatPosition:this.phase,voice:this.voice,intensity:this.intensity};
  }
}
