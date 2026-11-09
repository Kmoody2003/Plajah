// services/livewire/target.ts — Mux or Livewire for this stream? SERVER SIDE.
//
// Mux stays the answer for everyone until the owner turns Livewire on. Even then it opens to an
// allow-list first (internal accounts), and any stream can be forced back to Mux.
//   LIVEWIRE_ENABLED=1            master switch (default off)
//   LIVEWIRE_ALLOW_UIDS=a,b,c     who gets Livewire while testing ('*' = everyone)
//   LIVEWIRE_ORIGIN_HOST          origin hostname the broadcaster pushes to
//   LIVEWIRE_CDN_HOST             pull-zone hostname viewers play from
// Missing origin or CDN host = not configured = Mux, whatever the switch says.

import type { LiveTarget } from './types';

export interface TargetEnv {
  LIVEWIRE_ENABLED?: string;
  LIVEWIRE_ALLOW_UIDS?: string;
  LIVEWIRE_ORIGIN_HOST?: string;
  LIVEWIRE_CDN_HOST?: string;
}

export interface TargetDecision { target: LiveTarget; reason: string }

export function resolveLiveTarget(uid: string, env: TargetEnv, opts: { forceMux?: boolean } = {}): TargetDecision {
  if (opts.forceMux) return { target: 'mux', reason: 'forced to Mux for this stream' };
  if (env.LIVEWIRE_ENABLED !== '1') return { target: 'mux', reason: 'Livewire is off' };
  if (!env.LIVEWIRE_ORIGIN_HOST || !env.LIVEWIRE_CDN_HOST) return { target: 'mux', reason: 'Livewire origin/CDN not configured' };
  const allow = (env.LIVEWIRE_ALLOW_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allow.includes('*') && !allow.includes(uid)) return { target: 'mux', reason: 'not on the Livewire allow-list' };
  return { target: 'livewire', reason: 'Livewire enabled for this account' };
}
