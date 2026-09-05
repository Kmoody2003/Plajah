import assert from 'node:assert/strict';
import test from 'node:test';
import { displayValue } from '../components/tela/TelaGrid';
import { applyTelaOp } from '../components/tela/telaOps';
import { DATA_VIZ_ART_DIRECTIONS, DATA_VIZ_STYLES } from '../services/fabula/dataVizArtDirection';
import { makeTelaChart, resolveTelaChartData, telaRangeKeys } from '../services/telaChartData';
import type { TelaDoc, TelaGridDevice } from '../types';

test('chart ranges expand in reading order',()=>{
  assert.deepEqual(telaRangeKeys('B2:B5'),['B2','B3','B4','B5']);
  assert.deepEqual(telaRangeKeys('A1:B2'),['A1','B1','A2','B2']);
  assert.deepEqual(telaRangeKeys('bad'),[]);
});

test('chart data evaluates native Tela formulas live',()=>{
  const grid:TelaGridDevice={id:'grid',type:'GRID',rows:5,cols:3,cells:{A2:'North',A3:'South',A4:'West',B2:'12',B3:'=B2*2',B4:'=SUM(B2:B3)'}};
  const chart=makeTelaChart('chart');
  chart.binding={sourceType:'GRID',sourceDeviceId:'grid',labelRange:'A2:A4',series:[{id:'s',name:'Revenue',range:'B2:B4'}]};
  const result=resolveTelaChartData(chart,{grid,chart});
  assert.deepEqual(result.labels,['North','South','West']);
  assert.deepEqual(result.series[0].values,[12,24,36]);
  assert.equal(displayValue(grid.cells,'B4'),'36');
});

test('chart mutations stay in the shared Tela op stream',()=>{
  const chart=makeTelaChart('chart');
  const doc:TelaDoc={id:'doc',ownerId:'test',title:'Charts',frames:[{id:'f',kind:'SCREEN',preset:'FREE',x:0,y:0,w:960,h:540,deviceIds:['chart']}],devices:{chart},bindings:[],createdAt:0,updatedAt:0};
  const next=applyTelaOp(doc,{type:'UPDATE_CHART_DEVICE',deviceId:'chart',patch:{kind:'BAR_3D',style:'SPORTS'}});
  const changed=next.devices.chart;
  assert.equal(changed.type,'CHART');
  if(changed.type==='CHART'){assert.equal(changed.kind,'BAR_3D');assert.equal(changed.style,'SPORTS');}
});

test('data visualization identities have distinct structural art direction',()=>{
  assert.equal(DATA_VIZ_STYLES.length,18);
  const arts=DATA_VIZ_STYLES.map(style=>DATA_VIZ_ART_DIRECTIONS[style]);
  assert.equal(new Set(arts.map(a=>a.name)).size,18);
  assert.ok(new Set(arts.map(a=>a.grid)).size>=5);
  assert.ok(new Set(arts.map(a=>a.mark)).size>=6);
  assert.ok(new Set(arts.map(a=>a.texture)).size>=7);
  assert.ok(new Set(arts.map(a=>a.font)).size>=7);
  for(const art of arts){assert.ok(art.premise.length>45);assert.ok(art.studioVoice.length>10)}
});
