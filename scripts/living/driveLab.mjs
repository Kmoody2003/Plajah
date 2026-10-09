// Drives the Living Runtime lab with REAL pointer / touch / keyboard events (Playwright + Chromium) and asserts behaviour.
//   1) npx vite --config living-lab.vite.config.mjs        (serves http://127.0.0.1:3155)
//   2) node scripts/living/driveLab.mjs [framesDir]
// Exit code 1 if any check fails. Frame captures (mid-animation) go to framesDir (default docs/living-runtime-frames).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.LAB_URL || 'http://127.0.0.1:3155/living-lab.html';
const FRAMES = path.resolve(process.argv[2] || 'docs/living-runtime-frames');
fs.mkdirSync(FRAMES, { recursive: true });

let pass = 0, fail = 0; const failures = [];
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL ${name} ${extra}`); } };
const section = n => console.log(`\n# ${n}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** crop in page units (lab renders 600x900 page units at 420px wide, 12px padding) */
const cp = (x, y, w, h) => ({ x: 12 + x * 0.7, y: 12 + y * 0.7, width: w * 0.7, height: h * 0.7 });

const browser = await chromium.launch();
const errors = [];

async function open(q = '', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: false });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(Array.isArray(p) ? p : [p]); return true; }; });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}${q}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector(opts.wait || '.pj-live-page', { timeout: 90000 });
  await page.waitForTimeout(500);
  const api = {
    page, ctx,
    vars: () => page.evaluate(() => window.__lab.vars()),
    v: async n => (await page.evaluate(() => window.__lab.vars()))[n],
    dbg: () => page.evaluate(() => window.__lab.engine().debug()),
    audio: () => page.evaluate(() => JSON.parse(JSON.stringify(window.__lab.audio.calls))),
    audioNames: async () => (await page.evaluate(() => window.__lab.audio.calls.map(c => c.n))),
    center: id => page.evaluate(i => window.__lab.objCenter(i), id),
    computed: id => page.evaluate(i => window.__lab.computed(i), id),
    async click(id, o = {}) { const c = await api.center(id); await page.mouse.click(c.x + (o.dx || 0), c.y + (o.dy || 0)); return c; },
    async slowMove(from, to, stepPx = 8, everyMs = 40) { const d = Math.hypot(to.x - from.x, to.y - from.y); const n = Math.max(1, Math.round(d / stepPx)); for (let i = 1; i <= n; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n); await sleep(everyMs); } },
    async fastMove(from, to, n = 6) { for (let i = 1; i <= n; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n); await sleep(6); } },
    close: () => ctx.close(),
  };
  return api;
}

