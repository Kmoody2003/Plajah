// castRigSpecs.ts — how each Ravencrest cast member's VTuber build (public/games/ravencrest/assets/
// vtuber/<model>.vrm) was made, so any of them can be rebuilt exactly:
//   const L = await import('/components/taleo/dev/vtuberRigLab.ts');
//   for (const s of CAST_RIG_SPECS) await L.build(s.model, s.name, s.opts);
// Auto = MediaPipe found the face on its own. Hand = marks placed on the FRONT_VIEW render
// (L.frontShot(model)), because the tracker can't read that face (or read it wrong).

import type { BuildOptions } from './buildVtuberRig';

export const CAST_RIG_SPECS: Array<{ model: string; name: string; opts: BuildOptions }> = [
  { model: 'jack_thorne', name: 'Jack Thorne', opts: {} },
  { model: 'elise', name: 'Elise Carter', opts: {} },
  { model: 'miriam', name: 'Wicked Witch Miriam', opts: {} },
  { model: 'crane', name: 'Robo-Bones', opts: {} },
  { model: 'ghost', name: 'Ghost', opts: {} },
  { model: 'dracula', name: 'Count Dracula', opts: {} },
  { model: 'halo_angel', name: 'Halo Angel', opts: {} },
  // Carved pumpkin: keeps its glowing carved eyes and grin (no eyeballs/teeth); the grin opens.
  {
    model: 'melvin', name: 'Pumpkin Patch (Melvin)',
    opts: { eyes: false, mouth: false, marks: { 33: [252, 395], 133: [340, 445], 159: [295, 392], 145: [300, 455], 263: [545, 395], 362: [450, 445], 386: [500, 394], 374: [495, 450], 1: [395, 500], 61: [232, 520], 291: [572, 515], 13: [395, 575], 14: [395, 610], 152: [395, 690] } },
  },
  // Auto fit landed off the burlap face.
  {
    model: 'stitch', name: 'Stitch',
    opts: { eyes: false, mouth: false, marks: { 33: [268, 340], 133: [322, 352], 159: [295, 330], 145: [295, 362], 263: [470, 338], 362: [415, 352], 386: [442, 330], 374: [442, 362], 1: [385, 410], 61: [315, 475], 291: [455, 470], 13: [385, 470], 14: [385, 495], 152: [385, 560] } },
  },
  // Head turned in the rest pose; keeps its own red eyes and fangs.
  {
    model: 'vampire', name: 'Vampire',
    opts: { eyes: false, mouth: false, marks: { 33: [322, 360], 133: [352, 372], 159: [338, 357], 145: [338, 373], 263: [442, 385], 362: [412, 393], 386: [428, 382], 374: [428, 398], 1: [378, 435], 61: [318, 482], 291: [378, 488], 13: [348, 478], 14: [350, 500], 152: [350, 540] } },
  },
  {
    model: 'werewolf', name: 'Werewolf',
    opts: { eyes: false, mouth: false, marks: { 33: [312, 365], 133: [348, 378], 159: [330, 362], 145: [330, 378], 263: [455, 365], 362: [420, 378], 386: [437, 364], 374: [437, 380], 1: [385, 432], 61: [345, 495], 291: [440, 490], 13: [390, 478], 14: [390, 530], 152: [390, 560] } },
  },
  {
    model: 'zombie', name: 'Zombie',
    opts: { eyes: false, mouth: false, marks: { 33: [205, 392], 133: [250, 395], 159: [228, 380], 145: [230, 402], 263: [340, 335], 362: [300, 348], 386: [322, 330], 374: [322, 352], 1: [285, 420], 61: [255, 455], 291: [345, 470], 13: [300, 455], 14: [305, 480], 152: [320, 520] } },
  },
  // Trunk-like nose hangs below the mouth, so no nose/chin marks.
  {
    model: 'bridge_troll', name: 'Bridge Troll',
    opts: { eyes: false, mouth: false, marks: { 33: [185, 390], 133: [225, 403], 159: [205, 385], 145: [205, 405], 263: [378, 390], 362: [338, 403], 386: [358, 385], 374: [358, 405], 61: [225, 560], 291: [400, 560], 13: [330, 560], 14: [330, 572] } },
  },
];
