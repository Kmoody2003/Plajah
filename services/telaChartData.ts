import type { TelaBaseDevice, TelaChartDevice, TelaDevice, TelaGridDevice } from '../types';
import { colLetter, displayValue, type TelaFormulaContext } from '../components/tela/TelaGrid';

export interface TelaResolvedChartSeries { id: string; name: string; values: number[]; color?: string }
export interface TelaResolvedChartData { labels: string[]; series: TelaResolvedChartSeries[]; sourceName: string; errors: string[] }

const colIndex = (letters: string) => {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Expand an A1 range in reading order; a lone A1 is also valid. */
export function telaRangeKeys(range: string): string[] {
  const [a, b = a] = range.toUpperCase().replace(/\s/g, '').split(':');
  const ma = a?.match(/^([A-Z]+)(\d+)$/), mb = b?.match(/^([A-Z]+)(\d+)$/);
  if (!ma || !mb) return [];
  const c1 = colIndex(ma[1]), c2 = colIndex(mb[1]), r1 = Number(ma[2]) - 1, r2 = Number(mb[2]) - 1;
  const keys:string[] = [];
  for (let r=Math.min(r1,r2); r<=Math.max(r1,r2); r++) for (let c=Math.min(c1,c2); c<=Math.max(c1,c2); c++) keys.push(`${colLetter(c)}${r+1}`);
  return keys;
}

const numberOf = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,%\s]/g,''));
  return Number.isFinite(n) ? n : 0;
};

function fromGrid(chart:TelaChartDevice, grid:TelaGridDevice, ctx?:TelaFormulaContext):TelaResolvedChartData {
  const errors:string[]=[];
  const labels=telaRangeKeys(chart.binding.labelRange || 'A2:A8').map(key=>displayValue(grid.cells,key,ctx)||key);
  const series=chart.binding.series.map(item=>{
    const keys=telaRangeKeys(item.range || '');
    if(!keys.length) errors.push(`${item.name}: choose a valid A1 range.`);
    return {id:item.id,name:item.name,color:item.color,values:keys.map(key=>numberOf(displayValue(grid.cells,key,ctx)))};
  });
  return {labels,series,sourceName:'Tela Grid',errors};
}

function fromBase(chart:TelaChartDevice, base:TelaBaseDevice):TelaResolvedChartData {
  const labelField=base.fields.find(field=>field.id===chart.binding.labelFieldId);
  const labels=base.rows.map((row,index)=>labelField ? row.values[labelField.id] || `Row ${index+1}` : `Row ${index+1}`);
  const errors:string[]=[];
  const series=chart.binding.series.map(item=>{
    const field=base.fields.find(candidate=>candidate.id===item.fieldId);
    if(!field)errors.push(`${item.name}: choose a Base number field.`);
    return {id:item.id,name:item.name,color:item.color,values:base.rows.map(row=>numberOf(field ? row.values[field.id]:0))};
  });
  return {labels,series,sourceName:base.name||'Tela Base',errors};
}

export function resolveTelaChartData(chart:TelaChartDevice, devices:Record<string,TelaDevice>, ctx?:TelaFormulaContext):TelaResolvedChartData {
  const binding=chart.binding;
  if(binding.sourceType==='GRID'){
    const source=binding.sourceDeviceId ? devices[binding.sourceDeviceId]:undefined;
    if(source?.type==='GRID')return fromGrid(chart,source,ctx);
    return {labels:binding.labels||[],series:binding.series.map(s=>({id:s.id,name:s.name,color:s.color,values:s.values||[]})),sourceName:'Detached Grid',errors:['Select a Tela Grid source.']};
  }
  if(binding.sourceType==='BASE'){
    const source=binding.sourceDeviceId ? devices[binding.sourceDeviceId]:undefined;
    if(source?.type==='BASE')return fromBase(chart,source);
    return {labels:binding.labels||[],series:binding.series.map(s=>({id:s.id,name:s.name,color:s.color,values:s.values||[]})),sourceName:'Detached Base',errors:['Select a Tela Base source.']};
  }
  return {labels:binding.labels||[],series:binding.series.map(s=>({id:s.id,name:s.name,color:s.color,values:s.values||[]})),sourceName:'Inline data',errors:[]};
}

export function makeTelaChart(id=`chart_${Date.now()}`):TelaChartDevice {
  return {id,type:'CHART',name:'Data visualization',title:'Signal over time',subtitle:'Live from Tela',width:960,height:540,kind:'BAR',style:'PLAJAH',binding:{sourceType:'INLINE',labels:['Jan','Feb','Mar','Apr','May','Jun'],series:[{id:'series_1',name:'Audience',values:[32,48,44,68,74,92]},{id:'series_2',name:'Engagement',values:[22,31,39,51,63,79]}]},showLegend:true,showValues:true,interactive:true,animation:{preset:'CASCADE',durationMs:850,staggerMs:70},transition:{in:'WIPE',out:'FADE'},camera:{yaw:28,pitch:18,depth:26}};
}
