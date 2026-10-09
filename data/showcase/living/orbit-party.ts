// ORBIT PARTY!: the living edition (ages 4-6, torn cut-paper).  What this book shows off about the Tela format:
//   * every planet is a NOTE (a pentatonic "space xylophone"), tap in order on page 4 and it becomes a tune
//   * Zib's kazoo: press and HOLD, slide the finger up or down to BEND the pitch (a held voice)
//   * Nova follows the finger and leaves a sparkle trail (follow + trail)
//   * Mars is shy: approach SLOWLY and he peeks and blushes, RUSH and he hides (proximity with pointer speed)
//   * the dance page: tap the disco ball, a generated 120 bpm beat starts and the planets dance exactly on the beat
//   * tilt parallax on the star layers
// Every page has quiet idle life, a music cue (written in code with services/living/audio/compose), sound effects, read-aloud text,
// keyboard names (`hint`) and a reduced-motion twin for every interaction.  Nothing here is needed to read the page: the flat rendition stands alone.
// The object ids below are the stable ids services/showcase/livingDoc.ts mints (`p<NN>_<label>_<k>`); the GROUPS table was generated from the
// designer's z-order (a character or planet is a contiguous run of objects) and is checked against the real doc by tests/livingEdition.orbit-party.test.ts.
import type { Action, AnimSpec, Behavior, Cond, LivingBook, LivingPage, Score, Target } from '../../../services/living/contracts';
import { arpeggiate, bassline, chord, drums, makeScore, parseNotation, track } from '../../../services/living/audio/compose';
import { orbitParty } from '../books/orbitParty';

