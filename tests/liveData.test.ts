import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv, tableFromCsv, tableFromRecords, tableSignature, sniffDelimiter } from '../services/liveData/csv';
import { resolveBinding, evalMapping, selectRow, autoMap } from '../services/liveData/binding';
import { weatherTable, WMO } from '../services/liveData/weather';
import { addSource, pushRows, subscribeSource, liveTable, removeSource } from '../services/liveData/liveDataHub';
import { evaluateMathTable, listSimulators, sampleRun } from '../services/liveData/liveDataAdapters';
import { resolveLiveRef } from '../services/fabula/cg/cgLive';
import { pushTrackerState } from '../services/liveTracking/trackerHub';
import { libraryGraphic, allLibraryGraphics } from '../services/fabula/cg/cgLibrary';
import { evaluateCg } from '../services/fabula/cg/cgEvaluate';
import { CgPlayout, drawListAt } from '../services/fabula/cg/cgPlayout';
import { syncFollow } from '../services/fabula/cg/cgLive';
import { gradientLut, bucketSize } from '../services/visualFill/visualFill';

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and a BOM', () => {
    const m = parseCsv('﻿Name,Quote\r\n"Ellis, J.","He said ""hi""\nthen left"\r\nAda,ok\r\n');
    assert.deepEqual(m, [['Name', 'Quote'], ['Ellis, J.', 'He said "hi"\nthen left'], ['Ada', 'ok']]);
  });
  it('sniffs tab/semicolon delimiters and dedupes headers', () => {
    assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3'), '\t');
    assert.equal(sniffDelimiter('a;b\n1;2'), ';');
    const t = tableFromCsv('Name,Name,\nA,B,C');
    assert.deepEqual(t.columns, ['Name', 'Name 2', 'Column 3']);
    assert.equal(t.rows[0]['Name 2'], 'B');
  });
  it('turns JSON records into a table and signs content', () => {
    const t = tableFromRecords([{ a: 1, b: { x: 1 } }, { a: 2, c: 'z' }]);
    assert.deepEqual(t.columns, ['a', 'b', 'c']);
    assert.equal(t.rows[0].b, '{"x":1}');
    assert.equal(tableSignature(t), tableSignature({ ...t, updatedAt: 0 }));
    assert.notEqual(tableSignature(t), tableSignature({ ...t, rows: [...t.rows, { a: '3', b: '', c: '' }] }));
  });
});

describe('Live bindings', () => {
  const t = tableFromCsv('First,Last,Team,Votes\nAda,Lovelace,North,30\nAlan,Turing,South,10\nGrace,Hopper,North,60');
  it('selects first / last / index / match rows', () => {
    assert.equal(selectRow(t, { mode: 'last' }).row?.First, 'Grace');
    assert.equal(selectRow(t, { mode: 'index', index: 1 }).row?.First, 'Alan');
    assert.equal(selectRow(t, { mode: 'match', column: 'Last', equals: 'turing' }).index, 1);
    assert.equal(selectRow(t, { mode: 'row-of-item' }, 2).row?.First, 'Grace');
  });
  it('evaluates columns, templates, aggregates, absolute rows and literals', () => {
    const row = t.rows[0];
    assert.equal(evalMapping('{First} {Last} · {Team}', t, row, 0), 'Ada Lovelace · North');
    assert.equal(evalMapping('#count', t, row, 0), '3');
    assert.equal(evalMapping('#sum:Votes', t, row, 0), '100');
    assert.equal(evalMapping('#pct:Votes', t, row, 0), '30');
    assert.equal(evalMapping('#max:Votes', t, row, 0), '60');
    assert.equal(evalMapping('@2:Last', t, row, 0), 'Hopper');
    assert.equal(evalMapping('@last:First', t, row, 0), 'Grace');
    assert.equal(evalMapping('=LIVE', t, row, 0), 'LIVE');
  });
  it('resolves a binding and auto-maps fields to similar columns', () => {
    assert.deepEqual(resolveBinding({ sourceId: 'x', row: { mode: 'last' }, map: { name: '{First} {Last}', title: 'Team' } }, t), { name: 'Grace Hopper', title: 'North' });
    assert.deepEqual(autoMap([{ key: 'name', label: 'Name' }, { key: 'title', label: 'Title' }], ['Full Name', 'Role', 'Photo']), { name: 'Full Name', title: 'Role' });
  });
});