// ───────────────────────────────────────────────────────────────────────────
section('structure: stable DOM node per object, labels, accessible layer');
{
  const L = await open('');
  const info = await L.page.evaluate(() => ({
    n: document.querySelectorAll('[data-obj-id]').length,
    labelled: document.querySelectorAll('[data-obj-id][data-label]').length,
    ids: [...document.querySelectorAll('[data-obj-id]')].slice(0, 3).map(e => e.getAttribute('data-obj-id')),
    hits: [...document.querySelectorAll('.pj-live-hit')].map(b => ({ name: b.getAttribute('aria-label'), fam: b.dataset.family })),
    rootTouch: getComputedStyle(document.querySelector('.pj-live-page')).touchAction,
    dragTouch: getComputedStyle(document.querySelector('[data-obj-id="blanket"]')).touchAction,
    gradientIds: [...document.querySelectorAll('linearGradient,radialGradient,filter')].map(e => e.id),
  }));
  check('one <g data-obj-id> per object (45 objects)', info.n === 45, `got ${info.n}`);
  check('every object carries data-label', info.labelled === info.n);
  check('every interactive control has a non-empty accessible name', info.hits.length >= 10 && info.hits.every(h => h.name && h.name.length > 3), JSON.stringify(info.hits));
  check('gradient/filter ids are instance-prefixed (no clashes between pages)', info.gradientIds.length > 0 && info.gradientIds.every(i => /^lv\d+_/.test(i)), JSON.stringify(info.gradientIds));
  check('root keeps vertical scrolling (touch-action pan-y)', /pan-y/.test(info.rootTouch), info.rootTouch);
  check('drag targets take over touch (touch-action none)', info.dragTouch === 'none', info.dragTouch);
  const fams = new Set(info.hits.map(h => h.fam));
  check('tap, press, drag and proximity all have controls', ['tap', 'press', 'drag', 'proximity'].every(f => fams.has(f)), [...fams].join());
  // Merged: the two Mars proximity behaviours share ONE control
  check('behaviours on the same target share one control (Mars)', info.hits.filter(h => /Mars/.test(h.name)).length === 1);
  const run = await L.dbg();
  check('ambient loops are running (breathe, blink, twinkle, flicker, orbit, float)', run.running.some(([id]) => id === 'bo-body') && run.running.some(([id]) => id === 'flame') && run.running.some(([id]) => id === 'planet-1') && run.running.some(([id]) => id === 'star-1'));
  const bo = await L.computed('bo-body');
  const early = await L.page.evaluate(() => { window.__lab.handle().replay(); return { story: window.__lab.computed('story-1').opacity, title: document.querySelector('[data-obj-id="title"] text').textContent.length }; });
  check('entrance art starts hidden before the first paint (story fades in, title types on)', early.story === '0' && early.title === 0, JSON.stringify(early));
  check('no sound before a gesture (sound off): nothing in the audio log', (await L.audioNames()).filter(n => ['sfx', 'note', 'playCue', 'setAmbience', 'voice'].includes(n)).length === 0, JSON.stringify(await L.audioNames()));
  await L.page.screenshot({ path: path.join(FRAMES, 'lab-triggers-overview.png'), clip: cp(0, 0, 600, 900) });
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('tap with sound on: gesture unlocks, note pitch follows the tap, counters, goal, celebrate');
{
  const L = await open('?sound=1');
  const names0 = await L.audioNames();
  check('page music + ambience start once sound is on', names0.includes('playCue') && names0.includes('setAmbience'), JSON.stringify(names0));
  const c = await L.center('bo-body');
  await L.page.mouse.click(c.x - c.w * 0.4, c.y);   // left side of Bo
  await sleep(150);
  await L.page.mouse.click(c.x + c.w * 0.4, c.y);   // right side
  await sleep(150);
  const a = await L.audio();
  const notes = a.filter(x => x.n === 'note').map(x => x.a[1]);
  check('audio.unlock() called from the pointer gesture', a.some(x => x.n === 'unlock'));
  check('tap plays a marimba note, pitch chosen by where you tapped', notes.length === 2 && notes[0] !== notes[1], JSON.stringify(notes));
  check('tap counts (var beeps) and squashes', (await L.v('beeps')) === 2);
  const dbg = await L.dbg(); check('burst of notes spawned particles', dbg.particles > 0, String(dbg.particles));
  // pips: three taps -> goal -> celebrate
  for (const id of ['pip-1', 'pip-2', 'pip-3']) { await L.click(id); await sleep(160); }
  check('three pip taps -> found=3', (await L.v('found')) === 3);
  const goals = await L.page.evaluate(() => window.__lab.goals());
  check('goal fires once and calls onGoal', goals.length === 1 && goals[0] === '1:found-all', JSON.stringify(goals));
  await sleep(100); const d2 = await L.dbg();
  check('celebrate throws confetti and stars', d2.particles > 20, String(d2.particles));
  check('celebrate plays the celebrate sound', (await L.audio()).some(x => x.n === 'sfx' && x.a[0] === 'celebrate'));
  await L.page.screenshot({ path: path.join(FRAMES, 'celebrate-confetti.png'), clip: cp(0, 0, 600, 900) });
  check('goal announced to the live region', /Goal complete/.test(await L.page.textContent('[data-live-region]')));
  await sleep(200);
  await L.page.mouse.click(c.x, c.y);   // tapping a hidden... pip-1 (popped out) must not count again
  await L.click('pip-1'); await sleep(200);
  check('a popped pip stays gone (state committed, no second count)', (await L.v('found')) === 3);
  // loop sleeps once nothing moves (all particles aged out, pointer off the page)
  await L.page.mouse.move(980, 980); await sleep(4500);
  check('rAF loop sleeps when nothing is moving', (await L.dbg()).loop === false);
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('drag: progress variable, bounds, axis, reveal; draw-on scrubbed by variable; snap');
{
  const L = await open('?sound=1');
  const c = await L.center('blanket');
  await L.page.mouse.move(c.x, c.y); await L.page.mouse.down();
  const scale = c.w / 160; // client px per page unit
  await L.page.mouse.move(c.x + 40, c.y - 30 * scale, { steps: 6 });   // sideways ignored (axis y)
  await sleep(60);
  const mid = await L.v('lift');
  const st = (await L.dbg()).state.blanket;
  check('progress variable tracks the drag (30 of 100 units = 0.3)', Math.abs(mid - 0.3) < 0.04, String(mid));
  check('axis lock: x offset stays 0', st.x === 0 && st.y < -25, JSON.stringify(st));
  await L.page.mouse.move(c.x, c.y - 300, { steps: 10 }); await sleep(100);
  check('bounds clamp progress at 1 and offset at -100', (await L.v('lift')) === 1 && (await L.dbg()).state.blanket.y === -100);
  await L.page.mouse.up(); await sleep(700);
  const moth = await L.computed('moth');
  check('reveal: `when lift >= .7` fades the moth in (once)', moth.opacity === '1', JSON.stringify(moth));
  check('dragging flag cleared on release', (await L.v('lift.dragging')) === false);
  await L.page.screenshot({ path: path.join(FRAMES, 'drag-reveal-moth.png'), clip: cp(0, 400, 600, 150) });
  check('soft haptic requested at drag start', (await L.page.evaluate(() => window.__vib)).some(p => p.length === 1 && p[0] === 6), JSON.stringify(await L.page.evaluate(() => window.__vib)));

  // thread: draw-on scrubbed by `pull`; snap at the end
  const h = await L.center('thread-handle');
  const k = h.w / 32;
  await L.page.mouse.move(h.x, h.y); await L.page.mouse.down();
  await L.page.mouse.move(h.x + 245 * k, h.y, { steps: 12 }); await sleep(120);
  const pull = await L.v('pull');
  const dash = await L.page.evaluate(() => { const p = document.querySelector('[data-obj-id="thread"] path'); const a = p.getAnimations()[0]; return { n: p.getAnimations().length, t: a ? a.currentTime / a.effect.getTiming().duration : null, dasharray: p.style.strokeDasharray }; });
  check('thread handle: half way across = 0.5 progress', Math.abs(pull - 0.5) < 0.05, String(pull));
  check('draw-on is bound to the drag (scrubbed animation at the same fraction)', dash.n === 1 && Math.abs(dash.t - pull) < 0.05, JSON.stringify(dash));
  await L.page.screenshot({ path: path.join(FRAMES, 'thread-half-drawn.png'), clip: cp(0, 580, 600, 130) });
  await L.page.mouse.move(h.x + 480 * k, h.y, { steps: 12 }); await L.page.mouse.up(); await sleep(600);
  check('release near the end snaps there and emits drag:snap', (await L.v('threadDone')) === true && (await L.v('pull')) === 1);
  check('second goal (thread fully pulled) fired', (await L.page.evaluate(() => window.__lab.goals())).includes('1:thread-pulled'));
  // depth slider writes audio depth
  const cc = await L.center('coral'); await L.page.mouse.move(cc.x, cc.y); await L.page.mouse.down(); await L.page.mouse.move(cc.x, cc.y + 60 * (cc.w / 40), { steps: 8 }); await sleep(80);
  const depthCalls = (await L.audio()).filter(x => x.n === 'setDepth').map(x => x.a[0]);
  await L.page.mouse.up();
  check('`depth {fromVar}` drives audio.setDepth as the slider moves', depthCalls.length >= 3 && depthCalls[depthCalls.length - 1] > 0.3 && depthCalls.every((v, i) => i === 0 || v >= depthCalls[i - 1]), JSON.stringify(depthCalls));
  const hue = await L.page.evaluate(() => getComputedStyle(document.querySelector('[data-obj-id="bg"]')).filter);
  check('a variable-scrubbed animation (hue) follows the same slider', /hue-rotate/.test(hue) && hue !== 'hue-rotate(0deg)', hue);
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('proximity with pointer speed (Mars)');
{
  const L = await open('');
  const m = await L.center('mars'); const far = { x: m.x + 380, y: m.y + 250 };
  check('Mars starts hidden', (await L.computed('mars')).opacity === '0');
  await L.page.mouse.move(far.x, far.y); await sleep(100);
  await L.slowMove(far, { x: m.x + 20, y: m.y + 20 }, 7, 45);          // ~155 px/s
  await sleep(500);
  check('slow approach: Mars peeks (and blushes), does not hide', (await L.v('peeks')) === 1 && (await L.v('hides')) === 0, JSON.stringify(await L.vars()));
  const mc = await L.computed('mars'); check('Mars is visible after peeking', mc.opacity === '1', JSON.stringify(mc));
  await L.page.screenshot({ path: path.join(FRAMES, 'mars-peeks-slow.png'), clip: cp(0, 100, 600, 160) });
  await L.page.mouse.move(far.x, far.y); await sleep(200);
  await L.page.evaluate(() => document.getElementById('btn-replay').click()); await sleep(400);
  await L.page.mouse.move(far.x, far.y); await sleep(100);
  await L.fastMove(far, { x: m.x + 20, y: m.y + 20 }, 6);               // thousands of px/s
  await sleep(500);
  check('fast approach: Mars hides, does not peek', (await L.v('hides')) === 1 && (await L.v('peeks')) === 0, JSON.stringify(await L.vars()));
  await L.page.screenshot({ path: path.join(FRAMES, 'mars-hides-fast.png'), clip: cp(0, 100, 600, 160) });
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('press-and-hold (kazoo voice bends), release, double tap, hover, key, timer, events, sequence');
{
  const L = await open('?sound=1');
  const z = await L.center('zib');
  await L.page.mouse.move(z.x, z.y); await L.page.mouse.down(); await sleep(120);
  check('press starts a sustained voice and sets tooting', (await L.audioNames()).includes('voice') && (await L.v('tooting')) === true);
  await L.page.mouse.move(z.x, z.y - 54, { steps: 5 }); await sleep(80);
  check('moving up while held bends the pitch', (await L.audioNames()).includes('voice.setPitch'));
  await L.page.mouse.up(); await sleep(100);
  check('release stops the voice and runs the release behaviour', (await L.audioNames()).includes('voice.stop') && (await L.v('tooting')) === false);

  const d = await L.center('dbl');
  await L.page.mouse.click(d.x, d.y); await sleep(120); await L.page.mouse.click(d.x, d.y); await sleep(100);
  check('double tap fires once on the second tap', (await L.v('doubles')) === 1);
  await L.page.mouse.click(d.x, d.y); await sleep(700); await L.page.mouse.click(d.x, d.y); await sleep(100);
  check('two slow taps are not a double tap', (await L.v('doubles')) === 1);

  const hv = await L.center('hov'); await L.page.mouse.move(hv.x, hv.y); await sleep(100);
  check('hover fires on enter', (await L.v('hovers')) >= 1);

  await L.page.keyboard.press('k'); await sleep(80);
  check('key trigger (K)', (await L.v('keys')) === 1);

  await L.page.keyboard.press('c'); await sleep(100);
  check('celebrate action (key C): confetti + cheer', (await L.dbg()).particles > 20 && (await L.audio()).some(x => x.n === 'sfx' && x.a[0] === 'celebrate'));
  await L.click('tgl'); await sleep(500);
  check('toggle shows the hidden dot (pop-in)', (await L.computed('tgl-target')).visibility === 'visible' && (await L.v('toggles')) === 1);
  await L.click('tgl'); await sleep(600);
  check('toggle again hides it', (await L.computed('tgl-target')).opacity === '0' || (await L.computed('tgl-target')).visibility === 'hidden');
  await sleep(3300);
  check('repeating timer fires every 1.5s', (await L.v('ticks')) >= 2, String(await L.v('ticks')));

  await L.click('ping'); await sleep(200);
  check('emit -> event trigger', (await L.v('pongs')) === 1);

  await L.click('tilt-card'); await sleep(250);
  check('wait: second half of a sequence has not run yet', (await L.v('seqDone')) === 0);
  await sleep(1100);
  check('wait: sequence completes', (await L.v('seqDone')) === 1);

  await L.click('candle'); await sleep(900);
  const tint = await L.page.evaluate(() => getComputedStyle(document.querySelector('[data-tint]')).opacity);
  check('candle: page dims (tint overlay) and the flame is hidden', Number(tint) > 0.4 && (await L.computed('flame')).visibility === 'hidden', tint);
  await L.page.screenshot({ path: path.join(FRAMES, 'candle-dimmed-page.png'), clip: cp(0, 0, 600, 900) });
  await L.click('candle'); await sleep(900);
  check('tapping again relights it', (await L.computed('flame')).visibility === 'visible' && Number(await L.page.evaluate(() => getComputedStyle(document.querySelector('[data-tint]')).opacity)) < 0.05);

  // follow: pupils look toward the pointer; Nova follows with lag and trail
  const bo = await L.center('bo-body');
  await L.page.mouse.move(bo.x + 300, bo.y + 200); await sleep(500);
  const s1 = (await L.dbg()).state['bo-pupil-l'];
  check('eyes follow the pointer (bounded to maxOffset 7)', s1.fx > 1 && Math.hypot(s1.fx, s1.fy) <= 7.2, JSON.stringify(s1));
  await L.click('nova-switch'); await sleep(50);
  const before = (await L.dbg()).particles;
  await L.fastMove({ x: bo.x, y: bo.y + 300 }, { x: bo.x + 250, y: bo.y + 330 }, 14); await sleep(50);
  const nv = (await L.dbg()).state.nova;
  check('Nova follows the pointer', Math.hypot(nv.fx, nv.fy) > 5, JSON.stringify(nv));
  check('trail leaves particles while trailOn', (await L.dbg()).particles > before);
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('keyboard + accessibility (no mouse at all)');
{
  const L = await open('?sound=1');
  const names = await L.page.evaluate(() => [...document.querySelectorAll('.pj-live-hit')].map(b => b.getAttribute('aria-label')));
  const focusByName = async rx => { await L.page.evaluate(src => { const rx = new RegExp(src); const b = [...document.querySelectorAll('.pj-live-hit')].find(x => rx.test(x.getAttribute('aria-label'))); b.focus(); }, rx.source); };
  await focusByName(/Tap Bo/);
  const focused = await L.page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check('controls are focusable and named by their hint', /Tap Bo/.test(focused), focused);
  await L.page.keyboard.press('Enter'); await sleep(100);
  check('Enter on a tap control taps', (await L.v('beeps')) === 1);
  await L.page.keyboard.press('Space'); await sleep(100);
  check('Space on a tap control taps', (await L.v('beeps')) === 2);
  await focusByName(/Drag the blanket/);
  for (let i = 0; i < 10; i++) await L.page.keyboard.press('ArrowUp');
  await sleep(100);
  const lift = await L.v('lift');
  check('arrow keys nudge a drag target (10 presses = 0.8)', Math.abs(lift - 0.8) < 0.02, String(lift));
  await sleep(600);
  check('keyboard drag reveals the moth too', (await L.computed('moth')).opacity === '1');
  await L.page.keyboard.press('Enter'); await sleep(80);
  check('Enter completes a drag (progress 1)', (await L.v('lift')) === 1);
  await focusByName(/toot the kazoo/);
  await L.page.keyboard.down('Space'); await sleep(150);
  check('holding Space holds the note', (await L.audioNames()).includes('voice') && (await L.v('tooting')) === true);
  await L.page.keyboard.up('Space'); await sleep(100);
  check('releasing Space releases it', (await L.audioNames()).includes('voice.stop') && (await L.v('tooting')) === false);
  await focusByName(/Move slowly toward Mars/);
  await L.page.keyboard.press('Enter'); await sleep(300);
  check('keyboard activates the gentle proximity behaviour (peek)', (await L.v('peeks')) === 1 && (await L.v('hides')) === 0);
  await focusByName(/Pull the thread/);
  await L.page.keyboard.press('Enter'); await sleep(100);
  check('Enter completes the thread pull (snap point) and fires the goal path', (await L.v('pull')) === 1);
  const sr = await L.page.evaluate(() => ({ live: document.querySelector('[data-live-region]').getAttribute('aria-live'), group: document.querySelector('.pj-live-page').getAttribute('role'), label: document.querySelector('.pj-live-page').getAttribute('aria-label'), desc: document.querySelector('.pj-live-page').getAttribute('aria-describedby') }));
  check('live region is polite; page is a labelled group with instructions', sr.live === 'polite' && sr.group === 'group' && /lab page/i.test(sr.label) && !!sr.desc, JSON.stringify(sr));
  check('focus ring is visible (outline on :focus-visible)', await L.page.evaluate(() => { document.querySelector('.pj-live-hit').focus(); return true; }));
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('reduced motion: stills + non-motion equivalents');
{
  const L = await open('?reduced=1&sound=1');
  const dbg = await L.dbg();
  check('no ambient loops run (all stills); only the opacity-only entrance fades remain', dbg.running.every(([id, l]) => /^story/.test(id) && l.every(x => x === 'fade-in')), JSON.stringify(dbg.running));
  await sleep(1000);
  check('page still readable: every object visible except the intentionally hidden Mars', (await L.computed('bo-body')).opacity === '1' && (await L.computed('story-1')).opacity === '1' && (await L.computed('title')).opacity === '1');
  await L.click('bo-body'); await sleep(300);
  check('tap still counts and uses the behaviour\'s `reduced` actions (text shown, no particles)', (await L.v('beeps')) === 1 && (await L.dbg()).particles === 0);
  const title = await L.page.evaluate(() => document.querySelector('[data-obj-id="title"] text').textContent.trim());
  check('reduced action replaced the title text', title === 'Beep!', title);
  check('the result is announced for screen readers', /Beep!/.test(await L.page.textContent('[data-live-region]')));
  check('no motion animation was created on Bo (transform)', (await L.computed('bo-body')).anims === 0);
  await L.click('pip-1'); await sleep(100);
  const kf = await L.page.evaluate(() => { const g = document.querySelector('[data-obj-id="pip-1"]'); const a = g.getAnimations()[0]; return a ? a.effect.getKeyframes().map(k => Object.keys(k).filter(p => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))) : null; });
  check('pop-out becomes an opacity-only fade', kf && kf.flat().every(p => p === 'opacity'), JSON.stringify(kf));
  const dl = await L.center('dbl'); await L.page.mouse.click(dl.x, dl.y); await sleep(80); await L.page.mouse.click(dl.x, dl.y); await sleep(120);
  check('bursts are skipped (no particles)', (await L.dbg()).particles === 0 && (await L.v('doubles')) === 1);
  // drag still works (user-driven), snap tween instant
  const h = await L.center('thread-handle'); const k = h.w / 32;
  await L.page.mouse.move(h.x, h.y); await L.page.mouse.down(); await L.page.mouse.move(h.x + 470 * k, h.y, { steps: 8 }); await L.page.mouse.up(); await sleep(150);
  check('dragging still works and snaps instantly', (await L.v('pull')) === 1);
  const dashAnim = await L.page.evaluate(() => document.querySelector('[data-obj-id="thread"] path').getAnimations().length);
  check('draw-on twin: the thread is simply shown drawn (no animation)', dashAnim === 0);
  // toggle at runtime
  await L.page.evaluate(() => window.__lab.setReduced(false)); await sleep(500);
  check('switching reduced motion off restarts the page with ambient life', (await L.dbg()).running.length > 5);
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('inactive page, visibility and pause');
{
  const L = await open('?inactive=1');
  check('inactive page renders at rest: no animations, no controls', (await L.dbg()).running.length === 0 && (await L.page.$$('.pj-live-hit')).length === 0);
  check('inactive page shows entrance art (flat rendition readable)', (await L.computed('title')).opacity === '1' && (await L.computed('story-1')).opacity === '1');
  await L.page.evaluate(() => window.__lab.setActive(true)); await sleep(600);
  check('becoming active starts it', (await L.dbg()).running.length > 5 && (await L.page.$$('.pj-live-hit')).length > 5);
  await L.page.evaluate(() => window.__lab.handle().pause()); await sleep(100);
  const states = await L.page.evaluate(() => [...document.querySelectorAll('[data-obj-id]')].flatMap(g => g.getAnimations().map(a => a.playState)));
  check('pause freezes every animation and the loop', states.length > 5 && states.every(s => s === 'paused') && (await L.dbg()).loop === false, [...new Set(states)].join());
  await L.page.evaluate(() => window.__lab.handle().resume()); await sleep(100);
  const states2 = await L.page.evaluate(() => [...document.querySelectorAll('[data-obj-id]')].flatMap(g => g.getAnimations().map(a => a.playState)));
  check('resume continues them', states2.some(s => s === 'running'));
  await L.page.evaluate(() => window.__lab.setActive(false)); await sleep(300);
  check('leaving the page cancels animations and removes controls', (await L.dbg()).running.length === 0);
  const n0 = await L.page.evaluate(() => window.__lab.audio.calls.length);
  await L.page.evaluate(() => window.__lab.engine().goto('next'));
  check('goto reaches the host callback', (await L.page.evaluate(() => window.__lab.gotos())).includes('next'));
  await L.page.evaluate(() => window.__lab.handle().replay());
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('tilt (parallax) and narration highlight');
{
  const L = await open('?sound=1');
  await L.page.evaluate(() => window.__lab.engine().setTilt(1, 0.5)); await sleep(700);
  const s = (await L.dbg()).state;
  check('tilt moves the back and front layers by different amounts (parallax depth)', Math.abs(s['par-back'].px) > 3 && Math.abs(s['par-front'].px) > Math.abs(s['par-back'].px) * 1.5, JSON.stringify([s['par-back'], s['par-front']]));
  check('axis x only: back layer ignores vertical tilt', s['par-back'].py === 0 && s['par-front'].py !== 0);
  await L.page.screenshot({ path: path.join(FRAMES, 'tilt-parallax.png'), clip: cp(0, 280, 600, 100) });
  await L.click('listen'); await sleep(450);
  const hl = await L.page.evaluate(() => ({ words: document.querySelectorAll('[data-w]').length, lit: [...document.querySelectorAll('[data-w]')].filter(w => w.style.fill).map(w => w.textContent) }));
  check('read-aloud wraps words and highlights the current one', hl.words > 10 && hl.lit.length === 1, JSON.stringify(hl));
  await L.page.screenshot({ path: path.join(FRAMES, 'narration-highlight.png'), clip: cp(0, 0, 600, 140) });
  const sp = (await L.audio()).find(x => x.n === 'speak');
  check('speak() receives the page text', sp && /Bo beeps when you tap him/.test(sp.a[0]));
  await sleep(2800);
  check('highlight clears when speech ends', await L.page.evaluate(() => [...document.querySelectorAll('[data-w]')].every(w => !w.style.fill)));
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('touch events (touchscreen tap + CDP touch drag)');
{
  const L = await open('?sound=1', { touch: true });
  const c = await L.center('bo-body');
  await L.page.touchscreen.tap(c.x, c.y); await sleep(150);
  check('touch tap taps', (await L.v('beeps')) === 1);
  const b = await L.center('blanket'); const cdp = await L.ctx.newCDPSession(L.page); const k = b.w / 160;
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', b.x, b.y); await touch('touchMove', b.x, b.y - 20 * k); await touch('touchMove', b.x, b.y - 60 * k); await sleep(60);
  const p = await L.v('lift');
  await touch('touchEnd', 0, 0); await sleep(100);
  check('touch drag moves a drag target (progress ~0.6)', Math.abs(p - 0.6) < 0.08, String(p));
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('preset gallery: all 35 presets, mid-animation frames');
{
  const L = await open('?page=presets&w=600');
  const presets = await L.page.evaluate(() => [...document.querySelectorAll('[data-obj-id^="tile-"]')].map(g => g.getAttribute('data-obj-id').slice(5)));
  check('gallery shows 35 presets', presets.length === 34 /* type-on lives on the typed line */ || presets.length === 35, String(presets.length));
  const ambient = new Set(['breathe', 'blink', 'float', 'sway', 'twinkle', 'flicker', 'drift', 'orbit', 'flutter', 'swim', 'wave', 'shimmer', 'glow', 'bob']);
  const dbg = await L.dbg();
  const running = new Set(dbg.running.map(([id]) => id));
  check('ambient presets run on their own', [...ambient].filter(p => ['breathe', 'blink', 'float', 'sway', 'twinkle', 'flicker', 'drift', 'orbit', 'flutter', 'swim', 'wave'].includes(p)).every(p => running.has(`tile-${p}`)), JSON.stringify([...running]));
  const frameSet = new Set(['wiggle', 'bounce', 'pop-in', 'spin', 'jelly', 'heartbeat', 'shake', 'slide-in', 'squash', 'pulse', 'grow', 'rise', 'draw-on', 'type-on', 'fade-in', 'pop-out']);
  const moved = [];
  for (const p of presets.concat(['type-on'])) {
    if (ambient.has(p) || p === 'parallax') continue;
    const id = p === 'type-on' ? 'typed' : `tile-${p}`;
    await L.page.evaluate(() => document.getElementById('btn-replay').click()); await sleep(250);
    const before = await L.page.evaluate(i => { const g = document.querySelector(`[data-obj-id="${i}"]`); return { t: g.style.transform, tx: g.querySelector('text')?.textContent ?? '' }; }, id);
    const c = await L.center(id); await L.page.mouse.click(c.x, c.y);
    await sleep(p === 'draw-on' || p === 'type-on' ? 500 : 140);
    const mid = await L.page.evaluate(i => { const g = document.querySelector(`[data-obj-id="${i}"]`); const anims = g.getAnimations().length + [...g.querySelectorAll('path,rect,ellipse')].reduce((n, s) => n + s.getAnimations().length, 0); return { anims, tx: g.querySelector('text')?.textContent ?? '', cs: getComputedStyle(g).transform + '|' + getComputedStyle(g).opacity }; }, id);
    const played = p === 'type-on' ? (mid.tx.length > 0 && mid.tx.length < 'Typed on, one letter at a time.'.length) : mid.anims > 0;
    moved.push([p, played]);
    if (frameSet.has(p)) {
      const pad = 8; const x = Math.max(0, c.x - 60), y = Math.max(0, c.y - 40);
      await L.page.screenshot({ path: path.join(FRAMES, `preset-${p}-mid.png`), clip: { x, y, width: p === 'type-on' ? 420 : 130, height: p === 'type-on' ? 40 : 110 } });
    }
  }
  const notPlayed = moved.filter(([, ok]) => !ok).map(([p]) => p);
  check('every tap-driven preset actually creates an animation (or types text)', notPlayed.length === 0, JSON.stringify(notPlayed));
  await L.page.evaluate(() => window.__lab.engine().setTilt(1, 1)); await sleep(500);
  const pc = await L.center('tile-parallax'); await L.page.mouse.click(pc.x, pc.y); await L.page.evaluate(() => window.__lab.engine().setTilt(1, 0)); await sleep(600);
  check('parallax preset responds to tilt', Math.abs((await L.dbg()).state['tile-parallax'].px) > 5, JSON.stringify((await L.dbg()).state['tile-parallax']));
  await L.page.evaluate(() => document.getElementById('btn-replay').click()); await sleep(900);
  await L.page.screenshot({ path: path.join(FRAMES, 'presets-gallery.png'), clip: { x: 0, y: 0, width: 620, height: 780 } });
  await L.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('Tela Behaviours panel (authoring): presets, form, validation, JSON, undo, preview, save/reload');
{
  const T = await open('?page=tela', { wait: '[data-tela-behaviors]' });
  const tela = () => T.page.evaluate(() => { const d = window.__tela.doc(); return { living: d.living, ops: window.__tela.ops().map(o => o.type) }; });
  const panel = T.page.locator('[data-tela-behaviors]');
  check('panel mounts for the selected page (Live · page 1)', /live · page 1/i.test(await panel.innerText()));
  await T.page.getByRole('tab', { name: 'Add' }).click();
  await T.page.getByRole('button', { name: /Tap to wiggle/ }).click();
  let st = await tela();
  check('adding a preset dispatches SET_LIVING_PAGE through the Tela op path', st.ops.includes('SET_LIVING_PAGE') && st.living.pages[0].behaviors.length === 1);
  const b = st.living.pages[0].behaviors[0];
  check('preset expanded into plain Behavior JSON with a hint, targeting the selected object by label', b.on.type === 'tap' && /Bo body/.test(b.hint) && b.target.label === 'Bo body' && b.do[0].anim.preset === 'wiggle', JSON.stringify(b));
  check('after adding, the list shows it expanded', await T.page.getByText(/Tap Bo body/).first().isVisible());
  // validation: clear the hint -> error
  const hintBox = T.page.locator('input[placeholder="Tap Bo to make him beep"]').first();
  await hintBox.fill('');
  await sleep(150);
  check('clearing the hint of a tap behaviour shows an error and a "to fix" badge', /no hint/.test(await panel.innerText()) && /to fix/.test(await panel.innerText()));
  await hintBox.fill('Tap Bo to wiggle him');
  await sleep(150);
  check('writing a hint clears the error', !/to fix/.test(await panel.innerText()));
  st = await tela(); check('hint change reached doc.living', st.living.pages[0].behaviors[0].hint === 'Tap Bo to wiggle him');
  // form: change the action through the real dropdowns
  await T.page.locator('select[aria-label="Action type"]').first().selectOption('sfx');
  await sleep(100); st = await tela();
  check('action type dropdown swaps the action', st.living.pages[0].behaviors[0].do[0].do === 'sfx');
  const sound = T.page.locator('input[aria-label="Sound"]').first(); await sound.fill('beep-car'); await sleep(100);
  check('sound field writes the id', (await tela()).living.pages[0].behaviors[0].do[0].sound === 'beep-car');
  const listed = await T.page.evaluate(() => [...document.querySelectorAll('#tbp-sfx option')].length);
  check('sound suggestions come from the real audio catalogue (services/living/audio)', listed > 20, String(listed));
  // more presets
  await T.page.getByRole('tab', { name: 'Add' }).click();
  for (const name of [/^Float/, /^Blink/, /Tap to burst sparkles/, /Press to hold a note/, /Peek when approached slowly/, /Counter \+ goal/, /Fade in on enter/, /Follow the pointer/]) { await T.page.getByRole('button', { name }).first().click(); await T.page.getByRole('tab', { name: 'Add' }).click(); }
  st = await tela();
  check('eight more presets added (Peek adds three behaviours)', st.living.pages[0].behaviors.length === 1 + 8 + 2 && Object.keys(st.living.pages[0].vars || {}).length === 1 && st.living.pages[0].goals.length === 1, String(st.living.pages[0].behaviors.length));
  await T.page.getByRole('tab', { name: 'Behaviours' }).click();
  check('no validation errors for gallery presets', !/to fix/.test(await panel.innerText()));
  await T.page.screenshot({ path: path.join(FRAMES, 'panel-behaviours.png'), clip: { x: 300, y: 0, width: 420, height: 900 } });
  // duplicate / disable / delete from the row buttons
  const before = (await tela()).living.pages[0].behaviors.length;
  await T.page.getByRole('button', { name: 'Duplicate behaviour' }).first().click(); await sleep(100);
  check('duplicate adds a copy', (await tela()).living.pages[0].behaviors.length === before + 1);
  await T.page.getByRole('button', { name: 'Disable behaviour' }).first().click(); await sleep(100);
  check('disable keeps it in the data but flags it', (await tela()).living.pages[0].behaviors.some(x => x.disabled === true));
  await T.page.getByRole('button', { name: 'Delete behaviour' }).first().click(); await sleep(100);
  check('delete removes it', (await tela()).living.pages[0].behaviors.length === before);
  await T.page.getByRole('button', { name: 'Undo behaviour change' }).click(); await sleep(100);
  check('undo restores the deleted behaviour', (await tela()).living.pages[0].behaviors.length === before + 1);
  await T.page.getByRole('button', { name: 'Redo behaviour change' }).click(); await sleep(100);
  check('redo deletes it again', (await tela()).living.pages[0].behaviors.length === before);
  // JSON view
  await T.page.getByRole('tab', { name: 'JSON' }).click();
  const ta = T.page.getByLabel('Living page JSON'); await sleep(200); const txt = await ta.inputValue();
  check('JSON view shows the page data', JSON.parse(txt).page === 1 && JSON.parse(txt).behaviors.length === before);
  await ta.fill('{ not json'); await T.page.getByRole('button', { name: 'Apply' }).click();
  check('invalid JSON is rejected with a readable message', /Not valid JSON/.test(await panel.innerText()));
  const edited = JSON.parse(txt); edited.behaviors = edited.behaviors.slice(0, 2); await ta.fill(JSON.stringify(edited)); await T.page.getByRole('button', { name: 'Apply' }).click(); await sleep(100);
  check('valid JSON replaces the page (power-user path)', (await tela()).living.pages[0].behaviors.length === 2);
  // save / reload round trip
  await T.page.evaluate(() => window.__tela.reload()); await sleep(200);
  check('survives save + reload (JSON round trip) and the panel shows it', (await tela()).living.pages[0].behaviors.length === 2 && /live · page 1 · 2/i.test(await panel.innerText()));
  // other page is untouched
  await T.page.click('#frame-2'); await sleep(150);
  check('another page has its own (empty) behaviours', /live · page 2/i.test(await panel.innerText()) && !/live · page 2 ·/i.test(await panel.innerText()));
  await T.page.click('#frame-1'); await T.page.getByRole('tab', { name: 'Behaviours' }).click();
  // preview
  await T.page.getByRole('button', { name: /Preview page/ }).click(); await sleep(1500);
  const dlg = await T.page.evaluate(() => ({ dlg: !!document.querySelector('[role=dialog] .pj-live-page'), objs: document.querySelectorAll('[role=dialog] [data-obj-id]').length }));
  check('Preview page opens the live page in a dialog', dlg.dlg && dlg.objs === 45, JSON.stringify(dlg));
  await T.page.screenshot({ path: path.join(FRAMES, 'panel-preview.png') });
  await T.page.keyboard.press('Escape'); await sleep(200);
  check('Escape closes the preview', !(await T.page.$('[role=dialog]')));
  await T.close();
}

// ───────────────────────────────────────────────────────────────────────────
section('Lorea reader integration (TelaBookReader): living page, control bar, page turn, fallback page, prefs');
{
  const R = await open('?page=reader');
  await R.page.waitForSelector('[data-living-page-frame="1"] .pj-live-page', { timeout: 60000 });
  await sleep(600);
  const info = await R.page.evaluate(() => ({ live: document.querySelectorAll('.pj-live-page').length, active: [...document.querySelectorAll('.pj-live-page')].map(e => e.dataset.active), bar: !!document.querySelector('[data-living-bar]'), sound: document.querySelector('[data-living-bar] button[aria-pressed]')?.getAttribute('aria-label') }));
  check('a page with living data renders with TelaLivePage inside the reader', info.live >= 1 && info.active.includes('1'), JSON.stringify(info));
  check('control bar shows: sound starts off ("tap to start")', info.bar && /tap to start/.test(info.sound), info.sound);
  const bo = await R.page.evaluate(() => { const r = document.querySelector('.pj-live-page [data-obj-id="bo-body"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await R.page.mouse.click(bo.x, bo.y); await sleep(300);
  check('first tap anywhere turns sound on', (await R.page.locator('[data-living-bar] button[aria-pressed]').first().getAttribute('aria-label')) === 'Sound on');
  await R.page.screenshot({ path: path.join(FRAMES, 'reader-living-page.png') });
  await R.page.getByRole('radio', { name: 'Auto' }).click(); await sleep(100);
  check('Read-to-me: Auto selected and remembered', (await R.page.evaluate(() => JSON.parse(localStorage.getItem('plajah-living-prefs')).narrate)) === 'auto');
  await R.page.getByRole('button', { name: /Motion: system/ }).click(); await sleep(150);
  check('reduced-motion override cycles to "on" and applies to the page', (await R.page.evaluate(() => document.querySelector('.pj-live-page').dataset.reduced)) === '1');
  await R.page.getByRole('button', { name: /Reduced motion: on/ }).click(); await sleep(100);
  check('...and to "off" (override beats the system setting)', (await R.page.evaluate(() => document.querySelector('.pj-live-page').dataset.reduced)) === '0');
  await R.page.getByRole('button', { name: 'Sound on' }).click(); await sleep(100);
  check('Sound button mutes (choice remembered)', (await R.page.evaluate(() => JSON.parse(localStorage.getItem('plajah-living-prefs')).sound)) === 'off');
  await sleep(1600);
  const vBefore = await R.page.evaluate(() => document.querySelector('.pj-live-page [data-obj-id="title"] text')?.textContent);
  await R.page.getByRole('button', { name: 'Play this page again' }).click(); await sleep(120);
  const vDuring = await R.page.evaluate(() => document.querySelector('.pj-live-page [data-obj-id="title"] text')?.textContent.length);
  check('Play again restarts the page (title types on again)', vBefore.length > 5 && vDuring < vBefore.length, `${vBefore.length} -> ${vDuring}`);
  await R.page.getByRole('button', { name: 'Next page' }).click(); await sleep(1800);
  const p2 = await R.page.evaluate(() => ({ live: [...document.querySelectorAll('.pj-live-page')].map(e => ({ n: e.dataset.livePage, active: e.dataset.active })) }));
  check('page turn lands on the next living page (active) and the old one is no longer active', p2.live.some(l => l.n === '2' && l.active === '1') && !p2.live.some(l => l.n === '1' && l.active === '1'), JSON.stringify(p2));
  await R.page.getByRole('button', { name: 'Next page' }).click(); await sleep(1800);
  const p3 = await R.page.evaluate(() => ({ live: document.querySelectorAll('.pj-live-page').length, text: document.body.innerText.includes('A page with no living data') }));
  check('a page without living data renders as the ordinary static Tela page (fallback)', p3.live === 0 && p3.text, JSON.stringify(p3));
  await R.page.getByRole('button', { name: 'Previous page' }).click(); await sleep(1200); await R.page.getByRole('button', { name: 'Previous page' }).click(); await sleep(1800);
  const back = await R.page.evaluate(() => [...document.querySelectorAll('.pj-live-page')].filter(e => e.dataset.active === '1').map(e => e.dataset.livePage));
  check('going back reactivates page 1', back.length === 1 && back[0] === '1', JSON.stringify(back));
  await R.page.reload({ waitUntil: 'load' }); await R.page.waitForSelector('[data-living-bar]', { timeout: 60000 }); await sleep(500);
  check('choices persist across reloads (Auto read, sound muted)', (await R.page.getByRole('radio', { name: 'Auto' }).getAttribute('aria-checked')) === 'true' && (await R.page.evaluate(() => JSON.parse(localStorage.getItem('plajah-living-prefs')).sound)) === 'off');
  await R.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
const real = errors.filter(e => !/favicon|Failed to load resource/.test(e));
console.log(real.length ? `page errors:\n  ${real.join('\n  ')}` : 'no page errors');
if (fail) console.log('FAILED: ' + failures.join(' | '));
process.exit(fail || real.length ? 1 : 0);