// ───────────────────────────── object groups (generated; see header) ─────────────────────────────
const GROUPS: Record<number, Record<string, string[]>> = {
  1: {
    sunBig: ['p01_cut-paper-disc_1', 'p01_cut-paper-disc_2', 'p01_cut-paper-disc_3', 'p01_halftone-shade_1'],
    planetTeal: ['p01_cut-paper-disc_4', 'p01_planet-shade_1', 'p01_crater_1', 'p01_crater-lip_1', 'p01_crater_2', 'p01_crater-lip_2', 'p01_crater_3', 'p01_crater-lip_3', 'p01_shine_1'],
    planetRed: ['p01_cut-paper-disc_5', 'p01_planet-shade_2', 'p01_halftone-shade_2', 'p01_crater_4', 'p01_crater-lip_4', 'p01_crater_5', 'p01_crater-lip_5', 'p01_crater_6', 'p01_crater-lip_6', 'p01_shine_2'],
    planetYellow: ['p01_cut-paper-disc_6', 'p01_planet-shade_3', 'p01_crater_7', 'p01_crater-lip_7', 'p01_crater_8', 'p01_crater-lip_8', 'p01_shine_3'],
    planetMint: ['p01_cut-paper-disc_7', 'p01_planet-shade_4', 'p01_crater_9', 'p01_crater-lip_9', 'p01_shine_4'],
    balloon1: ['p01_balloon-string_1', 'p01_balloon-outline_1', 'p01_balloon_1', 'p01_balloon-shine_1', 'p01_balloon-knot_1'],
    balloon2: ['p01_balloon-string_2', 'p01_balloon-outline_2', 'p01_balloon_2', 'p01_balloon-shine_2', 'p01_balloon-knot_2'],
    balloon3: ['p01_balloon-string_3', 'p01_balloon-outline_3', 'p01_balloon_3', 'p01_balloon-shine_3', 'p01_balloon-knot_3'],
    zib: ['p01_sticker-outline_2', 'p01_sticker-outline_3', 'p01_sticker-outline_4', 'p01_sticker-outline_5', 'p01_sticker-outline_6', 'p01_sticker-outline_7', 'p01_antenna_1', 'p01_antenna-bulb_1', 'p01_boot_1', 'p01_boot_2', 'p01_suit_1', 'p01_chest-panel_1', 'p01_tiny-disc-bottom_1', 'p01_tiny-disc-bottom_2', 'p01_tiny-disc-bottom_3', 'p01_arm_1', 'p01_mitt_1', 'p01_arm_2', 'p01_mitt_2', 'p01_helmet_1', 'p01_face_1', 'p01_visor-shine_1', 'p01_visor-shine_2', 'p01_cheek_1', 'p01_cheek_2', 'p01_eye_1', 'p01_eye-glint_1', 'p01_eye_2', 'p01_eye-glint_2', 'p01_smile_2'],
    nova: ['p01_comet-tail-outline_1', 'p01_comet-tail_1', 'p01_comet-tail-outline_2', 'p01_comet-tail_2', 'p01_tiny-disc-bottom-right_1', 'p01_comet-tail-outline_3', 'p01_comet-tail_3', 'p01_comet-tail-outline_4', 'p01_comet-tail_4', 'p01_tiny-disc-bottom-right_2', 'p01_small-disc-bottom-right_1', 'p01_small-disc-bottom-right_2', 'p01_sticker-outline_1', 'p01_ear_1', 'p01_ear_2', 'p01_head_1', 'p01_muzzle_1', 'p01_nose_1', 'p01_tiny-disc-right_1', 'p01_pupil_1', 'p01_tiny-disc-right_2', 'p01_tiny-disc-right_3', 'p01_pupil_2', 'p01_tiny-disc-right_4', 'p01_smile_1', 'p01_tongue_1'],
    cake: ['p01_cake-plate_1', 'p01_cake-tier_1', 'p01_cake-tier_2', 'p01_frosting-drips_1', 'p01_sprinkles_1', 'p01_candle_1', 'p01_flame_1', 'p01_tiny-disc-bottom_4'],
    titleLetters: ['p01_title-shadow_1', 'p01_title-shadow_2', 'p01_title-shadow_3', 'p01_title-shadow_4', 'p01_title-shadow_5', 'p01_title_1', 'p01_title_2', 'p01_title_3', 'p01_title_4', 'p01_title_5', 'p01_title-shadow_6', 'p01_title-shadow_7', 'p01_title-shadow_8', 'p01_title-shadow_9', 'p01_title-shadow_10', 'p01_title-shadow_11', 'p01_title_6', 'p01_title_7', 'p01_title_8', 'p01_title_9', 'p01_title_10', 'p01_title_11'],
    zibEyes: ['p01_eye_1', 'p01_eye-glint_1', 'p01_eye_2', 'p01_eye-glint_2'],
  },
  2: {
    sun: ['p02_cut-paper-disc_1', 'p02_cut-paper-disc_2', 'p02_cut-paper-disc_3', 'p02_halftone-shade_1', 'p02_sun-eye_1', 'p02_eye-glint_1', 'p02_sun-eye_2', 'p02_eye-glint_2', 'p02_cheek_1', 'p02_smile_1'],
    planetPink: ['p02_cut-paper-disc_4', 'p02_planet-shade_1', 'p02_halftone-shade_2', 'p02_crater_1', 'p02_crater-lip_1', 'p02_crater_2', 'p02_crater-lip_2', 'p02_crater_3', 'p02_crater-lip_3', 'p02_shine_1'],
    planetTeal: ['p02_cut-paper-disc_5', 'p02_planet-shade_2', 'p02_crater_4', 'p02_crater-lip_4', 'p02_crater_5', 'p02_crater-lip_5', 'p02_shine_2'],
    planetViolet: ['p02_cut-paper-disc_6', 'p02_planet-shade_3', 'p02_crater_6', 'p02_crater-lip_6', 'p02_crater_7', 'p02_crater-lip_7', 'p02_shine_3'],
    moon: ['p02_cut-paper-disc_7', 'p02_planet-shade_4', 'p02_crater_8', 'p02_crater-lip_8', 'p02_crater_9', 'p02_crater-lip_9', 'p02_crater_10', 'p02_crater-lip_10', 'p02_shine_4'],
    nova: ['p02_comet-tail-outline_1', 'p02_comet-tail_1', 'p02_comet-tail-outline_2', 'p02_comet-tail_2', 'p02_tiny-disc-bottom_1', 'p02_comet-tail-outline_3', 'p02_comet-tail_3', 'p02_comet-tail-outline_4', 'p02_comet-tail_4', 'p02_tiny-disc-bottom-right_1', 'p02_comet-tail-outline_5', 'p02_comet-tail_5', 'p02_comet-tail-outline_6', 'p02_comet-tail_6', 'p02_tiny-disc-bottom-right_2', 'p02_small-disc-bottom-right_1', 'p02_small-disc-bottom-right_2', 'p02_sticker-outline_1', 'p02_ear_1', 'p02_ear_2', 'p02_head_1', 'p02_muzzle_1', 'p02_nose_1', 'p02_tiny-disc-bottom-right_3', 'p02_pupil_1', 'p02_tiny-disc-bottom-right_4', 'p02_tiny-disc-bottom-right_5', 'p02_pupil_2', 'p02_tiny-disc-bottom-right_6', 'p02_smile_2', 'p02_tongue_1'],
    zib: ['p02_sticker-outline_2', 'p02_sticker-outline_3', 'p02_sticker-outline_4', 'p02_sticker-outline_5', 'p02_sticker-outline_6', 'p02_sticker-outline_7', 'p02_antenna_1', 'p02_antenna-bulb_1', 'p02_boot_1', 'p02_boot_2', 'p02_suit_1', 'p02_chest-panel_1', 'p02_tiny-disc-bottom-right_7', 'p02_tiny-disc-bottom-right_8', 'p02_tiny-disc-bottom-right_9', 'p02_arm_1', 'p02_mitt_1', 'p02_arm_2', 'p02_mitt_2', 'p02_helmet_1', 'p02_face_1', 'p02_visor-shine_1', 'p02_visor-shine_2', 'p02_cheek_2', 'p02_cheek_3', 'p02_eye_1', 'p02_eye-glint_3', 'p02_eye_2', 'p02_eye-glint_4', 'p02_smile_3'],
    kazooHold: ['p02_helmet_1', 'p02_face_1', 'p02_kazoo_1', 'p02_kazoo-mouthpiece_1', 'p02_arm_2', 'p02_mitt_2'],
    cake: ['p02_cake-plate_1', 'p02_cake-tier_1', 'p02_cake-tier_2', 'p02_frosting-drips_1', 'p02_sprinkles_1', 'p02_candle_1', 'p02_flame_1', 'p02_tiny-disc-bottom_2'],
    stars: ['p02_stars_1', 'p02_stars_2', 'p02_stars_3', 'p02_star-halos_1'],
    zibEyes: ['p02_eye_1', 'p02_eye-glint_3', 'p02_eye_2', 'p02_eye-glint_4'],
    sunEyes: ['p02_sun-eye_1', 'p02_eye-glint_1', 'p02_sun-eye_2', 'p02_eye-glint_2'],
  },
  3: {
    sunBig: ['p03_cut-paper-disc_1', 'p03_cut-paper-disc_2', 'p03_cut-paper-disc_3', 'p03_halftone-shade_1'],
    planetPurple: ['p03_cut-paper-disc_4', 'p03_planet-shade_1', 'p03_halftone-shade_2', 'p03_crater_1', 'p03_crater-lip_1', 'p03_crater_2', 'p03_crater-lip_2', 'p03_crater_3', 'p03_crater-lip_3', 'p03_shine_1'],
    planetTeal: ['p03_cut-paper-disc_5', 'p03_planet-shade_2', 'p03_crater_4', 'p03_crater-lip_4', 'p03_crater_5', 'p03_crater-lip_5', 'p03_shine_2'],
    planetYellow: ['p03_cut-paper-disc_6', 'p03_planet-shade_3', 'p03_crater_6', 'p03_crater-lip_6', 'p03_crater_7', 'p03_crater-lip_7', 'p03_crater_8', 'p03_crater-lip_8', 'p03_shine_3'],
    moon: ['p03_cut-paper-disc_7', 'p03_planet-shade_4', 'p03_crater_9', 'p03_crater-lip_9', 'p03_crater_10', 'p03_crater-lip_10', 'p03_shine_4'],
    nova: ['p03_comet-tail-outline_1', 'p03_comet-tail_1', 'p03_comet-tail-outline_2', 'p03_comet-tail_2', 'p03_tiny-disc-top_1', 'p03_comet-tail-outline_3', 'p03_comet-tail_3', 'p03_comet-tail-outline_4', 'p03_comet-tail_4', 'p03_tiny-disc-top_2', 'p03_comet-tail-outline_5', 'p03_comet-tail_5', 'p03_comet-tail-outline_6', 'p03_comet-tail_6', 'p03_tiny-disc-top-right_1', 'p03_small-disc-top-right_1', 'p03_small-disc-top-right_2', 'p03_sticker-outline_1', 'p03_ear_1', 'p03_ear_2', 'p03_head_1', 'p03_muzzle_1', 'p03_nose_1', 'p03_tiny-disc-top-right_2', 'p03_pupil_1', 'p03_tiny-disc-top-right_3', 'p03_tiny-disc-top-right_4', 'p03_pupil_2', 'p03_tiny-disc-top-right_5', 'p03_mouth_1'],
    sniff: ['p03_sniff_1', 'p03_sniff_2', 'p03_sniff_3', 'p03_sniff_4', 'p03_sniff_5', 'p03_sniff_6', 'p03_sniff_7', 'p03_sniff_8', 'p03_sniff_9', 'p03_sniff_10', 'p03_sniff_11', 'p03_sniff_12'],
    woof: ['p03_woof_1', 'p03_woof_2', 'p03_woof_3', 'p03_woof_4', 'p03_woof_5'],
  },
  4: {
    saturn: ['p04_saturn-ring-back_1', 'p04_cut-paper-disc_1', 'p04_planet-shade_1', 'p04_halftone-shade_1', 'p04_shine_1', 'p04_saturn-ring-front_1', 'p04_ring-shine_1', 'p04_eye_1', 'p04_tiny-disc-left_1', 'p04_eye_2', 'p04_tiny-disc-left_2', 'p04_grin_1', 'p04_tongue_1', 'p04_tiny-disc-left_3', 'p04_tiny-disc-left_4'],
    jupiter: ['p04_cut-paper-disc_2', 'p04_stripe_1', 'p04_stripe_2', 'p04_stripe_3', 'p04_stripe_4', 'p04_stripe_5', 'p04_planet-shade_2', 'p04_eye_3', 'p04_tiny-disc-centre_1', 'p04_eye_4', 'p04_tiny-disc-centre_2', 'p04_booming-mouth_1', 'p04_tongue_2', 'p04_tiny-disc-left_5', 'p04_tiny-disc-centre_3'],
    neptune: ['p04_cut-paper-disc_3', 'p04_planet-shade_3', 'p04_halftone-shade_2', 'p04_shine_2', 'p04_swirl_1', 'p04_swirl_2', 'p04_eye_5', 'p04_eye_6', 'p04_blub-mouth_1', 'p04_bubble_1', 'p04_bubble_2', 'p04_bubble_3'],
    moon: ['p04_cut-paper-disc_4', 'p04_planet-shade_4', 'p04_crater_1', 'p04_crater-lip_1', 'p04_crater_2', 'p04_crater-lip_2', 'p04_crater_3', 'p04_crater-lip_3', 'p04_shine_3', 'p04_tiny-disc-right_1', 'p04_tiny-disc-right_2', 'p04_smile_1', 'p04_snack-plate_1', 'p04_tiny-disc-right_3', 'p04_tiny-disc-right_4', 'p04_tiny-disc-right_5'],
    zib: ['p04_sticker-outline_1', 'p04_sticker-outline_2', 'p04_sticker-outline_3', 'p04_sticker-outline_4', 'p04_sticker-outline_5', 'p04_sticker-outline_6', 'p04_antenna_1', 'p04_antenna-bulb_1', 'p04_boot_1', 'p04_boot_2', 'p04_suit_1', 'p04_chest-panel_1', 'p04_tiny-disc-top-right_1', 'p04_tiny-disc-top-right_2', 'p04_tiny-disc-top-right_3', 'p04_arm_1', 'p04_mitt_1', 'p04_arm_2', 'p04_mitt_2', 'p04_helmet_1', 'p04_face_1', 'p04_visor-shine_1', 'p04_visor-shine_2', 'p04_cheek_1', 'p04_cheek_2', 'p04_eye_7', 'p04_eye-glint_1', 'p04_eye_8', 'p04_eye-glint_2', 'p04_smile_2'],
    nova: ['p04_comet-tail-outline_1', 'p04_comet-tail_1', 'p04_comet-tail-outline_2', 'p04_comet-tail_2', 'p04_tiny-disc-top_1', 'p04_comet-tail-outline_3', 'p04_comet-tail_3', 'p04_comet-tail-outline_4', 'p04_comet-tail_4', 'p04_tiny-disc-top-right_4', 'p04_small-disc-top-right_1', 'p04_small-disc-top-right_2', 'p04_sticker-outline_7', 'p04_ear_1', 'p04_ear_2', 'p04_head_1', 'p04_muzzle_1', 'p04_nose_1', 'p04_tiny-disc-top-right_5', 'p04_pupil_1', 'p04_tiny-disc-top-right_6', 'p04_tiny-disc-top-right_7', 'p04_pupil_2', 'p04_tiny-disc-top-right_8', 'p04_smile_3', 'p04_tongue_3'],
    emptyPlace: ['p04_empty-place_1', 'p04_orbit_4'],
    cake: ['p04_cake-plate_1', 'p04_cake-tier_1', 'p04_cake-tier_2', 'p04_frosting-drips_1', 'p04_sprinkles_1', 'p04_candle_1', 'p04_flame_1', 'p04_tiny-disc-bottom-right_1'],
    everyone: ['p04_everyone-came-shadow_1', 'p04_everyone-came-shadow_2', 'p04_everyone-came-shadow_3', 'p04_everyone-came-shadow_4', 'p04_everyone-came-shadow_5', 'p04_everyone-came-shadow_6', 'p04_everyone-came-shadow_7', 'p04_everyone-came-shadow_8', 'p04_everyone-came-shadow_9', 'p04_everyone-came-shadow_10', 'p04_everyone-came-shadow_11', 'p04_everyone-came-shadow_12', 'p04_everyone-came-shadow_13', 'p04_everyone-came_1', 'p04_everyone-came_2', 'p04_everyone-came_3', 'p04_everyone-came_4', 'p04_everyone-came_5', 'p04_everyone-came_6', 'p04_everyone-came_7', 'p04_everyone-came_8', 'p04_everyone-came_9', 'p04_everyone-came_10', 'p04_everyone-came_11', 'p04_everyone-came_12', 'p04_everyone-came_13'],
    almost: ['p04_almost-everyone-shadow_1', 'p04_almost-everyone-shadow_2', 'p04_almost-everyone-shadow_3', 'p04_almost-everyone-shadow_4', 'p04_almost-everyone-shadow_5', 'p04_almost-everyone-shadow_6', 'p04_almost-everyone-shadow_7', 'p04_almost-everyone-shadow_8', 'p04_almost-everyone-shadow_9', 'p04_almost-everyone-shadow_10', 'p04_almost-everyone-shadow_11', 'p04_almost-everyone-shadow_12', 'p04_almost-everyone-shadow_13', 'p04_almost-everyone-shadow_14', 'p04_almost-everyone-shadow_15', 'p04_almost-everyone_1', 'p04_almost-everyone_2', 'p04_almost-everyone_3', 'p04_almost-everyone_4', 'p04_almost-everyone_5', 'p04_almost-everyone_6', 'p04_almost-everyone_7', 'p04_almost-everyone_8', 'p04_almost-everyone_9', 'p04_almost-everyone_10', 'p04_almost-everyone_11', 'p04_almost-everyone_12', 'p04_almost-everyone_13', 'p04_almost-everyone_14', 'p04_almost-everyone_15'],
    zibEyes: ['p04_eye_7', 'p04_eye-glint_1', 'p04_eye_8', 'p04_eye-glint_2'],
  },
  5: {
    mars: ['p05_cut-paper-disc_1', 'p05_planet-shade_1', 'p05_halftone-shade_1', 'p05_crater_1', 'p05_crater-lip_1', 'p05_crater_2', 'p05_crater-lip_2', 'p05_crater_3', 'p05_crater-lip_3', 'p05_shine_1', 'p05_blush-patch_1', 'p05_blush-patch_2', 'p05_mars-eye_1', 'p05_mars-pupil_1', 'p05_eye-glint_1', 'p05_mars-eye_2', 'p05_mars-pupil_2', 'p05_eye-glint_2', 'p05_tiny-mouth_1'],
    marsPupils: ['p05_mars-pupil_1', 'p05_eye-glint_1', 'p05_mars-pupil_2', 'p05_eye-glint_2'],
    blush: ['p05_blush-patch_1', 'p05_blush-patch_2'],
    zib: ['p05_sticker-outline_1', 'p05_sticker-outline_2', 'p05_sticker-outline_3', 'p05_sticker-outline_4', 'p05_sticker-outline_5', 'p05_sticker-outline_6', 'p05_antenna_1', 'p05_antenna-bulb_1', 'p05_boot_1', 'p05_boot_2', 'p05_suit_1', 'p05_chest-panel_1', 'p05_tiny-disc-bottom_1', 'p05_tiny-disc-bottom_2', 'p05_tiny-disc-bottom_3', 'p05_arm_1', 'p05_mitt_1', 'p05_arm_2', 'p05_mitt_2', 'p05_helmet_1', 'p05_face_1', 'p05_visor-shine_1', 'p05_visor-shine_2', 'p05_cheek_1', 'p05_cheek_2', 'p05_eye_1', 'p05_eye-glint_3', 'p05_eye_2', 'p05_eye-glint_4', 'p05_mouth_1'],
    whisper: ['p05_whisper-shadow_1', 'p05_whisper-shadow_2', 'p05_whisper-shadow_3', 'p05_whisper-shadow_4', 'p05_whisper-shadow_5', 'p05_whisper_1', 'p05_whisper_2', 'p05_whisper_3', 'p05_whisper_4', 'p05_whisper_5'],
    zibEyes: ['p05_eye_1', 'p05_eye-glint_3', 'p05_eye_2', 'p05_eye-glint_4'],
    marsEyes: ['p05_mars-eye_1', 'p05_mars-pupil_1', 'p05_eye-glint_1', 'p05_mars-eye_2', 'p05_mars-pupil_2', 'p05_eye-glint_2'],
  },
  6: {
    door: ['p06_cut-paper-disc_1', 'p06_planet-shade_1', 'p06_halftone-shade_1', 'p06_crater_1', 'p06_crater-lip_1', 'p06_crater_2', 'p06_crater-lip_2', 'p06_shine_1', 'p06_crater-door_1', 'p06_door-knob_1'],
    knock: ['p06_knock_1', 'p06_knock_2'],
    zibDoor: ['p06_sticker-outline_1', 'p06_sticker-outline_2', 'p06_sticker-outline_3', 'p06_sticker-outline_4', 'p06_sticker-outline_5', 'p06_sticker-outline_6', 'p06_antenna_1', 'p06_antenna-bulb_1', 'p06_boot_1', 'p06_boot_2', 'p06_suit_1', 'p06_chest-panel_1', 'p06_tiny-disc-top-left_1', 'p06_tiny-disc-top-left_2', 'p06_tiny-disc-top-left_3', 'p06_arm_1', 'p06_mitt_1', 'p06_arm_2', 'p06_mitt_2', 'p06_helmet_1', 'p06_face_1', 'p06_visor-shine_1', 'p06_visor-shine_2', 'p06_cheek_1', 'p06_cheek_2', 'p06_eye_1', 'p06_eye-glint_1', 'p06_eye_2', 'p06_eye-glint_2', 'p06_smile_1'],
    zibSong: ['p06_sticker-outline_7', 'p06_sticker-outline_8', 'p06_sticker-outline_9', 'p06_sticker-outline_10', 'p06_sticker-outline_11', 'p06_sticker-outline_12', 'p06_antenna_2', 'p06_antenna-bulb_2', 'p06_boot_3', 'p06_boot_4', 'p06_suit_2', 'p06_chest-panel_2', 'p06_tiny-disc-right_1', 'p06_tiny-disc-right_2', 'p06_tiny-disc-right_3', 'p06_arm_3', 'p06_mitt_3', 'p06_arm_4', 'p06_mitt_4', 'p06_helmet_2', 'p06_face_2', 'p06_visor-shine_3', 'p06_visor-shine_4', 'p06_cheek_3', 'p06_cheek_4', 'p06_eye_3', 'p06_eye-glint_3', 'p06_eye_4', 'p06_eye-glint_4', 'p06_mouth_1'],
    balloonScraps: ['p06_balloon-scraps_1'],
    zibDance: ['p06_sticker-outline_13', 'p06_sticker-outline_14', 'p06_sticker-outline_15', 'p06_sticker-outline_16', 'p06_sticker-outline_17', 'p06_sticker-outline_18', 'p06_antenna_3', 'p06_antenna-bulb_3', 'p06_boot_5', 'p06_boot_6', 'p06_suit_3', 'p06_chest-panel_3', 'p06_tiny-disc-bottom-left_1', 'p06_tiny-disc-bottom-left_2', 'p06_tiny-disc-bottom-left_3', 'p06_arm_5', 'p06_mitt_5', 'p06_arm_6', 'p06_mitt_6', 'p06_helmet_3', 'p06_face_3', 'p06_visor-shine_5', 'p06_visor-shine_6', 'p06_cheek_5', 'p06_cheek_6', 'p06_eye_5', 'p06_eye-glint_5', 'p06_eye_6', 'p06_eye-glint_6', 'p06_smile_2'],
    novaDance: ['p06_comet-tail-outline_1', 'p06_comet-tail_1', 'p06_tiny-disc-bottom-left_4', 'p06_comet-tail-outline_2', 'p06_comet-tail_2', 'p06_comet-tail-outline_3', 'p06_comet-tail_3', 'p06_tiny-disc-bottom-left_5', 'p06_tiny-disc-bottom-left_6', 'p06_tiny-disc-bottom-left_7', 'p06_sticker-outline_19', 'p06_ear_1', 'p06_ear_2', 'p06_head_1', 'p06_muzzle_1', 'p06_nose_1', 'p06_tiny-disc-bottom-left_8', 'p06_pupil_1', 'p06_tiny-disc-bottom-left_9', 'p06_tiny-disc-bottom-left_10', 'p06_pupil_2', 'p06_tiny-disc-bottom-left_11', 'p06_smile_3', 'p06_tongue_1'],
    stomp: ['p06_stomp_1', 'p06_stomp_2', 'p06_stomp_3'],
    mars: ['p06_cut-paper-disc_2', 'p06_planet-shade_2', 'p06_halftone-shade_2', 'p06_crater_3', 'p06_crater-lip_3', 'p06_crater_4', 'p06_crater-lip_4', 'p06_crater_5', 'p06_crater-lip_5', 'p06_shine_2', 'p06_blush-patch_1', 'p06_blush-patch_2', 'p06_mars-eye_1', 'p06_mars-pupil_1', 'p06_eye-glint_7', 'p06_tiny-mouth_1'],
    note1: ['p06_note-stem_1', 'p06_note_1', 'p06_note-flag_1'],
    note2: ['p06_note-stem_2', 'p06_note_2', 'p06_note-flag_2'],
    note3: ['p06_note-stem_3', 'p06_note_3', 'p06_note-flag_3'],
  },
  7: {
    zib: ['p07_sticker-outline_1', 'p07_sticker-outline_2', 'p07_sticker-outline_3', 'p07_sticker-outline_4', 'p07_sticker-outline_5', 'p07_sticker-outline_6', 'p07_antenna_1', 'p07_antenna-bulb_1', 'p07_boot_1', 'p07_boot_2', 'p07_suit_1', 'p07_chest-panel_1', 'p07_tiny-disc-top-left_1', 'p07_tiny-disc-top-left_2', 'p07_tiny-disc-top-left_3', 'p07_arm_1', 'p07_mitt_1', 'p07_arm_2', 'p07_mitt_2', 'p07_helmet_1', 'p07_face_1', 'p07_visor-shine_1', 'p07_visor-shine_2', 'p07_cheek_1', 'p07_cheek_2', 'p07_eye_1', 'p07_eye-glint_3', 'p07_eye_2', 'p07_eye-glint_4', 'p07_mouth_1'],
    kazoo: ['p07_kazoo_1', 'p07_kazoo-mouthpiece_1'],
    nova: ['p07_comet-tail-outline_1', 'p07_comet-tail_1', 'p07_tiny-disc-top-right_1', 'p07_comet-tail-outline_2', 'p07_comet-tail_2', 'p07_comet-tail-outline_3', 'p07_comet-tail_3', 'p07_tiny-disc-top-right_2', 'p07_tiny-disc-top-right_3', 'p07_tiny-disc-top-right_4', 'p07_sticker-outline_7', 'p07_ear_1', 'p07_ear_2', 'p07_head_1', 'p07_muzzle_1', 'p07_nose_1', 'p07_tiny-disc-top-right_5', 'p07_pupil_1', 'p07_tiny-disc-top-right_6', 'p07_tiny-disc-top-right_7', 'p07_pupil_2', 'p07_tiny-disc-top-right_8', 'p07_mouth_2'],
    blush: ['p07_blush-patch_1', 'p07_blush-patch_2', 'p07_halftone-dots_1'],
    zibEyes: ['p07_eye_1', 'p07_eye-glint_3', 'p07_eye_2', 'p07_eye-glint_4'],
    marsPupils: ['p07_mars-pupil_1', 'p07_eye-glint_1', 'p07_mars-pupil_2', 'p07_eye-glint_2'],
    marsWhites: ['p07_mars-eye_1', 'p07_mars-eye_2'],
  },
  8: {
    zib: ['p08_sticker-outline_2', 'p08_sticker-outline_3', 'p08_sticker-outline_4', 'p08_sticker-outline_5', 'p08_sticker-outline_6', 'p08_sticker-outline_7', 'p08_antenna_1', 'p08_antenna-bulb_1', 'p08_boot_1', 'p08_boot_2', 'p08_suit_1', 'p08_chest-panel_1', 'p08_tiny-disc-left_2', 'p08_tiny-disc-centre_1', 'p08_tiny-disc-left_3', 'p08_arm_1', 'p08_mitt_1', 'p08_arm_2', 'p08_mitt_2', 'p08_helmet_1', 'p08_face_1', 'p08_visor-shine_1', 'p08_visor-shine_2', 'p08_cheek_1', 'p08_cheek_2', 'p08_eye_1', 'p08_eye-glint_1', 'p08_eye_2', 'p08_eye-glint_2', 'p08_smile_2'],
    mars: ['p08_cut-paper-disc_2', 'p08_planet-shade_1', 'p08_halftone-shade_1', 'p08_crater_1', 'p08_crater-lip_1', 'p08_crater_2', 'p08_crater-lip_2', 'p08_crater_3', 'p08_crater-lip_3', 'p08_shine_2', 'p08_blush-patch_1', 'p08_blush-patch_2', 'p08_mars-eye_1', 'p08_mars-pupil_1', 'p08_eye-glint_3', 'p08_mars-eye_2', 'p08_mars-pupil_2', 'p08_eye-glint_4', 'p08_tiny-mouth_1'],
    nova: ['p08_small-disc-bottom-left_1', 'p08_small-disc-bottom-left_2', 'p08_sticker-outline_1', 'p08_ear_1', 'p08_ear_2', 'p08_head_1', 'p08_muzzle_1', 'p08_nose_1', 'p08_tiny-disc-bottom-left_3', 'p08_pupil_1', 'p08_tiny-disc-bottom-left_4', 'p08_tiny-disc-bottom-left_5', 'p08_pupil_2', 'p08_tiny-disc-bottom-left_6', 'p08_smile_1', 'p08_tongue_1'],
    cake: ['p08_cake-plate_1', 'p08_cake-tier_1', 'p08_cake-tier_2', 'p08_frosting-drips_1', 'p08_sprinkles_1', 'p08_candle_1', 'p08_flame_1'],
    zibEyes: ['p08_eye_1', 'p08_eye-glint_1', 'p08_eye_2', 'p08_eye-glint_2'],
    marsPupils: ['p08_mars-pupil_1', 'p08_eye-glint_3', 'p08_mars-pupil_2', 'p08_eye-glint_4'],
    marsEyes: ['p08_mars-eye_1', 'p08_mars-pupil_1', 'p08_eye-glint_3', 'p08_mars-eye_2', 'p08_mars-pupil_2', 'p08_eye-glint_4'],
  },
  9: {
    jupiter: ['p09_cut-paper-disc_1', 'p09_stripe_1', 'p09_stripe_2', 'p09_stripe_3', 'p09_stripe_4', 'p09_stripe_5', 'p09_planet-shade_1', 'p09_eye_1', 'p09_tiny-disc-left_1', 'p09_eye_2', 'p09_tiny-disc-left_2', 'p09_whisper-mouth_1'],
    mars: ['p09_cut-paper-disc_2', 'p09_planet-shade_2', 'p09_halftone-shade_3', 'p09_crater_1', 'p09_crater-lip_1', 'p09_crater_2', 'p09_crater-lip_2', 'p09_crater_3', 'p09_crater-lip_3', 'p09_shine_1', 'p09_blush-patch_1', 'p09_blush-patch_2', 'p09_mars-eye_1', 'p09_mars-pupil_1', 'p09_eye-glint_1', 'p09_mars-eye_2', 'p09_mars-pupil_2', 'p09_eye-glint_2', 'p09_smile_1'],
    zib: ['p09_sticker-outline_1', 'p09_sticker-outline_2', 'p09_sticker-outline_3', 'p09_sticker-outline_4', 'p09_sticker-outline_5', 'p09_sticker-outline_6', 'p09_antenna_1', 'p09_antenna-bulb_1', 'p09_boot_1', 'p09_boot_2', 'p09_suit_1', 'p09_chest-panel_1', 'p09_tiny-disc-centre_1', 'p09_tiny-disc-centre_2', 'p09_tiny-disc-centre_3', 'p09_arm_1', 'p09_mitt_1', 'p09_arm_2', 'p09_mitt_2', 'p09_helmet_1', 'p09_face_1', 'p09_visor-shine_1', 'p09_visor-shine_2', 'p09_cheek_1', 'p09_cheek_2', 'p09_eye_3', 'p09_eye-glint_3', 'p09_eye_4', 'p09_eye-glint_4', 'p09_smile_2'],
    nova: ['p09_small-disc-bottom-left_1', 'p09_small-disc-bottom-left_2', 'p09_sticker-outline_7', 'p09_ear_1', 'p09_ear_2', 'p09_head_1', 'p09_muzzle_1', 'p09_nose_1', 'p09_tiny-disc-bottom-left_4', 'p09_pupil_1', 'p09_tiny-disc-bottom-left_5', 'p09_tiny-disc-bottom-left_6', 'p09_pupil_2', 'p09_tiny-disc-bottom-left_7', 'p09_smile_3', 'p09_tongue_1'],
    saturn: ['p09_saturn-ring-back_1', 'p09_cut-paper-disc_3', 'p09_planet-shade_3', 'p09_halftone-shade_4', 'p09_shine_2', 'p09_saturn-ring-front_1', 'p09_ring-shine_1', 'p09_eye_5', 'p09_tiny-disc-right_1', 'p09_eye_6', 'p09_tiny-disc-right_2', 'p09_grin_1', 'p09_tongue_2'],
    planetViolet: ['p09_cut-paper-disc_4', 'p09_planet-shade_4', 'p09_halftone-shade_5', 'p09_crater_4', 'p09_crater-lip_4', 'p09_crater_5', 'p09_crater-lip_5', 'p09_crater_6', 'p09_crater-lip_6', 'p09_shine_3'],
    planetRed: ['p09_cut-paper-disc_5', 'p09_planet-shade_5', 'p09_crater_7', 'p09_crater-lip_7', 'p09_crater_8', 'p09_crater-lip_8', 'p09_shine_4'],
    discoBall: ['p09_medium-disc-top-right_1', 'p09_halftone-shade_1', 'p09_halftone-shade_2', 'p09_disco-string_1'],
    zibEyes: ['p09_eye_3', 'p09_eye-glint_3', 'p09_eye_4', 'p09_eye-glint_4'],
    marsPupils: ['p09_mars-pupil_1', 'p09_eye-glint_1', 'p09_mars-pupil_2', 'p09_eye-glint_2'],
    marsEyes: ['p09_mars-eye_1', 'p09_mars-pupil_1', 'p09_eye-glint_1', 'p09_mars-eye_2', 'p09_mars-pupil_2', 'p09_eye-glint_2'],
  },
  10: {
    sun: ['p10_cut-paper-disc_1', 'p10_cut-paper-disc_2', 'p10_cut-paper-disc_3', 'p10_halftone-shade_1', 'p10_smile_1', 'p10_smile_2', 'p10_cheek_1', 'p10_cheek_2', 'p10_smile_3'],
    zib: ['p10_sticker-outline_1', 'p10_sticker-outline_2', 'p10_sticker-outline_3', 'p10_sticker-outline_4', 'p10_sticker-outline_5', 'p10_sticker-outline_6', 'p10_antenna_1', 'p10_antenna-bulb_1', 'p10_boot_1', 'p10_boot_2', 'p10_suit_1', 'p10_chest-panel_1', 'p10_tiny-disc-bottom_1', 'p10_tiny-disc-bottom_2', 'p10_tiny-disc-bottom_3', 'p10_arm_1', 'p10_mitt_1', 'p10_arm_2', 'p10_mitt_2', 'p10_helmet_1', 'p10_face_1', 'p10_visor-shine_1', 'p10_visor-shine_2', 'p10_cheek_3', 'p10_cheek_4', 'p10_smile_4', 'p10_smile_5', 'p10_smile_6'],
    nova: ['p10_comet-tail-outline_1', 'p10_comet-tail_1', 'p10_tiny-disc-bottom_4', 'p10_comet-tail-outline_2', 'p10_comet-tail_2', 'p10_comet-tail-outline_3', 'p10_comet-tail_3', 'p10_tiny-disc-bottom_5', 'p10_tiny-disc-bottom_6', 'p10_tiny-disc-bottom-right_1', 'p10_sticker-outline_7', 'p10_ear_1', 'p10_ear_2', 'p10_head_1', 'p10_muzzle_1', 'p10_nose_1', 'p10_smile_7', 'p10_smile_8', 'p10_smile_9', 'p10_tongue_1'],
    goodnight: ['p10_closing-line-shadow_1', 'p10_closing-line-shadow_2', 'p10_closing-line-shadow_3', 'p10_closing-line-shadow_4', 'p10_closing-line-shadow_5', 'p10_closing-line-shadow_6', 'p10_closing-line-shadow_7', 'p10_closing-line-shadow_8', 'p10_closing-line-shadow_9', 'p10_closing-line-shadow_10', 'p10_closing-line-shadow_11', 'p10_closing-line-shadow_12', 'p10_closing-line-shadow_13', 'p10_closing-line-shadow_14', 'p10_closing-line-shadow_15', 'p10_closing-line-shadow_16', 'p10_closing-line-shadow_17', 'p10_closing-line-shadow_18', 'p10_closing-line_1', 'p10_closing-line_2', 'p10_closing-line_3', 'p10_closing-line_4', 'p10_closing-line_5', 'p10_closing-line_6', 'p10_closing-line_7', 'p10_closing-line_8', 'p10_closing-line_9', 'p10_closing-line_10', 'p10_closing-line_11', 'p10_closing-line_12', 'p10_closing-line_13', 'p10_closing-line_14', 'p10_closing-line_15', 'p10_closing-line_16', 'p10_closing-line_17', 'p10_closing-line_18'],
  },
  11: {
    saturn: ['p11_saturn-ring-back_1', 'p11_cut-paper-disc_1', 'p11_planet-shade_1', 'p11_halftone-shade_1', 'p11_shine_1', 'p11_saturn-ring-front_1', 'p11_ring-shine_1', 'p11_eye_1', 'p11_tiny-disc-top-right_1', 'p11_eye_2', 'p11_tiny-disc-top-right_2', 'p11_grin_1', 'p11_tongue_1'],
    planetTeal: ['p11_cut-paper-disc_2', 'p11_planet-shade_2', 'p11_crater_1', 'p11_crater-lip_1', 'p11_crater_2', 'p11_crater-lip_2', 'p11_shine_2'],
    planetOrange: ['p11_cut-paper-disc_3', 'p11_planet-shade_3', 'p11_halftone-shade_2', 'p11_crater_3', 'p11_crater-lip_3', 'p11_crater_4', 'p11_crater-lip_4', 'p11_crater_5', 'p11_crater-lip_5', 'p11_shine_3'],
    planetWhite: ['p11_cut-paper-disc_4', 'p11_planet-shade_4', 'p11_crater_6', 'p11_crater-lip_6', 'p11_shine_4'],
    planetCream: ['p11_cut-paper-disc_5', 'p11_planet-shade_5', 'p11_halftone-shade_3', 'p11_crater_7', 'p11_crater-lip_7', 'p11_crater_8', 'p11_crater-lip_8', 'p11_shine_5'],
    emptyPlace: ['p11_empty-place_1'],
    cake: ['p11_cake-plate_1', 'p11_cake-tier_1', 'p11_cake-tier_2', 'p11_frosting-drips_1', 'p11_sprinkles_1', 'p11_candle_1', 'p11_flame_1'],
    zib: ['p11_sticker-outline_1', 'p11_sticker-outline_2', 'p11_sticker-outline_3', 'p11_sticker-outline_4', 'p11_sticker-outline_5', 'p11_sticker-outline_6', 'p11_antenna_1', 'p11_antenna-bulb_1', 'p11_boot_1', 'p11_boot_2', 'p11_suit_1', 'p11_chest-panel_1', 'p11_tiny-disc-bottom-right_1', 'p11_tiny-disc-bottom-right_2', 'p11_tiny-disc-bottom-right_3', 'p11_arm_1', 'p11_mitt_1', 'p11_arm_2', 'p11_mitt_2', 'p11_helmet_1', 'p11_face_1', 'p11_visor-shine_1', 'p11_visor-shine_2', 'p11_cheek_1', 'p11_cheek_2', 'p11_eye_3', 'p11_eye-glint_1', 'p11_eye_4', 'p11_eye-glint_2', 'p11_smile_1'],
    nova: ['p11_comet-tail-outline_1', 'p11_comet-tail_1', 'p11_comet-tail-outline_2', 'p11_comet-tail_2', 'p11_tiny-disc-bottom_1', 'p11_comet-tail-outline_3', 'p11_comet-tail_3', 'p11_comet-tail-outline_4', 'p11_comet-tail_4', 'p11_tiny-disc-bottom_2', 'p11_tiny-disc-bottom_3', 'p11_tiny-disc-bottom-right_4', 'p11_sticker-outline_7', 'p11_ear_1', 'p11_ear_2', 'p11_head_1', 'p11_muzzle_1', 'p11_nose_1', 'p11_tiny-disc-bottom-right_5', 'p11_pupil_1', 'p11_tiny-disc-bottom-right_6', 'p11_tiny-disc-bottom-right_7', 'p11_pupil_2', 'p11_tiny-disc-bottom-right_8', 'p11_smile_2', 'p11_tongue_2'],
    zibEyes: ['p11_eye_3', 'p11_eye-glint_1', 'p11_eye_4', 'p11_eye-glint_2'],
  },
};

