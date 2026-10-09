// LITTLE FOX, BIG TREES: the living edition (ages 5-7, linocut).  What this book shows off about the Tela format:
//   * "Left foot, right foot, hush": an ALTERNATING-TAP rhythm game (page 3). Tap the left side, then the right side, back and forth; every correct
//     step plays the next note of a rising plucked tune and scrolls the trunks past (animations scrubbed by a variable, three depths of parallax)
//   * tilt parallax between trunk layers (pages 1, 2, 4, 6, 8, 9, 11)
//   * Crunch / Rustle / Peek (page 5): each panel makes its own sound and reveals its part
//   * the HUSH page (page 4): music and ambience duck to almost nothing, crickets are all there is; silence is a tool
//   * drag Tam along the gold path (page 8): a drag whose progress drives the scenery AND the music, fireflies gather as the friends walk
//   * plucked folk strings (harp, pluck, kalimba, flute), forest wind, a distant owl
// Every page has idle life, a music cue, sfx, read-aloud text (from the spread), keyboard names (`hint`) and reduced-motion twins. The flat rendition stands alone.
// Ids are the stable ids services/showcase/livingDoc.ts mints (`p<NN>_<label>_<k>`); GROUPS was generated from the designers' z-order (a character or a
// tree trunk is a contiguous run of objects) and is verified against the real doc by tests/livingEdition.little-fox-big-trees.test.ts.
import type { Action, AnimSpec, Behavior, Cond, LivingBook, LivingPage, Score, Target } from '../../../services/living/contracts';
import { arpeggiate, bassline, chord, drums, makeScore, parseNotation, track } from '../../../services/living/audio/compose';
import { littleFoxBigTrees } from '../books/littleFoxBigTrees';

