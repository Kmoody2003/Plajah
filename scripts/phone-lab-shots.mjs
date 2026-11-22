// Screenshots of the Phone lab (real PhoneHub over the mock telecom bridge). Boots the lab's Vite
// server in-process (port 3331, closed at the end), drives each screen at phone and Fold-inner sizes,
// and also writes one contact-sheet PNG per size.
//   node scripts/phone-lab-shots.mjs [outDir]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'phone-lab-shots'));
fs.mkdirSync(out, { recursive: true });

const server = await createServer({ configFile: path.resolve('phone-lab.vite.config.mjs') });
await server.listen();
const BASE = 'http://127.0.0.1:3331';
const browser = await chromium.launch();
const errors = [];

const SIZES = [
  { tag: 'phone', label: 'Phone 375×812', viewport: { width: 375, height: 812 }, mobile: true },
  { tag: 'fold', label: 'Fold inner 884×1104', viewport: { width: 884, height: 1104 }, mobile: true },
];

async function page(size, query) {
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: 2, isMobile: size.mobile, hasTouch: size.mobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${size.tag} ${query}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${size.tag} ${query}: ${m.text()}`); });
  p.on('dialog', d => d.dismiss());
  await p.goto(`${BASE}/?bare=1${query}`, { waitUntil: 'load', timeout: 180000 });
  await p.getByText('Keypad', { exact: true }).first().waitFor({ timeout: 180000 });
  await p.waitForTimeout(900);
  return p;
}
const tab = (p, name) => p.locator('button', { hasText: new RegExp(`^${name}`) }).last().click().then(() => p.waitForTimeout(400));

const shots = {};
for (const size of SIZES) {
  const list = [];
  const snap = async (p, name, title) => {
    const f = path.join(out, `${size.tag}-${name}.png`);
    await p.screenshot({ path: f });
    list.push({ f, title });
    console.log('shot', path.basename(f));
  };

  let p = await page(size, '&launch=dial:3135550142');
  await snap(p, '1-keypad', 'Keypad');
  await tab(p, 'Recents'); await snap(p, '2-recents', 'Recents');
  await tab(p, 'Contacts'); await snap(p, '3-contacts', 'Contacts');
  await p.getByText('Andre Mitchell').first().click(); await p.waitForTimeout(300);
  await snap(p, '4-contact-sheet', 'Contact (phone + Plajah)');
  await p.mouse.click(10, 10); await p.waitForTimeout(200);
  await tab(p, 'Messages'); await snap(p, '5-messages', 'Messages');
  await p.context().close();

  p = await page(size, '&launch=sms:3135550177');
  await p.waitForTimeout(400);
  await snap(p, '6-conversation', 'Text conversation');
  await p.context().close();

  p = await page(size, '');
  await tab(p, 'Messages');
  await p.locator('button', { hasText: 'Bianca Lee' }).first().click(); await p.waitForTimeout(500);
  await snap(p, '6b-rcs', 'RCS conversation (bridge)');
  await p.context().close();

  p = await page(size, '&rcs=off');
  await tab(p, 'Messages'); await snap(p, '6c-rcs-setup', 'Turning RCS on');
  await p.context().close();

  p = await page(size, '&call=incoming');
  await snap(p, '7-incoming', 'Incoming call');
  await p.context().close();

  p = await page(size, '&call=active');
  await snap(p, '8-in-call', 'In call');
  await p.context().close();

  shots[size.tag] = list;
}

// Contact sheets
for (const size of SIZES) {
  const list = shots[size.tag];
  const cols = size.tag === 'phone' ? 4 : 4;
  const w = size.tag === 'phone' ? 300 : 360;
  const html = `<html><body style="margin:0;background:#111;font-family:system-ui;color:#fff;padding:24px">
    <div style="font-size:22px;font-weight:800;margin-bottom:16px">Plajah Phone — ${size.label}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:18px">
    ${list.map(s => `<div><div style="font-size:13px;opacity:.7;margin-bottom:6px">${s.title}</div><img src="data:image/png;base64,${fs.readFileSync(s.f).toString('base64')}" style="width:${w}px;border-radius:14px;border:1px solid #333"></div>`).join('')}
    </div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: cols * (w + 18) + 48, height: 800 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  const f = path.join(out, `sheet-${size.tag}.png`);
  await p.screenshot({ path: f, fullPage: true });
  console.log('sheet', f);
  await ctx.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
else console.log('no page errors');
