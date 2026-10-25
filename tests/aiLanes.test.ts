import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_PRICES, DEFAULT_CLOUD_MODEL, costUsd, gpuTier, qualifies, localSeconds, cloudSeconds, totals, fmtSeconds, fmtUsd, type Workload,
} from '../services/ai/aiLane';
import { toGeminiContents, toAnthropicResponse, systemText } from '../services/ai/anthropicCompat';
import { summarizeUsage } from '../services/ai/geminiLane';
import { councilWorkload, draftWorkload, factsFromProfile } from '../services/grants/council';
import { triageFinding } from '../services/securityCouncil/llm';
import { councilEnvFromProcess } from '../services/securityCouncil/types';

test('prices: default model is priced, costs follow the published per-million rates', () => {
  assert.ok(GEMINI_PRICES[DEFAULT_CLOUD_MODEL]);
  // 1M in + 1M out at $0.25 / $1.50
  assert.equal(costUsd('gemini-3.1-flash-lite', 1_000_000, 1_000_000), 1.75);
  assert.equal(costUsd('unknown-model', 10, 10), null);
});

test('hardware tiers and what qualifies for private local runs', () => {
  assert.equal(gpuTier('NVIDIA GeForce RTX 4070 Laptop GPU', 'vulkan'), 'nvidia');
  assert.equal(gpuTier('Intel(R) Arc(TM) Graphics', 'vulkan'), 'integrated');
  assert.equal(gpuTier('AMD Radeon RX 7600', 'vulkan'), 'discrete');
  assert.equal(gpuTier('NVIDIA GeForce RTX 4070', 'avx2'), 'cpu');            // CPU backend, whatever the card
  assert.ok(qualifies({ ready: true, backend: 'vulkan', gpu: 'NVIDIA RTX 4070' }));
  assert.ok(qualifies({ ready: true, backend: 'vulkan', gpu: 'Intel Arc Graphics' }));
  assert.ok(!qualifies({ ready: true, backend: 'avx2', gpu: '' }));
  assert.ok(!qualifies({ ready: false, backend: 'vulkan', gpu: 'NVIDIA' }));
  assert.ok(!qualifies(null));
});

const council: Workload = {
  kind: 'council',
  calls: [...Array(5)].map(() => ({ inTokens: 4000, outTokens: 350 })).concat([{ inTokens: 2500, outTokens: 400 }]),
  parallelGroups: [[0, 1, 2, 3, 4]],
};

test('time estimates: local runs serially, the cloud runs seats in parallel, measurements recalibrate', () => {
  const nvidia = localSeconds(council, 'nvidia');
  const igpu = localSeconds(council, 'integrated');
  assert.ok(nvidia > 60 && nvidia < 120, `nvidia ${nvidia}`);
  assert.ok(igpu > nvidia * 2, `integrated ${igpu}`);
  // This PC proved twice as slow as the tier default on past calls → estimate doubles (load time excluded).
  const predict = 4000 / 900 + 350 / 35;
  const slow = localSeconds(council, 'nvidia', [{ inTokens: 4000, outTokens: 350, seconds: predict * 2 }]);
  assert.ok(Math.abs((slow - 8) - (nvidia - 8) * 2) < 0.01);
  const cloud = cloudSeconds(council);
  assert.ok(cloud < 15, `cloud ${cloud}`);
  assert.deepEqual(totals(council), { inTokens: 22_500, outTokens: 2150 });
});

test('formatting stays human', () => {
  assert.equal(fmtSeconds(12), 'about 10 seconds');
  assert.equal(fmtSeconds(95), 'about 1.5 minutes');
  assert.equal(fmtUsd(0.004), 'less than 1¢');
  assert.equal(fmtUsd(0.12), 'about 12¢');
  assert.equal(fmtUsd(null), 'unknown');
});

test('a council review on the default cloud model costs about a cent', () => {
  const t = totals(council);
  const c = costUsd(DEFAULT_CLOUD_MODEL, t.inTokens, t.outTokens)!;
  assert.ok(c > 0.005 && c < 0.02, `cost ${c}`);
});