// ───────────────────────────── object groups (generated; see header) ─────────────────────────────
const GROUPS: Record<number, Record<string, string[]>> = {
  1: {
    tam: ['p01_tail_1', 'p01_tail-tip_1', 'p01_print-offset_3', 'p01_body_2', 'p01_bib_1', 'p01_paw_1', 'p01_paw_2', 'p01_ear_3', 'p01_ear-inner_3', 'p01_ear_4', 'p01_ear-inner_4', 'p01_print-offset_4', 'p01_head_2', 'p01_muzzle_2', 'p01_eye_3', 'p01_eye-glint_1', 'p01_eye_4', 'p01_eye-glint_2', 'p01_nose_2', 'p01_smile_2', 'p01_smile_3'],
    tamTail: ['p01_tail_1', 'p01_tail-tip_1'],
    tamEyes: ['p01_eye_3', 'p01_eye-glint_1', 'p01_eye_4', 'p01_eye-glint_2'],
    tamEars: ['p01_ear_3', 'p01_ear-inner_3', 'p01_ear_4', 'p01_ear-inner_4'],
    dot: ['p01_body_1', 'p01_spots_1', 'p01_ear_1', 'p01_ear-inner_1', 'p01_ear_2', 'p01_ear-inner_2', 'p01_head_1', 'p01_muzzle_1', 'p01_eye_1', 'p01_tiny-disc-right_1', 'p01_eye_2', 'p01_tiny-disc-right_2', 'p01_nose_1', 'p01_smile_1'],
    dotEyes: ['p01_eye_1', 'p01_tiny-disc-right_1', 'p01_eye_2', 'p01_tiny-disc-right_2'],
    dotEars: ['p01_ear_1', 'p01_ear-inner_1', 'p01_ear_2', 'p01_ear-inner_2'],
    trunkL: ['p01_print-offset_1', 'p01_trunk_1', 'p01_lit-edge_1', 'p01_wood-grain_1', 'p01_notches_1'],
    trunkR: ['p01_print-offset_2', 'p01_trunk_2', 'p01_lit-edge_2', 'p01_wood-grain_2', 'p01_notches_2'],
    lowSun: ['p01_low-sun_1'],
    rays: ['p01_sun-rays_1', 'p01_sun-rays_2'],
    firs: ['p01_fir-trunk_1', 'p01_fir-tier_1', 'p01_fir-light_1', 'p01_fir-tier_2', 'p01_fir-light_2', 'p01_fir-tier_3', 'p01_fir-light_3', 'p01_fir-tier_4', 'p01_fir-light_4', 'p01_fir-trunk_2', 'p01_fir-tier_5', 'p01_fir-light_5', 'p01_fir-tier_6', 'p01_fir-light_6', 'p01_fir-tier_7', 'p01_fir-light_7', 'p01_fir-tier_8', 'p01_fir-light_8', 'p01_fir-trunk_3', 'p01_fir-tier_9', 'p01_fir-light_9', 'p01_fir-tier_10', 'p01_fir-light_10', 'p01_fir-tier_11', 'p01_fir-light_11', 'p01_fir-tier_12', 'p01_fir-light_12', 'p01_fir-trunk_4', 'p01_fir-tier_13', 'p01_fir-light_13', 'p01_fir-tier_14', 'p01_fir-light_14', 'p01_fir-tier_15', 'p01_fir-light_15', 'p01_fir-tier_16', 'p01_fir-light_16', 'p01_fir-trunk_5', 'p01_fir-tier_17', 'p01_fir-light_17', 'p01_fir-tier_18', 'p01_fir-light_18', 'p01_fir-tier_19', 'p01_fir-light_19', 'p01_fir-tier_20', 'p01_fir-light_20', 'p01_fir-trunk_6', 'p01_fir-tier_21', 'p01_fir-light_21', 'p01_fir-tier_22', 'p01_fir-light_22', 'p01_fir-tier_23', 'p01_fir-light_23', 'p01_fir-tier_24', 'p01_fir-light_24', 'p01_fir-trunk_7', 'p01_fir-tier_25', 'p01_fir-light_25', 'p01_fir-tier_26', 'p01_fir-light_26', 'p01_fir-tier_27', 'p01_fir-light_27', 'p01_fir-tier_28', 'p01_fir-light_28'],
    titleLetters: ['p01_title-shadow_1', 'p01_title-shadow_2', 'p01_title-shadow_3', 'p01_title-shadow_4', 'p01_title-shadow_5', 'p01_title-shadow_6', 'p01_title-shadow_7', 'p01_title-shadow_8', 'p01_title-shadow_9', 'p01_title-shadow_10', 'p01_title_1', 'p01_title_2', 'p01_title_3', 'p01_title_4', 'p01_title_5', 'p01_title_6', 'p01_title_7', 'p01_title_8', 'p01_title_9', 'p01_title_10', 'p01_title-shadow_11', 'p01_title-shadow_12', 'p01_title-shadow_13', 'p01_title-shadow_14', 'p01_title-shadow_15', 'p01_title-shadow_16', 'p01_title-shadow_17', 'p01_title-shadow_18', 'p01_title_11', 'p01_title_12', 'p01_title_13', 'p01_title_14', 'p01_title_15', 'p01_title_16', 'p01_title_17', 'p01_title_18'],
    fireflies: ['p01_fireflies_1'],
  },
  2: {
    tam: ['p02_tail_1', 'p02_tail-tip_1', 'p02_print-offset_6', 'p02_body_1', 'p02_bib_1', 'p02_paw_1', 'p02_paw_2', 'p02_ear_1', 'p02_ear-inner_1', 'p02_ear_2', 'p02_ear-inner_2', 'p02_print-offset_7', 'p02_head_1', 'p02_muzzle_1', 'p02_eye_1', 'p02_eye-glint_1', 'p02_eye_2', 'p02_eye-glint_2', 'p02_nose_1', 'p02_mouth_1'],
    tamTail: ['p02_tail_1', 'p02_tail-tip_1'],
    tamEyes: ['p02_eye_1', 'p02_eye-glint_1', 'p02_eye_2', 'p02_eye-glint_2'],
    tamEars: ['p02_ear_1', 'p02_ear-inner_1', 'p02_ear_2', 'p02_ear-inner_2'],
    sun: ['p02_sun-rays_1', 'p02_sun-rays_2', 'p02_sun-glow_1', 'p02_sun_1'],
    beams: ['p02_light-beam_1', 'p02_light-beam_2', 'p02_light-beam_3', 'p02_light-beam_4'],
    treesNear: ['p02_print-offset_3', 'p02_trunk_3', 'p02_lit-edge_3', 'p02_wood-grain_3', 'p02_notches_3'],
    treesMid: ['p02_print-offset_2', 'p02_trunk_2', 'p02_lit-edge_2', 'p02_wood-grain_2', 'p02_notches_2', 'p02_print-offset_5', 'p02_trunk_5', 'p02_lit-edge_5', 'p02_wood-grain_5', 'p02_notches_5'],
    treesFar: ['p02_print-offset_1', 'p02_trunk_1', 'p02_lit-edge_1', 'p02_wood-grain_1', 'p02_notches_1', 'p02_print-offset_4', 'p02_trunk_4', 'p02_lit-edge_4', 'p02_wood-grain_4', 'p02_notches_4'],
    fireflies: ['p02_fireflies_1'],
    sign: ['p02_wood-sign_1', 'p02_story-text_1'],
  },
  3: {
    footL: ['p03_fir-trunk_1', 'p03_fir-tier_1', 'p03_fir-light_1', 'p03_fir-tier_2', 'p03_fir-light_2', 'p03_fir-tier_3', 'p03_fir-light_3', 'p03_fir-tier_4', 'p03_fir-light_4', 'p03_fir-tier_5', 'p03_fir-light_5', 'p03_fir-trunk_2', 'p03_fir-tier_6', 'p03_fir-light_6', 'p03_fir-tier_7', 'p03_fir-light_7', 'p03_fir-tier_8', 'p03_fir-light_8', 'p03_fir-tier_9', 'p03_fir-light_9', 'p03_fir-tier_10', 'p03_fir-light_10', 'p03_fir-trunk_3', 'p03_fir-tier_11', 'p03_fir-light_11', 'p03_fir-tier_12', 'p03_fir-light_12', 'p03_fir-tier_13', 'p03_fir-light_13', 'p03_fir-tier_14', 'p03_fir-light_14', 'p03_fir-tier_15', 'p03_fir-light_15', 'p03_print-offset_1', 'p03_trunk_1', 'p03_lit-edge_1', 'p03_wood-grain_1', 'p03_notches_1', 'p03_print-offset_2', 'p03_trunk_2', 'p03_lit-edge_2', 'p03_wood-grain_2', 'p03_notches_2', 'p03_print-offset_3', 'p03_trunk_3', 'p03_lit-edge_3', 'p03_wood-grain_3', 'p03_notches_3', 'p03_roots_1'],
    footR: ['p03_page-ground_1', 'p03_sun-rays_1', 'p03_sun-rays_2', 'p03_fir-trunk_4', 'p03_fir-tier_16', 'p03_fir-light_16', 'p03_fir-tier_17', 'p03_fir-light_17', 'p03_fir-tier_18', 'p03_fir-light_18', 'p03_fir-tier_19', 'p03_fir-light_19', 'p03_fir-tier_20', 'p03_fir-light_20', 'p03_fir-trunk_5', 'p03_fir-tier_21', 'p03_fir-light_21', 'p03_fir-tier_22', 'p03_fir-light_22', 'p03_fir-tier_23', 'p03_fir-light_23', 'p03_fir-tier_24', 'p03_fir-light_24', 'p03_fir-tier_25', 'p03_fir-light_25', 'p03_fir-trunk_6', 'p03_fir-tier_26', 'p03_fir-light_26', 'p03_fir-tier_27', 'p03_fir-light_27', 'p03_fir-tier_28', 'p03_fir-light_28', 'p03_fir-tier_29', 'p03_fir-light_29', 'p03_fir-tier_30', 'p03_fir-light_30', 'p03_fir-trunk_7', 'p03_print-offset_6', 'p03_wood-sign_1', 'p03_story-text_1'],
    trunkA: ['p03_print-offset_1', 'p03_trunk_1', 'p03_lit-edge_1', 'p03_wood-grain_1', 'p03_notches_1'],
    trunkB: ['p03_print-offset_2', 'p03_trunk_2', 'p03_lit-edge_2', 'p03_wood-grain_2', 'p03_notches_2'],
    trunkC: ['p03_print-offset_3', 'p03_trunk_3', 'p03_lit-edge_3', 'p03_wood-grain_3', 'p03_notches_3'],
    firsL: ['p03_fir-trunk_1', 'p03_fir-tier_1', 'p03_fir-light_1', 'p03_fir-tier_2', 'p03_fir-light_2', 'p03_fir-tier_3', 'p03_fir-light_3', 'p03_fir-tier_4', 'p03_fir-light_4', 'p03_fir-tier_5', 'p03_fir-light_5', 'p03_fir-trunk_2', 'p03_fir-tier_6', 'p03_fir-light_6', 'p03_fir-tier_7', 'p03_fir-light_7', 'p03_fir-tier_8', 'p03_fir-light_8', 'p03_fir-tier_9', 'p03_fir-light_9', 'p03_fir-tier_10', 'p03_fir-light_10', 'p03_fir-trunk_3', 'p03_fir-tier_11', 'p03_fir-light_11', 'p03_fir-tier_12', 'p03_fir-light_12', 'p03_fir-tier_13', 'p03_fir-light_13', 'p03_fir-tier_14', 'p03_fir-light_14', 'p03_fir-tier_15', 'p03_fir-light_15'],
    firsR: ['p03_fir-trunk_4', 'p03_fir-tier_16', 'p03_fir-light_16', 'p03_fir-tier_17', 'p03_fir-light_17', 'p03_fir-tier_18', 'p03_fir-light_18', 'p03_fir-tier_19', 'p03_fir-light_19', 'p03_fir-tier_20', 'p03_fir-light_20', 'p03_fir-trunk_5', 'p03_fir-tier_21', 'p03_fir-light_21', 'p03_fir-tier_22', 'p03_fir-light_22', 'p03_fir-tier_23', 'p03_fir-light_23', 'p03_fir-tier_24', 'p03_fir-light_24', 'p03_fir-tier_25', 'p03_fir-light_25', 'p03_fir-trunk_6', 'p03_fir-tier_26', 'p03_fir-light_26', 'p03_fir-tier_27', 'p03_fir-light_27', 'p03_fir-tier_28', 'p03_fir-light_28', 'p03_fir-tier_29', 'p03_fir-light_29', 'p03_fir-tier_30', 'p03_fir-light_30', 'p03_fir-trunk_7'],
    tam: ['p03_tail_1', 'p03_tail-tip_1', 'p03_print-offset_4', 'p03_body_1', 'p03_bib_1', 'p03_paw_1', 'p03_paw_2', 'p03_ear_1', 'p03_ear-inner_1', 'p03_ear_2', 'p03_ear-inner_2', 'p03_print-offset_5', 'p03_head_1', 'p03_muzzle_1', 'p03_eye_1', 'p03_eye-glint_1', 'p03_eye_2', 'p03_eye-glint_2', 'p03_nose_1', 'p03_mouth_1'],
    tamEyes: ['p03_eye_1', 'p03_eye-glint_1', 'p03_eye_2', 'p03_eye-glint_2'],
    tamEars: ['p03_ear_1', 'p03_ear-inner_1', 'p03_ear_2', 'p03_ear-inner_2'],
    pawL: ['p03_paw_1'],
    pawR: ['p03_paw_2'],
    lantern: ['p03_carved-lantern_1'],
    fireflies: ['p03_fireflies_1'],
    rays: ['p03_sun-rays_1', 'p03_sun-rays_2'],
  },
  4: {
    lanternLight: ['p04_fireflies_1', 'p04_lantern_1'],
    tam: ['p04_tail_1', 'p04_tail-tip_1', 'p04_print-offset_1', 'p04_body_1', 'p04_bib_1', 'p04_paw_1', 'p04_paw_2', 'p04_ear_1', 'p04_ear-inner_1', 'p04_ear_2', 'p04_ear-inner_2', 'p04_print-offset_2', 'p04_head_1', 'p04_muzzle_1', 'p04_eye_1', 'p04_eye-glint_1', 'p04_eye_2', 'p04_eye-glint_2', 'p04_nose_1', 'p04_mouth_1'],
    tamEyes: ['p04_eye_1', 'p04_eye_2'],
    tamEars: ['p04_ear_1', 'p04_ear_2'],
    hush: ['p04_whisper-shadow_1', 'p04_whisper-shadow_2', 'p04_whisper-shadow_3', 'p04_whisper-shadow_4', 'p04_whisper-shadow_5', 'p04_whisper_1', 'p04_whisper_2', 'p04_whisper_3', 'p04_whisper_4', 'p04_whisper_5'],
    treesNear: ['p04_trunk_1', 'p04_lit-edge_1', 'p04_wood-grain_1', 'p04_notches_1', 'p04_trunk_4', 'p04_wood-grain_4', 'p04_notches_4'],
    treesMid: ['p04_trunk_2', 'p04_lit-edge_2', 'p04_wood-grain_2', 'p04_notches_2', 'p04_trunk_3', 'p04_lit-edge_3', 'p04_wood-grain_3', 'p04_notches_3'],
  },
  5: {
    panel1: ['p05_panel-frame_1', 'p05_panel-ground_1', 'p05_fir-trunk_1', 'p05_fir-tier_1', 'p05_fir-light_1', 'p05_fir-tier_2', 'p05_fir-light_2', 'p05_fir-tier_3', 'p05_fir-light_3', 'p05_fir-tier_4', 'p05_fir-light_4', 'p05_print-offset_1', 'p05_body_1', 'p05_bib_1', 'p05_ear_1', 'p05_ear-inner_1', 'p05_ear_2', 'p05_ear-inner_2', 'p05_print-offset_2', 'p05_head_1', 'p05_muzzle_1', 'p05_eye_1', 'p05_eye-glint_1', 'p05_eye_2', 'p05_eye-glint_2', 'p05_nose_1', 'p05_mouth_1', 'p05_fireflies_1', 'p05_twig_1', 'p05_crunch-burst_1', 'p05_flag_1', 'p05_flag-word_1'],
    panel2: ['p05_panel-frame_2', 'p05_panel-ground_2', 'p05_trunk_1', 'p05_lit-edge_1', 'p05_wood-grain_1', 'p05_notches_1', 'p05_trunk_2', 'p05_lit-edge_2', 'p05_wood-grain_2', 'p05_notches_2', 'p05_peeking-eye_1', 'p05_peeking-eye_2', 'p05_tiny-disc-left_1', 'p05_tiny-disc-centre_1', 'p05_rustling-leaves_1', 'p05_flag_2', 'p05_flag-word_2'],
    panel3: ['p05_panel-frame_3', 'p05_panel-ground_3', 'p05_light-beam_1', 'p05_light-beam_2', 'p05_fir-trunk_2', 'p05_fir-tier_5', 'p05_fir-light_5', 'p05_fir-tier_6', 'p05_fir-light_6', 'p05_fir-tier_7', 'p05_fir-light_7', 'p05_fir-tier_8', 'p05_fir-light_8', 'p05_body_2', 'p05_spots_1', 'p05_ear_3', 'p05_ear-inner_3', 'p05_ear_4', 'p05_ear-inner_4', 'p05_head_2', 'p05_muzzle_2', 'p05_eye_3', 'p05_tiny-disc-top-right_1', 'p05_eye_4', 'p05_tiny-disc-top-right_2', 'p05_nose_2', 'p05_smile_1', 'p05_print-offset_3', 'p05_trunk_3', 'p05_lit-edge_3', 'p05_wood-grain_3', 'p05_notches_3', 'p05_print-offset_4', 'p05_body_3', 'p05_bib_2', 'p05_ear_5', 'p05_ear-inner_5', 'p05_ear_6', 'p05_ear-inner_6', 'p05_print-offset_5', 'p05_head_3', 'p05_muzzle_3', 'p05_eye_5', 'p05_eye-glint_3', 'p05_eye_6', 'p05_eye-glint_4', 'p05_nose_3', 'p05_mouth_2', 'p05_fireflies_2', 'p05_flag_3', 'p05_flag-word_3'],
    tam1: ['p05_print-offset_1', 'p05_body_1', 'p05_bib_1', 'p05_ear_1', 'p05_ear-inner_1', 'p05_ear_2', 'p05_ear-inner_2', 'p05_print-offset_2', 'p05_head_1', 'p05_muzzle_1', 'p05_eye_1', 'p05_eye-glint_1', 'p05_eye_2', 'p05_eye-glint_2', 'p05_nose_1', 'p05_mouth_1'],
    tam3: ['p05_print-offset_4', 'p05_body_3', 'p05_bib_2', 'p05_ear_5', 'p05_ear-inner_5', 'p05_ear_6', 'p05_ear-inner_6', 'p05_print-offset_5', 'p05_head_3', 'p05_muzzle_3', 'p05_eye_5', 'p05_eye-glint_3', 'p05_eye_6', 'p05_eye-glint_4', 'p05_nose_3', 'p05_mouth_2'],
    dot3: ['p05_body_2', 'p05_spots_1', 'p05_ear_3', 'p05_ear-inner_3', 'p05_ear_4', 'p05_ear-inner_4', 'p05_head_2', 'p05_muzzle_2', 'p05_eye_3', 'p05_tiny-disc-top-right_1', 'p05_eye_4', 'p05_tiny-disc-top-right_2', 'p05_nose_2', 'p05_smile_1'],
    twig: ['p05_twig_1'],
    burst: ['p05_crunch-burst_1'],
    leaves: ['p05_rustling-leaves_1'],
    peekEyes: ['p05_peeking-eye_1', 'p05_peeking-eye_2', 'p05_tiny-disc-left_1', 'p05_tiny-disc-centre_1'],
    flag1: ['p05_flag_1', 'p05_flag-word_1'],
    flag2: ['p05_flag_2', 'p05_flag-word_2'],
    flag3: ['p05_flag_3', 'p05_flag-word_3'],
    beams: ['p05_light-beam_1', 'p05_light-beam_2'],
    fireflies: ['p05_fireflies_1', 'p05_fireflies_2'],
    signTam: ['p05_wood-sign_3', 'p05_story-text_3'],
  },
  6: {
    dot: ['p06_body_1', 'p06_spots_1', 'p06_ear_1', 'p06_ear-inner_1', 'p06_ear_2', 'p06_ear-inner_2', 'p06_head_1', 'p06_muzzle_1', 'p06_eye_1', 'p06_tiny-disc-top_1', 'p06_eye_2', 'p06_tiny-disc-top-right_1', 'p06_nose_1', 'p06_smile_1'],
    dotEyes: ['p06_eye_1', 'p06_tiny-disc-top_1', 'p06_eye_2', 'p06_tiny-disc-top-right_1'],
    dotEars: ['p06_ear_1', 'p06_ear_2'],
    dotNose: ['p06_nose_1'],
    tam: ['p06_print-offset_2', 'p06_body_2', 'p06_bib_1', 'p06_ear_3', 'p06_ear-inner_3', 'p06_ear_4', 'p06_ear-inner_4', 'p06_print-offset_3', 'p06_head_2', 'p06_muzzle_2', 'p06_eye_3', 'p06_eye-glint_1', 'p06_eye_4', 'p06_eye-glint_2', 'p06_nose_2', 'p06_mouth_1'],
    sun: ['p06_sun-rays_1', 'p06_sun-rays_2', 'p06_sun-glow_1', 'p06_sun_1'],
    beams: ['p06_light-beam_1', 'p06_light-beam_2', 'p06_light-beam_3'],
    tree: ['p06_print-offset_1', 'p06_trunk_1', 'p06_lit-edge_1', 'p06_wood-grain_1', 'p06_notches_1'],
    fireflies: ['p06_fireflies_1'],
    sign: ['p06_wood-sign_1', 'p06_story-text_1'],
  },
  7: {
    tam: ['p07_tail_1', 'p07_tail-tip_1', 'p07_print-offset_1', 'p07_body_1', 'p07_bib_1', 'p07_ear_1', 'p07_ear-inner_1', 'p07_ear_2', 'p07_ear-inner_2', 'p07_print-offset_2', 'p07_head_1', 'p07_muzzle_1', 'p07_eye_1', 'p07_eye-glint_1', 'p07_eye_2', 'p07_eye-glint_2', 'p07_nose_1', 'p07_smile_1', 'p07_smile_2'],
    tamEyes: ['p07_eye_1', 'p07_eye_2'],
    dot: ['p07_leg_1', 'p07_hoof_1', 'p07_leg_2', 'p07_hoof_2', 'p07_body_2', 'p07_spots_1', 'p07_ear_3', 'p07_ear-inner_3', 'p07_ear_4', 'p07_ear-inner_4', 'p07_head_2', 'p07_muzzle_2', 'p07_eye_3', 'p07_tiny-disc-top_1', 'p07_eye_4', 'p07_tiny-disc-top_2', 'p07_nose_2', 'p07_smile_3'],
    dotEyes: ['p07_eye_3', 'p07_tiny-disc-top_1', 'p07_eye_4', 'p07_tiny-disc-top_2'],
    stripe1: ['p07_stripe-of-light_1'],
    stripe2: ['p07_stripe-of-light_2'],
    stripe3: ['p07_stripe-of-light_3'],
    path: ['p07_path_1'],
    beams: ['p07_light-beam_1', 'p07_light-beam_2', 'p07_light-beam_3'],
    fireflies: ['p07_fireflies_1'],
    firsL: ['p07_fir-trunk_1', 'p07_fir-tier_1', 'p07_fir-light_1', 'p07_fir-tier_2', 'p07_fir-light_2', 'p07_fir-tier_3', 'p07_fir-light_3', 'p07_fir-tier_4', 'p07_fir-light_4', 'p07_fir-tier_5', 'p07_fir-light_5'],
    firsR: ['p07_fir-trunk_2', 'p07_fir-tier_6', 'p07_fir-light_6', 'p07_fir-tier_7', 'p07_fir-light_7', 'p07_fir-tier_8', 'p07_fir-light_8', 'p07_fir-tier_9', 'p07_fir-light_9', 'p07_fir-tier_10', 'p07_fir-light_10'],
    sign: ['p07_wood-sign_1', 'p07_story-text_1'],
  },
  8: {
    tam: ['p08_tail_1', 'p08_tail-tip_1', 'p08_print-offset_9', 'p08_body_2', 'p08_bib_1', 'p08_ear_3', 'p08_ear-inner_3', 'p08_ear_4', 'p08_ear-inner_4', 'p08_print-offset_10', 'p08_head_2', 'p08_muzzle_2', 'p08_eye_3', 'p08_eye-glint_1', 'p08_eye_4', 'p08_eye-glint_2', 'p08_nose_2', 'p08_smile_2', 'p08_smile_3'],
    dot: ['p08_leg_3', 'p08_hoof_3', 'p08_leg_4', 'p08_hoof_4', 'p08_body_3', 'p08_spots_1', 'p08_ear_5', 'p08_ear-inner_5', 'p08_ear_6', 'p08_ear-inner_6', 'p08_head_3', 'p08_muzzle_3', 'p08_eye_5', 'p08_tiny-disc-centre_1', 'p08_eye_6', 'p08_tiny-disc-centre_2', 'p08_nose_3', 'p08_smile_4'],
    doe: ['p08_leg_1', 'p08_hoof_1', 'p08_leg_2', 'p08_hoof_2', 'p08_body_1', 'p08_ear_1', 'p08_ear-inner_1', 'p08_ear_2', 'p08_ear-inner_2', 'p08_head_1', 'p08_muzzle_1', 'p08_eye_1', 'p08_tiny-disc-right_1', 'p08_eye_2', 'p08_tiny-disc-right_2', 'p08_nose_1', 'p08_smile_1'],
    sun: ['p08_sun-glow_1', 'p08_sun_1'],
    path: ['p08_golden-path_1'],
    moss: ['p08_hill-of-moss_1'],
    bridge: ['p08_bridge-of-roots_1'],
    fireflies: ['p08_fireflies_1'],
    treesNear: ['p08_print-offset_1', 'p08_trunk_1', 'p08_lit-edge_1', 'p08_wood-grain_1', 'p08_notches_1', 'p08_print-offset_5', 'p08_trunk_5', 'p08_lit-edge_5', 'p08_wood-grain_5'],
    treesMid: ['p08_print-offset_2', 'p08_trunk_2', 'p08_lit-edge_2', 'p08_wood-grain_2', 'p08_notches_2', 'p08_print-offset_6', 'p08_trunk_6', 'p08_lit-edge_6', 'p08_wood-grain_6', 'p08_notches_5'],
    treesFar: ['p08_print-offset_3', 'p08_trunk_3', 'p08_lit-edge_3', 'p08_wood-grain_3', 'p08_notches_3', 'p08_print-offset_4', 'p08_trunk_4', 'p08_lit-edge_4', 'p08_wood-grain_4', 'p08_notches_4', 'p08_print-offset_7', 'p08_trunk_7', 'p08_lit-edge_7', 'p08_wood-grain_7', 'p08_notches_6', 'p08_print-offset_8', 'p08_trunk_8', 'p08_lit-edge_8', 'p08_wood-grain_8', 'p08_notches_7'],
    sign: ['p08_wood-sign_1', 'p08_story-text_1', 'p08_wood-sign_2', 'p08_story-text_2'],
  },
  9: {
    mama: ['p09_tail_1', 'p09_tail-tip_1', 'p09_print-offset_3', 'p09_body_1', 'p09_bib_1', 'p09_ear_1', 'p09_ear-inner_1', 'p09_ear_2', 'p09_ear-inner_2', 'p09_print-offset_4', 'p09_head_1', 'p09_muzzle_1', 'p09_gold-ear-ring_1', 'p09_eye_1', 'p09_eye-glint_1', 'p09_eye_2', 'p09_eye-glint_2', 'p09_nose_1', 'p09_smile_1', 'p09_smile_2'],
    tam: ['p09_tail_2', 'p09_tail-tip_2', 'p09_print-offset_5', 'p09_body_2', 'p09_bib_2', 'p09_ear_3', 'p09_ear-inner_3', 'p09_ear_4', 'p09_ear-inner_4', 'p09_print-offset_6', 'p09_head_2', 'p09_muzzle_2', 'p09_eye_3', 'p09_eye-glint_3', 'p09_eye_4', 'p09_eye-glint_4', 'p09_nose_2', 'p09_smile_3', 'p09_smile_4'],
    den: ['p09_den-door_1'],
    jar: ['p09_lantern-jar_1', 'p09_fireflies_1'],
    earRing: ['p09_gold-ear-ring_1'],
    sun: ['p09_sun-glow_1', 'p09_sun_1'],
    treesL: ['p09_print-offset_1', 'p09_trunk_1', 'p09_lit-edge_1', 'p09_wood-grain_1', 'p09_notches_1'],
    treesR: ['p09_print-offset_2', 'p09_trunk_2', 'p09_lit-edge_2', 'p09_wood-grain_2', 'p09_notches_2', 'p09_den-door_1', 'p09_lantern-jar_1', 'p09_fireflies_1'],
    fireflies: ['p09_fireflies_1', 'p09_fireflies_2'],
    sign: ['p09_wood-sign_1', 'p09_story-text_1', 'p09_wood-sign_2', 'p09_story-text_2'],
  },
  10: {
    d1: ['p10_answer-diamond_1'],
    d2: ['p10_answer-diamond_2'],
    d3: ['p10_answer-diamond_3'],
    d4: ['p10_answer-diamond_4'],
    d5: ['p10_answer-diamond_5'],
    ring: ['p10_answer-ring_1'],
    twig: ['p10_the-twig_1'],
    tr1: ['p10_trunk_1', 'p10_lit-edge_1', 'p10_wood-grain_1', 'p10_notches_1'],
    tr2: ['p10_trunk_2', 'p10_lit-edge_2', 'p10_wood-grain_2', 'p10_notches_2'],
    tr3: ['p10_trunk_3', 'p10_lit-edge_3', 'p10_wood-grain_3', 'p10_notches_3'],
    tr4: ['p10_trunk_4', 'p10_lit-edge_4', 'p10_wood-grain_4', 'p10_notches_4'],
    tr5: ['p10_trunk_5', 'p10_lit-edge_5', 'p10_wood-grain_5', 'p10_notches_5'],
    f1: ['p10_fireflies_1'],
    f2: ['p10_fireflies_2'],
    tam: ['p10_tail_1', 'p10_tail-tip_1', 'p10_print-offset_1', 'p10_body_1', 'p10_bib_1', 'p10_ear_1', 'p10_ear-inner_1', 'p10_ear_2', 'p10_ear-inner_2', 'p10_print-offset_2', 'p10_head_1', 'p10_muzzle_1', 'p10_eye_1', 'p10_eye-glint_1', 'p10_eye_2', 'p10_eye-glint_2', 'p10_nose_1', 'p10_smile_1', 'p10_smile_2'],
    dot: ['p10_leg_1', 'p10_hoof_1', 'p10_leg_2', 'p10_hoof_2', 'p10_body_2', 'p10_spots_1', 'p10_ear_3', 'p10_ear-inner_3', 'p10_ear_4', 'p10_ear-inner_4', 'p10_head_2', 'p10_muzzle_2', 'p10_eye_3', 'p10_tiny-disc-bottom_1', 'p10_eye_4', 'p10_tiny-disc-bottom_2', 'p10_nose_2', 'p10_smile_3'],
  },
  11: {
    mama: ['p11_tail_1', 'p11_tail-tip_1', 'p11_print-offset_3', 'p11_body_1', 'p11_bib_1', 'p11_ear_1', 'p11_ear-inner_1', 'p11_ear_2', 'p11_ear-inner_2', 'p11_print-offset_4', 'p11_head_1', 'p11_muzzle_1', 'p11_eye_1', 'p11_eye-glint_1', 'p11_eye_2', 'p11_eye-glint_2', 'p11_nose_1', 'p11_smile_1', 'p11_smile_2'],
    tam: ['p11_tail_2', 'p11_tail-tip_2', 'p11_print-offset_5', 'p11_body_2', 'p11_bib_2', 'p11_ear_3', 'p11_ear-inner_3', 'p11_ear_4', 'p11_ear-inner_4', 'p11_print-offset_6', 'p11_head_2', 'p11_muzzle_2', 'p11_eye_3', 'p11_eye-glint_3', 'p11_eye_4', 'p11_eye-glint_4', 'p11_nose_2', 'p11_smile_3', 'p11_smile_4'],
    dot: ['p11_leg_1', 'p11_hoof_1', 'p11_leg_2', 'p11_hoof_2', 'p11_body_3', 'p11_spots_1', 'p11_ear_5', 'p11_ear-inner_5', 'p11_ear_6', 'p11_ear-inner_6', 'p11_head_3', 'p11_muzzle_3', 'p11_eye_5', 'p11_tiny-disc-bottom_1', 'p11_eye_6', 'p11_tiny-disc-bottom_2', 'p11_nose_3', 'p11_smile_5'],
    sun: ['p11_sun-glow_1', 'p11_sun_1'],
    treesL: ['p11_print-offset_1', 'p11_trunk_1', 'p11_lit-edge_1', 'p11_wood-grain_1', 'p11_notches_1'],
    treesR: ['p11_print-offset_2', 'p11_trunk_2', 'p11_lit-edge_2', 'p11_wood-grain_2', 'p11_notches_2'],
    titleLetters: ['p11_title-shadow_1', 'p11_title-shadow_2', 'p11_title-shadow_3', 'p11_title-shadow_4', 'p11_title-shadow_5', 'p11_title-shadow_6', 'p11_title-shadow_7', 'p11_title-shadow_8', 'p11_title-shadow_9', 'p11_title-shadow_10', 'p11_title-shadow_11', 'p11_title-shadow_12', 'p11_title-shadow_13', 'p11_title-shadow_14', 'p11_title-shadow_15', 'p11_title-shadow_16', 'p11_title-shadow_17', 'p11_title-shadow_18', 'p11_title_1', 'p11_title_2', 'p11_title_3', 'p11_title_4', 'p11_title_5', 'p11_title_6', 'p11_title_7', 'p11_title_8', 'p11_title_9', 'p11_title_10', 'p11_title_11', 'p11_title_12', 'p11_title_13', 'p11_title_14', 'p11_title_15', 'p11_title_16', 'p11_title_17', 'p11_title_18'],
    fireflies: ['p11_fireflies_1'],
  },
};

