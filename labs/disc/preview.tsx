// Static preview of Disc Authoring: every template's menus + the live interface.
// Bundled into one HTML file (scripts/build-disc-preview) so it opens without a dev server.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DiscAuthoring, { type DiscSource } from '../../components/fabula/DiscAuthoring';
import { applyTemplate, TEMPLATES } from '../../services/disc/templates';
import { newProject, newTitle, uid, type DiscMenu, type DiscProject } from '../../services/disc/project';
import { drawMenu } from '../../services/disc/menuRaster';
import { prepareArt } from '../../services/disc/telaArt';
import type { DiscFormat } from '../../services/disc/spec';

const MARKS = [[0, 'Opening'], [412, 'The Platform'], [1210, 'Eastbound'], [2034, 'The Dining Car'], [2980, 'Tunnel'], [3720, 'Border'], [4511, 'The Letter'], [5390, 'Last Stop'], [6300, 'Credits']] as const;
const sources: DiscSource[] = [
  { id: 'tl', name: 'Night Train — final cut', durationSec: 6840, kind: 'timeline', markers: MARKS.map(([t, label]) => ({ t, label })) },
  { id: 'bts', name: 'Making Night Train', durationSec: 1320, kind: 'edit' },
  { id: 'trl', name: 'Theatrical Trailer', durationSec: 142, kind: 'asset' },
];

function sample(templateId: string, format: DiscFormat): DiscProject {
  let p = newProject(templateId === 'boxset' ? 'The Lighthouse Keepers' : templateId === 'encore' ? 'Live at the Orpheum' : 'Night Train', format);
  if (templateId === 'boxset') p.titles = ['Arrival', 'The Storm', 'Signals', 'Low Tide', 'The Keeper', 'Dawn'].map(n => newTitle(n, 1560, 'EPISODE'));
  else {
    const f = newTitle(p.name, 6840, 'FEATURE');
    f.chapters = (templateId === 'encore' ? ['Overture', 'Paper Moons', 'Wild Honey', 'Satellite', 'Riverbed', 'Gold Coast', 'Encore: Home'] : MARKS.map(m => m[1])).map((name, i) => ({ id: uid('ch'), name, timeSec: i * 700 }));
    f.audio = [{ id: uid('a'), lang: 'eng', label: 'English 5.1 LPCM', codec: 'lpcm', channels: 6, kbps: 6912 }, { id: uid('a'), lang: 'eng', label: "Director's Commentary", codec: 'ac3', channels: 2, kbps: 192, commentary: true }];
    f.subtitles = [{ id: uid('s'), lang: 'eng', label: 'English SDH', sdh: true, srt: '1\n00:00:05,000 --> 00:00:08,000\nThe last train leaves at midnight.\n' }, { id: uid('s'), lang: 'spa', label: 'Español' }];
    p.titles = [f, newTitle('Making Night Train', 1320, 'EXTRA'), newTitle('Theatrical Trailer', 142, 'TRAILER'), newTitle('Deleted Scenes', 840, 'EXTRA')];
  }
  return applyTemplate(p, templateId);
}

