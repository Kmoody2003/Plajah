// Plain-language descriptions and defaults for the Behaviours panel. Pure and unit-tested.
import type { Action, Behavior, Cond, Target, Trigger } from '../contracts';

export const TRIGGER_NAMES: Record<Trigger['type'], string> = {
  enter: 'When the page opens', exit: 'When the page is left', idle: 'Always (ambient loop)', tap: 'Tap', doubleTap: 'Double tap', press: 'Press and hold', release: 'Let go',
  drag: 'Drag', hover: 'Pointer hovers', proximity: 'Pointer comes near', tilt: 'Tilt the device', timer: 'After a delay', when: 'When a condition becomes true', event: 'When a message arrives', key: 'Key pressed',
};

export const ACTION_NAMES: Record<Action['do'], string> = {
  animate: 'Animate', stop: 'Stop animating', set: 'Set properties', show: 'Show', hide: 'Hide', toggle: 'Show / hide', sfx: 'Play a sound', note: 'Play a note', music: 'Start music', musicStop: 'Stop music',
  musicTempo: 'Change music speed', duck: 'Lower the music', ambience: 'Set ambience', depth: 'Underwater / depth sound', narrate: 'Read aloud', var: 'Change a variable', goto: 'Go to a page', burst: 'Burst of particles',
  trail: 'Particle trail', follow: 'Follow the pointer', haptic: 'Vibrate', emit: 'Send a message', wait: 'Wait', if: 'If / else', celebrate: 'Celebrate',
};

export function describeTarget(t: Target | undefined): string {
  if (!t) return 'this object';
  if ('id' in t) return `object ${t.id}`;
  if ('label' in t) return t.label.endsWith('*') ? `objects named "${t.label.slice(0, -1)}..."` : `"${t.label}"`;
  if ('role' in t) return `role ${t.role}`;
  if ('group' in t) return `group "${t.group}"`;
  return 'the whole page';
}

export function describeCond(c: Cond): string {
  if ('var' in c) return `${c.var} ${c.op} ${String(c.value)}`;
  if ('all' in c) return c.all.map(describeCond).join(' and ');
  if ('any' in c) return c.any.map(describeCond).join(' or ');
  return `not (${describeCond(c.not)})`;
}

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case 'press': return t.minMs ? `Press and hold ${t.minMs}ms` : TRIGGER_NAMES.press;
    case 'drag': return `Drag${t.axis && t.axis !== 'both' ? ` (${t.axis} only)` : ''}${t.progressVar ? ` -> ${t.progressVar}` : ''}`;
    case 'proximity': return `Pointer within ${t.radius}${t.slowBelow !== undefined ? `, slower than ${t.slowBelow}px/s` : ''}${t.fastAbove !== undefined ? `, faster than ${t.fastAbove}px/s` : ''}`;
    case 'timer': return `${t.every ? 'Every' : 'After'} ${t.afterMs}ms`;
    case 'when': return `When ${describeCond(t.cond)}`;
    case 'event': return `On message "${t.name}"`;
    case 'key': return `Key "${t.key}"`;
    case 'tilt': return `Tilt${t.axis && t.axis !== 'both' ? ` (${t.axis})` : ''}`;
    default: return TRIGGER_NAMES[t.type];
  }
}

export function describeAction(a: Action): string {
  switch (a.do) {
    case 'animate': return `${a.anim.preset ?? 'custom animation'}${a.anim.loop === 'infinite' ? ' (loop)' : ''}`;
    case 'sfx': return `sound ${a.sound}`;
    case 'note': return `${a.instrument} ${a.note}`;
    case 'music': return `music ${a.cue}`;
    case 'burst': return `${a.kind} burst`;
    case 'trail': return `${a.kind} trail`;
    case 'var': return `${a.name} ${a.op}${a.value !== undefined ? ` ${String(a.value)}` : ''}`;
    case 'goto': return `go to ${String(a.page)}`;
    case 'wait': return `wait ${a.ms}ms`;
    case 'set': return `set ${Object.keys(a.props).join(', ')}`;
    case 'show': case 'hide': case 'toggle': return `${a.do} ${describeTarget(a.target)}`;
    case 'follow': return 'follow the pointer';
    case 'haptic': return `vibrate (${a.pattern})`;
    case 'emit': return `message "${a.name}"`;
    case 'ambience': return a.bed ? `ambience ${a.bed}` : 'ambience off';
    default: return ACTION_NAMES[a.do].toLowerCase();
  }
}

