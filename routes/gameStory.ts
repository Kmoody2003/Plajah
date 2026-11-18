// POST /api/gamestudio/breakdown — Story Intelligence turns a story (typed idea, pasted chapter, script)
// into a Game Story breakdown through the Gemini lane. Signed-in users only; the answer is repaired and
// validated by services/gamestudio/story/prompt.ts before it goes back. Nothing is saved here: the Studio
// keeps the breakdown with the project.

import { Router, Request } from 'express';
import { verifyIdToken } from '../services/firebaseAdminRest';
import { geminiConfigured, geminiGenerate, laneModel } from '../services/ai/geminiLane';
import { breakdownPrompt, MAX_STORY_CHARS, parseBreakdown } from '../services/gamestudio/story/prompt';
import type { TemplateId } from '../services/gamestudio/schema';

const TEMPLATES = ['auto', 'arena-shooter', 'racer', 'fighter', 'platformer', 'adventure', 'picture-walk', 'party'];

export interface GameStoryDeps {
  callerUid?: (req: Request) => Promise<string | null>;
  generate?: (system: string, user: string) => Promise<string>;
}

export function createGameStoryRouter(deps: GameStoryDeps = {}): Router {
  const caller = deps.callerUid || (async (req: Request) => {
    const a = req.headers.authorization;
    return a?.startsWith('Bearer ') ? verifyIdToken(a.slice(7)) : null;
  });
  const generate = deps.generate || (async (system: string, user: string) => (await geminiGenerate({
    model: laneModel('GAME_STORY_MODEL'), system, contents: user, json: true, maxTokens: 8000, temperature: 0.4, timeoutMs: 120_000,
  })).text);
  const r = Router();

  r.post('/breakdown', async (req, res) => {
    const uid = await caller(req).catch(() => null);
    if (!uid) return res.status(401).json({ error: 'Sign in to use Story Intelligence.' });
    if (!deps.generate && !geminiConfigured()) return res.status(503).json({ error: 'The cloud assistant is not configured yet. You can still write a breakdown by hand.' });
    const text = String(req.body?.text ?? '').trim();
    const template = TEMPLATES.includes(req.body?.template) ? req.body.template as TemplateId | 'auto' : 'auto';
    if (text.length < 20) return res.status(400).json({ error: 'Give Story Intelligence a little more story to work with.' });
    if (text.length > MAX_STORY_CHARS) return res.status(413).json({ error: `Stories up to ${MAX_STORY_CHARS.toLocaleString()} characters for now.` });
    try {
      const { system, user } = breakdownPrompt(text, template);
      const answer = await generate(system, user);
      const out = parseBreakdown(answer, { kind: 'idea' });
      if (!out.story) return res.status(422).json({ error: 'Story Intelligence could not shape that into a game. Try again or add more detail.', details: out.errors.slice(0, 8) });
      res.json({ story: out.story, repairs: out.repairs });
    } catch (e: any) {
      res.status(502).json({ error: 'Story Intelligence is busy. Try again in a moment.', detail: String(e?.message ?? e).slice(0, 200) });
    }
  });

  return r;
}
