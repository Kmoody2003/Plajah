import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';

/**
 * "Make & present" — the creative tools that suit a classroom, and ONLY those. The social,
 * entertainment and shopping parts of Plajah are not here, so a student opening this row sees a
 * workshop, not a feed. A teacher can switch tools off for their students ("Choose tools"); the
 * choice is saved per teacher and applied wherever this row appears.
 *
 * Each tool opens an existing Plajah studio; nothing here is a demo.
 */
interface Tool { id: string; label: string; blurb: string; emoji: string; accent: string; view?: string; event?: string }

export const MEDIA_TOOLS: Tool[] = [
  { id: 'tela', label: 'Tela', blurb: 'Documents, worksheets, posters and slides', emoji: '📄', accent: '#FF8C00', view: 'TELA' },
  { id: 'lorea', label: 'Lorea', blurb: 'Read free classics. Write and publish books', emoji: '📖', accent: '#D40055', view: 'BOOKS' },
  { id: 'fabula', label: 'Fabula', blurb: 'Edit a film, a newscast or a documentary', emoji: '🎬', accent: '#e23b6d', event: 'OPEN_FABULA' },
  { id: 'melos', label: 'Melos', blurb: 'Compose, record and arrange music', emoji: '🎹', accent: '#FFD24A', view: 'MELOS' },
  { id: 'pixels', label: 'Pixels', blurb: 'Visuals, animation and shader art', emoji: '✨', accent: '#7a2bd6', event: 'OPEN_PLAJAH_PIXELS' },
  { id: 'podcast', label: 'Podcast Studio', blurb: 'Record, edit and publish a show', emoji: '🎙️', accent: '#06D6A0', view: 'PODCAST_STUDIO' },
  { id: 'photo', label: 'Photo Studio', blurb: 'Photography, galleries and art history', emoji: '📷', accent: '#36c5f0', view: 'GLOBAL_PHOTOS' },
  { id: 'comic', label: 'Comics', blurb: 'Draw and lay out comics and manga', emoji: '💥', accent: '#FF6FA8', view: 'COMIC' },
];

const KEY = (uid?: string) => `plajah:classroomTools:${uid || 'anon'}`;
export function loadHiddenTools(uid?: string): string[] { try { return JSON.parse(localStorage.getItem(KEY(uid)) || '[]'); } catch { return []; } }
function saveHiddenTools(uid: string | undefined, hidden: string[]) { try { localStorage.setItem(KEY(uid), JSON.stringify(hidden)); } catch { /* private mode */ } }

interface Props {
  /** Whose preference to read. For a teacher this is their own uid; students use their teacher's if known. */
  prefsUid?: string;
  /** Teachers get the "Choose tools" switch. */
  canCustomize?: boolean;
  title?: string;
  onNavigate: (view: string) => void;
}

const MediaToolsRow: React.FC<Props> = ({ prefsUid, canCustomize, title = 'Make & present', onNavigate }) => {
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenTools(prefsUid));
  const [editing, setEditing] = useState(false);
  useEffect(() => { setHidden(loadHiddenTools(prefsUid)); }, [prefsUid]);

  const toggle = (id: string) => { const next = hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id]; setHidden(next); saveHiddenTools(prefsUid, next); };
  const launch = (t: Tool) => {
    if (t.event) { try { window.dispatchEvent(new CustomEvent(t.event)); } catch { /* */ } return; }
    if (t.view) onNavigate(t.view);
  };
  const visible = editing ? MEDIA_TOOLS : MEDIA_TOOLS.filter(t => !hidden.includes(t.id));

  return (
    <section className="mb-9" aria-label={title}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Studios</p>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="text-[12px] text-white/50">Creative tools for projects, presentations and portfolios. No feeds, no shopping.</p>
        </div>
        {canCustomize && (
          <button type="button" onClick={() => setEditing(e => !e)} aria-pressed={editing}
            className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3.5 py-2 hover:bg-white/10 inline-flex items-center gap-1.5 whitespace-nowrap">
            {editing ? <><Check size={13} /> Done</> : <><SlidersHorizontal size={13} /> Choose tools</>}
          </button>
        )}
      </div>
      {editing && <p className="text-[12px] text-white/55 mb-3">Tap a tool to show or hide it for your students.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {visible.map(t => {
          const off = hidden.includes(t.id);
          return (
            <button key={t.id} type="button" onClick={() => (editing ? toggle(t.id) : launch(t))} aria-pressed={editing ? !off : undefined}
              className={`text-left rounded-2xl border p-4 transition-all ${off ? 'opacity-40 border-dashed border-white/20' : 'border-white/10 hover:-translate-y-0.5 hover:border-white/25'}`}
              style={{ background: `linear-gradient(155deg, ${t.accent}22, rgba(255,255,255,0.02) 70%)` }}>
              <span className="text-2xl">{t.emoji}</span>
              <p className="font-black mt-1.5 leading-tight">{t.label}</p>
              <p className="text-[11px] text-white/55 leading-snug mt-0.5 line-clamp-2">{t.blurb}</p>
              {editing && <p className="text-[10px] font-black uppercase tracking-wider mt-2" style={{ color: off ? '#94a3b8' : t.accent }}>{off ? 'Hidden' : 'Shown'}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default MediaToolsRow;