function MenuShot({ disc, menu, w = 640, animate = false }: { disc: DiscProject; menu: DiscMenu; w?: number; animate?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0, alive = true;
    prepareArt(disc, menu.id).then(art => {
      const c = ref.current; if (!c || !alive) return;
      const t0 = performance.now();
      const frame = () => {
        const ctx = c.getContext('2d')!; ctx.save(); ctx.scale(c.width / 1920, c.height / 1080);
        drawMenu(ctx, menu, { selected: menu.defaultButton, filmUnder: menu.kind === 'POPUP', art, time: (performance.now() - t0) / 1000 }); ctx.restore();
        if (animate && menu.motion && alive) raf = requestAnimationFrame(frame);
      };
      frame();
      (window as any).__shots = ((window as any).__shots || 0) + 1;
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [disc, menu, animate]);
  return <canvas ref={ref} width={w * 2} height={(w * 2 * 9) / 16} style={{ width: '100%', display: 'block', borderRadius: 8, background: '#000' }} />;
}

function Gallery() {
  const q = new URLSearchParams(location.search);
  const [fmt, setFmt] = useState<DiscFormat>((q.get('fmt') as DiscFormat) || 'BD');
  const only = q.get('only');
  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        {(['BD', 'UHD'] as DiscFormat[]).map(f => <button key={f} onClick={() => setFmt(f)} style={chip(fmt === f)}>{f === 'BD' ? 'Blu-ray' : '4K Ultra HD'}</button>)}
      </div>
      {TEMPLATES.filter(t => t.formats.includes(fmt) && (!only || t.id === only)).map(t => {
        const p = sample(t.id, fmt);
        const top = p.menus.find(m => m.id === p.topMenuId)!;
        const rest = p.menus.filter(m => m.id !== p.topMenuId);
        return (
          <section key={t.id} data-template={t.id} style={{ marginBottom: 46 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: '#ecebf2' }}>{t.name}</h2>
              <span style={{ fontSize: 12, color: '#8d8b99' }}>{p.menus.length} menus · first play: {t.firstPlay === 'TOP_MENU' ? 'main menu' : 'starts the film'}{t.popup ? ' · pop-up menu' : ''}</span>
            </div>
            <p style={{ margin: '0 0 6px', color: '#8d8b99', fontSize: 13 }}>{t.blurb}</p><p style={{ margin: '0 0 14px', color: '#c9c6d4', fontSize: 12 }}><b>Structure:</b> {(t as any).concept}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 14 }}>
              <figure style={fig}><MenuShot disc={p} menu={top} w={820} animate /><figcaption style={cap}>{top.name}</figcaption></figure>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
                {rest.map(m => <figure key={m.id} style={fig}><MenuShot disc={p} menu={m} w={320} /><figcaption style={cap}>{m.name}</figcaption></figure>)}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Interface() {
  const [discs, setDiscs] = useState<DiscProject[]>(() => [sample('marquee', 'BD')]);
  return <div style={{ height: 'calc(100dvh - 58px)' }}><DiscAuthoring discs={discs} onChange={setDiscs} sources={sources} productionTitle="Night Train" ownerId="preview" ping={m => console.log(m)} /></div>;
}

const chip = (on: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 999, border: `1px solid ${on ? '#ff9a3c' : '#2a2a35'}`, background: on ? '#ff9a3c22' : '#15151b', color: on ? '#ff9a3c' : '#ecebf2', fontWeight: 600, fontSize: 13, cursor: 'pointer' });
const fig: React.CSSProperties = { margin: 0, background: '#15151b', border: '1px solid #2a2a35', borderRadius: 10, padding: 8 };
const cap: React.CSSProperties = { fontSize: 11, color: '#8d8b99', padding: '6px 2px 0', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 };

function App() {
  const [tab, setTab] = useState<'templates' | 'interface'>(location.hash === '#interface' ? 'interface' : 'templates');
  return (
    <div style={{ minHeight: '100dvh', background: '#0d0d11', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ height: 58, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', borderBottom: '1px solid #2a2a35' }}>
        <b style={{ color: '#ecebf2', fontSize: 15 }}>Fabula · Disc Authoring</b><span style={{ color: '#8d8b99', fontSize: 12 }}>preview</span>
        <div style={{ flex: 1 }} />
        <button style={chip(tab === 'templates')} onClick={() => { setTab('templates'); location.hash = ''; }}>Templates</button>
        <button style={chip(tab === 'interface')} onClick={() => { setTab('interface'); location.hash = 'interface'; }}>Interface</button>
      </header>
      {tab === 'templates' ? <Gallery /> : <Interface />}
    </div>
  );
}

document.fonts.ready.then(() => createRoot(document.getElementById('root')!).render(<App />));