describe('Weather', () => {
  it('maps Open-Meteo JSON to one row per day with current conditions on row 0', () => {
    const json = {
      current: { temperature_2m: 71.6, apparent_temperature: 70, relative_humidity_2m: 40, weather_code: 2, wind_speed_10m: 8.2, wind_direction_10m: 270, is_day: 1 },
      daily: { time: ['2026-11-14', '2026-11-15'], weather_code: [2, 61], temperature_2m_max: [78.2, 66], temperature_2m_min: [60.6, 55], precipitation_probability_max: [5, 80], sunrise: ['2026-11-14T07:01', ''], sunset: ['2026-11-14T17:34', ''] },
    };
    const t = weatherTable(json, 'Atlanta, GA');
    assert.equal(t.rows.length, 2);
    assert.equal(t.rows[0].day, 'Today');
    assert.equal(t.rows[0].temp, '72');
    assert.equal(t.rows[0].icon, 'partly');
    assert.equal(t.rows[0].wind, 'W 8 mph');
    assert.equal(t.rows[1].condition, WMO[61].condition);
    assert.equal(t.rows[1].icon, 'rain');
  });
  it('ships weather graphics whose data hints match the weather columns', () => {
    const cols = ['place', 'day', 'date', 'condition', 'icon', 'code', 'high', 'low', 'precip', 'temp', 'feels', 'humidity', 'wind', 'unit', 'sunrise', 'sunset'];
    for (const g of allLibraryGraphics().filter(x => x.category === 'weather')) {
      for (const [field, expr] of Object.entries(g.dataHints || {})) {
        const col = expr.replace(/^@\d+:/, '');
        assert.ok(cols.includes(col), `${g.id}.${field} → ${expr}`);
        assert.ok(g.fields.some(f => f.key === field), `${g.id} hint for unknown field ${field}`);
      }
    }
  });
});

describe('Live data hub', () => {
  it('pushes rows into a table source and notifies subscribers only on change', async () => {
    const src = addSource({ name: 'Guests', kind: 'table', config: { columns: ['Name', 'Title'], rows: [] } });
    const seen: number[] = [];
    const off = subscribeSource(src.id, s => { if (s.table) seen.push(s.table.rows.length); });
    await new Promise(r => setTimeout(r, 30));
    pushRows(src.id, [{ Name: 'Ada', Title: 'Engineer' }], { append: true });
    pushRows(src.id, [{ Name: 'Alan', Title: 'Mathematician' }], { append: true });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(liveTable(src.id)?.rows.length, 2);
    assert.ok(seen.includes(2));
    off(); removeSource(src.id);
  });
  it('evaluates the formula engine to a table (MATLAB-style arrays + live t)', async () => {
    const t = await evaluateMathTable('SEQUENCE(3,2)*t', ['a', 'b'], { t: 2 });
    assert.deepEqual(t.columns, ['a', 'b']);
    assert.deepEqual(t.rows.map(r => [r.a, r.b]), [['2', '4'], ['6', '8'], ['10', '12']]);
  });
  it('registers simulators that produce sampleable channels', async () => {
    const wave = listSimulators().find(s => s.id === 'signal.wave')!;
    const run = await wave.run({ amp: 100 });
    assert.ok(run.n > 10);
    assert.ok(Math.abs(sampleRun(run, 'ramp', 0)) < 1e-6);
    assert.ok(listSimulators().some(s => s.id.startsWith('brakes.')));
  });
});

