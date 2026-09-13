// councilService — the client's door to the Council of Art Directors.
//
// Everything goes through the server (the directors' profiles are one shared team, and the model
// keys live there); the client never talks to Firestore for council data. Aria is the face: use
// `ariaIntro` for the sentence she says before the team's work appears.
import { auth } from '../firebase';
import { COUNCIL_DIRECTORS, COUNCIL_LIST } from './councilDirectors';
import type { CouncilBrief, CouncilDirector, CouncilDirectorId, Deliberation, DeliberationDepth, DirectorProfile, ResearchResult } from './councilTypes';

export { COUNCIL_DIRECTORS, COUNCIL_LIST };
export type { CouncilBrief, CouncilDirector, CouncilDirectorId, Deliberation, DirectorProfile, ResearchResult };

async function token(): Promise<string | null> {
  const user = auth?.currentUser; if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any)?.error || `Council request failed (${r.status})`);
  return data as T;
}

export const councilService = {
  directors: () => call<{ directors: CouncilDirector[]; profiles: DirectorProfile[] }>('/api/council/directors'),
  deliberate: (brief: CouncilBrief, opts: { depth?: DeliberationDepth; directors?: CouncilDirectorId[]; tier?: string } = {}) =>
    call<Deliberation>('/api/council/deliberate', { method: 'POST', body: JSON.stringify({ brief, ...opts }) }),
  research: (directorId: CouncilDirectorId, topic: string) =>
    call<ResearchResult>('/api/council/research', { method: 'POST', body: JSON.stringify({ directorId, topic }) }),
  sessions: () => call<{ sessions: Deliberation[] }>('/api/council/sessions'),
  session: (id: string) => call<Deliberation>(`/api/council/sessions/${encodeURIComponent(id)}`),
  decide: (id: string, choice: 'LEAD' | 'COUNTERPOINT' | 'AGAIN' | 'OWN', note?: string) =>
    call<Deliberation>(`/api/council/sessions/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ choice, note }) }),
};

/** The line Aria says while the room is filling. Varies so it never reads as a loading string. */
export function ariaIntro(brief: CouncilBrief): string {
  const lines = [
    'I have taken this to the council. Give them a minute — they do not agree quickly, and that is the point.',
    'The team is in the room. Six directors, six different answers; I will tell you where they split and which side I take.',
    'Bringing this to the council. I will come back with a direction, a counterpoint worth keeping, and one decision that is yours.',
  ];
  let h = 0; for (const c of brief.ask) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lines[h % lines.length];
}

/** Director colour: the identity they carry in the platform's art-direction spec. */
export function directorSwatch(id: CouncilDirectorId, ad: Record<string, { bg: string; fg: string; series: string[] }>) {
  const style = COUNCIL_DIRECTORS[id].councilStyle;
  const a = ad[style];
  return a ? { bg: a.bg, fg: a.fg, accent: a.series[0] } : { bg: '#16131F', fg: '#F5F2F9', accent: '#8b5cf6' };
}