// ───────────────────────────── small builders ─────────────────────────────
const grp = (group: string): Target => ({ group });
const lab = (label: string): Target => ({ label });
const PAGE: Target = { page: true };
const eq = (name: string, value: number | string | boolean): Cond => ({ var: name, op: '==', value });
const ge = (name: string, value: number): Cond => ({ var: name, op: '>=', value });
const spreadText = (n: number) => orbitParty.spreads[n - 1].text.replace(/\s+/g, ' ').trim();

/** A looping idle animation. `sync` keeps every piece of a group in the same phase (a character must not tear apart); without it, loops desynchronise by seed. */
const loop = (id: string, target: Target, preset: AnimSpec['preset'], o: Partial<AnimSpec> = {}, sync = false, label?: string): Behavior => ({
  id, label, target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset, loop: 'infinite', ...(sync ? { delayMs: 0 } : {}), ...o } }],
});
/** Idle life of a character built from many pieces: breathe + blink, all in the same phase. */
const life = (prefix: string, body: string, eyes?: string, o: { bob?: number; breathe?: number } = {}): Behavior[] => [
  loop(`${prefix}-breathe`, grp(body), 'breathe', { amount: o.breathe ?? 1, durationMs: 4200 }, true, `${prefix} breathes`),
  ...(o.bob ? [loop(`${prefix}-bob`, grp(body), 'bob', { amount: o.bob, durationMs: 2600 }, true, `${prefix} bobs`)] : []),
  ...(eyes ? [loop(`${prefix}-blink`, grp(eyes), 'blink', {}, true, `${prefix} blinks`)] : []),
];
const twinkle = (id: string, target: Target, amount = 1): Behavior => loop(id, target, 'twinkle', { amount }, false, 'Stars twinkle');
const parallax = (id: string, target: Target, amount: number, hint: string, axis: 'x' | 'y' | 'both' = 'both'): Behavior => ({
  id, label: 'Tilt parallax', target, on: { type: 'tilt', axis, gain: 1 }, hint, do: [{ do: 'animate', anim: { preset: 'parallax', amount } }],
});