describe('CG live resolution', () => {
  it('fills graphic fields from a bound source', async () => {
    const src = addSource({ name: 'Supers', kind: 'table', config: { columns: [], rows: [] } });
    const off = subscribeSource(src.id, () => undefined);
    pushRows(src.id, [{ Speaker: 'Dr. Lena Park', Role: 'Joining from Seoul' }]);
    const g = libraryGraphic('meridian.lt-strap')!;
    const ref = resolveLiveRef(g, { graphicId: g.id, data: { sourceId: src.id, row: { mode: 'last' }, map: { name: 'Speaker', title: 'Role' } } })!;
    assert.equal(ref.fields?.name, 'Dr. Lena Park');
    const f = evaluateCg(g, 3, Infinity, ref);
    assert.ok(f.layers.some(l => l.text === 'DR. LENA PARK'));
    off(); removeSource(src.id);
  });
  it('pins an anchored graphic to a tracked point and hides it when lost', () => {
    const g = libraryGraphic('meridian.tag-follow')!;
    pushTrackerState('trk_test', { faceBottom: { x: 0.25, y: 0.5, v: 1 } });
    const ref = resolveLiveRef(g, { graphicId: g.id, anchor: { trackerId: 'trk_test', point: 'faceBottom', origin: { x: 960, y: 300 } } })!;
    // origin (960,300) must land on (0.25·1920, 0.5·1080) = (480, 540)
    assert.equal(ref.offset!.x, 480 - 960);
    assert.equal(ref.offset!.y, 540 - 300);
    pushTrackerState('trk_test', {});
    assert.equal(resolveLiveRef(g, { graphicId: g.id, anchor: { trackerId: 'trk_test', point: 'faceBottom', hideWhenLost: true } }), null);
    assert.equal(resolveLiveRef(g, { graphicId: g.id, anchor: { trackerId: 'trk_test', point: 'faceBottom' }, data: undefined })?.graphicId, g.id);
  });
  it('drops a lost anchored graphic from the draw list and grows a follow rundown', () => {
    const p = new CgPlayout();
    pushTrackerState('trk_gone', {});
    p.take({ graphicId: 'meridian.tag-follow', anchor: { trackerId: 'trk_gone', point: 'face', hideWhenLost: true } });
    assert.equal(drawListAt(p.state, Date.now() + 2000).length, 0);
    const src = addSource({ name: 'Names', kind: 'table', config: { columns: [], rows: [] } });
    const off = subscribeSource(src.id, () => undefined);
    pushRows(src.id, [{ Name: 'Ada' }, { Name: 'Alan' }]);
    const f = p.addFollow({ sourceId: src.id, ref: { graphicId: 'meridian.lt-strap', data: { sourceId: src.id, row: { mode: 'row-of-item' }, map: { name: 'Name' } } }, labelColumn: 'Name' });
    assert.equal(syncFollow(p, f), 2);
    pushRows(src.id, [{ Name: 'Grace' }], { append: true });
    assert.equal(syncFollow(p, p.state.follows![0]), 1, 'only the new row is appended');
    assert.deepEqual(p.state.rundown.map(r => r.label), ['Ada', 'Alan', 'Grace']);
    assert.equal(p.state.rundown[2].ref.data?.pinnedRow, 2);
    off(); removeSource(src.id); p.dispose();
  });
});

describe('Visual fill helpers', () => {
  it('builds gradient LUTs and buckets sizes to share instances', () => {
    const lut = gradientLut([[0, '#000000'], [1, '#ff0000']]);
    assert.deepEqual([...lut.slice(0, 4)], [0, 0, 0, 255]);
    assert.deepEqual([...lut.slice(255 * 4, 255 * 4 + 4)], [255, 0, 0, 255]);
    assert.deepEqual(bucketSize(700, 120), { w: 704, h: 128 });
    assert.deepEqual(bucketSize(5000, 10), { w: 1280, h: 64 });
  });
});
