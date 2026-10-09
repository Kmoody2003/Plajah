// EditorialCouncilPanel — the compact way in. One button, "Ask the editors", then the report inline. The full room
// (pick editors, scope, highlights, archive) opens from "Open the full room". Mounted in the ebook submission
// Check step, the book authoring toolbar and the article desk.
import React, { useState } from 'react';
import EditorialCouncilRoom from './EditorialCouncilRoom';
import EditorialReportView, { ACCENT } from './EditorialReportView';
import { useEditorialReview } from './useEditorialReview';
import { NOT_LEGAL_ADVICE, type Anchor, type ManuscriptInput } from '../../../services/editorial/council/editorialTypes';

interface Props { getManuscript: () => ManuscriptInput; selection?: string; onJump?: (a: Anchor) => void; /** label for the primary button */ label?: string; /** start with the full room open */ startOpen?: boolean }

export default function EditorialCouncilPanel({ getManuscript, selection, onJump, label = 'Ask the editors', startOpen = false }: Props) {
  const { session, busy, error, run, decide, reply } = useEditorialReview();
  const [room, setRoom] = useState(startOpen);
  if (room) return <div><EditorialCouncilRoom getManuscript={getManuscript} selection={selection} onJump={onJump} onClose={() => setRoom(false)} /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={() => void run(getManuscript(), { depth: 'QUICK' })} style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, fontWeight: 800, background: ACCENT, color: '#04140E', border: 'none', cursor: 'pointer' }}>{busy ? 'The editors are reading...' : label}</button>
        <button type="button" onClick={() => setRoom(true)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, fontWeight: 700, background: 'transparent', color: 'inherit', border: `1px solid ${ACCENT}`, cursor: 'pointer' }}>Open the full room</button>
      </div>
      <p style={{ margin: 0, fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>Honest, kind guidance from AI editors: options for you to accept, adapt or decline. Not a human editor. {NOT_LEGAL_ADVICE}</p>
      {error && <p role="alert" style={{ color: '#FF8A7A', fontSize: 13, margin: 0 }}>{error}</p>}
      {session && <EditorialReportView compact session={session} onDecide={decide} onReply={reply} onJump={onJump} busy={busy} />}
    </div>
  );
}