// ───────────────────────────── small builders ─────────────────────────────
const grp = (group: string): Target => ({ group });
const lab = (label: string): Target => ({ label });
const PAGE: Target = { page: true };
const eq = (name: string, value: number | string | boolean): Cond => ({ var: name, op: '==', value });
const ge = (name: string, value: number): Cond => ({ var: name, op: '>=', value });
const spreadText = (n: number) => littleFoxBigTrees.spreads[n - 1].text.replace(/\s+/g, ' ').trim();

const loop = (id: string, target: Target, preset: AnimSpec['preset'], o: Partial<AnimSpec> = {}, sync = true, label?: string): Behavior => ({
  id, label, target, on: { type: 'idle' }, do: [{ do: 'animate', anim: { preset, loop: 'infinite', ...(sync ? { delayMs: 0 } : {}), ...o } }],
});
/** A character built from many pieces breathes (all pieces in step) and blinks. */
const life = (prefix: string, body: string, eyes?: string, o: { breathe?: number; ms?: number } = {}): Behavior[] => [
  loop(`${prefix}-breathe`, grp(body), 'breathe', { amount: o.breathe ?? 1, durationMs: o.ms ?? 4400 }, true, `${prefix} breathes`),
  ...(eyes ? [loop(`${prefix}-blink`, grp(eyes), 'blink', {}, true, `${prefix} blinks`)] : []),
];
/** An ear flick every so often (a repeating timer's interval is `everyMs`; it never runs faster than every few seconds). */
const flick = (id: string, target: Target, _firstMs: number, everyMs: number): Behavior => ({ id, label: 'An ear flick now and then', target, on: { type: 'timer', afterMs: everyMs, every: true }, do: [{ do: 'animate', anim: { preset: 'wiggle', amount: 0.7, delayMs: 0 } }] });
const twinkle = (id: string, target: Target, amount = 1, label = 'Fireflies twinkle'): Behavior => loop(id, target, 'twinkle', { amount, durationMs: 2600 }, false, label);
const parallax = (id: string, target: Target, amount: number, hint: string, axis: 'x' | 'y' | 'both' = 'both'): Behavior => ({
  id, label: 'Tilt parallax', target, on: { type: 'tilt', axis, gain: 1 }, hint, do: [{ do: 'animate', anim: { preset: 'parallax', amount } }],
});
const ping = (t: Target): Action[] => [{ do: 'set', target: t, props: { opacity: 0.55 } }, { do: 'wait', ms: 150 }, { do: 'set', target: t, props: { opacity: 1 } }];
const burst = (t: Target, kind: 'notes' | 'sparkles' | 'hearts' | 'stars' | 'fireflies' | 'leaves' = 'fireflies', count = 6): Action => ({ do: 'burst', at: t, kind, count });
const note = (instrument: string, n: string | number, durationMs = 800, gain = 0.8): Action => ({ do: 'note', instrument, note: n, durationMs, gain });
const sfx = (sound: string, gain?: number, pitch?: number): Action => ({ do: 'sfx', sound, params: { ...(gain != null ? { gain } : {}), ...(pitch != null ? { pitch } : {}) } });
const wait = (ms: number): Action => ({ do: 'wait', ms });
const setv = (name: string, value: number | string | boolean): Action => ({ do: 'var', name, op: 'set', value });
const incv = (name: string): Action => ({ do: 'var', name, op: 'inc' });
const anim = (target: Target, a: AnimSpec): Action => ({ do: 'animate', target, anim: a });

