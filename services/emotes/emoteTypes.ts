// emoteTypes — the shape of a Reello Live emote.
//
// An emote is a definition: a code people type (`:fire:`), the art, a motion it moves with, and
// a GEL — the colour of light it throws. The gel matters. When a crowd sends emotes, their gels
// tint the broadcast's rim light and can drive the creator's real room lights (Crowd Light). When
// many people send the same emote at once it becomes a CHORUS and evolves into something bigger.
//
// Art comes in three kinds:
//   • svg   — vector art drawn under the shared light plot (services/emotes/emoteRig.ts)
//   • kaiju — Lorik / Lumi performing a pose clip, baked from the real canvas puppet so the
//             likeness never drifts (services/emotes/packs/kaijuPack.ts)
//   • image — a creator's uploaded channel emote (PNG / GIF / WebP)

import type { Pose } from '../../components/kaiju/kaijuPose';
import type { SvgAnim } from './emoteAnimators';

export type EmotePackId =
  | 'core'       // the classics: faces + icons, glossy amber under the house light plot
  | 'kaiju'      // Lorik & Lumi, animated
  | 'neon'       // The Futurist: light as the material
  | 'riso'       // The Rebellious Hand: misregistered riso stamps
  | 'gilded'     // The Classical Mind: gold leaf, laurels, proportion
  | 'spotlight'  // The Baroque Dramatist: chiaroscuro, the stage
  | 'oneline'    // The Radical Minimalist: one weight, one line
  | 'atlas'      // The World-Eclectic Traveler: celebrations of many places, credited
  | 'channel';   // a creator's own uploads

/** How the emote travels across the stream. */
export type EmoteMotion =
  | 'float'   // rises from the bottom with a sway (the classic)
  | 'pop'     // appears in place, overshoots, settles, fades
  | 'bounce'  // drops from the top and bounces on the floor
  | 'spin'    // rises while spinning
  | 'shake'   // appears and trembles (rage, shock)
  | 'rain'    // falls from the top
  | 'stomp'   // slams in at the floor with a ground ring
  | 'beam'    // shoots straight up fast with a light trail
  | 'orbit'   // circles the centre of the frame
  | 'pulse';  // heartbeat in place

/** Who may send it. Global library emotes are 'everyone'; channel emotes can be gated. */
export type EmoteAccess = 'everyone' | 'follower' | 'member' | 'creator';

/** What a full CHORUS (tier 3) turns into. Defaults by motion when unset. */
export type ChorusEvolution =
  | 'storm'      // the whole frame rains this emote + one giant pop in the centre
  | 'wall'       // a marching row sweeps across the frame
  | 'firework'   // launches up and bursts into a ring of itself
  | 'shockwave'  // a giant stomp with a ring that rolls out to the edges
  | 'summon';    // kaiju only: the full-size character walks on and performs

export type KaijuWho = 'lorik' | 'lumi';

/** One character's performance inside a kaiju emote. */
export interface KaijuActor {
  who: KaijuWho;
  /** Pose at clip time t (seconds, 0..duration). Return a partial; the rest comes from REST. */
  pose: (t: number) => Partial<Pose>;
  /** Character-space offset/scale inside the emote frame (duo emotes put two side by side). */
  x?: number; y?: number; scale?: number;
  /** Mirror horizontally (face the partner). */
  flip?: boolean;
}

export interface KaijuArt {
  kind: 'kaiju';
  actors: KaijuActor[];
  /** Clip length in seconds; it loops. */
  duration: number;
  /** 'bust' crops head + shoulders (reads at 28 px), 'full' shows the whole body. */
  frame: 'bust' | 'full';
  /** Glyphs drawn around the characters (zzz, hearts, notes…), in emote space 0..128. Optional. */
  overlay?: (ctx: CanvasRenderingContext2D, t: number) => void;
}

export interface SvgArt {
  kind: 'svg';
  /** Returns a complete standalone <svg viewBox="0 0 128 128"> document. Called once, cached. */
  svg: () => string;
}

export interface ImageArt {
  kind: 'image';
  url: string;
  animated?: boolean;
}

export type EmoteArt = SvgArt | KaijuArt | ImageArt;

export interface EmoteDef {
  /** Globally unique, `${pack}.${code}` for library emotes, `ch.${ownerUid}.${code}` for channel ones. */
  id: string;
  /** What people type between colons, lowercase a-z0-9_ (e.g. `fire` → `:fire:`). */
  code: string;
  name: string;
  pack: EmotePackId;
  tags: string[];
  /** The light this emote throws, hex. Drives glow, crowd light, chorus flashes. */
  gel: string;
  motion: EmoteMotion;
  art: EmoteArt;
  access?: EmoteAccess;
  evolution?: ChorusEvolution;
  /** The legacy unicode emoji this replaces, so old `{emoji:'🔥'}` events map onto the library. */
  unicode?: string;
  /** Vector emotes only: how it comes alive when shown big (neon flicker, gold sheen, riso boil,
   *  spotlight). Packs set a default in emoteLibrary; `null` opts an emote out. */
  anim?: SvgAnim | null;
}

export interface EmotePack {
  id: EmotePackId;
  name: string;
  /** One line about the pack's point of view (shown in the picker). */
  blurb: string;
  /** Which council director's lens shaped it (null for core / kaiju / channel). */
  director?: 'CLASSICAL' | 'REBEL' | 'FUTURIST' | 'WORLD_ECLECTIC' | 'BAROQUE' | 'RADICAL_MINIMAL';
  /** Representative emote id shown on the picker tab. */
  icon: string;
  emotes: EmoteDef[];
}

/** An emote event on `streams/{id}/events` (type 'emote'). `emoji` is kept for old clients. */
export interface EmoteEvent {
  type: 'emote';
  uid: string;
  ts: number;
  emoteId?: string;
  emoji?: string;
  /** How many taps this event carries (press-and-hold batches taps into one write). 1..30 */
  n?: number;
  name?: string;
}

/** Written by the host onto the stream doc so every viewer sees the chorus banner. */
export interface ChorusState {
  emoteId: string;
  tier: 1 | 2 | 3;
  count: number;
  ts: number;
}

/** Per-stream emote settings on the stream doc (`streams/{id}.emotes`). Owner-written. */
export interface StreamEmoteSettings {
  /** Chat accepts emote-only messages. */
  emoteOnly?: boolean;
  /** Chorus detection + evolutions on the broadcast. Default on. */
  chorus?: boolean;
  /** Crowd Light rim on the broadcast. Default on. */
  crowdLight?: boolean;
  /** Kaiju summons at full chorus. Default on. */
  summons?: boolean;
  /** Packs hidden from this stream's picker. */
  hiddenPacks?: EmotePackId[];
  /** Draw emotes INTO the published video (for recordings / restreams). Viewers then only draw their own taps. */
  bake?: boolean;
  /** Set by the host on busy streams: viewers read the host's one-doc relay instead of every event. */
  relay?: boolean;
}