/** A quick, non-moving "I heard you" for reduced motion: the object dims for an instant. */
const ping = (t: Target): Action[] => [{ do: 'set', target: t, props: { opacity: 0.55 } }, { do: 'wait', ms: 150 }, { do: 'set', target: t, props: { opacity: 1 } }];
const sparkle = (t: Target, kind: 'notes' | 'sparkles' | 'hearts' | 'stars' | 'confetti' | 'bubbles' = 'notes', count = 5): Action => ({ do: 'burst', at: t, kind, count });

/** Tap a thing: it makes a sound and moves; reduced motion keeps the sound and shows a still "ping". */
const tapSound = (id: string, target: Target, hint: string, sound: Action[], motion: AnimSpec | null, o: Partial<Behavior> & { burst?: Action | null } = {}): Behavior => {
  const { burst, ...rest } = o;
  return {
    id, target, on: { type: 'tap' }, hint,
    do: [...sound, ...(motion ? [{ do: 'animate', anim: motion } as Action] : []), ...(burst === null ? [] : [burst ?? sparkle(target)])],
    reduced: [...sound, ...ping(target)],
    ...rest,
  };
};
const note = (instrument: string, n: string | number, durationMs = 700, gain = 0.8): Action => ({ do: 'note', instrument, note: n, durationMs, gain });
const sfx = (sound: string, gain?: number, pitch?: number): Action => ({ do: 'sfx', sound, params: { ...(gain != null ? { gain } : {}), ...(pitch != null ? { pitch } : {}) } });
const wait = (ms: number): Action => ({ do: 'wait', ms });
const setv = (name: string, value: number | string | boolean): Action => ({ do: 'var', name, op: 'set', value });
const incv = (name: string): Action => ({ do: 'var', name, op: 'inc' });