const tapSound = (id: string, target: Target, hint: string, sound: Action[], motion: { target?: Target; anim: AnimSpec } | null, o: Partial<Behavior> & { fx?: Action | null } = {}): Behavior => {
  const { fx, ...rest } = o;
  return {
    id, target, on: { type: 'tap' }, hint,
    do: [...sound, ...(motion ? [anim(motion.target ?? target, motion.anim)] : []), ...(fx === null ? [] : [fx ?? burst(target, 'sparkles', 4)])],
    reduced: [...sound, ...ping(target)],
    ...rest,
  };
};
/** Tap the wooden sign to hear the page read aloud (the reader also has its own "Read to me"). */
const readSign = (group = 'sign'): Behavior => ({
  id: 'read-sign', label: 'Read this page', target: grp(group), on: { type: 'tap' }, hint: 'Tap the wooden sign to hear this page read aloud.',
  do: [{ do: 'narrate' }, anim(grp(group), { preset: 'pulse', amount: 0.25 })], reduced: [{ do: 'narrate' }, ...ping(grp(group))],
});
/** Owl in the distance, now and then (never loud). */
const owl = (_firstMs = 11000, everyMs = 19000, gain = 0.16): Behavior => ({ id: 'owl-far', label: 'A far-off owl', target: PAGE, on: { type: 'timer', afterMs: everyMs, every: true }, do: [{ do: 'sfx', sound: 'owl-hoo', params: { gain, pan: -0.6 } }] });