test('workloads are built from the real prompts and exclude identifiers', () => {
  const facts = factsFromProfile(
    { ein: { value: '38-1234567' }, repEmail: { value: 'boss@x.org' }, mission: { value: 'Feed families' } },
    ['We fed 450 families.'],
    k => ({ ein: 'EIN', repEmail: 'Rep email', mission: 'Mission' } as Record<string, string>)[k],
  );
  assert.deepEqual(facts.profileLines, ['Mission: Feed families']);
  const notice = { title: 'Food Grant', agency: 'USDA' };
  const w = councilWorkload({ notice, facts, draft: 'x'.repeat(8000) });
  assert.equal(w.calls.length, 6);
  assert.ok(w.calls[0].inTokens > 2000);
  assert.equal(draftWorkload({ section: 'need', notice, facts }).calls.length, 1);
});

test('Messages-API bodies translate to Gemini: roles, merged turns, images, leading assistant dropped', () => {
  const c = toGeminiContents([
    { role: 'assistant', content: 'hi' },
    { role: 'user', content: 'one' },
    { role: 'user', content: [{ type: 'text', text: 'two' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpg', data: 'AAAA' } }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'system', content: 'ignored' } as any,
    { role: 'user', content: [{ type: 'tool_use' }] },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].role, 'user');
  assert.equal(c[0].parts.length, 3);
  assert.deepEqual(c[0].parts[2], { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
  assert.equal(c[1].role, 'model');
  assert.equal(systemText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\n\nb');
  assert.equal(systemText(undefined), undefined);
  const r = toAnthropicResponse('hello', 'gemini-x', { inTokens: 3, outTokens: 2 });
  assert.equal(r.content[0].text, 'hello');
  assert.deepEqual(r.usage, { input_tokens: 3, output_tokens: 2 });
});

test('usage summaries add up and report unknown cost honestly', () => {
  const s = summarizeUsage([{ model: 'm', inTokens: 10, outTokens: 5, costUsd: 0.001, seconds: 2 }, { model: 'm', inTokens: 1, outTokens: 1, costUsd: 0.002, seconds: 4 }]);
  assert.equal(s.inTokens, 11); assert.equal(s.calls, 2); assert.ok(Math.abs(s.costUsd! - 0.003) < 1e-9); assert.equal(s.seconds, 4);
  assert.equal(summarizeUsage([{ model: 'x', inTokens: 1, outTokens: 1, costUsd: null, seconds: 1 }]).costUsd, null);
});

test('security council defaults to Gemini and parses a Gemini triage verdict', async () => {
  const env = councilEnvFromProcess({ GOOGLE_AI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' } as any);
  assert.equal(env.llmApiKey, 'g');
  assert.match(env.triageModel, /^gemini-/);
  assert.match(env.briefModel, /^gemini-/);
  const back = councilEnvFromProcess({ SECURITY_COUNCIL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a' } as any);
  assert.equal(back.llmApiKey, 'a'); assert.match(back.triageModel, /^claude-/);

  let url = ''; let headers: any = {};
  const fetchImpl = (async (u: any, init: any) => {
    url = String(u); headers = init.headers;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"Looks real","likelyFalsePositive":false,"severitySuggestion":"high","nextStep":"Check logs"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }), { status: 200 });
  }) as typeof fetch;
  const t = await triageFinding('g', 'gemini-3.1-flash-lite', { agent: 'medic', severity: 'medium', title: 't', dedupeKey: 'k', evidence: {}, proposedFix: 'f' } as any, fetchImpl);
  assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite:generateContent/);
  assert.equal(headers['x-goog-api-key'], 'g');
  assert.equal(t!.severitySuggestion, 'high');

  const blocked = (async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })) as typeof fetch;
  assert.equal(await triageFinding('g', 'gemini-3.1-flash-lite', { agent: 'medic', severity: 'medium', title: 't', dedupeKey: 'k', evidence: {}, proposedFix: 'f' } as any, blocked), null);
});
