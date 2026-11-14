// Pure TypeScript in-process Express tests for Chora Direct local endpoints (`/compile`,
// `/render-preview`, `/transcribe-chords`, `/ai-info`, and `/write` 428 guard).
// Runs with zero network sockets or cloud API calls.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import express from 'express';
import { createChoraDirectRouter } from '../routes/choraDirect';

interface DispatchResult {
  status: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: any;
}

async function dispatchJson(
  router: express.Router,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
): Promise<DispatchResult> {
  const app = express();
  app.use('/api/chora/direct', router);

  const rawBody = payload !== undefined ? Buffer.from(JSON.stringify(payload), 'utf8') : Buffer.alloc(0);
  const reqStream = Readable.from(rawBody.byteLength ? [rawBody] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
    connection: Record<string, unknown>;
    socket: Record<string, unknown>;
  };
  reqStream.method = method;
  reqStream.url = `/api/chora/direct${path}`;
  reqStream.headers =
    payload !== undefined
      ? {
          'content-type': 'application/json',
          'content-length': String(rawBody.byteLength),
        }
      : {};
  reqStream.connection = { remoteAddress: '127.0.0.1' };
  reqStream.socket = { remoteAddress: '127.0.0.1' };

  const headers: Record<string, string | number | string[] | undefined> = {};
  const chunks: Buffer[] = [];
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    setHeader: (k: string, v: string | number | string[]) => void;
    getHeader: (k: string) => string | number | string[] | undefined;
    removeHeader: (k: string) => void;
    status: (code: number) => typeof res;
    set: (k: string | Record<string, string>, v?: string) => typeof res;
    json: (obj: unknown) => typeof res;
    send: (data: unknown) => typeof res;
    end: (data?: unknown) => typeof res;
    write: (chunk: unknown) => boolean;
  };
  res.statusCode = 200;
  res.setHeader = (k, v) => {
    headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => headers[k.toLowerCase()];
  res.removeHeader = (k) => {
    delete headers[k.toLowerCase()];
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = (k, v) => {
    if (typeof k === 'string') headers[k.toLowerCase()] = v;
    else for (const [hk, hv] of Object.entries(k)) headers[hk.toLowerCase()] = hv;
    return res;
  };
  res.write = (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  };
  res.json = (obj) => {
    headers['content-type'] = 'application/json';
    chunks.push(Buffer.from(JSON.stringify(obj), 'utf8'));
    res.emit('finish');
    return res;
  };
  res.send = (data) => {
    if (Buffer.isBuffer(data)) chunks.push(data);
    else if (typeof data === 'string') chunks.push(Buffer.from(data, 'utf8'));
    else chunks.push(Buffer.from(JSON.stringify(data), 'utf8'));
    res.emit('finish');
    return res;
  };
  res.end = (data) => {
    if (data !== undefined) {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'));
    }
    res.emit('finish');
    return res;
  };

  return await new Promise<DispatchResult>((resolve, reject) => {
    res.once('finish', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: any = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // leave as string
      }
      resolve({ status: res.statusCode, headers, body });
    });
    (app as any).handle(reqStream, res, (err: unknown) => {
      if (err) reject(err);
    });
  });
}

test('POST /compile: deterministically compiles prompt into brief, review, handoffs, and VocalLayer', async () => {
  const router = createChoraDirectRouter();
  const res = await dispatchJson(router, 'POST', '/compile', {
    prompt: [
      'deep house, 122 bpm, F minor',
      '[Intro | 4 bars | mp]',
      '[Verse 1 | 8 bars | mf]',
      'Midnight echoes on the avenue',
    ].join('\n'),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.brief.pack.id, 'edm-deep-house');
  assert.equal(res.body.brief.bpm, 122);
  assert.ok(Array.isArray(res.body.review));
  assert.ok(res.body.bandChart.chart.length > 0);
  assert.ok(res.body.renderRequest.prompt.includes('122 bpm'));
  assert.equal(res.body.vocalLayer.phrases.length, 1);
});

test('POST /render-preview + POST /transcribe-chords: renders WAV preview and recognises chords round-trip', async () => {
  const router = createChoraDirectRouter();
  const preview = await dispatchJson(router, 'POST', '/render-preview', {
    prompt: 'indie pop rock, 120 bpm, C major\n[Intro | 4 bars]\n{C | Am | F | G}',
    maxDurationSec: 8,
    sampleRate: 22050,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.backend, 'dsp');
  const wavBuf = Buffer.from(preview.body.wavBase64, 'base64');
  assert.equal(wavBuf.toString('ascii', 0, 4), 'RIFF');

  // Synthesize a 4-bar C | Am | F | G mono buffer at 22050 Hz and send via float32 base64
  const sr = 22050;
  const totalSec = 8;
  const mono = new Float32Array(sr * totalSec);
  const chords = [
    [60, 64, 67], // C
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [55, 59, 62], // G
  ];
  for (let bar = 0; bar < 4; bar++) {
    const start = bar * 2 * sr;
    const end = (bar + 1) * 2 * sr;
    const notes = chords[bar];
    for (let i = start; i < end; i++) {
      const t = i / sr;
      let v = 0;
      for (const m of notes) v += Math.sin(2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) * t);
      mono[i] = (v / notes.length) * 0.4;
    }
  }
  const pcmBase64 = Buffer.from(mono.buffer, mono.byteOffset, mono.byteLength).toString('base64');
  const beatTimes = Array.from({ length: 16 }, (_, b) => b * 0.5);
  const xcribe = await dispatchJson(router, 'POST', '/transcribe-chords', {
    pcmBase64,
    sampleRate: sr,
    beatTimes,
    beatsPerBar: 4,
  });
  assert.equal(xcribe.status, 200);
  assert.deepEqual(xcribe.body.chords, ['C', 'Am', 'F', 'G']);
});

test('POST /write: enforces 428 without cloudConsent: true and validates noteLines with stubbed lane', async () => {
  let called = false;
  const router = createChoraDirectRouter({
    lane: async () => {
      called = true;
      return '1 1 1 C3\n1 2 1 G2\n2 1 2 A2';
    },
  });

  const denied = await dispatchJson(router, 'POST', '/write', {
    prompt: 'deep house, 122 bpm',
    chair: 'bass',
    section: 's1',
    bars: 2,
    cloudConsent: false,
  });
  assert.equal(denied.status, 428);
  assert.equal(called, false);

  const ok = await dispatchJson(router, 'POST', '/write', {
    prompt: 'deep house, 122 bpm',
    chair: 'bass',
    section: 's1',
    bars: 2,
    cloudConsent: true,
  });
  assert.equal(ok.status, 200);
  assert.equal(called, true);
  assert.deepEqual(ok.body.lines, ['1 1 1 C3', '1 2 1 G2', '2 1 2 A2']);
});
