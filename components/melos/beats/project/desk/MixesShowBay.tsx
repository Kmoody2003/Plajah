// Chora Mixes versions + Show Mode.
//
// A Mix version is the album re-pressed as ONE continuous programme — its own running order and
// crossfade — and published as a Chora Mix (an Album with subType MIX, the cue sheet built from
// the album clock so every song is a marker in the mix). Show Mode is how the album opens on
// the fullscreen stage: the mode, the countdown, the opening song, lyrics, the call to action.

import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Disc3, Download, UploadCloud, ExternalLink } from 'lucide-react';
import {
  albumLayout, renderAlbumContinuous, seedAlbumCreator, setCrossfade, type MasterProjectDoc,
} from '../../../../../services/melos/beats/masterProject';
import { deskOf, deskUid, type MixVersion, type MixVersionKind, type ShowSetup } from '../../../../../services/melos/beats/releaseDesk';
import type { MasteringState } from '../../../../../services/melos/beats/fx/mastering';
import { downloadBlob } from '../../../../../services/melos/beats/render';
import { buildShowUrl } from '../../../../../services/deepLinkService';
import { Panel, Field, Toggle, inputCls, selectCls, btnCls, SERIF, type BayProps } from './ui';

const KIND_DEFAULTS: Record<MixVersionKind, { label: string; crossfade: number }> = {
  continuous: { label: 'Continuous album mix', crossfade: 3 },
  dj: { label: 'DJ mix', crossfade: 12 },
  extended: { label: 'Extended mix', crossfade: 8 },
  radio: { label: 'Radio sequence', crossfade: 1.5 },
  instrumental: { label: 'Instrumental mix', crossfade: 4 },
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A throwaway project in the version's order with the version's crossfades — the album untouched. */
function versionProject(project: MasterProjectDoc, v: MixVersion): MasterProjectDoc {
  const clone: MasterProjectDoc = JSON.parse(JSON.stringify(project));
  const order = v.trackIds.length ? v.trackIds : project.tracks.map((t) => t.id);
  clone.tracks = order.map((id) => clone.tracks.find((t) => t.id === id)).filter(Boolean) as MasterProjectDoc['tracks'];
  if (v.crossfadeSec > 0) for (let i = 0; i < clone.tracks.length - 1; i++) setCrossfade(clone, i, v.crossfadeSec);
  return clone;
}

export const MixesShowBay: React.FC<BayProps & { albumPressing: MasteringState | null }> = ({ project, mutate, albumPressing, productionId }) => {
  const mixes = project.desk?.mixes ?? [];
  const show: ShowSetup = project.desk?.show ?? { mode: 'DEFAULT', countdown: true, showLyrics: true };
  const [busy, setBusy] = useState<Record<string, string>>({});
  const setMix = (id: string, fn: (m: MixVersion) => void) => mutate((p) => { const m = deskOf(p).mixes?.find((x) => x.id === id); if (m) fn(m); });
  const setShow = (fn: (s: ShowSetup) => void) => mutate((p) => { const d = deskOf(p); if (!d.show) d.show = { mode: 'DEFAULT', countdown: true, showLyrics: true }; fn(d.show); });
  const albumId = project.desk?.publish?.choraAlbumId;

  const addMix = (kind: MixVersionKind) => mutate((p) => {
    const d = deskOf(p);
    d.mixes = [...(d.mixes ?? []), { id: deskUid(), name: KIND_DEFAULTS[kind].label, kind, trackIds: p.tracks.map((t) => t.id), crossfadeSec: KIND_DEFAULTS[kind].crossfade }];
  });

  const render = async (v: MixVersion, then: 'download' | 'publish') => {
    setBusy((b) => ({ ...b, [v.id]: 'Pressing the mix…' }));
    try {
      const vp = versionProject(project, v);
      const res = await renderAlbumContinuous(vp, albumPressing, { bitDepth: 24 });
      if (!res) { setBusy((b) => ({ ...b, [v.id]: 'Nothing to press' })); return; }
      const name = `${project.publishing.title || 'Album'} — ${v.name}`;
      if (then === 'download') { downloadBlob(res.blob, `${name}.wav`); return; }
      const layout = albumLayout(vp);
      const artist = project.publishing.artist;
      // One file, every song a cue — the MIX shape (tracks[0] is the master).
      const master = { ...vp.tracks[0], id: `mix_${v.id}`, title: name, lyrics: undefined, timeCodedLyrics: undefined };
      seedAlbumCreator(vp, { files: [{ track: master, blob: res.blob, filename: `${name}.wav` }], failed: [] }, {
        prodId: productionId,
        mix: { name: v.name, durationSec: res.seconds, cueSheet: layout.tracks.map((l) => ({ id: l.track.id, time: +l.startSec.toFixed(2), title: l.track.title, artist })) },
      });
    } finally { setBusy((b) => { const n = { ...b }; delete n[v.id]; return n; }); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4">
      <Panel title="Chora Mixes" hint="Each version publishes as its own Chora Mix — one continuous file with every song as a cue point — and leaves the album untouched."
        right={
          <select className="h-7 rounded-lg bg-black/40 border border-white/12 text-[10.5px] text-white/80 px-2" value="" onChange={(e) => { if (e.target.value) addMix(e.target.value as MixVersionKind); }} aria-label="Add a mix version">
            <option value="">+ New version…</option>
            {(Object.keys(KIND_DEFAULTS) as MixVersionKind[]).map((k) => <option key={k} value={k}>{KIND_DEFAULTS[k].label}</option>)}
          </select>
        }>
        {!mixes.length && <p className="text-[11px] text-white/35">No versions yet. A continuous album mix is a good first one.</p>}
        <div className="space-y-3">
          {mixes.map((v) => {
            const order = v.trackIds.length ? v.trackIds : project.tracks.map((t) => t.id);
            const length = albumLayout(versionProject(project, v)).totalSec;
            return (
              <div key={v.id} className="rounded-[10px] border border-white/10 p-2.5">
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
                  <input className={inputCls} value={v.name} onChange={(e) => setMix(v.id, (m) => { m.name = e.target.value; })} aria-label="Mix name" />
                  <span className="font-mono text-[10px] text-white/45 px-1">{fmt(length)}</span>
                  <button onClick={() => mutate((p) => { const d = deskOf(p); d.mixes = (d.mixes ?? []).filter((m) => m.id !== v.id); })} className="w-7 h-7 grid place-items-center text-white/30 hover:text-[#EF4444]" aria-label={`Delete ${v.name}`}><Trash2 size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Field label="Kind">
                    <select className={selectCls} value={v.kind} onChange={(e) => setMix(v.id, (m) => { m.kind = e.target.value as MixVersionKind; })}>
                      {(Object.keys(KIND_DEFAULTS) as MixVersionKind[]).map((k) => <option key={k} value={k}>{KIND_DEFAULTS[k].label}</option>)}
                    </select>
                  </Field>
                  <Field label={`Crossfade · ${v.crossfadeSec > 0 ? `${v.crossfadeSec.toFixed(1)} s` : 'album transitions'}`}>
                    <input type="range" min={0} max={20} step={0.5} value={v.crossfadeSec} onChange={(e) => setMix(v.id, (m) => { m.crossfadeSec = Number(e.target.value); })} className="w-full accent-[#D40055] mt-2" />
                  </Field>
                </div>
                <ol className="mt-2 space-y-0.5">
                  {project.tracks.map((t) => {
                    const pos = order.indexOf(t.id);
                    const on = pos >= 0;
                    return { t, pos, on };
                  }).sort((a, b) => (a.on === b.on ? (a.on ? a.pos - b.pos : 0) : a.on ? -1 : 1)).map(({ t, pos, on }) => (
                    <li key={t.id} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)' }}>
                      <input type="checkbox" checked={on} className="accent-[#D40055]" onChange={(e) => setMix(v.id, (m) => {
                        const base = m.trackIds.length ? m.trackIds : project.tracks.map((x) => x.id);
                        m.trackIds = e.target.checked ? [...base, t.id] : base.filter((x) => x !== t.id);
                      })} aria-label={`Include ${t.title}`} />
                      <span className="font-mono w-4 text-white/30">{on ? pos + 1 : '–'}</span>
                      <span className="flex-1 truncate">{t.title}</span>
                      {on && (
                        <>
                          <button disabled={pos === 0} onClick={() => setMix(v.id, (m) => { const a = [...order]; [a[pos - 1], a[pos]] = [a[pos], a[pos - 1]]; m.trackIds = a; })} className="text-white/30 hover:text-white disabled:opacity-20" aria-label="Earlier"><ChevronUp size={12} /></button>
                          <button disabled={pos === order.length - 1} onClick={() => setMix(v.id, (m) => { const a = [...order]; [a[pos + 1], a[pos]] = [a[pos], a[pos + 1]]; m.trackIds = a; })} className="text-white/30 hover:text-white disabled:opacity-20" aria-label="Later"><ChevronDown size={12} /></button>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <button className={btnCls} disabled={!!busy[v.id] || !order.length} onClick={() => { void render(v, 'download'); }}><Download size={11} /> Bounce WAV</button>
                  <button className={btnCls} disabled={!!busy[v.id] || !order.length} onClick={() => { void render(v, 'publish'); }} style={{ borderColor: 'rgba(212,0,85,0.5)', color: '#fff' }}><UploadCloud size={11} /> Publish as Chora Mix</button>
                  {busy[v.id] && <span className="text-[10px] font-mono text-[#FF8C00] self-center">{busy[v.id]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Show Mode" hint="How “Share in Show Mode” opens this album: the fullscreen stage with your visuals or slides, synced lyrics and your call to action.">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stage">
              <select className={selectCls} value={show.mode} onChange={(e) => setShow((s) => { s.mode = e.target.value as ShowSetup['mode']; })}>
                <option value="DEFAULT">Auto — visuals ⇄ slides</option>
                <option value="FX">Visuals only</option>
                <option value="SLIDES">Slides only</option>
              </select>
            </Field>
            <Field label="Opening song">
              <select className={selectCls} value={show.openingTrackId ?? ''} onChange={(e) => setShow((s) => { s.openingTrackId = e.target.value || undefined; })}>
                <option value="">Track 1</option>
                {project.tracks.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.title}</option>)}
              </select>
            </Field>
            <Field label="Call to action label"><input className={inputCls} placeholder="Pre-save the album" value={show.ctaLabel ?? ''} onChange={(e) => setShow((s) => { s.ctaLabel = e.target.value; })} /></Field>
            <Field label="Call to action link"><input className={inputCls} placeholder="https://" value={show.ctaUrl ?? ''} onChange={(e) => setShow((s) => { s.ctaUrl = e.target.value; })} /></Field>
          </div>
          <Field label="Welcome line" className="mt-2"><input className={inputCls} placeholder="Turn it up." value={show.welcome ?? ''} onChange={(e) => setShow((s) => { s.welcome = e.target.value; })} /></Field>
          <Toggle on={show.countdown} onChange={(val) => setShow((s) => { s.countdown = val; })} label="3-2-1 countdown" />
          <Toggle on={show.showLyrics} onChange={(val) => setShow((s) => { s.showLyrics = val; })} label="Synced lyrics on the stage" />
          {albumId ? (
            <a href={buildShowUrl(albumId, { mode: show.mode === 'FX' ? 'fx' : show.mode === 'SLIDES' ? 'slides' : 'default' })} target="_blank" rel="noreferrer" className={`${btnCls} mt-2 inline-flex`}><ExternalLink size={11} /> Preview the show</a>
          ) : (
            <p className="mt-2 text-[10px] text-white/35" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>Publish the album to preview its show.</p>
          )}
        </Panel>
        <Panel title="What a mix carries">
          <p className="text-[11px] leading-relaxed text-white/50 flex gap-2"><Disc3 size={13} className="flex-none mt-0.5 text-[#D0BCFF]" />
            The album pressing and Suite, each song's inserts and per-song pressing, and the cue sheet from the album clock. Lyrics stay on the album — a mix is one long file.
          </p>
        </Panel>
      </div>
    </div>
  );
};
