// The results card: what a run or a shift paid, and everything it opened. Shared by the game and the garage.
import type { Outcome } from './progress';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const cr = (n: number): string => `${Math.round(n).toLocaleString('en-US')} cr`;
const MEDAL_COLOR: Record<string, string> = { bronze: '#d08a4e', silver: '#cfd8e3', gold: '#ffd166', elohim: '#00f5d4' };

export function outcomeHtml(title: string, sub: string, o: Outcome): string {
  const medal = o.medal ? `<span style="display:inline-block;margin-left:10px;padding:2px 12px;border-radius:999px;border:1px solid ${MEDAL_COLOR[o.medal]};color:${MEDAL_COLOR[o.medal]};font:700 12px Outfit,sans-serif;letter-spacing:.18em;text-transform:uppercase">${o.medal}${o.newMedal ? ' · new' : ''}</span>` : '';
  const lines = o.lines.map((l) => `<div class="oc-line"><span>${esc(l.label)}</span><b>+${l.credits.toLocaleString('en-US')}</b></div>`).join('');
  const lvl = o.levelUps.length ? `<div class="oc-level">Level ${o.levelUps[o.levelUps.length - 1]}${o.levelBonus ? ` · +${o.levelBonus.toLocaleString('en-US')} cr bonus` : ''}</div>` : '';
  const objs = o.objectives.map((x) => `<div class="oc-obj">Objective complete: <b>${esc(x.title)}</b>${x.reward.part ? ' · part reward' : ''}${x.reward.car ? ' · car reward' : ''}</div>`).join('');
  const ach = o.achievements.map((x) => `<div class="oc-obj">Achievement: <b>${esc(x.title)}</b></div>`).join('');
  const unl = o.newUnlocks.length ? `<div class="oc-unl"><div class="oc-h">Now available</div>${o.newUnlocks.slice(0, 8).map((u) => `<div>${u.kind === 'car' ? 'Car' : 'Part'}: ${esc(u.name)}</div>`).join('')}${o.newUnlocks.length > 8 ? `<div>and ${o.newUnlocks.length - 8} more</div>` : ''}</div>` : '';
  return `<div class="oc-title">${esc(title)}${medal}</div><div class="oc-sub">${esc(sub)}</div>${lines}<div class="oc-total"><span>Total</span><b>${cr(o.credits)}</b><span class="oc-xp">+${o.xp.toLocaleString('en-US')} XP</span></div>${lvl}${objs}${ach}${unl}`;
}

/** styles for the card; the game and the garage both inject it once */
export const OUTCOME_CSS = `
.oc-title{font:800 22px Outfit,sans-serif;letter-spacing:.04em}.oc-sub{font:500 12px Inter,sans-serif;color:rgba(255,255,255,.6);margin:2px 0 12px}
.oc-line{display:flex;justify-content:space-between;gap:16px;font:500 13px Inter,sans-serif;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)}.oc-line b{color:#ffd166;font-family:'JetBrains Mono',monospace}
.oc-total{display:flex;align-items:baseline;gap:12px;margin-top:10px;font:600 13px Outfit,sans-serif;letter-spacing:.14em;text-transform:uppercase}.oc-total b{font:800 24px Outfit,sans-serif;color:#fff;letter-spacing:.02em}.oc-xp{margin-left:auto;color:#D0BCFF}
.oc-level{margin-top:10px;padding:6px 12px;border-radius:12px;background:rgba(0,245,212,.12);border:1px solid rgba(0,245,212,.4);font:700 13px Outfit,sans-serif;color:#00f5d4}
.oc-obj{margin-top:8px;font:500 12.5px Inter,sans-serif;color:rgba(255,255,255,.82)}.oc-unl{margin-top:12px;padding:10px 12px;border-radius:14px;background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.35);font:500 12px Inter,sans-serif}.oc-h{font:700 10px Outfit,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#FF8C00;margin-bottom:4px}`;
