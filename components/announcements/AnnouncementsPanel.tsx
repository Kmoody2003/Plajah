// AnnouncementsPanel — the announcements stream for a class or a whole org, with the composer for
// people who may post. Works for any org type; the host decides who can post and who it reaches.
import React, { useCallback, useEffect, useState } from 'react';
import {
  listClassAnnouncements, listOrgAnnouncements, ANNOUNCEMENTS_CHANGED, type Announcement,
} from '../../services/announcements/announcementService';
import AnnouncementComposer, { takeComposerDraft, type AudienceOption, type ComposerDraft } from './AnnouncementComposer';
import AnnouncementCard from './AnnouncementCard';
import { AN_CSS } from './anStyles';

export type { AudienceOption } from './AnnouncementComposer';

export default function AnnouncementsPanel({ orgId, orgName, programId, programName, viewer, authorRole, canPost, canManage, asStaff, audiences, title = 'Announcements', compact, returnLabel }: {
  orgId: string; orgName: string;
  /** Set for a class stream; omit for the org-wide stream. */
  programId?: string; programName?: string;
  viewer: { uid: string; name: string };
  authorRole?: string;
  canPost: boolean;
  canManage?: boolean;
  /** Org-wide: staff see every members-only announcement. */
  asStaff?: boolean;
  /** Where a new announcement can go (first is the default). */
  audiences: AudienceOption[];
  title?: string;
  /** Show only the newest few with a "show all" toggle. */
  compact?: boolean;
  returnLabel?: string;
}) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<ComposerDraft | null>(null);
  const [all, setAll] = useState(!compact);

  const load = useCallback(() => {
    const p = programId ? listClassAnnouncements(orgId, programId) : listOrgAnnouncements(orgId, { uid: viewer.uid, asStaff });
    void p.then(setItems);
  }, [orgId, programId, viewer.uid, asStaff]);

  useEffect(() => {
    load();
    window.addEventListener(ANNOUNCEMENTS_CHANGED, load);
    return () => window.removeEventListener(ANNOUNCEMENTS_CHANGED, load);
  }, [load]);

  // Back from "Customize in Tela": reopen the composer with the edited flyer.
  useEffect(() => {
    if (!canPost) return;
    const d = takeComposerDraft(orgId, programId);
    if (d) { setDraft(d); setComposing(true); }
  }, [canPost, orgId, programId]);

  const shown = items ? (all ? items : items.slice(0, 2)) : [];
  return (
    <section className="ce an" aria-label={title}>
      <style>{AN_CSS}</style>
      <div className="row wrap">
        <h3 className="grow" style={{ fontSize: '1rem', fontWeight: 900 }}>{title}</h3>
        {canPost && <button type="button" className="btn p sm" onClick={() => { setDraft(null); setComposing(true); }}>+ Announcement</button>}
      </div>
      {items === null && <p className="small">Loading…</p>}
      {items && !items.length && (
        <div className="card">
          <div className="t">{canPost ? 'Nothing posted yet' : 'No announcements yet'}</div>
          <div className="u">{canPost ? 'Post an update, a themed flyer or a one-page newsletter. Add a poll or a short survey to any of them.' : 'When your teachers or leaders post something, it shows up here.'}</div>
        </div>
      )}
      {shown.map(a => <AnnouncementCard key={a.id} a={a} viewer={viewer} canManage={!!canManage} returnLabel={returnLabel || programName} />)}
      {items && compact && items.length > 2 && <button type="button" className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
      {composing && (
        <AnnouncementComposer orgId={orgId} orgName={orgName} viewer={viewer} authorRole={authorRole} audiences={audiences} draft={draft} returnLabel={returnLabel || programName || title}
          onClose={() => { setComposing(false); setDraft(null); }} onPosted={() => load()} />
      )}
    </section>
  );
}