/** One page. `groups` is picked from GROUPS by scanning which ones the behaviours use, so a page carries only what it needs. */
function page(n: number, p: Omit<LivingPage, 'page' | 'groups' | 'narration'> & { rate?: number }): LivingPage {
  const { rate, ...rest } = p;
  const used = new Set([...JSON.stringify(rest.behaviors).matchAll(/"group":"([^"]+)"/g)].map(m => m[1]));
  const groups: Record<string, string[]> = {};
  for (const name of used) { const ids = GROUPS[n]?.[name]; if (!ids) throw new Error(`orbit-party page ${n}: no group "${name}"`); groups[name] = ids; }
  return { page: n, ...(used.size ? { groups } : {}), ...rest, narration: { text: spreadText(n), voice: 'bright', rate: rate ?? 0.9 } };
}

// ───────────────────────────── music (all synthesised; everything lives in C major pentatonic, so any planet note fits any cue) ─────────────────────────────
const bars = (n: number) => n * 4;
/** One arpeggio per bar over a list of [root, quality]. */
const barArps = (prog: Array<[string, string]>, o: { pattern?: 'up' | 'down' | 'updown'; step: number; count: number; dur: number; vel: number; lift?: number }) =>
  prog.flatMap(([r, q], b) => arpeggiate(chord(r, q).map(x => x + (o.lift ?? 12)), { pattern: o.pattern ?? 'updown', step: o.step, count: o.count, dur: o.dur, t0: b * 4, vel: o.vel }));
const PROG: Array<[string, string]> = [['C3', 'maj'], ['A2', 'min'], ['C3', 'maj'], ['G2', 'maj']];

const partyTheme = (): Score => {
  const melody = parseNotation('E5:1 G5:.5 E5:.5 D5:1 C5:1 | D5:1 E5:.5 D5:.5 C5:1 A4:1 | G4:1 A4:.5 C5:.5 D5:1 E5:1 | D5:2 C5:1 rest:1', { defaultVel: 0.7 });
  return makeScore({
    id: 'party-theme', tempo: 100, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.2, variation: { seed: 41, humanizeMs: 10, dropout: 0.03 },
    tracks: [
      track('marimba', melody.notes, { gain: 0.8 }),
      track('kalimba', barArps(PROG, { step: 0.5, count: 8, dur: 0.5, vel: 0.32 }), { gain: 0.5, pan: -0.25 }),
      track('bass', bassline(['C2', 'A1', 'C2', 'G2'], 'oompah', { beatsPerBar: 4, vel: 0.7 }), { gain: 0.7 }),
      track('drum', drums({ shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.4 }),
    ],
  });
};
const sniffTrot = (): Score => {
  const melody = parseNotation('G4:.5 A4:.5 C5:.5 A4:.5 G4:1 E4:1 | G4:.5 A4:.5 C5:.5 D5:.5 E5:1 C5:1 | D5:.5 C5:.5 A4:.5 G4:.5 A4:1 G4:1 | E4:.5 G4:.5 A4:.5 C5:.5 D5:2', { defaultVel: 0.7 });
  return makeScore({
    id: 'sniff-trot', tempo: 120, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.15, variation: { seed: 42, humanizeMs: 12, dropout: 0.04 },
    tracks: [
      track('pluck', melody.notes, { gain: 0.55 }),
      track('kalimba', barArps(PROG, { pattern: 'up', step: 0.5, count: 8, dur: 0.4, vel: 0.3 }), { gain: 0.45, pan: 0.25 }),
      track('bass', bassline(['C2', 'C2', 'A1', 'G2'], 'pulse', { beatsPerBar: 4, vel: 0.65 }), { gain: 0.6 }),
      track('drum', drums({ kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.38 }),
    ],
  });
};
const shySky = (): Score => {
  const bell = parseNotation('rest:2 E5:2 | rest:1 D5:1 C5:2 | rest:2 G4:2 | A4:3 rest:1', { defaultVel: 0.55 });
  const glass = parseNotation('rest:4 | C5:1 rest:3 | rest:4 | rest:2 E5:1 rest:1', { defaultVel: 0.35 });
  return makeScore({
    id: 'shy-sky', tempo: 75, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.55, variation: { seed: 43, humanizeMs: 22, dropout: 0.12 },
    tracks: [
      track('bell', bell.notes, { gain: 0.6 }), track('glass', glass.notes, { gain: 0.4, pan: 0.3 }),
      track('pad', [{ t: 0, n: 'C3', d: 15.5, v: 0.3 }, { t: 0, n: 'G3', d: 15.5, v: 0.22 }], { gain: 0.3 }),
    ],
  });
};
const knockKnock = (): Score => {
  const stab = parseNotation('rest:1 E4:.5 G4:.5 rest:1 E4:.5 G4:.5 | rest:1 D4:.5 E4:.5 rest:1 C4:.5 D4:.5 | rest:1 E4:.5 G4:.5 rest:1 E4:.5 G4:.5 | rest:1 A4:.5 G4:.5 E4:2', { defaultVel: 0.65 });
  return makeScore({
    id: 'knock-knock', tempo: 100, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.12, variation: { seed: 44, humanizeMs: 10 },
    tracks: [
      track('marimba', stab.notes, { gain: 0.7 }),
      track('bass', bassline(['C2', 'C2', 'A1', 'G2'], 'pulse', { beatsPerBar: 4, vel: 0.6 }), { gain: 0.55 }),
      track('drum', drums({ click: 'x.x.............' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.5 }),
    ],
  });
};
const sitBeside = (): Score => {
  const mel = parseNotation('E5:2 D5:1 C5:1 | D5:2 A4:2 | G4:2 A4:1 C5:1 | D5:3 rest:1', { defaultVel: 0.55 });
  return makeScore({
    id: 'sit-beside', tempo: 80, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.4, variation: { seed: 45, humanizeMs: 16, dropout: 0.05 },
    tracks: [
      track('musicbox', mel.notes, { gain: 0.8 }),
      track('harp', barArps(PROG, { pattern: 'up', step: 1, count: 4, dur: 1.2, vel: 0.32 }), { gain: 0.45, pan: -0.25 }),
      track('pad', [{ t: 0, n: 'C3', d: 15.5, v: 0.26 }, { t: 0, n: 'G3', d: 15.5, v: 0.2 }], { gain: 0.3 }),
    ],
  });
};
/** 120 bpm = exactly 500 ms a beat, so the dancers on page 9 (animations of 500 / 1000 ms) stay in step for as long as anyone watches. */
const DANCE_BEAT_MS = 500;
const danceSmall = (): Score => {
  const hook = parseNotation('E5:.5 G5:.5 E5:.5 D5:.5 C5:1 D5:1 | E5:.5 G5:.5 A5:.5 G5:.5 E5:1 D5:1 | C5:.5 D5:.5 E5:.5 D5:.5 C5:1 A4:1 | D5:.5 E5:.5 D5:.5 C5:.5 D5:2', { defaultVel: 0.7 });
  const bellHits = [0, 4, 8, 12].map(t => ({ t, n: 'C6', d: 1.5, v: 0.4 }));
  return makeScore({
    id: 'dance-small', tempo: 120, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.18, variation: { seed: 46, humanizeMs: 6 },
    tracks: [
      track('marimba', hook.notes, { gain: 0.7 }),
      track('kalimba', barArps(PROG, { pattern: 'up', step: 0.5, count: 8, dur: 0.4, vel: 0.3 }), { gain: 0.4, pan: -0.3 }),
      track('bell', bellHits, { gain: 0.4, pan: 0.3 }),
      track('bass', bassline(['C2', 'A1', 'C2', 'G2'], 'oompah', { beatsPerBar: 4, vel: 0.75 }), { gain: 0.7 }),
      track('drum', drums({ kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.5 }),
    ],
  });
};
const goodnightSky = (): Score => {
  const mel = parseNotation('G4:2 E4:1 D4:1 | C4:2 D4:1 E4:1 | G4:2 A4:1 G4:1 | E4:4', { defaultVel: 0.5 });
  return makeScore({
    id: 'goodnight-sky', tempo: 60, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.5, variation: { seed: 47, humanizeMs: 18 },
    tracks: [
      track('musicbox', mel.notes, { gain: 0.8 }),
      track('harp', barArps([['C3', 'maj'], ['A2', 'min'], ['C3', 'maj'], ['C3', 'maj']], { pattern: 'up', step: 1, count: 4, dur: 1.4, vel: 0.28 }), { gain: 0.4, pan: -0.2 }),
      track('pad', [{ t: 0, n: 'C3', d: 15.5, v: 0.28 }, { t: 0, n: 'E3', d: 15.5, v: 0.2 }, { t: 0, n: 'G3', d: 15.5, v: 0.2 }], { gain: 0.3 }),
    ],
  });
};
const SCORES: Record<string, Score> = Object.fromEntries([partyTheme(), sniffTrot(), shySky(), knockKnock(), sitBeside(), danceSmall(), goodnightSky()].map(s => [s.id, s]));

// ───────────────────────────── the planets: one note each ─────────────────────────────
/** Tap a planet: its note, a little pulse, a few musical notes. `glow` is an extra sound that belongs to the planet's character. */
const planet = (id: string, group: string, name: string, instrument: string, n: string, extra: Action[] = [], flag?: string): Behavior =>
  tapSound(id, grp(group), `Tap ${name} to play its note`, [note(instrument, n, 900, 0.8), ...extra, ...(flag ? [setv(flag, true)] : [])], { preset: 'pulse', amount: 1.1 }, { burst: sparkle(grp(group), 'notes', 4) });

const ambienceSpace = (gain = 0.22) => ({ bed: 'space-drone', gain });

// ───────────────────────────── pages ─────────────────────────────
const P1 = page(1, {
  vars: { popped: 0 },
  music: { cue: 'party-theme', fadeMs: 800 },
  behaviors: [
    { id: 'title-bounce', label: 'Title bounces in', target: grp('titleLetters'), on: { type: 'enter' }, do: [{ do: 'animate', anim: { preset: 'bounce', amount: 0.6, delayMs: 0 } }] },
    ...life('zib', 'zib', 'zibEyes', { bob: 0.5 }),
    loop('nova-drift', grp('nova'), 'drift', { amount: 0.8, durationMs: 5200 }, true, 'Nova drifts'),
    loop('sun-breathe', grp('sunBig'), 'breathe', { amount: 0.7, durationMs: 6000 }, true, 'The big sun breathes'),
    loop('teal-drift', grp('planetTeal'), 'drift', { amount: 0.7, durationMs: 6400 }, true),
    loop('red-drift', grp('planetRed'), 'drift', { amount: 0.6, durationMs: 5600, direction: 'reverse' }, true),
    loop('yellow-drift', grp('planetYellow'), 'drift', { amount: 0.6, durationMs: 7200 }, true),
    loop('mint-drift', grp('planetMint'), 'drift', { amount: 0.5, durationMs: 6000, direction: 'reverse' }, true),
    loop('balloon1-bob', grp('balloon1'), 'bob', { amount: 0.5, durationMs: 2600 }, true),
    loop('balloon2-bob', grp('balloon2'), 'bob', { amount: 0.5, durationMs: 3000 }, true),
    loop('balloon3-bob', grp('balloon3'), 'bob', { amount: 0.5, durationMs: 2300 }, true),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.8),
    loop('flame-flicker', lab('Flame'), 'flicker', { amount: 0.8 }, false, 'The candle flickers'),
    parallax('flecks-tilt', lab('Paper flecks'), 1.1, 'Tilt your device and the paper flecks drift a little'),

    tapSound('zib-toot', grp('zib'), 'Tap Zib to hear his kazoo', [sfx('kazoo-toot', 0.7)], { preset: 'jelly', amount: 0.8 }, { burst: sparkle(grp('zib'), 'notes', 5) }),
    tapSound('nova-yip', grp('nova'), 'Tap Nova the comet pup to hear her yip', [sfx('squeak', 0.6, 5)], { preset: 'jelly', amount: 0.8 }, { burst: sparkle(grp('nova'), 'sparkles', 8) }),
    tapSound('title-chime', grp('titleLetters'), 'Tap the title to ring a chime', [note('bell', 'G5', 1200, 0.7), note('bell', 'C6', 1200, 0.5)], { preset: 'pulse', amount: 0.5 }, { burst: null }),
    planet('sun-note', 'sunBig', 'the big sun', 'marimba', 'C3'),
    planet('teal-note', 'planetTeal', 'the teal planet', 'marimba', 'G4'),
    planet('red-note', 'planetRed', 'the red planet', 'marimba', 'A4'),
    planet('yellow-note', 'planetYellow', 'the yellow planet', 'marimba', 'E4'),
    planet('mint-note', 'planetMint', 'the little mint planet', 'glass', 'C5'),
    ...(['1', '2', '3'] as const).map((k, i): Behavior => ({
      id: `balloon${k}-pop`, target: grp(`balloon${k}`), on: { type: 'tap' }, once: true, hint: `Tap balloon ${k} to pop it`,
      do: [sfx('pop', 0.6, 3 + i * 2), { do: 'animate', anim: { preset: 'pop-out' } }, sparkle(grp(`balloon${k}`), 'confetti', 8), incv('popped')],
      reduced: [sfx('pop', 0.6, 3 + i * 2), { do: 'hide', target: grp(`balloon${k}`) }, incv('popped')],
    })),
    { id: 'balloons-cheer', label: 'Three balloons popped', target: PAGE, on: { type: 'when', cond: ge('popped', 3) }, do: [sfx('success-jingle', 0.7), { do: 'burst', at: { x: 512, y: 300 }, kind: 'confetti', count: 20 }] },
    tapSound('cake-blow', grp('cake'), 'Tap the cake to blow the candle', [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4)], null, { burst: null,
      do: [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4), { do: 'hide', target: lab('Flame') }, wait(2200), { do: 'show', target: lab('Flame') }] }),
  ],
  goals: [{ id: 'popped-all', label: 'Popped all three balloons', when: ge('popped', 3), celebrate: false }],
  a11y: { summary: 'The cover: Orbit Party! Zib the little astronaut holds a cake, Nova the comet pup zips past, and planets and balloons float around the title.', instructions: 'Tap any planet to play its note. Pop the three balloons. Tap Zib, Nova or the cake. Tilt your device to shift the paper flecks.' },
});

const P2 = page(2, {
  vars: { toots: 0 },
  music: { cue: 'party-theme', fadeMs: 800 },
  ambience: ambienceSpace(0.18),
  behaviors: [
    ...life('zib', 'zib', 'zibEyes', { bob: 0.6 }),
    loop('nova-drift', grp('nova'), 'drift', { amount: 0.8, durationMs: 5600 }, true),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.6, durationMs: 6400 }, true, 'The sun breathes'),
    loop('sun-blink', grp('sunEyes'), 'blink', {}, true, 'The sun blinks'),
    loop('pink-drift', grp('planetPink'), 'drift', { amount: 0.4, durationMs: 9000 }, true),
    loop('teal-drift', grp('planetTeal'), 'drift', { amount: 0.8, durationMs: 6000, direction: 'reverse' }, true),
    loop('violet-drift', grp('planetViolet'), 'drift', { amount: 0.8, durationMs: 7000 }, true),
    loop('moon-drift', grp('moon'), 'drift', { amount: 1, durationMs: 8000, direction: 'reverse' }, true),
    twinkle('stars-twinkle', grp('stars'), 1),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.7),
    loop('flame-flicker', lab('Flame'), 'flicker', { amount: 0.8 }, false, 'The candle flickers'),
    parallax('stars-tilt', grp('stars'), 0.5, 'Tilt your device and the stars slide behind Zib'),
    parallax('flecks-tilt', lab('Paper flecks'), 1.1, 'Tilt your device to shift the flecks'),
    parallax('pink-tilt', grp('planetPink'), 0.25, 'Tilt your device to move the big pink planet a little'),

    // Zib's kazoo: press and HOLD; a held voice that bends with the finger (up = higher, down = lower)
    { id: 'kazoo-hold', label: "Zib's kazoo", target: grp('kazooHold'), on: { type: 'press', minMs: 0 },
      hint: "Press and hold Zib's kazoo to toot. Slide your finger up or down to bend the note.",
      do: [{ do: 'note', instrument: 'kazoo', note: 'G4', gain: 0.7 }, { do: 'animate', target: lab('Kazoo'), anim: { preset: 'wiggle', amount: 0.5 } }, incv('toots')],
      reduced: [{ do: 'note', instrument: 'kazoo', note: 'G4', gain: 0.7 }, incv('toots')] },
    { id: 'kazoo-release', label: 'The toot ends', target: grp('kazooHold'), on: { type: 'release' }, do: [{ do: 'burst', at: lab('Kazoo'), kind: 'notes', count: 4 }] },
    tapSound('nova-yip', grp('nova'), 'Tap Nova to hear her yip', [sfx('squeak', 0.6, 5)], { preset: 'jelly', amount: 0.8 }),
    tapSound('sun-twinkle', grp('sun'), 'Tap the smiling sun', [note('felt-piano', 'C4', 1200, 0.7), sfx('twinkle', 0.5)], { preset: 'pulse', amount: 0.6 }, { burst: sparkle(grp('sun'), 'stars', 6) }),
    planet('pink-note', 'planetPink', 'the big pink planet', 'marimba', 'C3'),
    planet('teal-note', 'planetTeal', 'the teal planet', 'marimba', 'E4'),
    planet('violet-note', 'planetViolet', 'the violet planet', 'marimba', 'G4'),
    planet('moon-note', 'moon', 'the moon', 'glass', 'D5'),
    tapSound('cake-blow', grp('cake'), 'Tap the cake to blow the candle', [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4)], null, { burst: null,
      do: [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4), { do: 'hide', target: lab('Flame') }, wait(2200), { do: 'show', target: lab('Flame') }] }),
  ],
  a11y: { summary: 'Zib zooms past a smiling sun with a cake and a kazoo, with Nova right behind him.', instructions: "Press and hold Zib's kazoo to toot, and slide your finger up or down to bend the pitch. Tap each planet to play its note. Tilt your device to slide the star layers." },
});

