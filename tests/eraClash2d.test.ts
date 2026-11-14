import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const HTML_PATH = path.resolve(process.cwd(), 'public/games/era-clash/index.html');
const RIG_PATH = path.resolve(process.cwd(), 'public/games/era-clash/rig2d.js');

function extractInlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) out.push(m[1]);
  }
  return out;
}

test('era-clash 2d HTML inline scripts parse with valid syntax', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = extractInlineScripts(html);
  assert.ok(scripts.length >= 1, 'Expected inline script block in era-clash/index.html');
  for (let i = 0; i < scripts.length; i++) {
    assert.doesNotThrow(() => new vm.Script(scripts[i], { filename: `era-clash-inline-${i}.js` }));
  }
});

test('era-clash 2d rig2d parses cleanly and all 15 warriors define unique fighting styles and signature moves', () => {
  const rigSrc = fs.readFileSync(RIG_PATH, 'utf8');
  assert.doesNotThrow(() => new vm.Script(rigSrc, { filename: 'rig2d.js' }));

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const expectedIds = [
    'samurai', 'viking', 'knight', 'jaguar', 'monk', 'gladiator',
    'shaka', 'nzinga', 'amanirenas', 'lapulapu', 'hangtuah',
    'naresuan', 'tecumseh', 'lautaro', 'zumbi',
  ];

  // Extract SIG_STYLES literal safely and verify every character has distinct moves + valid frame data
  const m = html.match(/var\s+SIG_STYLES\s*=\s*(\{[\s\S]*?\n\s{4}\});/);
  assert.ok(m, 'SIG_STYLES block must be present in public/games/era-clash/index.html');
  const sigStyles = vm.runInNewContext(`(${m[1]})`) as Record<string, {
    styleName: string;
    passiveDesc: string;
    exName: string;
    slots: Record<string, { id: string; base: string; name: string; dmg: number; startup: number; active: number; recovery: number; range: number }>;
  }>;

  const seenMoveIds = new Set<string>();
  for (const id of expectedIds) {
    const entry = sigStyles[id];
    assert.ok(entry, `Missing SIG_STYLES entry for ${id}`);
    assert.ok(entry.styleName.length > 4, `${id} styleName should be populated`);
    assert.ok(entry.exName.length > 3, `${id} exName should be populated`);
    const slots = Object.values(entry.slots);
    assert.ok(slots.length >= 2, `${id} must have at least 2 signature special slots`);
    for (const sp of slots) {
      assert.ok(!seenMoveIds.has(sp.id), `Duplicate signature move id ${sp.id}`);
      seenMoveIds.add(sp.id);
      assert.ok(sp.dmg > 0 && sp.startup > 0 && sp.active > 0 && sp.recovery > 0 && sp.range > 80);
    }
  }
});