/** `text` overrides the narration only where the page's visible reading order differs from the story order (the runtime highlights word i of the VISIBLE text). */
function page(n: number, p: Omit<LivingPage, 'page' | 'groups' | 'narration'> & { rate?: number; text?: string }): LivingPage {
  const { rate, text, ...rest } = p;
  const used = new Set([...JSON.stringify(rest.behaviors).matchAll(/"group":"([^"]+)"/g)].map(m => m[1]));
  const groups: Record<string, string[]> = {};
  for (const name of used) { const ids = GROUPS[n]?.[name]; if (!ids) throw new Error(`little-fox page ${n}: no group "${name}"`); groups[name] = ids; }
  return { page: n, ...(used.size ? { groups } : {}), ...rest, narration: { text: text ?? spreadText(n), voice: 'soft', rate: rate ?? 0.85 } };
}

// ───────────────────────────── music: plucked folk strings, everything in A minor pentatonic (A C D E G) ─────────────────────────────
const bars = (n: number) => n * 4;
const PROG: Array<[string, string]> = [['A2', 'min'], ['C3', 'maj'], ['G2', 'sus2'], ['A2', 'min']];
const barArps = (prog: Array<[string, string]>, o: { pattern?: 'up' | 'down' | 'updown'; step: number; count: number; dur: number; vel: number; lift?: number }) =>
  prog.flatMap(([r, q], b) => arpeggiate(chord(r, q).map(x => x + (o.lift ?? 12)), { pattern: o.pattern ?? 'updown', step: o.step, count: o.count, dur: o.dur, t0: b * 4, vel: o.vel }));
const drone = (v = 0.24): Array<{ t: number; n: string; d: number; v: number }> => [{ t: 0, n: 'A2', d: 15.5, v }, { t: 0, n: 'E3', d: 15.5, v: v * 0.8 }];

const foxTheme = (): Score => makeScore({
  id: 'fox-theme', tempo: 80, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.4, variation: { seed: 51, humanizeMs: 14, dropout: 0.04 },
  tracks: [
    track('flute', parseNotation('A4:2 C5:1 D5:1 | E5:2 D5:1 C5:1 | A4:1 C5:1 D5:1 E5:1 | A4:4', { defaultVel: 0.55 }).notes, { gain: 0.5, pan: 0.2 }),
    track('harp', barArps(PROG, { step: 0.5, count: 8, dur: 0.9, vel: 0.4 }), { gain: 0.75, pan: -0.2 }),
    track('pluck', bassline(['A1', 'C2', 'G1', 'A1'], 'root-fifth', { beatsPerBar: 4, vel: 0.6 }), { gain: 0.5 }),
    track('pad', drone(0.22), { gain: 0.3 }),
  ],
});
const forestWalk = (): Score => makeScore({
  id: 'forest-walk', tempo: 96, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.3, variation: { seed: 52, humanizeMs: 12, dropout: 0.05 },
  tracks: [
    track('pluck', bassline(['A1', 'C2', 'D2', 'A1'], 'pulse', { beatsPerBar: 4, vel: 0.6 }), { gain: 0.55 }),
    track('harp', barArps(PROG, { step: 0.5, count: 8, dur: 0.6, vel: 0.3 }), { gain: 0.6, pan: -0.25 }),
    track('kalimba', parseNotation('rest:3 E5:1 | rest:2 D5:1 rest:1 | rest:3 C5:1 | A4:2 rest:2', { defaultVel: 0.4 }).notes, { gain: 0.5, pan: 0.3 }),
    track('drum', drums({ shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.25 }),
  ],
});
/** Almost nothing: a drone and two glass notes. The hush page ducks everything else. */
const hushDusk = (): Score => makeScore({
  id: 'hush-dusk', tempo: 60, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.65, variation: { seed: 53, humanizeMs: 30 },
  tracks: [track('pad', drone(0.16), { gain: 0.3 }), track('glass', [{ t: 6, n: 'E5', d: 2, v: 0.2 }, { t: 12, n: 'A4', d: 2, v: 0.18 }], { gain: 0.4, pan: 0.2 })],
});
const crunchRustle = (): Score => makeScore({
  id: 'crunch-rustle', tempo: 100, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.2, variation: { seed: 54, humanizeMs: 14, dropout: 0.1 },
  tracks: [
    track('pluck', parseNotation('A3:.5 rest:.5 C4:.5 rest:.5 E4:1 rest:1 | D4:.5 rest:.5 C4:.5 rest:.5 A3:1 rest:1 | A3:.5 rest:.5 C4:.5 rest:.5 E4:1 G4:1 | E4:2 rest:2', { defaultVel: 0.6 }).notes, { gain: 0.6 }),
    track('bass', bassline(['A1', 'A1', 'C2', 'A1'], 'pulse', { beatsPerBar: 4, vel: 0.5 }), { gain: 0.4 }),
    track('drum', drums({ click: 'x.......x.......' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.3 }),
  ],
});
const dotHello = (): Score => makeScore({
  id: 'dot-hello', tempo: 72, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.45, variation: { seed: 55, humanizeMs: 18, dropout: 0.04 },
  tracks: [
    track('kalimba', parseNotation('E5:1 G5:1 E5:2 | D5:1 C5:1 D5:2 | C5:1 A4:1 C5:1 D5:1 | E5:4', { defaultVel: 0.55 }).notes, { gain: 0.7 }),
    track('harp', barArps(PROG, { pattern: 'up', step: 1, count: 4, dur: 1.2, vel: 0.3 }), { gain: 0.5, pan: -0.25 }),
    track('pad', drone(0.2), { gain: 0.3 }),
  ],
});
const braveSteps = (): Score => makeScore({
  id: 'brave-steps', tempo: 100, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.25, variation: { seed: 56, humanizeMs: 12, dropout: 0.04 },
  tracks: [
    track('flute', parseNotation('A4:1 A4:.5 C5:.5 D5:1 E5:1 | D5:1 C5:1 A4:2 | A4:1 A4:.5 C5:.5 D5:1 E5:1 | G5:2 E5:2', { defaultVel: 0.5 }).notes, { gain: 0.45, pan: 0.25 }),
    track('harp', barArps(PROG, { step: 0.5, count: 8, dur: 0.7, vel: 0.35 }), { gain: 0.6, pan: -0.2 }),
    track('pluck', bassline(['A1', 'C2', 'D2', 'E2'], 'walking', { beatsPerBar: 4, vel: 0.55 }), { gain: 0.5 }),
  ],
});
const goldPath = (): Score => makeScore({
  id: 'gold-path', tempo: 80, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.45, variation: { seed: 57, humanizeMs: 14, dropout: 0.03 },
  tracks: [
    track('harp', barArps(PROG, { pattern: 'up', step: 0.5, count: 8, dur: 1, vel: 0.4 }), { gain: 0.8, pan: -0.15 }),
    track('flute', parseNotation('A4:2 C5:2 | D5:2 E5:2 | G5:2 E5:2 | A5:4', { defaultVel: 0.5 }).notes, { gain: 0.45, pan: 0.25 }),
    track('pad', drone(0.26), { gain: 0.3 }),
    track('drum', drums({ shaker: '..x...x...x...x.' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.2 }),
  ],
});
const homeDen = (): Score => makeScore({
  id: 'home-den', tempo: 72, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.5, variation: { seed: 58, humanizeMs: 18 },
  tracks: [
    track('musicbox', parseNotation('E5:2 D5:1 C5:1 | A4:2 C5:2 | D5:2 C5:1 A4:1 | A4:4', { defaultVel: 0.5 }).notes, { gain: 0.75 }),
    track('harp', barArps(PROG, { pattern: 'up', step: 1, count: 4, dur: 1.4, vel: 0.3 }), { gain: 0.5, pan: -0.2 }),
    track('pad', drone(0.24), { gain: 0.3 }),
  ],
});
const seekFind = (): Score => makeScore({
  id: 'seek-find', tempo: 108, beatsPerBar: 4, lengthBeats: bars(4), reverb: 0.2, variation: { seed: 59, humanizeMs: 10, dropout: 0.05 },
  tracks: [
    track('kalimba', parseNotation('A4:.5 C5:.5 D5:.5 E5:.5 G5:1 E5:1 | D5:.5 E5:.5 D5:.5 C5:.5 A4:2 | A4:.5 C5:.5 D5:.5 E5:.5 G5:1 A5:1 | G5:1 E5:1 D5:2', { defaultVel: 0.6 }).notes, { gain: 0.65 }),
    track('pluck', bassline(['A1', 'C2', 'G1', 'A1'], 'oompah', { beatsPerBar: 4, vel: 0.55 }), { gain: 0.5 }),
    track('drum', drums({ shaker: '..x...x...x...x.', click: 'x...x...x...x...' }, { stepBeats: 0.25, bars: 4 }), { gain: 0.3 }),
  ],
});
const SCORES: Record<string, Score> = Object.fromEntries([foxTheme(), forestWalk(), hushDusk(), crunchRustle(), dotHello(), braveSteps(), goldPath(), homeDen(), seekFind()].map(s => [s.id, s]));

const wind = (gain = 0.26) => ({ bed: 'forest-wind', gain });
const night = (gain = 0.24) => ({ bed: 'forest-night', gain });

// ───────────────────────────── pages ─────────────────────────────
const P1 = page(1, {
  music: { cue: 'fox-theme', fadeMs: 900 },
  ambience: wind(0.24),
  behaviors: [
    ...life('tam', 'tam', 'tamEyes'),
    loop('tam-tail', grp('tamTail'), 'sway', { amount: 0.6, durationMs: 3200 }, true, "Tam's tail sways"),
    ...life('dot', 'dot', 'dotEyes', { breathe: 1.4, ms: 3800 }),
    flick('tam-ears', grp('tamEars'), 4000, 7000),
    flick('dot-ears', grp('dotEars'), 6500, 9000),
    loop('sun-breathe', grp('lowSun'), 'breathe', { amount: 0.6, durationMs: 7000 }, true, 'The low sun breathes'),
    { id: 'rays-turn', label: 'The sunburst turns very slowly', target: grp('rays'), on: { type: 'idle' }, do: [anim(grp('rays'), { keyframes: [{ at: 0, rotate: -1.6 }, { at: 1, rotate: 1.6 }], durationMs: 16000, direction: 'alternate', loop: 'infinite', delayMs: 0, easing: 'ease-in-out' })] },
    loop('firs-sway', grp('firs'), 'drift', { amount: 0.25, durationMs: 6200 }, true, 'The little firs stir'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    owl(),
    parallax('trunkL-tilt', grp('trunkL'), 1.2, 'Tilt your device and the big trunk on the left slides'),
    parallax('trunkR-tilt', grp('trunkR'), 1.2, 'Tilt your device and the big trunk on the right slides'),
    parallax('sun-tilt', grp('lowSun'), 0.4, 'Tilt your device to shift the low sun'),

    tapSound('tam-tap', grp('tam'), 'Tap Tam to hear a plucked hello', [note('pluck', 'A3', 900, 0.8), note('pluck', 'E4', 900, 0.6)], { target: grp('tamTail'), anim: { preset: 'wiggle', amount: 1 } }, { fx: burst(grp('tam'), 'hearts', 4) }),
    tapSound('dot-tap', grp('dot'), 'Tap little Dot to hear a kalimba note', [note('kalimba', 'E5', 900, 0.7)], { target: grp('dotEars'), anim: { preset: 'wiggle', amount: 1 } }, { fx: burst(grp('dot'), 'hearts', 3) }),
    tapSound('title-chord', grp('titleLetters'), 'Tap the title to strum a chord', [note('harp', 'A3', 1400, 0.7), wait(90), note('harp', 'E4', 1400, 0.6), wait(90), note('harp', 'A4', 1400, 0.5)], { anim: { preset: 'pulse', amount: 0.3 } }, { fx: null }),
    tapSound('sun-bell', grp('lowSun'), 'Tap the low sun', [note('bell', 'A4', 1500, 0.5), sfx('twinkle', 0.3)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('lowSun'), 'sparkles', 6) }),
    tapSound('fireflies-gather', grp('fireflies'), 'Tap the fireflies and they gather', [note('glass', 'E5', 1200, 0.5), sfx('sparkle', 0.35)], { anim: { preset: 'glow', amount: 1.4 } }, { fx: burst(grp('fireflies'), 'fireflies', 10) }),
    tapSound('trunkL-knock', grp('trunkL'), 'Tap the big trunk to knock on it', [sfx('knock', 0.5, -3)], { anim: { preset: 'shake', amount: 0.15 } }, { fx: burst(grp('trunkL'), 'leaves', 4) }),
    tapSound('trunkR-knock', grp('trunkR'), 'Tap the other big trunk to knock on it', [sfx('knock', 0.5, 0)], { anim: { preset: 'shake', amount: 0.15 } }, { fx: burst(grp('trunkR'), 'leaves', 4) }),
  ],
  a11y: { summary: 'The cover: Tam the little fox sits on a sunburst between two towering trunks. Little Dot the fawn stands at the right.', instructions: 'Tap Tam or Dot to hear a plucked note. Tap the title for a chord. Tap the fireflies, the sun and the trunks. Tilt your device to slide the trunks.' },
});

const P2 = page(2, {
  music: { cue: 'fox-theme', fadeMs: 900 },
  ambience: wind(0.26),
  behaviors: [
    ...life('tam', 'tam', 'tamEyes', { breathe: 1.2, ms: 3800 }),
    loop('tam-tail', grp('tamTail'), 'sway', { amount: 0.5, durationMs: 3400 }, true),
    flick('tam-ears', grp('tamEars'), 5000, 8000),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.6, durationMs: 6400 }, true, 'The sun breathes'),
    loop('beams-glow', grp('beams'), 'twinkle', { amount: 0.6, durationMs: 4200 }, true, 'The light beams shimmer'),
    loop('near-sway', grp('treesNear'), 'drift', { amount: 0.15, durationMs: 7600 }, true, 'The trees creak'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    owl(9000, 18000),
    parallax('near-tilt', grp('treesNear'), 1.3, 'Tilt your device: the nearest trunk slides the most'),
    parallax('mid-tilt', grp('treesMid'), 0.8, 'Tilt your device: the middle trunks slide a little'),
    parallax('far-tilt', grp('treesFar'), 0.4, 'Tilt your device: the far trunks hardly move'),
    parallax('beams-tilt', grp('beams'), 0.3, 'Tilt your device to move the light beams'),
    readSign(),
    tapSound('tam-tap', grp('tam'), 'Tap tiny Tam to hear a plucked note', [note('pluck', 'A3', 900, 0.8)], { target: grp('tamTail'), anim: { preset: 'wiggle', amount: 1 } }, { fx: burst(grp('tam'), 'hearts', 3) }),
    tapSound('sun-bell', grp('sun'), 'Tap the setting sun', [note('bell', 'E5', 1500, 0.5)], { anim: { preset: 'pulse', amount: 0.4 } }, { fx: burst(grp('sun'), 'sparkles', 6) }),
    tapSound('near-knock', grp('treesNear'), 'Tap the biggest trunk: wide as a house', [sfx('knock', 0.5, -5)], { anim: { preset: 'shake', amount: 0.1 } }, { fx: burst(grp('treesNear'), 'leaves', 5) }),
    tapSound('mid-knock', grp('treesMid'), 'Tap a middle trunk', [sfx('knock', 0.5, -1)], { anim: { preset: 'shake', amount: 0.1 } }, { fx: burst(grp('treesMid'), 'leaves', 4) }),
    tapSound('far-knock', grp('treesFar'), 'Tap a far trunk', [sfx('knock', 0.5, 3)], { anim: { preset: 'shake', amount: 0.1 } }, { fx: burst(grp('treesFar'), 'leaves', 4) }),
    tapSound('fireflies-gather', grp('fireflies'), 'Tap the fireflies and they gather', [note('glass', 'A5', 1200, 0.4), sfx('sparkle', 0.3)], { anim: { preset: 'glow', amount: 1.4 } }, { fx: burst(grp('fireflies'), 'fireflies', 10) }),
  ],
  a11y: { summary: 'Tam is tiny at the base of enormous trunks. A low sun glows at the right and light beams cross the path.', instructions: 'Tilt your device and the trunks slide at different speeds. Tap Tam, the sun, the trunks and the fireflies. Tap the wooden sign to hear the page read aloud.' },
});

// page 3: LEFT FOOT, RIGHT FOOT, HUSH. Tap the left side, then the right side, back and forth: each correct step plays the next note of a rising tune
// and the trunks slide past (three depths). Tapping the same side twice stumbles (a soft tick), it never punishes.
const WALK_NOTES = ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5'];
const stepNote = (): Action => WALK_NOTES.reduceRight<Action[]>((acc, n, i) => [{ do: 'if', cond: eq('steps', i), then: [note('pluck', n, 900, 0.85)], else: acc }], [])[0];
const stepped = (side: 'L' | 'R'): Action[] => [
  stepNote(), sfx(side === 'L' ? 'footstep-left' : 'footstep-right', 0.8), setv('last', side), incv('steps'), { do: 'var', name: 'walk', op: 'inc', value: 0.125 },
];
const foot = (side: 'L' | 'R'): Behavior => ({
  id: `foot-${side}`, label: side === 'L' ? 'Left foot' : 'Right foot', target: grp(side === 'L' ? 'footL' : 'footR'), on: { type: 'tap' }, when: { var: 'steps', op: '<', value: 8 },
  hint: side === 'L' ? 'Left foot: tap the big trees on the left, then the right side. Go left, right, left, right to walk Tam through the forest.' : 'Right foot: tap anywhere on the right after the left. Left, right, left, right!',
  do: [
    { do: 'if', cond: { var: 'last', op: '!=', value: side }, then: [
      ...stepped(side), anim(grp(side === 'L' ? 'pawL' : 'pawR'), { preset: 'squash', amount: 1.4 }), anim(grp('tam'), { preset: 'bounce', amount: 0.3 }), burst(grp('tam'), 'leaves', 3),
    ], else: [sfx('tick', 0.5, -6), anim(grp('tam'), { preset: 'wiggle', amount: 0.4 })] },
  ],
  reduced: [{ do: 'if', cond: { var: 'last', op: '!=', value: side }, then: [...stepped(side), ...ping(grp(side === 'L' ? 'pawL' : 'pawR'))], else: [sfx('tick', 0.5, -6)] }],
});
const SCROLL: Array<[string, number]> = [['trunkA', -90], ['trunkB', -55], ['trunkC', -30], ['firsL', -45], ['firsR', -30], ['fireflies', -24]];
const P3 = page(3, {
  vars: { steps: 0, last: '', walk: 0 },
  music: { cue: 'forest-walk', fadeMs: 900 },
  ambience: wind(0.24),
  behaviors: [
    { id: 'scroll-trunks', label: 'The trunks slide past as Tam walks', target: PAGE, on: { type: 'enter' },
      do: SCROLL.map(([g, x]) => anim(grp(g), { keyframes: [{ at: 0, x: 0 }, { at: 1, x }], durationMs: 1000, easing: 'var:walk' })) },
    ...life('tam', 'tam', 'tamEyes', { breathe: 1.2, ms: 3600 }),
    flick('tam-ears', grp('tamEars'), 4500, 8000),
    loop('lantern-glow', grp('lantern'), 'glow', { amount: 1.2 }, true, 'The carved lantern glows'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    loop('rays-turn', grp('rays'), 'twinkle', { amount: 0.4, durationMs: 5200 }, true, 'The sun rays shimmer'),
    parallax('rays-tilt', grp('rays'), 0.3, 'Tilt your device to shift the light'),
    parallax('fireflies-tilt', grp('fireflies'), 1.1, 'Tilt your device to shift the fireflies'),
    foot('L'), foot('R'),
    { id: 'foot-done', label: 'Tam is through the trunks', target: grp('footL'), on: { type: 'tap' }, when: ge('steps', 8), hint: 'Tam walked all the way through. Tap the trees to hear the tune again.',
      do: [note('pluck', 'A3', 700, 0.6), wait(120), note('pluck', 'E4', 700, 0.6), wait(120), note('pluck', 'A4', 1000, 0.6), burst(grp('tam'), 'fireflies', 6)], reduced: [note('pluck', 'A3', 700, 0.6), wait(120), note('pluck', 'E4', 700, 0.6), wait(120), note('pluck', 'A4', 1000, 0.6)] },
    { id: 'walk-cheer', label: 'The whole walk', target: PAGE, on: { type: 'when', cond: ge('steps', 8) }, once: true,
      do: [wait(600), sfx('harp-gliss', 0.6), burst(grp('tam'), 'fireflies', 12), anim(grp('tam'), { preset: 'bounce', amount: 0.8 })] },
    tapSound('tam-ear', grp('tam'), 'Tap Tam to hear him whisper "hush"', [sfx('hum', 0.25, 3)], { target: grp('tamEars'), anim: { preset: 'wiggle', amount: 1 } }, { fx: null }),
    tapSound('lantern-tap', grp('lantern'), 'Tap the carved lantern', [note('glass', 'E5', 1400, 0.45)], { anim: { preset: 'pulse', amount: 0.8 } }, { fx: burst(grp('lantern'), 'fireflies', 6) }),
  ],
  goals: [{ id: 'walked', label: 'Walked Tam through the trunks: left, right, left, right', when: ge('steps', 8), celebrate: false }],
  a11y: { summary: 'Tam walks through tall trunks. The big trunks are on the left, the story sign is on the right.', instructions: 'Tap the left side, then the right side, and keep going, left, right, left, right, to walk Tam through the forest. Each right step plays the next note of a tune and the trunks slide past. Tapping the same side twice only makes a soft tick. Tilt your device to shift the light.' },
});

// page 4: HUSH. All sound ducks to almost nothing; the crickets and a drone are all that is left. Silence is the tool.
const P4 = page(4, {
  vars: { carry: 0, lit: false },
  music: { cue: 'hush-dusk', fadeMs: 2500 },
  ambience: { bed: 'night-crickets', gain: 0.3 },
  rate: 0.78,
  behaviors: [
    { id: 'hush-enter', label: 'Everything goes quiet', target: PAGE, on: { type: 'enter' }, do: [{ do: 'duck', amount: 0.55, ms: 4500 }] },
    { id: 'owl-stirs', label: 'Something stirs, far away', target: PAGE, on: { type: 'timer', afterMs: 9000 }, do: [{ do: 'sfx', sound: 'owl-hoo', params: { gain: 0.14, pan: -0.5 } }, anim(grp('lanternLight'), { preset: 'pulse', amount: 0.6 })] },
    ...life('tam', 'tam', 'tamEyes', { breathe: 1.4, ms: 5200 }),
    loop('lantern-glow', grp('lanternLight'), 'glow', { amount: 1.2 }, true, 'The little lantern glows'),
    loop('hush-bob', grp('hush'), 'bob', { amount: 0.25, durationMs: 3800 }, false, 'The word Hush floats'),
    parallax('near-tilt', grp('treesNear'), 1.2, 'Tilt your device to slide the dark trunks'),
    parallax('mid-tilt', grp('treesMid'), 0.6, 'Tilt your device to slide the far trunks'),
    { id: 'lantern-drag', label: 'Carry the lantern', target: grp('lanternLight'), on: { type: 'drag', axis: 'both', bounds: { minX: -260, maxX: 20, minY: -40, maxY: 80 }, progressVar: 'carry' },
      hint: 'Drag the little lantern across the dark. The fireflies come with it. Press Enter to carry it all the way.',
      do: [{ do: 'haptic', pattern: 'soft' }, sfx('glass-chime', 0.18)], reduced: [sfx('glass-chime', 0.18)] },
    { id: 'lantern-lit', label: 'The fireflies gather', target: PAGE, on: { type: 'when', cond: ge('carry', 0.5) }, once: true,
      do: [setv('lit', true), note('glass', 'E5', 2000, 0.25), burst(grp('lanternLight'), 'fireflies', 10)] },
    { id: 'hush-tap', target: grp('hush'), on: { type: 'tap' }, hint: 'Tap the word Hush and even the crickets stop for a moment.',
      do: [{ do: 'ambience', bed: null, fadeMs: 500 }, anim(grp('hush'), { preset: 'pulse', amount: 0.3 }), wait(4500), { do: 'ambience', bed: 'night-crickets', gain: 0.3, fadeMs: 2000 }],
      reduced: [{ do: 'ambience', bed: null, fadeMs: 500 }, wait(4500), { do: 'ambience', bed: 'night-crickets', gain: 0.3, fadeMs: 2000 }] },
    tapSound('tam-ear', grp('tam'), 'Tap tiny Tam: his ears go back', [sfx('hum', 0.15, 3)], { target: grp('tamEars'), anim: { preset: 'wiggle', amount: 1 } }, { fx: null }),
    tapSound('cricket-tap', grp('treesNear'), 'Tap a dark trunk to hear one cricket', [sfx('cricket', 0.2)], null, { fx: null }),
  ],
  goals: [{ id: 'lantern-carried', label: 'Carried the lantern through the dark', when: ge('carry', 0.5), celebrate: false }],
  a11y: { summary: 'A nearly empty dark green page. Tiny Tam sits in the corner next to a small glowing lantern. The word Hush is on the page. All the sound is nearly gone, only crickets are left.', instructions: 'Drag the little lantern through the dark and the fireflies come with it. Tap the word Hush and even the crickets stop for a moment. Wait quietly and a far-off owl will call.' },
});

// page 5: CRUNCH. RUSTLE. PEEK! Each panel makes its own sound and reveals its part.
const P5 = page(5, {
  vars: { c: false, r: false, p: false },
  music: { cue: 'crunch-rustle', fadeMs: 900 },
  ambience: wind(0.15),
  behaviors: [
    { id: 'hide-parts', label: 'The surprises start hidden', target: PAGE, on: { type: 'enter' }, do: [
      { do: 'set', target: grp('burst'), props: { opacity: 0 } }, { do: 'set', target: grp('peekEyes'), props: { opacity: 0 } }, { do: 'set', target: grp('dot3'), props: { opacity: 0 } } ] },
    ...life('tam1', 'tam1', undefined, { breathe: 1.2, ms: 3600 }),
    ...life('tam3', 'tam3', undefined, { breathe: 1.2, ms: 3900 }),
    loop('leaves-sway', grp('leaves'), 'wave', { amount: 0.4, durationMs: 2800 }, true, 'The leaves rustle gently'),
    loop('flag1-sway', grp('flag1'), 'bob', { amount: 0.25, durationMs: 2600 }, true),
    loop('flag2-sway', grp('flag2'), 'bob', { amount: 0.25, durationMs: 3000 }, true),
    loop('flag3-sway', grp('flag3'), 'bob', { amount: 0.25, durationMs: 2300 }, true),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    parallax('beams-tilt', grp('beams'), 0.6, 'Tilt your device to move the light beams'),
    // 1. CRUNCH
    { id: 'crunch', label: 'Crunch', target: grp('panel1'), on: { type: 'tap' }, hint: 'Tap the first picture to hear the twig go crunch.',
      do: [sfx('crunch', 0.5), note('pluck', 'A3', 700, 0.7), setv('c', true), { do: 'show', target: grp('burst'), anim: { preset: 'pop-in', durationMs: 300 } }, anim(grp('tam1'), { preset: 'bounce', amount: 0.9 }), anim(grp('twig'), { preset: 'shake', amount: 0.5 })],
      reduced: [sfx('crunch', 0.5), note('pluck', 'A3', 700, 0.7), setv('c', true), { do: 'set', target: grp('burst'), props: { opacity: 1 } }] },
    // 2. RUSTLE
    { id: 'rustle', label: 'Rustle', target: grp('panel2'), on: { type: 'tap' }, hint: 'Tap the second picture to hear the leaves rustle.',
      do: [sfx('rustle', 0.5), note('pluck', 'C4', 700, 0.7), setv('r', true), { do: 'show', target: grp('peekEyes'), anim: { preset: 'pop-in', durationMs: 400 } }, anim(grp('leaves'), { preset: 'shake', amount: 0.6 })],
      reduced: [sfx('rustle', 0.5), note('pluck', 'C4', 700, 0.7), setv('r', true), { do: 'set', target: grp('peekEyes'), props: { opacity: 1 } }] },
    // 3. PEEK!
    { id: 'peek', label: 'Peek!', target: grp('panel3'), on: { type: 'tap' }, hint: 'Tap the third picture and someone with spots peeks out from behind the tree.',
      do: [sfx('squeak', 0.3, 7), note('pluck', 'E4', 700, 0.7), setv('p', true), { do: 'show', target: grp('dot3'), anim: { preset: 'slide-in', durationMs: 600, amount: 0.8 } }, sfx('twinkle', 0.3)],
      reduced: [sfx('squeak', 0.3, 7), note('pluck', 'E4', 700, 0.7), setv('p', true), { do: 'set', target: grp('dot3'), props: { opacity: 1 } }] },
    { id: 'all-three', label: 'Crunch, rustle, peek', target: PAGE, on: { type: 'when', cond: { all: [eq('c', true), eq('r', true), eq('p', true)] } },
      do: [wait(500), note('harp', 'A4', 1400, 0.5), wait(140), note('harp', 'C5', 1400, 0.5), wait(140), note('harp', 'E5', 1600, 0.5), burst(grp('fireflies'), 'fireflies', 10)] },
    { id: 'feet-stuck', label: 'Tam\'s feet would not move', target: grp('signTam'), on: { type: 'tap' }, hint: 'Tap this sign: Tam wanted to run, but his feet would not move.',
      do: [sfx('thud', 0.3), anim(grp('tam3'), { preset: 'shake', amount: 0.7 })], reduced: [sfx('thud', 0.3), ...ping(grp('tam3'))] },
  ],
  goals: [{ id: 'crunch-rustle-peek', label: 'Crunch, rustle, peek: all three found', when: { all: [eq('c', true), eq('r', true), eq('p', true)] }, celebrate: false }],
  a11y: { summary: 'Three tall framed pictures. A twig breaks near Tam. Two eyes look out from behind rustling leaves. Someone with spots peeks out from behind a tree.', instructions: 'Tap each picture: the first goes crunch, the second goes rustle, the third goes peek. Each one plays its sound and shows what was hiding.' },
});

const P6 = page(6, {
  music: { cue: 'dot-hello', fadeMs: 900 },
  ambience: wind(0.2),
  behaviors: [
    { id: 'dot-eyes-follow', label: "Dot's big eyes follow your finger", target: grp('dotEyes'), on: { type: 'enter' }, do: [{ do: 'follow', target: grp('dotEyes'), to: 'pointer', lookAt: true, lagMs: 300, maxOffset: 12 }] },
    loop('dot-breathe', grp('dot'), 'breathe', { amount: 0.6, durationMs: 5200 }, true, 'Dot breathes'),
    loop('dot-blink', grp('dotEyes'), 'blink', {}, true, 'Dot blinks'),
    flick('dot-ears', grp('dotEars'), 4000, 7000),
    ...life('tam', 'tam', undefined, { breathe: 1.4, ms: 3800 }),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.6, durationMs: 6400 }, true),
    loop('beams-glow', grp('beams'), 'twinkle', { amount: 0.6, durationMs: 4200 }, true, 'The light beams shimmer'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    owl(8000, 20000),
    parallax('tree-tilt', grp('tree'), 1.2, 'Tilt your device to slide the big trunk'),
    parallax('beams-tilt', grp('beams'), 0.4, 'Tilt your device to move the beams'),
    readSign(),
    tapSound('dot-hello', grp('dot'), 'Tap Dot to hear her small voice', [note('flute', 'E5', 1000, 0.35), sfx('twinkle', 0.25)], { target: grp('dotEars'), anim: { preset: 'wiggle', amount: 1 } }, { fx: burst(grp('dot'), 'hearts', 5) }),
    tapSound('dot-nose', grp('dotNose'), "Tap Dot's nose", [sfx('boop', 0.4, 4)], { anim: { preset: 'pulse', amount: 1 } }, { fx: null }),
    tapSound('tam-squeak', grp('tam'), 'Tap tiny Tam', [sfx('squeak', 0.35, 3)], { anim: { preset: 'jelly', amount: 0.6 } }, { fx: null }),
    tapSound('sun-bell', grp('sun'), 'Tap the little sun', [note('bell', 'A4', 1500, 0.4)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('sun'), 'sparkles', 5) }),
  ],
  a11y: { summary: 'A giant fawn face with huge dark eyes fills the page. Tiny Tam stands below it.', instructions: "Dot's big eyes follow your finger. Tap Dot to hear her small voice, tap her nose, tap Tam, and tap the wooden sign to hear the page read aloud." },
});

// page 7: two small friends walk. Alternate Tam and Dot (left foot, right foot) and each step lights a stripe of the gold path.
const P7 = page(7, {
  vars: { steps: 0, last: '' },
  music: { cue: 'brave-steps', fadeMs: 900 },
  ambience: wind(0.2),
  behaviors: [
    ...life('tam', 'tam', 'tamEyes', { breathe: 1.2, ms: 3700 }),
    ...life('dot', 'dot', 'dotEyes', { breathe: 1.2, ms: 4100 }),
    loop('beams-glow', grp('beams'), 'twinkle', { amount: 0.5, durationMs: 4400 }, true, 'The light beams shimmer'),
    loop('firsL-drift', grp('firsL'), 'drift', { amount: 0.2, durationMs: 6800 }, true),
    loop('firsR-drift', grp('firsR'), 'drift', { amount: 0.2, durationMs: 7400, direction: 'reverse' }, true),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    parallax('firsL-tilt', grp('firsL'), 0.8, 'Tilt your device to slide the little firs'),
    parallax('firsR-tilt', grp('firsR'), 0.5, 'Tilt your device to slide the far firs'),
    readSign(),
    // tap Tam (left foot), then Dot (right foot), back and forth: each step lights the next stripe of gold
    ...(['T', 'D'] as const).map((who): Behavior => ({
      id: `friend-${who}`, label: who === 'T' ? 'Tam steps' : 'Dot steps', target: grp(who === 'T' ? 'tam' : 'dot'), on: { type: 'tap' },
      hint: who === 'T' ? 'Tap Tam, then Dot, then Tam again: left foot, right foot. Each step lights a stripe of the gold path.' : 'Tap Dot after Tam: right foot. Left, right, left, right!',
      do: [{ do: 'if', cond: { var: 'last', op: '!=', value: who }, then: [
        sfx(who === 'T' ? 'footstep-left' : 'footstep-right', 0.7), incv('steps'), setv('last', who),
        { do: 'if', cond: eq('steps', 1), then: [note('pluck', 'A3', 800, 0.8), anim(grp('stripe1'), { preset: 'pulse', amount: 1.5 })], else: [{ do: 'if', cond: eq('steps', 2), then: [note('pluck', 'C4', 800, 0.8), anim(grp('stripe2'), { preset: 'pulse', amount: 1.5 })], else: [note('pluck', 'E4', 800, 0.8), anim(grp('stripe3'), { preset: 'pulse', amount: 1.5 })] }] },
        anim(grp(who === 'T' ? 'tam' : 'dot'), { preset: 'bounce', amount: 0.3 }),
      ], else: [sfx('tick', 0.4, -6)] }],
      reduced: [{ do: 'if', cond: { var: 'last', op: '!=', value: who }, then: [sfx(who === 'T' ? 'footstep-left' : 'footstep-right', 0.7), incv('steps'), setv('last', who), note('pluck', 'A3', 800, 0.8), ...ping(grp('stripe1'))], else: [sfx('tick', 0.4, -6)] }],
    })),
    { id: 'friends-arrive', label: 'Three steps along the gold', target: PAGE, on: { type: 'when', cond: ge('steps', 3) }, once: true, do: [wait(300), sfx('harp-gliss', 0.5), burst(grp('fireflies'), 'fireflies', 10)] },
    tapSound('stripe1-tap', grp('stripe1'), 'Tap the first stripe of gold light', [note('glass', 'A4', 1200, 0.5)], { anim: { preset: 'pulse', amount: 1.5 } }, { fx: burst(grp('stripe1'), 'sparkles', 4) }),
    tapSound('stripe2-tap', grp('stripe2'), 'Tap the second stripe of gold light', [note('glass', 'C5', 1200, 0.5)], { anim: { preset: 'pulse', amount: 1.5 } }, { fx: burst(grp('stripe2'), 'sparkles', 4) }),
    tapSound('stripe3-tap', grp('stripe3'), 'Tap the third stripe of gold light', [note('glass', 'E5', 1200, 0.5)], { anim: { preset: 'pulse', amount: 1.5 } }, { fx: burst(grp('stripe3'), 'sparkles', 4) }),
  ],
  goals: [{ id: 'three-steps', label: 'Three steps together: left, right, left', when: ge('steps', 3), celebrate: false }],
  a11y: { summary: 'Tam and Dot stand side by side on a path with three stripes of gold light, framed between two little fir trees.', instructions: 'Tap Tam, then Dot, then Tam again, left foot, right foot, and each step lights a stripe of the gold path. You can also tap each stripe to hear its note.' },
});

// page 8: THE GOLD PATH. Drag Tam along the path: the friends walk, the trunks slide past at three depths, the fireflies gather and the music warms.
const P8 = page(8, {
  vars: { walk: 0, gold: 0 },
  music: { cue: 'gold-path', fadeMs: 900 },
  ambience: wind(0.2),
  behaviors: [
    { id: 'scenery-follows', label: 'The scenery follows the walk', target: PAGE, on: { type: 'enter' }, do: [
      anim(grp('dot'), { keyframes: [{ at: 0, x: 0 }, { at: 1, x: 300 }], durationMs: 1000, easing: 'var:walk' }),
      anim(grp('fireflies'), { keyframes: [{ at: 0, x: 0, opacity: 0.7 }, { at: 1, x: 330, opacity: 1 }], durationMs: 1000, easing: 'var:walk' }),
      anim(grp('path'), { keyframes: [{ at: 0, opacity: 0.8 }, { at: 1, opacity: 1 }], durationMs: 1000, easing: 'var:walk' }),
      anim(grp('treesNear'), { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -70 }], durationMs: 1000, easing: 'var:walk' }),
      anim(grp('treesMid'), { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -40 }], durationMs: 1000, easing: 'var:walk' }),
      anim(grp('treesFar'), { keyframes: [{ at: 0, x: 0 }, { at: 1, x: -18 }], durationMs: 1000, easing: 'var:walk' }),
    ] },
    ...life('tam', 'tam', undefined, { breathe: 1.2, ms: 3800 }),
    loop('dot-breathe', grp('dot'), 'breathe', { amount: 1.2, durationMs: 4200 }, true),
    loop('doe-breathe', grp('doe'), 'breathe', { amount: 0.8, durationMs: 5000 }, true, 'The doe breathes'),
    flick('doe-wait', grp('doe'), 6000, 9000),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.8, durationMs: 6200 }, true, 'The low sun breathes'),
    twinkle('fireflies-twinkle', grp('fireflies'), 0.6),
    parallax('near-tilt', grp('treesNear'), 1.0, 'Tilt your device to slide the nearest trunks'),
    parallax('far-tilt', grp('treesFar'), 0.4, 'Tilt your device to slide the far trunks'),
    readSign(),
    { id: 'tam-walk', label: 'Walk the gold path', target: grp('tam'), on: { type: 'drag', axis: 'x', bounds: { minX: 0, maxX: 330 }, progressVar: 'walk', snapTo: [{ x: 330, y: 0, r: 60 }] },
      hint: "Drag Tam along the gold path toward Dot's mother. Dot walks with him and the fireflies gather. Press Enter to walk the whole way.",
      do: [{ do: 'haptic', pattern: 'soft' }, sfx('footstep-left', 0.6), note('pluck', 'A3', 700, 0.7)], reduced: [sfx('footstep-left', 0.6), note('pluck', 'A3', 700, 0.7)] },
    // each fifth of the walk is one glowing step: the next note of the tune and a puff of fireflies; the music warms in the middle
    ...[[0.2, 'C4'], [0.4, 'D4'], [0.6, 'E4'], [0.8, 'G4']].map(([at, n], i): Behavior => ({
      id: `glow-step-${i + 1}`, label: 'A glowing step', target: PAGE, on: { type: 'when', cond: ge('walk', at as number) }, once: true,
      do: [note('pluck', n as string, 800, 0.75), sfx('footstep-right', 0.4), burst(grp('tam'), 'fireflies', 3)],
    })),
    { id: 'warmer', label: 'The path warms the music', target: PAGE, on: { type: 'when', cond: ge('walk', 0.5) }, once: true, do: [{ do: 'musicTempo', scale: 1.08, rampMs: 2500 }] },
    { id: 'doe-reached', label: 'Dot runs to her mother', target: PAGE, on: { type: 'event', name: 'drag:snap:tam-walk' }, once: true, do: [
      setv('gold', 1), anim(grp('dot'), { keyframes: [{ at: 0, x: 0 }, { at: 1, x: 90 }], durationMs: 900, easing: 'ease-out' }), anim(grp('doe'), { preset: 'jelly', amount: 0.7 }),
      sfx('harp-gliss', 0.55), wait(500), note('bell', 'A5', 1600, 0.45), burst(grp('doe'), 'hearts', 8), burst(grp('fireflies'), 'fireflies', 10),
    ] },
    tapSound('moss-tap', grp('moss'), 'Tap the hill of moss', [sfx('rustle', 0.35), note('kalimba', 'D5', 800, 0.5)], { anim: { preset: 'squash', amount: 0.6 } }, { fx: burst(grp('moss'), 'leaves', 4) }),
    tapSound('bridge-tap', grp('bridge'), 'Tap the bridge of roots', [sfx('knock', 0.5, -2), note('kalimba', 'A4', 800, 0.5)], { anim: { preset: 'squash', amount: 0.6 } }, { fx: null }),
    tapSound('doe-tap', grp('doe'), "Tap Dot's mother, the tall doe", [sfx('hum', 0.3, 3)], { anim: { preset: 'jelly', amount: 0.5 } }, { fx: burst(grp('doe'), 'hearts', 3) }),
    tapSound('dot-tap', grp('dot'), 'Tap Dot to hear her squeak', [sfx('squeak', 0.4, 6)], { anim: { preset: 'jelly', amount: 0.7 } }, { fx: null }),
    tapSound('sun-bell', grp('sun'), 'Tap the low sun at the end of the path', [note('bell', 'E5', 1500, 0.45)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('sun'), 'sparkles', 6) }),
  ],
  goals: [{ id: 'reached-doe', label: "Walked the whole gold path to Dot's mother", when: ge('gold', 1), celebrate: false }, { id: 'walked-half', label: 'Walked halfway along the gold path', when: ge('walk', 0.5), celebrate: false }],
  a11y: { summary: 'A wide gold path leads from a low sun between dark trunks. Tam and Dot stand on it and a tall doe waits at the right.', instructions: "Drag Tam to the right along the gold path, or press Enter to walk it all the way. Dot walks along, the trunks slide past, fireflies gather and the music warms. At the end Dot runs to her mother. Tap the moss, the bridge of roots and the sun." },
});

