import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { COUNCIL_DIRECTORS } from '../../services/council/councilDirectors';
import { GAME_COUNCIL_SPECIALISTS, gameCouncilCanonBrief } from '../../services/game/council/gameCouncilService';
import { MOTION_PERSONAS } from '../../services/motion/council/motionCouncilPersonas';
import { MUSIC_PERSONAS } from '../../services/melos/council/musicCouncilPersonas';
import { ensureLocalLane, localLane, localHealth, stopLocalLane } from '../council/localLane';

// Local production review. Never modifies shared council profiles or production data.
// This text lane receives the audit and source excerpts, not image pixels.
const destination = 'docs/halloween-council';
mkdirSync(destination, { recursive: true });
const audit = readFileSync('docs/halloween-ravencrest-art-assessment.md', 'utf8');
const source = readFileSync('components/taleo/HauntedCastleExhibition.tsx', 'utf8');
const audio = readFileSync('services/halloween/halloweenAudioSfx.ts', 'utf8');
const brief = `The user requires a nearly 1:1 playable reconstruction of Ravencrest artwork, including matching player and monster appearance. The chosen authority is creation_3752884032.png: residential castle, five levels (basement, ground grand hall, queen's floor, king's floor, observatory). Do not substitute the courtyard fortress plan. Browser delivery required. Give concrete implementation priorities, one disagreement/tradeoff, asset requirements, and measurable visual/playability acceptance gates. Do not claim any completed work or visual verification. You have a source audit, NOT image pixels.\n\n${audit.slice(0, 3800)}`;
const councils = [
  ['art', COUNCIL_DIRECTORS, source.slice(1080, 4500)],
  ['interactive-game', GAME_COUNCIL_SPECIALISTS, source.slice(source.indexOf('const resolvePlayerCollisions'), source.indexOf('const resolvePlayerCollisions') + 6500)],
  ['animation', MOTION_PERSONAS, source.slice(source.indexOf('const applyBoneDeltaEuler'), source.indexOf('const applyBoneDeltaEuler') + 5500)],
  ['music', MUSIC_PERSONAS, audio.slice(0, 11000)],
] as const;

try {
  await ensureLocalLane();
  const health = await localHealth();
  for (const [name, roster, evidence] of councils) {
    console.log(`Reviewing ${name} council`);
    const roles = Object.values(roster).map((member: any) => ({
      name: member.personaName || member.name,
      focus: member.specialty || member.medium || member.lens,
      protects: member.protects,
    }));
    let response = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        response = await localLane(
          `You are the ${name} production council. Use these actual project member roles: ${JSON.stringify(roles).slice(0, 2400)}. Return a concise actionable production review, not promotional copy. Admit missing evidence.`,
          `${name === 'interactive-game' ? `${gameCouncilCanonBrief()}\n\n` : ''}${brief}\n\nRelevant source excerpt:\n${evidence.slice(0, 1600)}`,
          600,
        );
        break;
      } catch (error) {
        if (!String(error).includes('thermal pause') || attempt === 9) throw error;
        console.log(`${name}: waiting 20 seconds for the existing thermal guard`);
        await new Promise(resolve => setTimeout(resolve, 20000));
      }
    }
    writeFileSync(`${destination}/${name}.json`, JSON.stringify({ council: name, source: 'local-model', visualInput: false, model: health?.model ?? null, authoritativePlan: 'creation_3752884032.png', review: response }, null, 2));
    console.log(`Saved ${name} review`);
  }
} finally {
  stopLocalLane();
}