const P3 = page(3, {
  vars: { chase: true },
  music: { cue: 'sniff-trot', fadeMs: 800 },
  behaviors: [
    // Nova follows the finger and the finger leaves sparkles behind (the trail can be switched off by tapping Nova)
    { id: 'nova-follow', label: 'Nova follows your finger', target: grp('nova'), on: { type: 'enter' },
      do: [{ do: 'follow', target: grp('nova'), to: 'pointer', lookAt: true, lagMs: 260, maxOffset: 110 }, { do: 'trail', kind: 'sparkles', whileVar: 'chase' }] },
    loop('nova-bob', grp('nova'), 'bob', { amount: 0.4, durationMs: 1400 }, true, 'Nova bobs'),
    loop('sun-breathe', grp('sunBig'), 'breathe', { amount: 0.7, durationMs: 6000 }, true, 'The big sun breathes'),
    loop('purple-drift', grp('planetPurple'), 'drift', { amount: 0.8, durationMs: 7000 }, true),
    loop('teal-drift', grp('planetTeal'), 'drift', { amount: 0.8, durationMs: 6000, direction: 'reverse' }, true),
    loop('yellow-drift', grp('planetYellow'), 'drift', { amount: 0.7, durationMs: 6600 }, true),
    loop('moon-drift', grp('moon'), 'drift', { amount: 0.6, durationMs: 5200, direction: 'reverse' }, true),
    loop('sniff-bob', grp('sniff'), 'bob', { amount: 0.35, durationMs: 1200 }, false, 'Sniff! Sniff! bobs'),
    loop('woof-bob', grp('woof'), 'bob', { amount: 0.5, durationMs: 1700 }, false, 'Woof! bobs'),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.7),
    parallax('orbit-tilt', lab('Orbit'), 0.5, 'Tilt your device to shift the orbit lines'),
    parallax('flecks-tilt', lab('Paper flecks'), 1.1, 'Tilt your device to shift the flecks'),

    { id: 'nova-trail-toggle', target: grp('nova'), on: { type: 'tap' }, hint: 'Nova follows your finger. Tap Nova to turn her sparkle trail on or off.',
      do: [{ do: 'var', name: 'chase', op: 'toggle' }, sfx('squeak', 0.55, 5), { do: 'animate', anim: { preset: 'jelly', amount: 0.8 } }],
      reduced: [{ do: 'var', name: 'chase', op: 'toggle' }, sfx('squeak', 0.55, 5), ...ping(grp('nova'))] },
    tapSound('sniff-tap', grp('sniff'), 'Tap Sniff! Sniff! to hear Nova sniff', [sfx('tick', 0.8, 4), wait(120), sfx('tick', 0.8, 6), wait(120), sfx('tick', 0.8, 5)], { preset: 'jelly', amount: 0.6 }, { burst: null }),
    tapSound('woof-tap', grp('woof'), 'Tap Woof! to hear Nova bark', [sfx('boop', 0.9, -9), note('marimba', 'C3', 400, 0.7)], { preset: 'bounce', amount: 1 }, { burst: sparkle(grp('woof'), 'stars', 6) }),
    planet('sun-note', 'sunBig', 'the big sun', 'marimba', 'C3'),
    planet('purple-note', 'planetPurple', 'the purple planet', 'marimba', 'E4'),
    planet('teal-note', 'planetTeal', 'the teal planet', 'marimba', 'G4'),
    planet('yellow-note', 'planetYellow', 'the yellow planet', 'marimba', 'C5'),
    planet('moon-note', 'moon', 'the white moon', 'glass', 'D5'),
  ],
  a11y: { summary: 'Nova the comet pup zips round the page, sniffing out the planets.', instructions: 'Move your finger over the page and Nova follows it, leaving sparkles. Tap Nova to switch the trail. Tap Sniff and Woof, and tap any planet to play its note.' },
});

// page 4: the planets arrive. Tap them in the order they came (Saturn, Jupiter, Neptune, the Moon) and they play the arrival tune.
const arrival = (k: 1 | 2 | 3 | 4, then: Action[]): Action => ({ do: 'if', cond: eq('order', k - 1), then: [setv('order', k), ...then], else: [setv('order', k === 1 ? 1 : 0)] });
const P4 = page(4, {
  vars: { order: 0 },
  music: { cue: 'party-theme', fadeMs: 800 },
  ambience: ambienceSpace(0.16),
  behaviors: [
    ...life('zib', 'zib', 'zibEyes', { bob: 0.5 }),
    loop('nova-drift', grp('nova'), 'drift', { amount: 0.7, durationMs: 5200 }, true),
    loop('saturn-bob', grp('saturn'), 'bob', { amount: 0.5, durationMs: 2800 }, true, 'Saturn bobs'),
    loop('jupiter-breathe', grp('jupiter'), 'breathe', { amount: 1.2, durationMs: 4600 }, true, 'Jupiter breathes'),
    loop('neptune-bob', grp('neptune'), 'bob', { amount: 0.6, durationMs: 2200 }, true, 'Neptune blub-blubs'),
    loop('moon-bob', grp('moon'), 'bob', { amount: 0.4, durationMs: 3200 }, true),
    loop('empty-glow', grp('emptyPlace'), 'twinkle', { amount: 1.4, durationMs: 2400 }, true, 'The empty place waits'),
    twinkle('stars-twinkle', lab('Stars'), 1),
    loop('flame-flicker', lab('Flame'), 'flicker', { amount: 0.8 }, false),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),

    tapSound('saturn-tap', grp('saturn'), 'Tap Saturn to hear his note. Tap the planets in order to play a tune.', [note('glass', 'G4', 1000, 0.8), sfx('whoosh', 0.35), arrival(1, [])], { preset: 'jelly', amount: 0.8 }, { burst: sparkle(grp('saturn'), 'notes', 5) }),
    tapSound('jupiter-tap', grp('jupiter'), 'Tap Jupiter to hear him go ho ho ho', [note('marimba', 'C3', 900, 0.9), sfx('toot', 0.5, -5), wait(170), sfx('toot', 0.45, -5), wait(170), sfx('toot', 0.4, -5), arrival(2, [])], { preset: 'jelly', amount: 0.7 }, { burst: sparkle(grp('jupiter'), 'stars', 6) }),
    tapSound('neptune-tap', grp('neptune'), 'Tap Neptune to hear him blub blub', [note('marimba', 'E4', 900, 0.8), sfx('bubble', 0.7, 2), wait(130), sfx('bubble', 0.7, 6), wait(130), sfx('bubble', 0.7, 9), arrival(3, [])], { preset: 'jelly', amount: 0.9 }, { burst: sparkle(grp('neptune'), 'bubbles', 6) }),
    tapSound('moon-tap', grp('moon'), 'Tap the Moon who brought the snacks', [note('bell', 'C5', 1200, 0.7), sfx('chime', 0.4), arrival(4, [])], { preset: 'pulse', amount: 1 }, { burst: sparkle(grp('moon'), 'sparkles', 6) }),
    { id: 'arrival-tune', label: 'The arrival tune', target: PAGE, on: { type: 'when', cond: ge('order', 4) }, do: [sfx('harp-gliss', 0.7), wait(500), note('bell', 'C6', 1200, 0.6), sfx('success-jingle', 0.55), { do: 'burst', at: { x: 512, y: 380 }, kind: 'stars', count: 18 }] },
    tapSound('empty-tap', grp('emptyPlace'), 'Tap the empty place. Who is missing from the party?', [sfx('gentle-no', 0.45), note('bell', 'A3', 1500, 0.3)], { preset: 'pulse', amount: 0.8 }, { burst: null }),
    tapSound('everyone-tap', grp('everyone'), 'Tap the words Everyone came for a cheer', [sfx('twinkle', 0.6), note('marimba', 'G4', 500, 0.6), note('marimba', 'C5', 600, 0.6)], { preset: 'bounce', amount: 0.6 }, { burst: null }),
    tapSound('almost-tap', grp('almost'), 'Tap the words Almost everyone and everything gets quiet for a moment', [sfx('gentle-no', 0.35), { do: 'duck', amount: 0.6, ms: 1800 }], { preset: 'pulse', amount: 0.5 }, { burst: null }),
    tapSound('cake-blow', grp('cake'), 'Tap the cake to blow the candle', [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4)], null, { burst: null,
      do: [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4), { do: 'hide', target: lab('Flame') }, wait(2200), { do: 'show', target: lab('Flame') }] }),
    tapSound('zib-toot', grp('zib'), 'Tap Zib to hear his kazoo', [sfx('kazoo-toot', 0.6)], { preset: 'jelly', amount: 0.8 }),
    tapSound('nova-yip', grp('nova'), 'Tap Nova to hear her yip', [sfx('squeak', 0.55, 5)], { preset: 'jelly', amount: 0.8 }),
  ],
  goals: [{ id: 'arrival-tune', label: 'Played the arrival tune', when: ge('order', 4), celebrate: false }],
  a11y: { summary: 'The planets arrive at a floating party table: Saturn in his ring, booming Jupiter, bubbly Neptune and the Moon with snacks. An empty dotted place is waiting for someone.', instructions: 'Tap each planet to hear its note. Tap them in the order they arrive, Saturn, Jupiter, Neptune, Moon, to play the arrival tune. Tap the empty place and think about who is missing.' },
});

// page 5: SHY MARS. Slow approach: he peeks and blushes. Fast approach: he hides behind the hill, then peeks back by himself.
const peekDown = (up: boolean): Action[] => [
  { do: 'animate', target: grp('mars'), anim: { keyframes: [{ at: 0, y: 0 }, { at: 1, y: up ? 186 : 170 }], durationMs: 380, easing: 'ease-in' } },
  wait(380), { do: 'set', target: grp('mars'), props: { y: 170 } },
];
const P5 = page(5, {
  vars: { peeks: 0, hides: 0, marsUp: false, marsHidden: false },
  music: { cue: 'shy-sky', fadeMs: 1200 },
  ambience: ambienceSpace(0.28),
  rate: 0.82,
  behaviors: [
    loop('mars-breathe', grp('mars'), 'breathe', { amount: 0.5, durationMs: 5200 }, true, 'Mars breathes'),
    loop('mars-blink', grp('marsEyes'), 'blink', {}, true, 'Mars blinks'),
    ...life('zib', 'zib', 'zibEyes', { breathe: 1.4 }),
    twinkle('stars-twinkle', lab('Stars'), 1),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),
    { id: 'mars-peek', label: 'Mars peeks (slow approach)', target: grp('mars'), on: { type: 'proximity', radius: 210, slowBelow: 260 }, when: eq('marsHidden', false),
      hint: 'Move your finger slowly toward Mars and he peeks out and blushes. Rush at him and he hides. Press Enter to approach gently.',
      do: [
        incv('peeks'), note('bell', 'E5', 1400, 0.5), sfx('twinkle', 0.45),
        { do: 'set', target: grp('blush'), props: { fill: '#ff5c93' } }, { do: 'animate', target: grp('blush'), anim: { preset: 'pulse', amount: 1 } },
        sparkle({ id: 'p05_blush-patch_1' }, 'hearts', 4),
        { do: 'if', cond: eq('marsUp', false), then: [
          setv('marsUp', true),
          { do: 'animate', target: grp('mars'), anim: { keyframes: [{ at: 0, y: 0 }, { at: 1, y: -16 }], durationMs: 700, easing: 'ease-out' } },
          { do: 'animate', target: grp('marsPupils'), anim: { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -7 }], durationMs: 700 } },
          wait(700), { do: 'set', target: grp('mars'), props: { y: -16 } }, { do: 'set', target: grp('marsPupils'), props: { x: -7 } },
        ] },
      ],
      reduced: [incv('peeks'), note('bell', 'E5', 1400, 0.5), sfx('twinkle', 0.45), { do: 'set', target: grp('blush'), props: { fill: '#ff5c93' } }, setv('marsUp', true)] },
    { id: 'mars-hide', label: 'Mars hides (fast approach)', target: grp('mars'), on: { type: 'proximity', radius: 210, fastAbove: 1100 }, when: eq('marsHidden', false),
      hint: 'Rush at Mars and he hides behind the hill. He peeks back out by himself.',
      do: [
        incv('hides'), setv('marsHidden', true), sfx('squeak', 0.35, -4),
        { do: 'if', cond: eq('marsUp', true), then: peekDown(true), else: peekDown(false) },
        wait(2800),
        { do: 'animate', target: grp('mars'), anim: { keyframes: [{ at: 0, y: 0 }, { at: 1, y: -170 }], durationMs: 1200, easing: 'ease-out' } },
        wait(1200), { do: 'set', target: grp('mars'), props: { y: 0 } }, { do: 'set', target: grp('marsPupils'), props: { x: 0 } },
        setv('marsUp', false), setv('marsHidden', false), sfx('twinkle', 0.3),
      ],
      reduced: [incv('hides'), setv('marsHidden', true), sfx('squeak', 0.35, -4), { do: 'set', target: grp('mars'), props: { opacity: 0.2 } }, wait(2800), { do: 'set', target: grp('mars'), props: { opacity: 1 } }, setv('marsHidden', false)] },
    { id: 'hush-tap', target: grp('whisper'), on: { type: 'tap' }, hint: 'Tap the word Shhh and the whole sky goes quiet for a moment.',
      do: [{ do: 'duck', amount: 0.85, ms: 3500 }, { do: 'set', target: PAGE, props: { fill: '#14002e', opacity: 0.4 } }, { do: 'animate', target: grp('whisper'), anim: { preset: 'pulse', amount: 0.4 } }, wait(3500), { do: 'set', target: PAGE, props: { opacity: 0 } }],
      reduced: [{ do: 'duck', amount: 0.85, ms: 3500 }, { do: 'set', target: PAGE, props: { fill: '#14002e', opacity: 0.4 } }, wait(3500), { do: 'set', target: PAGE, props: { opacity: 0 } }] },
    tapSound('zib-quiet-toot', grp('zib'), 'Tap tiny Zib to hear a very quiet toot', [sfx('kazoo-toot', 0.25, -2)], { preset: 'jelly', amount: 0.6 }, { burst: null }),
  ],
  goals: [{ id: 'mars-peeked', label: 'Mars peeked out', when: ge('peeks', 1), celebrate: false }],
  a11y: { summary: 'Dark violet page. A big shy Mars peeks over a hill. Tiny Zib sits far away.', instructions: 'Move your finger slowly toward Mars and he peeks out and blushes. If you rush, he hides, then peeks back out by himself. Tap the word Shhh to hush the whole sky.' },
});

