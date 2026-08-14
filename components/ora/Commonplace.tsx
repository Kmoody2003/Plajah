import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Search, Link2 } from 'lucide-react';
import { Button, IconButton, Surface, Eyebrow, Textarea, Chip } from '../ui';
import { listNotes, saveNote, removeNote, searchNotes, tagCloud, parseTags, type OraNote } from '../../services/oraNotes';

/**
 * Ora — Commonplace. The notes surface.
 *
 * Capture is one field on purpose: a note you have to file is a note you do not
 * write. Tags are parsed out of the text itself (#idea), so there is nothing to
 * fill in before the thought is saved.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md
 */

export const Commonplace: React.FC = () => {
  const [notes, setNotes] = useState<OraNote[]>([]);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setNotes(await listNotes()); }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    await saveNote({ text: draft });
    setDraft('');
    await load();
    setBusy(false);
  };

  const remove = async (id: string) => {
    await removeNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const tags = useMemo(() => tagCloud(notes), [notes]);
  const shown = useMemo(() => {
    const bySearch = searchNotes(notes, q);
    return tag ? bySearch.filter((n) => n.tags.includes(tag)) : bySearch;
  }, [notes, q, tag]);

  const draftTags = parseTags(draft);

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <div>
        <Eyebrow>Commonplace</Eyebrow>
        <p className="type-body-sm" style={{ margin: 'var(--pj-space-2) 0 0', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
          Anything worth keeping. Write <code>#tag</code> anywhere in a note and it files itself.
          {/* Said plainly rather than implied: notes are not the journal, and they
              are not encrypted, because they are meant to be searched. */}
          {' '}Unlike your journal, notes are not encrypted — they are built to be searched.
        </p>
      </div>

      <Surface level={2} shape="sheet">
        <Textarea
          placeholder="A thought, a lyric, a reference…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter saves — capture should never need the mouse.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); }
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-2)', marginTop: 'var(--pj-space-3)', flexWrap: 'wrap' }}>
          {draftTags.map((t) => <Chip key={t} selected>#{t}</Chip>)}
          <span style={{ flex: 1 }} />
          <Button variant="primary" icon={<Plus />} loading={busy} onClick={submit} disabled={!draft.trim()}>
            Keep it
          </Button>
        </div>
      </Surface>

      {notes.length > 0 && (
        <>
          <div className="pj-row">
            <Search size={16} style={{ color: 'var(--on-surface-variant)', flex: 'none' }} />
            <input
              className="pj-input"
              placeholder="Search your notes"
              aria-label="Search notes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)' }}>
              <Chip interactive selected={tag === null} onClick={() => setTag(null)}>All</Chip>
              {tags.slice(0, 12).map(({ tag: t, count }) => (
                <Chip key={t} interactive selected={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  #{t} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      {shown.map((n) => (
        <Surface key={n.id} level={1}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pj-space-3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {n.attachedTo && (
                <p className="type-label-md" style={{ margin: '0 0 6px', color: 'var(--pj-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={12} /> {n.attachedTo.label}
                </p>
              )}
              <p className="type-body-md" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{n.text}</p>
            </div>
            <IconButton variant="ghost" size="sm" aria-label="Delete note" onClick={() => remove(n.id)}>
              <Trash2 />
            </IconButton>
          </div>
        </Surface>
      ))}

      {notes.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          Nothing kept yet.
        </p>
      )}
      {notes.length > 0 && shown.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center' }}>
          No notes match that.
        </p>
      )}
    </div>
  );
};

export default Commonplace;
