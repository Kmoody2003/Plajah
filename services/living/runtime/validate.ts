// Authoring validation: pure, shared by the Behaviours panel (warnings) and the tests.
import type { Action, Behavior, Cond, LivingPage, Score } from '../contracts';
import { condVars } from './conditions';
import { ANIM_PRESET_LIST, BURST_KIND_LIST, INTERACTIVE_TRIGGERS } from './catalog';
import { resolveTarget, type ObjInfo } from './targets';

export interface Issue { severity: 'error' | 'warning'; code: string; message: string; behaviorId?: string }

/** Triggers that REQUIRE a hint (contract rule 3). Hover/tilt/key are optional but encouraged. */
export const HINT_REQUIRED = new Set(['tap', 'doubleTap', 'press', 'drag', 'proximity']);
export const isInteractive = (b: Behavior) => INTERACTIVE_TRIGGERS.includes(b.on.type);

function walk(actions: Action[], fn: (a: Action) => void) { for (const a of actions) { fn(a); if (a.do === 'if') { walk(a.then, fn); walk(a.else ?? [], fn); } } }

export interface ValidateOptions { objects?: ObjInfo[]; scores?: Record<string, Score>; sfxIds?: string[]; instruments?: string[]; beds?: string[] }

export function validateLivingPage(page: LivingPage, opts: ValidateOptions = {}): Issue[] {
  const out: Issue[] = [];
  const ids = new Set<string>();
  const declared = new Set(Object.keys(page.vars ?? {}));
  const written = new Set<string>();
  for (const b of page.behaviors) {
    walk([...b.do, ...(b.reduced ?? [])], a => { if (a.do === 'var') written.add(a.name); });
    if (b.on.type === 'drag' && b.on.progressVar) written.add(b.on.progressVar);
  }
  const known = (n: string) => declared.has(n) || written.has(n) || /^(tilt[XY]?)$/.test(n);

  for (const b of page.behaviors) {
    const at = (code: string, message: string, severity: Issue['severity'] = 'warning') => out.push({ severity, code, message, behaviorId: b.id });
    if (ids.has(b.id)) at('duplicate-id', `Another behaviour already uses the id "${b.id}".`, 'error');
    ids.add(b.id);
    if (HINT_REQUIRED.has(b.on.type) && !b.hint?.trim()) at('missing-hint', `"${b.label || b.id}" can be tapped, pressed, dragged or approached but has no hint, so a screen reader or keyboard user cannot find it. Add a short instruction like "Tap Bo to make him beep".`, 'error');
    else if ((b.on.type === 'hover' || b.on.type === 'tilt' || b.on.type === 'key') && !b.hint?.trim()) at('no-hint', `"${b.label || b.id}" has no hint; adding one helps people who cannot use the pointer.`);
    if (opts.objects && !('page' in b.target)) {
      if (!resolveTarget(b.target, opts.objects, page.groups).length) at('target-empty', `"${b.label || b.id}" targets nothing on this page (${JSON.stringify(b.target)}).`);
    }
    for (const c of [b.when, b.on.type === 'when' ? b.on.cond : undefined] as Array<Cond | undefined>) for (const v of condVars(c)) if (!known(v)) at('var-undeclared', `Condition reads "${v}" but nothing declares or sets it.`);
    walk([...b.do, ...(b.reduced ?? [])], a => {
      if (a.do === 'animate' && a.anim.preset && !ANIM_PRESET_LIST.includes(a.anim.preset)) at('unknown-preset', `Unknown animation preset "${a.anim.preset}".`, 'error');
      if (a.do === 'animate' && a.anim.preset === 'flicker' && (a.anim.durationMs ?? 2400) < 700) at('flash-rate', 'Flicker faster than about 3 changes a second can bother people with photosensitivity.');
      if ((a.do === 'burst' || a.do === 'trail') && !BURST_KIND_LIST.includes(a.kind)) at('unknown-burst', `Unknown particle kind "${a.kind}".`, 'error');
      if (a.do === 'music' && opts.scores && !opts.scores[a.cue]) at('cue-missing', `Music cue "${a.cue}" is not in this book's scores.`);
      if (a.do === 'sfx' && opts.sfxIds && !opts.sfxIds.includes(a.sound)) at('sfx-unknown', `Sound "${a.sound}" is not in the sound catalogue.`);
      if (a.do === 'note' && opts.instruments && !opts.instruments.includes(a.instrument)) at('instrument-unknown', `Instrument "${a.instrument}" is not in the catalogue.`);
      if (a.do === 'ambience' && a.bed && opts.beds && !opts.beds.includes(a.bed)) at('bed-unknown', `Ambience bed "${a.bed}" is not in the catalogue.`);
      if (a.do === 'wait' && a.ms > 20000) at('wait-long', 'A wait over 20 seconds is probably a mistake.');
    });
    if (b.on.type === 'timer' && b.on.afterMs < 330 && b.on.every) at('flash-rate', 'A repeating timer faster than 3 times a second can bother people with photosensitivity.');
  }
  if (page.music && opts.scores && !opts.scores[page.music.cue]) out.push({ severity: 'warning', code: 'cue-missing', message: `Page music cue "${page.music.cue}" is not in this book's scores.` });
  for (const g of page.goals ?? []) for (const v of condVars(g.when)) if (!known(v)) out.push({ severity: 'warning', code: 'goal-var', message: `Goal "${g.label}" reads "${v}" but nothing declares or sets it.` });
  return out;
}