const P6 = page(6, {
  vars: { knocked: 0, popped: 0, stomped: 0 },
  music: { cue: 'knock-knock', fadeMs: 800 },
  behaviors: [
    ...life('zib-door', 'zibDoor'),
    ...life('zib-song', 'zibSong', undefined, { bob: 0.6 }),
    ...life('zib-dance', 'zibDance', undefined, { bob: 0.7 }),
    loop('nova-dance', grp('novaDance'), 'bob', { amount: 0.8, durationMs: 900 }, true, 'Nova bounces'),
    loop('mars-breathe', grp('mars'), 'breathe', { amount: 0.8, durationMs: 4600 }, true),
    loop('knock-twinkle', grp('knock'), 'twinkle', { amount: 1.2, durationMs: 1800 }, true, 'Knock! twinkles'),
    loop('stomp-twinkle', grp('stomp'), 'twinkle', { amount: 1, durationMs: 2000 }, true),
    loop('notes-bob', grp('note1'), 'bob', { amount: 0.6, durationMs: 1400 }, true),
    loop('notes2-bob', grp('note2'), 'bob', { amount: 0.6, durationMs: 1700 }, true),
    loop('notes3-bob', grp('note3'), 'bob', { amount: 0.6, durationMs: 1200 }, true),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.7),
    parallax('flecks-tilt', lab('Paper flecks'), 1, 'Tilt your device to shift the flecks'),

    // porthole 1: knock, knock (no answer)
    tapSound('door-knock', grp('door'), "Tap Mars's crater door to knock, knock", [sfx('knock', 0.7), wait(260), sfx('knock', 0.7), incv('knocked')], { preset: 'shake', amount: 0.5 }, { burst: null }),
    // porthole 2: a balloon, then a loud song
    tapSound('balloon-pop', grp('balloonScraps'), 'Tap the balloon to pop it', [sfx('pop', 0.6, 2), incv('popped')], { preset: 'shake', amount: 0.8 }, { burst: sparkle(grp('balloonScraps'), 'confetti', 8) }),
    { id: 'zib-song-hold', label: "Zib's loud song", target: grp('zibSong'), on: { type: 'press', minMs: 0 }, hint: 'Press and hold Zib to sing a kazoo song. Slide your finger to bend the notes.',
      do: [{ do: 'note', instrument: 'kazoo', note: 'E4', gain: 0.6 }], reduced: [{ do: 'note', instrument: 'kazoo', note: 'E4', gain: 0.6 }] },
    tapSound('note1-tap', grp('note1'), 'Tap the yellow music note', [note('kazoo', 'C5', 450, 0.5)], { preset: 'pulse', amount: 1 }),
    tapSound('note2-tap', grp('note2'), 'Tap the mint music note', [note('kazoo', 'E5', 450, 0.5)], { preset: 'pulse', amount: 1 }),
    tapSound('note3-tap', grp('note3'), 'Tap the white music note', [note('kazoo', 'G5', 450, 0.5)], { preset: 'pulse', amount: 1 }),
    // porthole 3: a big stomping dance; Mars peeks and hides
    tapSound('stomp-tap', grp('stomp'), 'Tap the stomp marks to stomp, stomp, stomp', [sfx('thud', 0.5), wait(240), sfx('thud', 0.5), wait(240), sfx('thud', 0.55), incv('stomped')], { preset: 'shake', amount: 0.7 }, { burst: null }),
    tapSound('dance-bounce', grp('zibDance'), 'Tap Zib to make him dance', [sfx('boing', 0.45, 3)], { preset: 'bounce', amount: 1 }, { burst: sparkle(grp('zibDance'), 'stars', 4) }),
    { id: 'mars6-peek', label: 'Mars peeks (slow)', target: grp('mars'), on: { type: 'proximity', radius: 150, slowBelow: 260 }, hint: 'Move slowly toward Mars in the third window and he peeks. Rush and he hides.',
      do: [sfx('twinkle', 0.4), { do: 'set', target: lab('Blush patch'), props: { fill: '#ff5c93' } }, { do: 'animate', target: grp('mars'), anim: { preset: 'pulse', amount: 0.8 } }],
      reduced: [sfx('twinkle', 0.4), { do: 'set', target: lab('Blush patch'), props: { fill: '#ff5c93' } }] },
    { id: 'mars6-hide', label: 'Mars hides (fast)', target: grp('mars'), on: { type: 'proximity', radius: 150, fastAbove: 1100 }, hint: 'Rush at Mars and he hides for a moment.',
      do: [sfx('squeak', 0.3, -4), { do: 'animate', target: grp('mars'), anim: { preset: 'fade-out', durationMs: 300 } }, wait(2400), { do: 'show', target: grp('mars') }],
      reduced: [sfx('squeak', 0.3, -4), { do: 'set', target: grp('mars'), props: { opacity: 0.2 } }, wait(2400), { do: 'set', target: grp('mars'), props: { opacity: 1 } }] },
  ],
  a11y: { summary: 'Three round windows. In the first Zib knocks on a crater door. In the second he tries a balloon and a loud song. In the third he does a big stomping dance while Mars peeks out with one eye.', instructions: 'Tap the door to knock. Pop the balloon. Press and hold Zib in the second window to sing. Tap the stomp marks. Move slowly toward Mars in the third window and he peeks; rush and he hides.' },
});

const P7 = page(7, {
  vars: { quiet: 0 },
  music: { cue: 'shy-sky', fadeMs: 1000 },
  ambience: ambienceSpace(0.26),
  rate: 0.82,
  behaviors: [
    // the giant eyes follow the finger: the pupils travel further than the whites
    { id: 'mars-eyes-follow', label: 'Mars watches your finger', target: grp('marsPupils'), on: { type: 'enter' },
      do: [{ do: 'follow', target: grp('marsPupils'), to: 'pointer', lookAt: true, lagMs: 320, maxOffset: 26 }, { do: 'follow', target: grp('marsWhites'), to: 'pointer', lookAt: true, lagMs: 400, maxOffset: 6 }] },
    loop('blush-breathe', grp('blush'), 'breathe', { amount: 1.6, durationMs: 4800 }, true, 'Mars blushes'),
    ...life('zib', 'zib', 'zibEyes', { breathe: 1.4 }),
    loop('kazoo-droop', grp('kazoo'), 'sway', { amount: 0.5, durationMs: 4200 }, true, 'The kazoo droops'),
    loop('nova-drift', grp('nova'), 'drift', { amount: 0.5, durationMs: 5000 }, true),
    twinkle('stars-twinkle', lab('Stars'), 1),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),

    { id: 'mars-quiet', label: 'Too loud, whispers Mars', target: lab('Cut-paper disc'), on: { type: 'tap' }, cooldownMs: 1500, hint: 'Tap Mars and everything gets quieter, because he whispered "too loud".',
      do: [{ do: 'duck', amount: 0.6, ms: 2200 }, sfx('hum', 0.35, -3), incv('quiet')], reduced: [{ do: 'duck', amount: 0.6, ms: 2200 }, sfx('hum', 0.35, -3), incv('quiet')] },
    tapSound('blush-tap', grp('blush'), "Tap Mars's cheeks to make him blush pinker", [{ do: 'set', target: grp('blush'), props: { fill: '#ff4f8d' } }, sfx('twinkle', 0.4)], { preset: 'pulse', amount: 1.3 }, { burst: sparkle(grp('blush'), 'hearts', 5) }),
    tapSound('zib-droop', grp('kazoo'), "Tap Zib's drooping kazoo to hear a sad little toot", [{ do: 'sfx', sound: 'kazoo-toot', params: { gain: 0.5, pitch: -8, durationScale: 1.6 } }], { preset: 'jelly', amount: 0.6 }, { burst: null }),
    tapSound('zib-sad', grp('zib'), 'Tap tiny Zib', [{ do: 'sfx', sound: 'squeak', params: { gain: 0.4, pitch: -2 } }], { preset: 'jelly', amount: 0.7 }, { burst: null }),
    tapSound('nova-tiny', grp('nova'), 'Tap tiny Nova', [sfx('squeak', 0.4, 6)], { preset: 'jelly', amount: 0.8 }, { burst: null }),
  ],
  a11y: { summary: "A giant close-up of Mars's big shy eyes and blushing cheeks. Tiny Zib stands in a corner with his drooping kazoo.", instructions: "Mars's eyes follow your finger. Tap Mars and the sound gets quieter. Tap his cheeks to make him blush. Tap Zib's kazoo for a sad little toot." },
});

const P8 = page(8, {
  vars: { closer: 0, wobbles: 0, marsX: 0 },
  music: { cue: 'sit-beside', fadeMs: 1200 },
  ambience: ambienceSpace(0.22),
  rate: 0.84,
  behaviors: [
    ...life('zib', 'zib', 'zibEyes', { breathe: 1.2 }),
    loop('mars-breathe', grp('mars'), 'breathe', { amount: 0.7, durationMs: 5600 }, true, 'Mars breathes more calmly'),
    loop('mars-glance', grp('marsPupils'), 'drift', { amount: 0.3, durationMs: 6400, direction: 'reverse' }, true, 'Mars glances at Zib'),
    loop('mars-blink', grp('marsEyes'), 'blink', {}, true, 'Mars blinks'),
    loop('nova-breathe', grp('nova'), 'breathe', { amount: 0.8, durationMs: 5000 }, true, 'Nova sits very still'),
    twinkle('stars-twinkle', lab('Stars'), 1),
    loop('flame-flicker', lab('Flame'), 'flicker', { amount: 0.7 }, false),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),
    // Mars is kind of braver here: approach slowly and he scoots closer. Rush and he leans back a little, but he does not run away.
    { id: 'mars-closer', label: 'Mars scoots closer (slow)', target: grp('mars'), on: { type: 'proximity', radius: 230, slowBelow: 300 }, once: true,
      hint: 'Move your finger slowly toward Mars and he scoots closer to Zib. Press Enter to approach gently.',
      do: [incv('closer'), note('bell', 'E5', 1500, 0.5), note('bell', 'G5', 1500, 0.4), { do: 'animate', target: grp('mars'), anim: { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -26 }], durationMs: 1400, easing: 'ease-in-out' } }, sparkle(grp('mars'), 'hearts', 5), wait(1400), { do: 'set', target: grp('mars'), props: { x: -26 } }],
      reduced: [incv('closer'), note('bell', 'E5', 1500, 0.5), note('bell', 'G5', 1500, 0.4), { do: 'set', target: grp('mars'), props: { x: -26 } }] },
    { id: 'mars-lean', label: 'Mars leans back (fast)', target: grp('mars'), on: { type: 'proximity', radius: 230, fastAbove: 1100 }, hint: 'Rush at Mars and he leans back a little. Gentle works better.',
      do: [sfx('squeak', 0.25, -4), { do: 'animate', target: grp('mars'), anim: { keyframes: [{ at: 0, x: 0 }, { at: 0.4, x: 9 }, { at: 1, x: 0 }], durationMs: 900 } }],
      reduced: [sfx('squeak', 0.25, -4)] },
    tapSound('zib-wobble', grp('zib'), 'Tap Zib and his knees go wobbly', [sfx('jelly-squish', 0.5), incv('wobbles')], { preset: 'shake', amount: 0.7 }, { burst: null }),
    tapSound('nova-still', grp('nova'), 'Tap Nova who is sitting very still', [sfx('squeak', 0.3, 7)], { preset: 'pulse', amount: 0.5 }, { burst: null }),
    tapSound('cake-blow', grp('cake'), 'Tap the forgotten cake', [sfx('candle-blow', 0.5), note('bell', 'E6', 900, 0.35)], null, { burst: null,
      do: [sfx('candle-blow', 0.5), note('bell', 'E6', 900, 0.35), { do: 'hide', target: lab('Flame') }, wait(2200), { do: 'show', target: lab('Flame') }] }),
  ],
  goals: [{ id: 'sat-together', label: 'Mars scooted closer', when: ge('closer', 1), celebrate: false }],
  a11y: { summary: 'Zib sits right next to Mars on the quiet ground. Nova sits very still with her tail curled around her paws. A forgotten cake waits far away.', instructions: 'Move your finger slowly toward Mars and he scoots closer to Zib. Tap Zib to wobble his knees. Tap Nova and the cake.' },
});