/** "Tap -> wiggle, sound pop" */
export function describeBehavior(b: Behavior): string {
  const acts = b.do.slice(0, 3).map(describeAction).join(', ') + (b.do.length > 3 ? `, +${b.do.length - 3} more` : '');
  return `${describeTrigger(b.on)} → ${acts || 'nothing yet'}`;
}

export function defaultTrigger(type: Trigger['type']): Trigger {
  switch (type) {
    case 'press': return { type, minMs: 0 };
    case 'drag': return { type, axis: 'both', progressVar: 'progress' };
    case 'proximity': return { type, radius: 120, slowBelow: 300 };
    case 'tilt': return { type, axis: 'both', gain: 1 };
    case 'timer': return { type, afterMs: 1500 };
    case 'when': return { type, cond: { var: 'count', op: '>=', value: 1 } };
    case 'event': return { type, name: 'message' };
    case 'key': return { type, key: 'k' };
    default: return { type } as Trigger;
  }
}

export function defaultAction(type: Action['do']): Action {
  switch (type) {
    case 'animate': return { do: 'animate', anim: { preset: 'wiggle' } };
    case 'stop': return { do: 'stop' };
    case 'set': return { do: 'set', props: { opacity: 1 } };
    case 'show': case 'hide': case 'toggle': return { do: type, target: { label: 'Name*' } };
    case 'sfx': return { do: 'sfx', sound: 'pop' };
    case 'note': return { do: 'note', instrument: 'marimba', note: 'C4', durationMs: 400 };
    case 'music': return { do: 'music', cue: 'main', fadeMs: 800 };
    case 'musicStop': return { do: 'musicStop', fadeMs: 600 };
    case 'musicTempo': return { do: 'musicTempo', scale: 0.8, rampMs: 1500 };
    case 'duck': return { do: 'duck', amount: 0.6, ms: 1500 };
    case 'ambience': return { do: 'ambience', bed: 'room-tone', gain: 0.5, fadeMs: 800 };
    case 'depth': return { do: 'depth', value: 0.5 };
    case 'narrate': return { do: 'narrate' };
    case 'var': return { do: 'var', name: 'count', op: 'inc' };
    case 'goto': return { do: 'goto', page: 'next' };
    case 'burst': return { do: 'burst', kind: 'sparkles', count: 12 };
    case 'trail': return { do: 'trail', kind: 'sparkles' };
    case 'follow': return { do: 'follow', target: { label: 'Name*' }, to: 'pointer', lookAt: true, maxOffset: 6 };
    case 'haptic': return { do: 'haptic', pattern: 'tap' };
    case 'emit': return { do: 'emit', name: 'message' };
    case 'wait': return { do: 'wait', ms: 500 };
    case 'if': return { do: 'if', cond: { var: 'count', op: '>=', value: 1 }, then: [], else: [] };
    case 'celebrate': return { do: 'celebrate' };
  }
}

/** Dotted-path helpers for the config-driven form fields. An empty value removes the key (keeps the JSON tidy). */
export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
}
export function setPath<T>(o: T, path: string, value: unknown): T {
  const keys = path.split('.'); const root: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) { if (value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))) delete cur[k]; else cur[k] = value; }
    else { const next = { ...(cur[k] as Record<string, unknown> | undefined) }; cur[k] = next; cur = next; }
  });
  return root as T;
}

/** Text from a form field -> a scalar (number / boolean / string). */
export function parseScalar(s: string): number | boolean | string {
  const t = s.trim(); if (t === 'true') return true; if (t === 'false') return false;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return s;
}
