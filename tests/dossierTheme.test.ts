import test from 'node:test';
import assert from 'node:assert/strict';
import { DOSSIERS } from '../data/dossier/registry';
import { contrastRatio, fitTitleCqw, googleFontsHref, heroTitleVw, inkOn, mixHex, themeVars } from '../services/dossier/dossierTheme';
import { CHASSIS_AFTER_MIN, CHASSIS_BEFORE_MIN, chassisMinutes, formatMinutes, lineFigures, periodLabel, speedUp, stationsPassed } from '../services/dossier/movingLine';
import { ROAD_STOPS } from '../data/dossier/persiaRoad';
import { fordDossier } from '../data/dossier/ford';
import { persiaDossier } from '../data/dossier/persia';

test('every exhibit has a theme with a legible accent on its ground and display fonts to load', () => {
  for (const d of DOSSIERS) {
    assert.ok(d.theme, `${d.id} theme`);
    assert.ok(contrastRatio(d.theme!.accent, d.theme!.bg) >= 4.5, `${d.id} accent contrast ${contrastRatio(d.theme!.accent, d.theme!.bg).toFixed(2)}`);
    assert.ok(d.theme!.fonts.length >= 2, d.id);
    assert.ok(d.theme!.display.length > 4 && d.theme!.body.length > 4, d.id);
    assert.match(themeVars(d.theme!)['--dh-a'], /^#[0-9a-f]{6}$/i);
  }
});

test('the four exhibits keep their agreed identities', () => {
  const t = Object.fromEntries(DOSSIERS.map(d => [d.id, d.theme!]));
  assert.equal(t['henry-ford'].accent, '#ff4b1f');
  assert.match(t['henry-ford'].display, /Anton/);
  assert.equal(t['frederick-douglass'].accent, '#d9b36a');
  assert.match(t['frederick-douglass'].display, /Abril Fatface/);
  assert.equal(t['christianity-in-persia'].accent, '#4f7cff');
  assert.match(t['christianity-in-persia'].display, /Cormorant Garamond/);
  assert.ok(t['christianity-in-persia'].script && t['christianity-in-persia'].script!.word.length > 0);
  assert.equal(t['partition-1947'].accent, '#e8553d');
  assert.match(t['partition-1947'].display, /Fraunces/);
  assert.equal(t['henry-ford'].upper, true);
  assert.equal(t['partition-1947'].upper, false);
});

test('mixHex, inkOn and googleFontsHref behave', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('nope', '#ffffff', 0.5), 'nope');
  assert.equal(inkOn('#ffffff'), '#0b0a0d');
  assert.equal(inkOn('#000000'), '#ffffff');
  const href = googleFontsHref([DOSSIERS[1].theme!, DOSSIERS[1].theme!]);
  assert.match(href, /^https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(href, /family=Anton/);
  assert.match(href, /family=Source\+Serif\+4:opsz,wght@8\.\.60/);
  assert.equal(href.match(/family=Anton/g)!.length, 1, 'deduplicated');
  assert.match(href, /display=swap$/);
});

test('hero title size steps down with length and never exceeds 14vw', () => {
  const sizes = ['Legacy', 'The Rouge', 'Detroit and the First Cars', 'The Car for the Great Multitude', 'The Twentieth Century: Constitution, War and Revolution']
    .map(s => heroTitleVw(s, true));
  for (const s of sizes) assert.ok(s > 0 && s <= 14, String(s));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] <= sizes[i - 1], `${sizes[i]} <= ${sizes[i - 1]}`);
  assert.ok(heroTitleVw('Legacy', false) < heroTitleVw('Legacy', true), 'serif faces run a little smaller');
  for (const d of DOSSIERS) { const c = fitTitleCqw(d.theme!.heroTitle ?? d.title, d.theme!); assert.ok(c > 5 && c <= 40, `${d.id} ${c}`); }
});

test('Moving Line: documented chassis times at the ends, linear between, formatted plainly', () => {
  assert.equal(CHASSIS_BEFORE_MIN, 728);
  assert.equal(CHASSIS_AFTER_MIN, 93);
  assert.equal(chassisMinutes(0), 728);
  assert.equal(chassisMinutes(1), 93);
  assert.equal(chassisMinutes(5), 93, 'clamped');
  assert.equal(chassisMinutes(NaN), 728);
  assert.equal(formatMinutes(728), '12 h 8 min');
  assert.equal(formatMinutes(93), '1 h 33 min');
  assert.equal(formatMinutes(45), '45 min');
  assert.ok(Math.abs(speedUp(1) - 7.83) < 0.01);
  assert.equal(periodLabel(0), 'Oct 1913');
  assert.equal(periodLabel(1), 'Early 1914');
  assert.deepEqual(stationsPassed(0), []);
  assert.equal(stationsPassed(1).length, 5);
});

test('Moving Line reads its figures from the Ford ledger and is wired into room r3', () => {
  const fig = lineFigures(fordDossier.ledger.claims);
  assert.ok(fig.time && fig.price && fig.launch, 'ledger has c-93min, c-price, c-modelt');
  assert.equal(fig.sourced, true);
  assert.match(fig.time!.text, /93 minutes/);
  assert.match(fig.price!.text, /\$260/);
  assert.match(fig.launch!.text, /\$825/);
  assert.equal(lineFigures([]).sourced, false, 'no ledger, no sourced numbers');
  const node = fordDossier.rooms.find(r => r.id === 'r3')!.nodes.find(n => n.experience === 'ford-moving-line');
  assert.ok(node, 'a Ford r3 node hosts ford-moving-line');
});

test('Persia Road: five stops with a word, caption, art file and an ordered route; wired into room r4', async () => {
  assert.equal(ROAD_STOPS.length, 5);
  assert.deepEqual(ROAD_STOPS.map(s => s.progress), [0, 30, 55, 78, 100]);
  for (const s of ROAD_STOPS) { assert.ok(s.word && s.cap && s.text && s.name); assert.match(s.art, /^\/dossier\/persia\/recon\/.+\.jpg$/); }
  const fs = await import('node:fs'); const path = await import('node:path');
  for (const s of ROAD_STOPS) assert.ok(fs.existsSync(path.join('public', s.art)), s.art);
  const node = persiaDossier.rooms.find(r => r.id === 'r4')!.nodes.find(n => n.experience === 'persia-road');
  assert.ok(node, 'a Persia r4 node hosts persia-road');
});
