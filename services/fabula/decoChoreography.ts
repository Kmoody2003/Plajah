// Continuous layout interpolation: one four-bar phrase per configuration. No
// threshold swaps and no multiplication of absolute time by instantaneous BPM.
export const DECO_CONFIGURATIONS=['Sunburst','Crown','Palmette','Fountain'] as const;
export function decoChoreography(beatPosition:number,intensity:number,voice:number){
  const beat=Math.max(0,beatPosition),phrase=beat/16,index=Math.floor(phrase)%4;
  const f=phrase-Math.floor(phrase),blend=f*f*f*(f*(f*6-15)+10);
  const weights=[0,0,0,0];weights[index]=1-blend;weights[(index+1)%4]=blend;
  return {weights,from:DECO_CONFIGURATIONS[index],to:DECO_CONFIGURATIONS[(index+1)%4],blend,
    expansion:.84+.18*Math.max(0,Math.min(1,intensity)),
    voiceLift:Math.max(0,Math.min(1,voice))*.32};
}
