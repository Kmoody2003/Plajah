/**
 * services/anima/ariaMotionAgent.ts
 *
 * Aria Creative Motion & Animation Intelligence Agent
 *
 * Translates natural-language intent into concrete animation tracks, physics simulations,
 * interactive triggers, and compositing layers across:
 * - 📖 Storybooks & Living Books (Lorea reader interactive pages, ambient cinemagraphs)
 * - 💥 Comics & Manga / Graphic Novels (Panels, speech balloons, speed lines, sound effect bursts)
 * - 🎨 Living Canvas (Bringing still AI images & video plates to life)
 * - 🎬 Film, NLE & Broadcast Graphics (Lower thirds, titles, camera choreography)
 *
 * Powered by Aria's Motion Director Council lenses:
 * 1. The Animator (weight, squash-and-stretch, acting, anticipation, follow-through)
 * 2. The Compositor (invisible integration, light-wrap, depth, plates)
 * 3. The Kinetic Typographer (timing, kerning-in-motion, text reveals)
 * 4. The Generative Artist (real-time physics, fluids, particles, audio-reactivity)
 * 5. The Cinematic Dramatist (camera choreography, depth parallax, lighting reveals)
 */

import type { AnimaChannel, BehaviorConfig, Keyframe } from './types';

export type CreativeMedium = 'storybook' | 'comic' | 'living_canvas' | 'film_vfx';

export interface AriaMotionProposal {
  id?: string;
  headline: string;
  lens: 'The Animator' | 'The Compositor' | 'The Kinetic Typographer' | 'The Generative Artist' | 'The Cinematic Dramatist' | (string & {});
  explanation?: string;
  medium?: CreativeMedium;
  actionSummary: string;
  appliedPreset?: {
    category: 'camera' | 'atmosphere' | 'character_life' | 'comic_fx' | 'storybook_interact' | 'fluid_magic';
    name: string;
  };
  channels: Record<string, Partial<AnimaChannel<number>>>;
  suggestedStepRate?: 1 | 2 | 3 | 4;
  interactiveTrigger?: {
    type: 'tap' | 'hover' | 'scroll' | 'proximity';
    action: string;
    soundCue?: string;
  };
  compositingLayer?: {
    kind: 'particles' | 'fluid' | 'hair' | 'soft_body' | 'speech_balloon' | 'speed_lines';
    config: Record<string, any>;
  };
}