const P9 = page(9, {
  music: { cue: 'home-den', fadeMs: 1200 },
  ambience: night(0.22),
  behaviors: [
    ...life('mama', 'mama', undefined, { breathe: 1.2, ms: 4400 }),
    ...life('tam', 'tam', undefined, { breathe: 1.4, ms: 3800 }),
    loop('ring-glint', grp('earRing'), 'twinkle', { amount: 1.2, durationMs: 2200 }, true, "Mama Fox's gold ear ring glints"),
    loop('jar-glow', grp('jar'), 'glow', { amount: 1.4 }, true, 'The firefly jar glows'),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.8, durationMs: 6400 }, true, 'The setting sun breathes'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    owl(9000, 20000, 0.14),
    parallax('treesL-tilt', grp('treesL'), 1.1, 'Tilt your device to slide the left trunk'),
    parallax('treesR-tilt', grp('treesR'), 1.1, 'Tilt your device to slide the right trunk'),
    readSign(),
    tapSound('mama-hum', grp('mama'), 'Tap Mama Fox to hear her hum', [sfx('hum', 0.35, 2), note('harp', 'A3', 1500, 0.4)], { anim: { preset: 'pulse', amount: 0.4 } }, { fx: burst(grp('mama'), 'hearts', 6) }),
    tapSound('tam-squeak', grp('tam'), 'Tap Tam to hear him squeak', [sfx('squeak', 0.4, 4), note('pluck', 'E4', 800, 0.6)], { anim: { preset: 'jelly', amount: 0.7 } }, { fx: burst(grp('tam'), 'hearts', 4) }),
    tapSound('jar-chime', grp('jar'), 'Tap the lantern jar full of fireflies', [sfx('glass-chime', 0.4), note('glass', 'E5', 1400, 0.4)], { anim: { preset: 'pulse', amount: 1 } }, { fx: burst(grp('jar'), 'fireflies', 10) }),
    tapSound('den-knock', grp('den'), 'Tap the den door', [sfx('knock', 0.4, -3), wait(500), sfx('hum', 0.2, -2)], { anim: { preset: 'pulse', amount: 0.15 } }, { fx: null }),
    tapSound('sun-bell', grp('sun'), 'Tap the setting sun', [note('bell', 'A4', 1600, 0.4)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('sun'), 'sparkles', 5) }),
  ],
  a11y: { summary: 'At the den, Mama Fox with a gold ear ring waits next to Tam. A jar of fireflies glows near the den door as the sun sets behind them.', instructions: 'Tap Mama Fox, Tam, the firefly jar, the den door and the sun. Tilt your device to slide the trunks. Tap the wooden sign to hear the page read aloud.' },
});

