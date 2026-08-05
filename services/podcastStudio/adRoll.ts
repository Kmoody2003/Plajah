// adRoll.ts — roll audio ads + live-read spots during a show. Creatives come from the host's studio
// ad library (their brand deals / sponsor reads) + optional radio-station audio drops, stored per
// user in Firestore (studioAds/{uid}). Rolling an audio creative ducks the show and plays it on the
// ads bus; a live-read ducks briefly and surfaces the copy on a teleprompter. Each play returns an
// ad marker for the episode.

import { db } from '../backendService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { MixEngine } from './mixEngine';

export interface AdCreative {
  id: string;
  sponsor: string;
  label: string;
  copy?: string;       // live-read script
  audioUrl?: string;   // recorded spot (optional)
  source: 'brand-deal' | 'radio-station' | 'manual';
}
export interface AdPlay { creativeId: string; sponsor: string; at: number; mode: 'audio' | 'read' }

export async function loadAdLibrary(uid: string): Promise<AdCreative[]> {
  try { const s = await getDoc(doc(db, 'studioAds', uid)); return (s.data()?.items as AdCreative[]) || []; }
  catch { return []; }
}
export async function saveAdLibrary(uid: string, items: AdCreative[]): Promise<void> {
  try { await setDoc(doc(db, 'studioAds', uid), { items, updatedAt: Date.now() }, { merge: true }); } catch { /* */ }
}

export class AdRoll {
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  constructor(private mix: MixEngine) { mix.addChannel('ads', 'Ads', { duckable: false }); }

  async roll(creative: AdCreative): Promise<AdPlay> {
    this.mix.duck(true);
    if (creative.audioUrl) {
      try {
        const u = creative.audioUrl;
        const res = await fetch(u.startsWith('http') && !u.includes(location.host) ? `/api/proxy?url=${encodeURIComponent(u)}` : u);
        const buf = await this.mix.ctx.decodeAudioData(await res.arrayBuffer());
        const src = this.mix.ctx.createBufferSource(); src.buffer = buf;
        const gain = this.mix.ctx.createGain(); src.connect(gain);
        this.mix.connectNode('ads', gain, 'Ads');
        src.onended = () => { this.mix.duck(false); this.current = null; };
        src.start(); this.current = { src, gain };
        return { creativeId: creative.id, sponsor: creative.sponsor, at: Date.now(), mode: 'audio' };
      } catch { this.mix.duck(false); }
    }
    // live read — host reads the copy; keep a light duck for a beat
    setTimeout(() => this.mix.duck(false), 500);
    return { creativeId: creative.id, sponsor: creative.sponsor, at: Date.now(), mode: 'read' };
  }
  stop(): void { if (this.current) { try { this.current.src.stop(); } catch { /* */ } this.current = null; } this.mix.duck(false); }
}