export class AriaMotionAgent {
  /**
   * Interpret a natural language instruction in context of the chosen creative medium
   */
  static interpret(prompt: string, medium: CreativeMedium = 'living_canvas', durationSec = 3.0): AriaMotionProposal {
    const p = prompt.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. STORYBOOK & LIVING BOOKS
    // ─────────────────────────────────────────────────────────────────────────
    if (medium === 'storybook' || p.includes('storybook') || p.includes('picture book') || p.includes('fairy tale') || p.includes('tap')) {
      if (p.includes('tap') || p.includes('interact') || p.includes('touch') || p.includes('click')) {
        return {
          id: `aria_${Date.now()}`,
          headline: 'Interactive Wonder: Tap-to-Bloom & Chime',
          lens: 'The Generative Artist',
          explanation: 'Children explore books through tactile discovery. A gentle tap triggers a joyful elastic bounce, floating stardust particles, and a soft musical bell chime.',
          medium: 'storybook',
          actionSummary: 'Added interactive tap trigger with elastic bounce, golden stardust particle burst, and music chime',
          appliedPreset: { category: 'storybook_interact', name: 'Tap-to-Bloom Particle Chime' },
          interactiveTrigger: {
            type: 'tap',
            action: 'burst_and_chime',
            soundCue: 'chime_crystal_bell',
          },
          compositingLayer: {
            kind: 'particles',
            config: {
              type: 'ring',
              color: '#FFD700',
              ratePerSecond: 60,
              lifespan: 1.2,
              speed: 120,
            },
          },
          channels: {
            'transform.scaleX': {
              name: 'Scale X',
              path: 'transform.scaleX',
              defaultValue: 1,
              keyframes: [
                { id: 'sb_1', t: 0, v: 1, ease: 'smooth' },
                { id: 'sb_2', t: 0.15, v: 1.2, ease: 'smooth' },
                { id: 'sb_3', t: 0.35, v: 0.95, ease: 'smooth' },
                { id: 'sb_4', t: 0.6, v: 1.0, ease: 'smooth' },
              ],
            },
            'transform.scaleY': {
              name: 'Scale Y',
              path: 'transform.scaleY',
              defaultValue: 1,
              keyframes: [
                { id: 'sb_1y', t: 0, v: 1, ease: 'smooth' },
                { id: 'sb_2y', t: 0.15, v: 1.25, ease: 'smooth' },
                { id: 'sb_3y', t: 0.35, v: 0.95, ease: 'smooth' },
                { id: 'sb_4y', t: 0.6, v: 1.0, ease: 'smooth' },
              ],
            },
          },
        };
      }

      // Ambient storybook cinemagraph (fireflies / floating starlight)
      return {
        id: `aria_${Date.now()}`,
        headline: 'Ambient Tale: Starlight Glow & Gentle Drift',
        lens: 'The Cinematic Dramatist',
        explanation: 'Picture book spreads come alive when the artwork breathes. Soft starlight particles drift across the page while the camera glides with a gentle 2.5D parallax.',
        medium: 'storybook',
        actionSummary: 'Configured gentle floating starlight particles with subtle Ken Burns drift',
        appliedPreset: { category: 'atmosphere', name: 'Starlight Fireflies & Soft Pan' },
        compositingLayer: {
          kind: 'particles',
          config: {
            type: 'box',
            color: '#D0BCFF',
            ratePerSecond: 18,
            lifespan: 3.5,
            speed: 25,
            directionAngle: -90,
          },
        },
        channels: {
          'camera.zoom': {
            name: 'Camera Zoom',
            path: 'camera.zoom',
            defaultValue: 1.0,
            keyframes: [
              { id: 'cz1', t: 0, v: 1.0, ease: 'smooth' },
              { id: 'cz2', t: durationSec, v: 1.06, ease: 'smooth' },
            ],
          },
        },
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. COMIC & GRAPHIC NOVELS / MANGA
    // ─────────────────────────────────────────────────────────────────────────
    if (medium === 'comic' || p.includes('comic') || p.includes('manga') || p.includes('panel') || p.includes('speech') || p.includes('balloon') || p.includes('speed line')) {
      if (p.includes('speech') || p.includes('balloon') || p.includes('dialogue') || p.includes('talk')) {
        return {
          id: `aria_${Date.now()}`,
          headline: 'Manga Pop: Dialogue Balloon with Elastic Anticipation',
          lens: 'The Animator',
          explanation: 'Speech balloons in dynamic comics shouldn’t just appear; they pop into existence with an elastic overshoot that matches the vocal punch of the dialogue.',
          medium: 'comic',
          actionSummary: 'Created animated speech balloon with comic spring entrance and tail wobble',
          appliedPreset: { category: 'comic_fx', name: 'Dynamic Dialogue Pop' },
          compositingLayer: {
            kind: 'speech_balloon',
            config: {
              shape: 'rounded_comic',
              text: 'LOOK OUT!',
              tailAngle: 45,
            },
          },
          channels: {
            'transform.scaleX': {
              name: 'Balloon Scale X',
              path: 'transform.scaleX',
              defaultValue: 1,
              keyframes: [
                { id: 'cb1', t: 0, v: 0, ease: 'out' },
                { id: 'cb2', t: 0.25, v: 1.18, ease: 'smooth' },
                { id: 'cb3', t: 0.45, v: 0.95, ease: 'smooth' },
                { id: 'cb4', t: 0.65, v: 1.0, ease: 'smooth' },
              ],
            },
            'transform.scaleY': {
              name: 'Balloon Scale Y',
              path: 'transform.scaleY',
              defaultValue: 1,
              keyframes: [
                { id: 'cb1y', t: 0, v: 0, ease: 'out' },
                { id: 'cb2y', t: 0.25, v: 1.22, ease: 'smooth' },
                { id: 'cb3y', t: 0.45, v: 0.96, ease: 'smooth' },
                { id: 'cb4y', t: 0.65, v: 1.0, ease: 'smooth' },
              ],
            },
          },
        };
      }

      // Shonen / Action Impact Speed Lines & Shake
      return {
        id: `aria_${Date.now()}`,
        headline: 'Action Pulse: Radial Manga Speed Lines & Camera Impact',
        lens: 'The Kinetic Typographer',
        explanation: 'Translates high-stakes graphic novel action into motion: high-contrast radial Japanese speed lines, frame-1 anticipation hold, and camera screen rumble.',
        medium: 'comic',
        actionSummary: 'Generated radial manga speed line overlay and impact screen shake',
        appliedPreset: { category: 'comic_fx', name: 'Shonen Radial Speed Burst' },
        suggestedStepRate: 2, // Animate on 2s
        compositingLayer: {
          kind: 'speed_lines',
          config: {
            density: 0.8,
            focalPoint: [640, 360],
            color: '#FFFFFF',
          },
        },
        channels: {
          'transform.x': {
            name: 'Screen Rumble X',
            path: 'transform.x',
            defaultValue: 0,
            keyframes: [],
            expression: { enabled: true, code: 'wiggle(18, 12)' },
          },
          'transform.y': {
            name: 'Screen Rumble Y',
            path: 'transform.y',
            defaultValue: 0,
            keyframes: [],
            expression: { enabled: true, code: 'wiggle(18, 12)' },
          },
        },
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. LIVING CANVAS (BRINGING STILL AI IMAGES & VIDEO TO LIFE)
    // ─────────────────────────────────────────────────────────────────────────
    if (p.includes('breath') || p.includes('idle') || p.includes('alive') || p.includes('character life')) {
      return {
        id: `aria_${Date.now()}`,
        headline: 'Living Character: Breathing Cycle & Subtle Eye Blink',
        lens: 'The Animator',
        explanation: 'Transforms a still Midjourney or Flux character portrait into living reality through rhythmic chest rise, subtle micro-sway, and natural blinking.',
        medium: 'living_canvas',
        actionSummary: 'Added natural breathing cycle (harmonic wave) and organic micro-sway',
        appliedPreset: { category: 'character_life', name: 'Organic Idle Breathing & Sway' },
        channels: {
          'transform.scaleY': {
            name: 'Breathing Chest Rise',
            path: 'transform.scaleY',
            defaultValue: 1.0,
            keyframes: [],
            expression: { enabled: true, code: '1.0 + Math.sin(time * 1.8) * 0.02' },
          },
          'transform.rotationZ': {
            name: 'Subtle Micro-Sway',
            path: 'transform.rotationZ',
            defaultValue: 0,
            keyframes: [],
            expression: { enabled: true, code: 'Math.sin(time * 0.9) * 0.8' },
          },
        },
      };
    }

    if (p.includes('rain') || p.includes('weather') || p.includes('snow') || p.includes('storm')) {
      return {
        id: `aria_${Date.now()}`,
        headline: 'Cinematic Weather: Atmospheric Rain & Parallax Layers',
        lens: 'The Compositor',
        explanation: 'Composites 3 layers of deterministic atmospheric rain streaks over the background plate with realistic wind drift and lighting match.',
        medium: 'living_canvas',
        actionSummary: 'Composited multi-layer wind-driven rain over the still image/video plate',
        appliedPreset: { category: 'atmosphere', name: 'Cinematic Rainy Weather' },
        compositingLayer: {
          kind: 'particles',
          config: {
            type: 'box',
            color: '#00DAF3',
            ratePerSecond: 80,
            lifespan: 1.0,
            speed: 450,
            directionAngle: 105,
          },
        },
        channels: {},
      };
    }

    if (p.includes('magic') || p.includes('aura') || p.includes('smoke') || p.includes('energy') || p.includes('fluid')) {
      return {
        id: `aria_${Date.now()}`,
        headline: 'Fluid Sorcery: Swirling Navier-Stokes Energy Aura',
        lens: 'The Generative Artist',
        explanation: 'Injects real-time fluid dynamic vortices around focal points. Evolving curl noise causes ethereal energy smoke to billow and react organically.',
        medium: 'living_canvas',
        actionSummary: 'Injected real-time fluid dynamics vortex aura with violet-cyan dissipation',
        appliedPreset: { category: 'fluid_magic', name: 'Navier-Stokes Energy Smoke' },
        compositingLayer: {
          kind: 'fluid',
          config: {
            viscosity: 0.0003,
            vorticity: 3.2,
            dissipation: 0.992,
            colorA: '#6B0099',
            colorB: '#00DAF3',
          },
        },
        channels: {},
      };
    }

    // Default: Cinematic 2.5D Parallax Drift for any still or video
    return {
      id: `aria_${Date.now()}`,
      headline: 'Cinematic Parallax: Slow Handheld Camera Float',
      lens: 'The Cinematic Dramatist',
      explanation: 'Gives any static generated art immediate cinematic presence through a deliberate 2.5D camera float with organic momentum.',
      medium: 'living_canvas',
      actionSummary: 'Applied cinematic 2.5D camera drift and subtle focal depth push',
      appliedPreset: { category: 'camera', name: '2.5D Handheld Parallax Float' },
      channels: {
        'camera.x': {
          name: 'Camera Pan X',
          path: 'camera.x',
          defaultValue: 0,
          keyframes: [
            { id: 'cpx1', t: 0, v: -15, ease: 'smooth' },
            { id: 'cpx2', t: durationSec, v: 15, ease: 'smooth' },
          ],
        },
        'camera.zoom': {
          name: 'Camera Zoom In',
          path: 'camera.zoom',
          defaultValue: 1.0,
          keyframes: [
            { id: 'czm1', t: 0, v: 1.0, ease: 'smooth' },
            { id: 'czm2', t: durationSec, v: 1.08, ease: 'smooth' },
          ],
        },
      },
    };
  }

  /** Quick Recommended Directives tailored per medium */
  static getQuickPrompts(medium: CreativeMedium): Array<{ label: string; prompt: string }> {
    switch (medium) {
      case 'storybook':
        return [
          { label: '✨ Starlight Fireflies', prompt: 'Ambient starlight fireflies with gentle camera drift' },
          { label: '🔔 Tap-to-Chime Sparkles', prompt: 'Tap the character to bloom with golden sparkles and bell chime' },
          { label: '🦋 Butterfly Flutter', prompt: 'Gentle butterfly flutter path looping around the page' },
          { label: '🌙 Moonlit Water Ripple', prompt: 'Soft water caustics and breathing character idle' },
        ];
      case 'comic':
        return [
          { label: '💬 Dialogue Pop-In', prompt: 'Speech balloon pops in with bouncy spring anticipation' },
          { label: '⚡ Manga Speed Lines', prompt: 'High-octane radial manga action speed lines with screen shake' },
          { label: '💥 Impact SFX Boom', prompt: 'Onomatopoeia BOOM stamp with squash and particle burst' },
          { label: '🎥 Dramatic Panel Push', prompt: 'Cinematic slow push into panel focal character' },
        ];
      case 'living_canvas':
      default:
        return [
          { label: '🫁 Breathing & Eye Blink', prompt: 'Natural character breathing chest cycle and micro-sway' },
          { label: '🌧️ Atmospheric Rain', prompt: 'Cinematic wind-blown rain streaks with lens droplets' },
          { label: '🔮 Swirling Fluid Magic', prompt: 'Ethereal swirling fluid energy aura around character hands' },
          { label: '💨 Hair & Cape Flutter', prompt: 'Dynamic hair strand physics fluttering in the breeze' },
        ];
    }
  }
}