// page 9: the dance. Tap the disco ball: a 120 bpm beat starts and every planet dances in time (animations of 500 / 1000 ms against 500 ms beats).
const beat = DANCE_BEAT_MS;
const dancer = (group: string, preset: AnimSpec['preset'], amount: number, ms: number, delayMs = 0): Action => ({ do: 'animate', target: grp(group), anim: { preset, amount, durationMs: ms, delayMs, loop: 'infinite' } });
const CALM: Array<[string, number]> = [['jupiter', 1.2], ['mars', 0.5], ['saturn', 0.6], ['zib', 1], ['nova', 0.8], ['planetViolet', 0.6], ['planetRed', 0.6]];
const calmLoop = (g: string, a: number): AnimSpec => ({ preset: 'breathe', amount: a, durationMs: 4200, loop: 'infinite', delayMs: 0 });
const restAll: Action[] = CALM.map(([g, a]) => ({ do: 'animate', target: grp(g), anim: calmLoop(g, a) }) as Action);
const P9 = page(9, {
  vars: { dancing: false },
  music: { cue: 'sit-beside', fadeMs: 800 },
  rate: 0.9,
  behaviors: [
    ...CALM.map(([g, a]): Behavior => ({ id: `calm-${g}`, label: 'Quiet breathing before the dance', target: grp(g), on: { type: 'idle' }, do: [{ do: 'animate', anim: calmLoop(g, a) }] })),
    loop('zib-blink', grp('zibEyes'), 'blink', {}, true, 'Zib blinks'),
    loop('mars-blink', grp('marsEyes'), 'blink', {}, true, 'Mars blinks'),
    loop('disco-glow', grp('discoBall'), 'glow', { amount: 1.2 }, true, 'The disco ball glints'),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.8),
    parallax('flecks-tilt', lab('Paper flecks'), 1.2, 'Tilt your device to shift the flecks'),
    { id: 'disco-toggle', label: 'Start / stop the dance', target: grp('discoBall'), on: { type: 'tap' },
      hint: 'Tap the disco ball to start the party beat and make every planet dance. Tap it again to stop.',
      do: [
        { do: 'var', name: 'dancing', op: 'toggle' },
        { do: 'if', cond: eq('dancing', true),
          then: [
            { do: 'music', cue: 'dance-small', fadeMs: 300 }, sfx('sparkle', 0.5),
            dancer('jupiter', 'bounce', 0.9, beat * 2), dancer('saturn', 'jelly', 0.7, beat * 2), dancer('zib', 'bounce', 0.8, beat), dancer('nova', 'bounce', 0.8, beat, beat / 2),
            dancer('mars', 'bob', 0.5, beat * 2), dancer('planetViolet', 'pulse', 1, beat), dancer('planetRed', 'bounce', 0.6, beat), dancer('discoBall', 'pulse', 0.8, beat),
            { do: 'burst', at: grp('discoBall'), kind: 'stars', count: 12 },
          ],
          else: [{ do: 'music', cue: 'sit-beside', fadeMs: 900 }, ...['jupiter', 'saturn', 'zib', 'nova', 'mars', 'planetViolet', 'planetRed', 'discoBall'].map((g): Action => ({ do: 'stop', target: grp(g) })), ...restAll] },
      ],
      reduced: [
        { do: 'var', name: 'dancing', op: 'toggle' },
        { do: 'if', cond: eq('dancing', true), then: [{ do: 'music', cue: 'dance-small', fadeMs: 300 }, sfx('sparkle', 0.5), { do: 'set', target: PAGE, props: { fill: '#ffd24a', opacity: 0.12 } }], else: [{ do: 'music', cue: 'sit-beside', fadeMs: 900 }, { do: 'set', target: PAGE, props: { opacity: 0 } }] },
      ] },
    { id: 'dance-cheer', label: 'The party starts', target: PAGE, on: { type: 'when', cond: eq('dancing', true) }, once: true, do: [sfx('success-jingle', 0.5), { do: 'burst', at: { x: 512, y: 380 }, kind: 'confetti', count: 18 }] },
    planet('jupiter-note', 'jupiter', 'Jupiter', 'marimba', 'C3', [sfx('toot', 0.35, -5)]),
    planet('mars-note', 'mars', 'shy Mars', 'glass', 'E4'),
    planet('saturn-note', 'saturn', 'Saturn', 'glass', 'G4'),
    planet('violet-note', 'planetViolet', 'the violet planet', 'marimba', 'A4'),
    planet('red-note', 'planetRed', 'the little red planet', 'glass', 'D5'),
    tapSound('zib-toot', grp('zib'), 'Tap Zib to hear his kazoo', [sfx('kazoo-toot', 0.55)], { preset: 'jelly', amount: 0.8 }),
    tapSound('nova-yip', grp('nova'), 'Tap Nova to hear her yip', [sfx('squeak', 0.5, 5)], { preset: 'jelly', amount: 0.8 }),
  ],
  goals: [{ id: 'danced', label: 'Started the dance party', when: eq('dancing', true), celebrate: false }],
  a11y: { summary: 'A wide disco of planets: Jupiter, Mars, Zib, Nova and Saturn, with a disco-ball moon hanging at the top right.', instructions: 'Tap the disco ball to start the party beat; the planets dance in time, and Mars dances small. Tap it again to stop. Tap any planet to play its note over the beat.' },
});

const P10 = page(10, {
  vars: { snores: 0 },
  music: { cue: 'goodnight-sky', fadeMs: 1500 },
  ambience: ambienceSpace(0.14),
  rate: 0.8,
  behaviors: [
    { id: 'slow-down', label: 'The lullaby slows', target: PAGE, on: { type: 'enter' }, do: [{ do: 'musicTempo', scale: 0.85, rampMs: 9000 }] },
    { id: 'fade-away', label: 'The lullaby fades out', target: PAGE, on: { type: 'timer', afterMs: 40000 }, do: [{ do: 'musicStop', fadeMs: 8000 }] },
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 1.2, durationMs: 6400 }, true, 'The sleepy sun breathes'),
    loop('zib-breathe', grp('zib'), 'breathe', { amount: 1.4, durationMs: 5200 }, true, 'Zib sleeps'),
    loop('nova-breathe', grp('nova'), 'breathe', { amount: 1.4, durationMs: 5600 }, true, 'Nova sleeps'),
    twinkle('stars-twinkle', lab('Stars'), 1),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.6),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),
    tapSound('sun-lullaby', grp('sun'), 'Tap the sleepy sun to hear a lullaby note', [note('musicbox', 'scale:C4,E4,G4,A4,C5', 1600, 0.6), sfx('hum', 0.3, -5)], { preset: 'pulse', amount: 0.4 }, { burst: sparkle(grp('sun'), 'stars', 5) }),
    tapSound('zib-snore', grp('zib'), 'Tap sleeping Zib', [sfx('snore', 0.4), incv('snores')], { preset: 'pulse', amount: 0.4 }, { burst: sparkle(grp('zib'), 'hearts', 3) }),
    tapSound('nova-yawn', grp('nova'), 'Tap sleeping Nova', [sfx('yawn', 0.4)], { preset: 'pulse', amount: 0.4 }, { burst: sparkle(grp('nova'), 'hearts', 3) }),
    tapSound('end-tap', grp('goodnight'), 'Tap the words Good night, planets', [note('musicbox', 'C5', 1400, 0.5), note('musicbox', 'G4', 1400, 0.45)], { preset: 'pulse', amount: 0.3 }, { burst: null }),
  ],
  a11y: { summary: 'A big sleepy sun with a soft smile. Zib and Nova are asleep on a purple planet below.', instructions: 'Tap the sun, Zib or Nova. The lullaby slows down and fades out by itself after a while.' },
});

const P11 = page(11, {
  vars: { tSaturn: false, tTeal: false, tOrange: false, tWhite: false, tCream: false },
  music: { cue: 'party-theme', fadeMs: 800 },
  behaviors: [
    ...life('zib', 'zib', 'zibEyes', { bob: 0.5 }),
    loop('nova-drift', grp('nova'), 'drift', { amount: 0.8, durationMs: 5000 }, true),
    loop('saturn-bob', grp('saturn'), 'bob', { amount: 0.5, durationMs: 2600 }, true),
    loop('teal-drift', grp('planetTeal'), 'drift', { amount: 0.6, durationMs: 5200 }, true),
    loop('orange-drift', grp('planetOrange'), 'drift', { amount: 0.6, durationMs: 6200, direction: 'reverse' }, true),
    loop('white-drift', grp('planetWhite'), 'drift', { amount: 0.6, durationMs: 5600 }, true),
    loop('cream-drift', grp('planetCream'), 'drift', { amount: 0.6, durationMs: 6800, direction: 'reverse' }, true),
    loop('empty-glow', grp('emptyPlace'), 'twinkle', { amount: 1.4, durationMs: 2400 }, true, 'The empty place waits'),
    twinkle('stars-twinkle', lab('Stars'), 1),
    twinkle('flecks-twinkle', lab('Paper flecks'), 0.7),
    loop('flame-flicker', lab('Flame'), 'flicker', { amount: 0.8 }, false),
    parallax('stars-tilt', lab('Stars'), 0.5, 'Tilt your device to slide the stars'),
    planet('saturn-note', 'saturn', 'Saturn', 'glass', 'G4', [], 'tSaturn'),
    planet('teal-note', 'planetTeal', 'the teal planet', 'marimba', 'E4', [], 'tTeal'),
    planet('orange-note', 'planetOrange', 'the orange planet', 'marimba', 'C4', [], 'tOrange'),
    planet('white-note', 'planetWhite', 'the white planet', 'glass', 'D5', [], 'tWhite'),
    planet('cream-note', 'planetCream', 'the cream planet', 'marimba', 'A4', [], 'tCream'),
    { id: 'tune-done', label: 'Every planet played', target: PAGE, on: { type: 'when', cond: { all: [eq('tSaturn', true), eq('tTeal', true), eq('tOrange', true), eq('tWhite', true), eq('tCream', true)] } },
      do: [sfx('harp-gliss', 0.6), wait(500), sfx('success-jingle', 0.5), { do: 'burst', at: { x: 700, y: 250 }, kind: 'stars', count: 16 }] },
    tapSound('empty-tap', grp('emptyPlace'), 'Tap the empty place saved for Mars', [note('bell', 'A3', 1600, 0.3), sfx('twinkle', 0.3)], { preset: 'pulse', amount: 0.8 }, { burst: null }),
    tapSound('cake-blow', grp('cake'), 'Tap the cake to blow the candle', [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4)], null, { burst: null,
      do: [sfx('candle-blow', 0.6), note('bell', 'E6', 900, 0.4), { do: 'hide', target: lab('Flame') }, wait(2200), { do: 'show', target: lab('Flame') }] }),
    tapSound('zib-toot', grp('zib'), 'Tap Zib to hear his kazoo', [sfx('kazoo-toot', 0.6)], { preset: 'jelly', amount: 0.8 }),
    tapSound('nova-yip', grp('nova'), 'Tap Nova to hear her yip', [sfx('squeak', 0.55, 5)], { preset: 'jelly', amount: 0.8 }),
  ],
  goals: [{ id: 'all-planets', label: 'Played every planet around the cake', when: { all: [eq('tSaturn', true), eq('tTeal', true), eq('tOrange', true), eq('tWhite', true), eq('tCream', true)] }, celebrate: false }],
  a11y: { summary: 'The back cover: a ring of five planets around a floating cake, with a dotted empty place saved for Mars. Zib waves in the corner and Nova zips by.', instructions: 'Tap the five planets around the cake to play a tune. Tap the empty place saved for Mars. Tap the cake, Zib or Nova.' },
});

// plain JSON on purpose: no undefined fields, so the data survives a round trip through the Tela document / bundle unchanged
export const orbitPartyLiving: LivingBook = JSON.parse(JSON.stringify({
  version: 1,
  bookId: 'orbit-party',
  pages: [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11],
  scores: SCORES,
  defaults: { musicGain: 0.55, sfxGain: 0.85, narrate: 'on-demand', ambient: true },
  authorNotes: 'Orbit Party shows off: planets as pentatonic notes (every cue is in C major pentatonic, so any tap is in key), a held kazoo voice that bends with the finger, follow + trail, proximity with pointer speed (Mars), beat-synced dancing (120 bpm = 500 ms, animation periods are multiples of 500 ms), and tilt parallax. Every interaction has a reduced-motion twin that keeps the sound and shows a still result. To remix: change a note in the planet() calls, a cue in SCORES, or a radius / speed in the proximity triggers.',
}));
export default orbitPartyLiving;
