// Release options — every music-release option the Album Creator offers, chosen here so the
// Creator opens with them set: visibility, draft, price/paywall/preview, schedule +
// announcement, rights, comments, Reello mirroring, Audius, early access, slideshow, links.

import React from 'react';
import { deskOf, type ReleaseOptions } from '../../../../../services/melos/beats/releaseDesk';
import { Panel, Field, Toggle, inputCls, selectCls, type BayProps } from './ui';

const SOCIAL = ['website', 'instagram', 'youtube', 'spotify', 'twitter'];

export const ReleaseBay: React.FC<BayProps> = ({ project, mutate }) => {
  const r: ReleaseOptions = project.desk?.release ?? {};
  const set = (fn: (o: ReleaseOptions) => void) => mutate((p) => { const d = deskOf(p); if (!d.release) d.release = {}; fn(d.release); });
  const link = (platform: string) => r.socialLinks?.find((l) => l.platform === platform)?.url ?? '';
  const setLink = (platform: string, url: string) => set((o) => {
    const rest = (o.socialLinks ?? []).filter((l) => l.platform !== platform);
    o.socialLinks = url ? [...rest, { platform, url }] : rest;
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Visibility">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Who can find it">
              <select className={selectCls} value={r.visibility ?? 'public'} onChange={(e) => set((o) => { o.visibility = e.target.value as ReleaseOptions['visibility']; })}>
                <option value="public">Public on Chora</option>
                <option value="private">Private — chats, groups and you</option>
                <option value="intimate">Intimate chats only</option>
              </select>
            </Field>
          </div>
          <Toggle on={!!r.draft} onChange={(v) => set((o) => { o.draft = v; })} label="Save as a draft" hint="Uploads everything but doesn't release it." />
          <Toggle on={r.allowComments !== false} onChange={(v) => set((o) => { o.allowComments = v; })} label="Allow comments" />
          <Toggle on={!!r.rightsConfirmed} onChange={(v) => set((o) => { o.rightsConfirmed = v; })} label="I own or have permission for everything on this release" hint="Including co-writers, featured performers, samples and covers. The Creator asks you to accept the Creator Agreement before it publishes." />
        </Panel>

        <Panel title="Price" hint="Music is free by default. Only you decide to charge for your own work.">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Album price (USD)">
              <input type="number" min={0} step={0.5} className={inputCls} value={r.price ?? 0} onChange={(e) => set((o) => { o.price = Math.max(0, Number(e.target.value) || 0); })} />
            </Field>
          </div>
          <Toggle on={!!r.isPaywalled} onChange={(v) => set((o) => { o.isPaywalled = v; })} label="Paywall the album" />
          <Toggle on={!!r.previewOnly} onChange={(v) => set((o) => { o.previewOnly = v; })} label="Non-buyers hear a 30 s preview" hint="Off: priced music still streams in full; buying means owning and downloading." />
        </Panel>

        <Panel title="Schedule">
          <Toggle on={!!r.scheduled} onChange={(v) => set((o) => { o.scheduled = v; })} label="Schedule the release" />
          {r.scheduled && (
            <div className="grid grid-cols-1 gap-2 mt-1">
              <Field label="Release at"><input type="datetime-local" className={inputCls} value={r.releaseDate ?? ''} onChange={(e) => set((o) => { o.releaseDate = e.target.value; })} /></Field>
              <Toggle on={!!r.announcement?.enabled} onChange={(v) => set((o) => { o.announcement = { enabled: v, message: o.announcement?.message ?? '' }; })} label="Announce it before it drops" />
              {r.announcement?.enabled && (
                <textarea className={`${inputCls} h-auto min-h-[54px] py-2`} placeholder="The message followers see" value={r.announcement.message} onChange={(e) => set((o) => { o.announcement = { enabled: true, message: e.target.value }; })} />
              )}
            </div>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Where it goes">
          <Toggle on={r.publishVideosToGallery ?? false} onChange={(v) => set((o) => { o.publishVideosToGallery = v; })} label="Mirror the album's videos to Reello" hint="Videos marked “Reello” in Media are uploaded there either way." />
          <Toggle on={!!r.publishToAudius} onChange={(v) => set((o) => { o.publishToAudius = v; })} label="Also publish to Audius" hint="Needs your Audius account connected (Publish bay)." />
          {r.publishToAudius && (
            <Field label="Audius handle" className="mt-1"><input className={inputCls} value={r.audiusHandle ?? ''} placeholder="@handle" onChange={(e) => set((o) => { o.audiusHandle = e.target.value; })} /></Field>
          )}
          <Toggle on={!!r.earlyAccessEnabled} onChange={(v) => set((o) => { o.earlyAccessEnabled = v; })} label="Early access" hint="Review codes and the early list are managed in the Creator." />
          <Toggle on={!!r.slideshowEnabled} onChange={(v) => set((o) => { o.slideshowEnabled = v; })} label="Show the photo slideshow instead of the visualizer" />
        </Panel>

        <Panel title="Links & live">
          <div className="grid grid-cols-1 gap-2">
            {SOCIAL.map((s) => (
              <Field key={s} label={s}><input className={inputCls} value={link(s)} placeholder="https://" onChange={(e) => setLink(s, e.target.value)} /></Field>
            ))}
            <Field label="Album live feed URL"><input className={inputCls} value={r.liveFeedUrl ?? ''} onChange={(e) => set((o) => { o.liveFeedUrl = e.target.value; })} /></Field>
            <Field label="Donation goal (USD)"><input type="number" min={0} className={inputCls} value={r.donationGoal ?? ''} onChange={(e) => set((o) => { o.donationGoal = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)); })} /></Field>
          </div>
        </Panel>
      </div>
    </div>
  );
};