// page 10: the activity page. Light the five diamonds, find the twig that went crunch, knock on the trees.
const DIAMOND_NOTES = ['A4', 'C5', 'D5', 'E5', 'G5'];
const P10 = page(10, {
  vars: { lights: 0, twig: false },
  music: { cue: 'seek-find', fadeMs: 900 },
  ambience: wind(0.16),
  behaviors: [
    ...life('tam', 'tam', undefined, { breathe: 1.4, ms: 3600 }),
    ...life('dot', 'dot', undefined, { breathe: 1.4, ms: 4000 }),
    twinkle('f1-twinkle', grp('f1'), 1),
    twinkle('f2-twinkle', grp('f2'), 1),
    loop('ring-pulse', grp('ring'), 'twinkle', { amount: 1.2, durationMs: 2600 }, true, 'The answer ring waits'),
    parallax('tr-tilt', grp('tr4'), 0.8, 'Tilt your device to slide the widest tree'),
    ...[1, 2, 3, 4, 5].map((k): Behavior => ({
      id: `diamond-${k}`, label: `Gold light ${k}`, target: grp(`d${k}`), on: { type: 'tap' }, once: true, hint: `Tap diamond ${k} to light it gold. Count the gold lights you find.`,
      do: [{ do: 'set', target: grp(`d${k}`), props: { fill: '#FFD700' } }, note('harp', DIAMOND_NOTES[k - 1], 1200, 0.65), incv('lights'), anim(grp(`d${k}`), { preset: 'pop-in', durationMs: 400 }), burst(grp(`d${k}`), 'sparkles', 4)],
      reduced: [{ do: 'set', target: grp(`d${k}`), props: { fill: '#FFD700' } }, note('harp', DIAMOND_NOTES[k - 1], 1200, 0.65), incv('lights')],
    })),
    { id: 'lights-done', label: 'All five lights found', target: PAGE, on: { type: 'when', cond: ge('lights', 5) }, once: true, do: [wait(300), sfx('harp-gliss', 0.55), burst(grp('f1'), 'fireflies', 12)] },
    { id: 'twig-found', label: 'The twig that went crunch', target: grp('twig'), on: { type: 'tap' }, once: true, hint: 'Tap the twig on the ground that went crunch.',
      do: [sfx('crunch', 0.5), setv('twig', true), { do: 'set', target: grp('ring'), props: { fill: '#FFD700' } }, burst(grp('twig'), 'leaves', 6), anim(grp('twig'), { preset: 'shake', amount: 0.6 })],
      reduced: [sfx('crunch', 0.5), setv('twig', true), { do: 'set', target: grp('ring'), props: { fill: '#FFD700' } }] },
    { id: 'twig-cheer', label: 'Twig found', target: PAGE, on: { type: 'when', cond: eq('twig', true) }, once: true, do: [wait(250), note('kalimba', 'A5', 1200, 0.5), burst(grp('tam'), 'fireflies', 6)] },
    ...[1, 2, 3, 4, 5].map((k): Behavior => tapSound(`tree-${k}`, grp(`tr${k}`), `Tap tree ${k} to knock on it. They all reach right up past the top!`, [sfx('knock', 0.45, -6 + k * 2), sfx('rustle', 0.2)], { anim: { preset: 'shake', amount: 0.12 } }, { fx: burst(grp(`tr${k}`), 'leaves', 4) })),
    tapSound('f1-gather', grp('f1'), 'Tap the fireflies in the trees', [note('glass', 'E5', 1200, 0.4)], { anim: { preset: 'glow', amount: 1.4 } }, { fx: burst(grp('f1'), 'fireflies', 8) }),
    tapSound('f2-gather', grp('f2'), 'Tap the fireflies near Dot', [note('glass', 'A5', 1200, 0.4)], { anim: { preset: 'glow', amount: 1.4 } }, { fx: burst(grp('f2'), 'fireflies', 8) }),
  ],
  goals: [{ id: 'five-lights', label: 'Lit all five gold lights', when: ge('lights', 5), celebrate: false }, { id: 'found-twig', label: 'Found the twig that went crunch', when: eq('twig', true), celebrate: false }],
  a11y: { summary: 'A framed forest scene with five tall trunks, hidden fireflies, Tam and Dot, and counting boxes: five dotted diamonds and a dotted ring on wooden signs.', instructions: 'Tap each dotted diamond to light it gold and count the lights. Find the twig on the ground and tap it. Tap the trees to knock on them and tap the fireflies.' },
});

