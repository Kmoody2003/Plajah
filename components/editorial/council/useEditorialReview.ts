import { useCallback, useState } from 'react';
import { editorialService, type ReviewOptions } from '../../../services/editorial/council/editorialService';
import type { DecisionChoice, EditorialSession, ManuscriptInput, Note } from '../../../services/editorial/council/editorialTypes';

/** Owns one reading: run it, record decisions, send pushback. Errors are shown in words, never thrown at the page. */
export function useEditorialReview() {
  const [session, setSession] = useState<EditorialSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (input: ManuscriptInput, opts: ReviewOptions) => {
    setBusy(true); setError('');
    try { const s = await editorialService.review(input, opts); setSession(s); return s; }
    catch (e: any) { setError(e?.message || 'The editors could not read this just now.'); return null; }
    finally { setBusy(false); }
  }, []);
  const decide = useCallback(async (n: Note, c: DecisionChoice, why?: string) => {
    if (!session) return; setBusy(true);
    try { setSession(await editorialService.decide(session, n.id, c, why)); } catch (e: any) { setError(e?.message || 'Could not save your decision.'); } finally { setBusy(false); }
  }, [session]);
  const reply = useCallback(async (n: Note, text: string) => {
    if (!session) return; setBusy(true);
    try { setSession(await editorialService.reply(session, text, n.id)); } catch (e: any) { setError(e?.message || 'Could not send your reply.'); } finally { setBusy(false); }
  }, [session]);
  return { session, setSession, busy, error, run, decide, reply };
}
