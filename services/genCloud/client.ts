// services/genCloud/client.ts — browser client for /api/gen-cloud (routes/genCloud.ts).
// Non-throwing: every call resolves to { ok, ... } so a closed service or dropped connection shows a
// message instead of breaking the panel. Never sees providers, model ids or costs — the server strips them.

import { auth } from '../firebase';
import type { GenKind, Resolution } from './types';

const base = () => `${(import.meta as any).env?.VITE_APP_URL ?? window.location.origin}/api/gen-cloud`;

export interface Fail { ok: false; error: string; code?: string; httpStatus: number; upgradeTo?: string }
export type Res<T> = ({ ok: true } & T) | Fail;
export const failed = <T,>(r: Res<T>): r is Fail => r.ok === false;

export interface EngineView {
  id: string; name: string; kind: GenKind; lane: 'standard' | 'premium'; blurb: string;
  credits: Partial<Record<Resolution | 'default', number>>;
  durations?: number[]; resolutions?: Resolution[]; audio?: boolean; adultOnly?: boolean;
  allowed: boolean; reason?: 'restricted_account' | 'adult_only' | 'lane_locked'; upgradeTo?: string;
}
export interface BalanceView { available: number; monthly: number; bonus: number; pack: number; held: number; frozen: number; plan: string }
export interface PackView { id: string; name: string; credits: number; priceCents: number; bonusPct: number }
export interface JobOutput { url: string; mime: string; width?: number; height?: number; seconds?: number }
export interface JobView { id: string; engine: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; credits: number; outputs: JobOutput[]; error?: string; createdAt: number; aiGenerated: true }
export interface GenBody {
  engine: string; prompt: string; seconds?: number; resolution?: Resolution; count?: number;
  aspect?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'; text?: string; imageUrl?: string;
}

async function call<T>(method: string, path: string, body?: object): Promise<Res<T>> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) return { ok: false, error: 'Sign in to generate.', httpStatus: 401 };
    const res = await fetch(`${base()}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, code: json?.code, upgradeTo: json?.upgradeTo, httpStatus: res.status };
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, error: 'Connection lost. Try again.', httpStatus: 0 };
  }
}

export const genCloud = {
  engines: () => call<{ engines: EngineView[] }>('GET', '/engines'),
  balance: () => call<BalanceView>('GET', '/balance'),
  quote: (b: GenBody) => call<{ credits: number; units: number; unitLabel: string }>('POST', '/quote', b),
  submit: (b: GenBody) => call<{ job: JobView }>('POST', '/jobs', b),
  job: (id: string) => call<{ job: JobView }>('GET', `/jobs/${encodeURIComponent(id)}`),
  packs: () => call<{ onSale: boolean; packs: PackView[] }>('GET', '/packs'),
  checkout: (packId: string) => call<{ url: string }>('POST', '/packs/checkout', { packId }),
};

/** Plan ids → names users see. */
export const PLAN_LABEL: Record<string, string> = {
  free: 'Free', spark: 'Spark', glow: 'Glow', nova: 'Nova', all_access: 'All Access',
  studio_max: 'Studio Max', studio_team: 'Studio Team', production_house: 'Production House',
};

/** Download a generated result as a File (for rooms that insert local files: Tela, Reello). */
export async function outputToFile(o: JobOutput, name: string): Promise<File> {
  const res = await fetch(o.url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const blob = await res.blob();
  const ext = o.mime.includes('mp4') ? 'mp4' : o.mime.includes('mpeg') ? 'mp3' : o.mime.includes('jpeg') ? 'jpg' : o.mime.includes('webp') ? 'webp' : 'png';
  return new File([blob], `${name}.${ext}`, { type: o.mime || blob.type });
}