const P11 = page(11, {
  music: { cue: 'fox-theme', fadeMs: 1200 },
  ambience: night(0.22),
  behaviors: [
    { id: 'slow-end', label: 'The tune slows for goodnight', target: PAGE, on: { type: 'enter' }, do: [{ do: 'musicTempo', scale: 0.9, rampMs: 6000 }] },
    { id: 'fade-out', label: 'The tune fades out', target: PAGE, on: { type: 'timer', afterMs: 45000 }, do: [{ do: 'musicStop', fadeMs: 8000 }] },
    loop('mama-breathe', grp('mama'), 'breathe', { amount: 0.8, durationMs: 4800 }, true, 'Mama Fox breathes'),
    loop('tam-breathe', grp('tam'), 'breathe', { amount: 1, durationMs: 4200 }, true, 'Tam breathes'),
    loop('dot-breathe', grp('dot'), 'breathe', { amount: 1, durationMs: 4600 }, true, 'Dot breathes'),
    loop('sun-breathe', grp('sun'), 'breathe', { amount: 0.8, durationMs: 6400 }, true, 'The setting sun breathes'),
    twinkle('fireflies-twinkle', grp('fireflies'), 1),
    owl(10000, 21000, 0.14),
    parallax('treesL-tilt', grp('treesL'), 1.1, 'Tilt your device to slide the left trunk'),
    parallax('treesR-tilt', grp('treesR'), 1.1, 'Tilt your device to slide the right trunk'),
    tapSound('mama-hum', grp('mama'), 'Tap Mama Fox, the tall silhouette', [sfx('hum', 0.3, 2)], { anim: { preset: 'pulse', amount: 0.4 } }, { fx: burst(grp('mama'), 'hearts', 4) }),
    tapSound('tam-note', grp('tam'), 'Tap Tam, the small fox silhouette', [note('pluck', 'A4', 900, 0.7)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('tam'), 'hearts', 3) }),
    tapSound('dot-note', grp('dot'), 'Tap Dot, the fawn silhouette', [note('kalimba', 'E5', 900, 0.7)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('dot'), 'hearts', 3) }),
    tapSound('title-chord', grp('titleLetters'), 'Tap the title to strum a chord', [note('harp', 'A3', 1400, 0.7), wait(90), note('harp', 'E4', 1400, 0.6), wait(90), note('harp', 'A4', 1400, 0.5)], { anim: { preset: 'pulse', amount: 0.3 } }, { fx: null }),
    tapSound('sun-bell', grp('sun'), 'Tap the setting sun', [note('bell', 'A4', 1600, 0.4)], { anim: { preset: 'pulse', amount: 0.5 } }, { fx: burst(grp('sun'), 'sparkles', 5) }),
    tapSound('fireflies-gather', grp('fireflies'), 'Tap the fireflies and they gather', [note('glass', 'E5', 1200, 0.4), sfx('sparkle', 0.3)], { anim: { preset: 'glow', amount: 1.4 } }, { fx: burst(grp('fireflies'), 'fireflies', 10) }),
  ],
  a11y: { summary: 'Back cover: a sunset forest. Mama Fox, Tam and little Dot stand in silhouette between two big trunks.', instructions: 'Tap each silhouette to hear a note. Tap the title for a chord, tap the sun and the fireflies. The tune slows down and fades out by itself.' },
});

// plain JSON on purpose: no undefined fields, so the data survives a round trip through the Tela document / bundle unchanged
export const littleFoxLiving: LivingBook = JSON.parse(JSON.stringify({
  version: 1,
  bookId: 'little-fox-big-trees',
  pages: [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11],
  scores: SCORES,
  defaults: { musicGain: 0.5, sfxGain: 0.85, narrate: 'on-demand', ambient: true },
  authorNotes: 'Little Fox shows off: an alternating-tap rhythm game (page 3: every correct step plays the next note and scrolls three depths of trunks, scrubbed by the `walk` variable), tilt parallax between trunk layers, per-panel sounds and reveals (page 5), a hush page that ducks everything and leaves only crickets (page 4), a drag whose progress drives scenery, fireflies and the music tempo (page 8), plucked folk strings in A minor pentatonic, forest-wind ambience and a distant owl. Every interaction has a reduced-motion twin that keeps the sound and shows a still result. To remix: change the WALK_NOTES, the cues in SCORES, or the drag bounds on the gold path.',
}));
export default littleFoxLiving;
