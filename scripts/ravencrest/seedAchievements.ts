/**
 * Seeds Ravencrest's achievements into the platform catalog (achievements/{id}) so the game's unlocks
 * work for everyone: Troll Slayer, Dracula Slain, Curse Breaker. The catalog is admin-write, so a
 * normal player's client can't create them on first unlock — run this once as a Plajah admin.
 *
 *   PLAJAH_AGENT_EMAIL=you@email.com PLAJAH_AGENT_PASSWORD=xxx npx tsx scripts/ravencrest/seedAchievements.ts
 *
 * Doc ids are the trigger strings (stable; re-running updates them in place).
 */
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { BASE_ACHIEVEMENTS } from '../../services/achievementService';

async function main() {
  const email = process.env.PLAJAH_AGENT_EMAIL, password = process.env.PLAJAH_AGENT_PASSWORD;
  if (!email || !password) { console.error('Set PLAJAH_AGENT_EMAIL and PLAJAH_AGENT_PASSWORD.'); process.exit(1); }
  await signInWithEmailAndPassword(auth, email, password);
  const now = Date.now();
  for (const a of BASE_ACHIEVEMENTS.filter((x) => x.triggerType.startsWith('RAVENCREST_'))) {
    await setDoc(doc(db, 'achievements', a.triggerType), { ...a, id: a.triggerType, createdAt: now, updatedAt: now }, { merge: true });
    console.log('[achievements] seeded', a.triggerType, '—', a.title);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
