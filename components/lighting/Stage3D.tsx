// The 3D stage panel: pick a venue, run the board's real output through the simulator, plan a
// Christmas display, or build a room from photos.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { BULBS, HOLIDAY_RUNS, VENUES, estimateRun, type BulbPattern, type BulbType, type VenueSpec } from '../../services/lighting/venues';
import { deleteRoom, depthFromPhoto, listRooms, saveRoom, venueFromRoom, type CapturedRoom, type Facing } from '../../services/lighting/roomCapture';
import { StageSim, type StageView } from '../../services/lighting/stageScene';

const btn = 'px-2.5 py-1.5 rounded text-xs font-medium';
const FACINGS: { id: Facing; label: string }[] = [{ id: 'front', label: 'Front' }, { id: 'right', label: 'Right' }, { id: 'back', label: 'Back' }, { id: 'left', label: 'Left' }];

function RoomBuilder({ onBuilt }: { onBuilt: (room: CapturedRoom) => void }) {
  const [name, setName] = useState('My room');
  const [ceiling, setCeiling] = useState(2.7);
  const [photos, setPhotos] = useState<{ file: File; url: string; facing: Facing }[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const add = (files: FileList | null) => {
    if (!files) return;
    const next = [...files].map((file, i) => ({ file, url: URL.createObjectURL(file), facing: FACINGS[(photos.length + i) % 4].id }));
    setPhotos((p) => [...p, ...next]);
  };

  const build = async () => {
    setBusy(true);
    const built: CapturedRoom['photos'] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        setStatus(`Reading depth in photo ${i + 1} of ${photos.length}. The first run downloads a small model.`);
        const img = new Image();
        img.src = photos[i].url;
        await img.decode();
        const depth = await depthFromPhoto(img);
        if (!depth) { setStatus(`Couldn't read depth from photo ${i + 1}. Try another shot, or the Plajah desktop app.`); setBusy(false); return; }
        built.push({ image: photos[i].file, depth: depth.depth, depthWidth: depth.width, depthHeight: depth.height, facing: photos[i].facing });
      }
      const room: CapturedRoom = { id: String(Date.now()), name: name.trim() || 'My room', ceilingM: ceiling, hfovDeg: 65, photos: built, createdAt: Date.now() };
      await saveRoom(room);
      setStatus('');
      setPhotos([]);
      onBuilt(room);
    } catch (e: any) {
      setStatus(e?.message || 'That photo could not be read.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/60">Stand in one spot and take a photo in each direction. Each one becomes a 3D surface you can light. Hidden areas stay empty, so this shows what the camera saw, not a measured model.</p>
      <div className="flex flex-wrap gap-2">
        <input value={name} aria-label="Room name" onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[7rem] bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
        <label className="flex items-center gap-1.5 text-xs text-white/60">Ceiling (m)
          <input type="number" min={2} max={40} step={0.1} value={ceiling} onChange={(e) => setCeiling(Number(e.target.value) || 2.7)} className="w-16 bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
        </label>
      </div>
      <label className={`${btn} bg-white/10 hover:bg-white/[0.16] inline-flex items-center gap-1.5 cursor-pointer`}>
        <Camera size={13} /> Take or choose photos
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </label>
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5">
          {photos.map((p, i) => (
            <li key={p.url} className="rounded overflow-hidden bg-white/[0.04]">
              <img src={p.url} alt={`Photo ${i + 1}`} className="w-full h-20 object-cover" />
              <div className="flex items-center gap-1 p-1">
                <select aria-label={`Direction of photo ${i + 1}`} value={p.facing} onChange={(e) => setPhotos((all) => all.map((x, k) => (k === i ? { ...x, facing: e.target.value as Facing } : x)))} className="flex-1 bg-white/[0.06] rounded px-1 py-1 text-xs text-white [&>option]:bg-zinc-900">
                  {FACINGS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <button aria-label="Remove photo" onClick={() => setPhotos((all) => all.filter((_, k) => k !== i))} className="p-1 rounded hover:bg-white/10"><Trash2 size={12} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && <button disabled={busy} onClick={() => void build()} className={`${btn} w-full py-2 bg-[#FF8C00] text-black disabled:opacity-50`}>{busy ? 'Building…' : 'Build 3D room'}</button>}
      {status && <p role="status" className="text-xs text-white/70">{status}</p>}
    </div>
  );
}

function ChristmasPanel() {
  const board = useBoard();
  const holiday = board.show.holiday ?? {};
  const runs = HOLIDAY_RUNS.map((run) => {
    const state = holiday[run.id];
    const bulb = (state?.bulb ?? run.bulb) as BulbType;
    return { run, on: !!state?.on, bulb, pattern: (state?.pattern ?? run.pattern) as BulbPattern, est: estimateRun({ path: run.path, bulb }) };
  });
  const lit = runs.filter((r) => r.on);
  const total = lit.reduce((a, r) => ({ bulbs: a.bulbs + r.est.bulbs, metres: a.metres + r.est.metres, watts: a.watts + r.est.watts }), { bulbs: 0, metres: 0, watts: 0 });

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button className={`${btn} flex-1 bg-white/10 hover:bg-white/[0.16]`} onClick={() => HOLIDAY_RUNS.forEach((r) => boardEngine.setHolidayRun(r.id, { on: true }))}>Light everything</button>
      </div>
      <ul className="space-y-1">
        {runs.map(({ run, on, bulb, pattern, est }) => (
          <li key={run.id} className="p-2 rounded bg-white/[0.04] text-xs space-y-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={on} onChange={(e) => boardEngine.setHolidayRun(run.id, { on: e.target.checked })} className="accent-[#FF8C00]" />
              <span className="flex-1 font-medium">{run.name}</span>
              <span className="text-white/50 tabular-nums">{est.bulbs} bulbs · {Math.round(est.metres * 3.281)} ft</span>
            </label>
            {on && (
              <div className="flex gap-1">
                <select aria-label={`${run.name} bulb type`} value={bulb} onChange={(e) => boardEngine.setHolidayRun(run.id, { bulb: e.target.value as BulbType })} className="flex-1 bg-white/[0.06] rounded px-1 py-1 text-white [&>option]:bg-zinc-900">
                  {(Object.keys(BULBS) as BulbType[]).map((b) => <option key={b} value={b}>{BULBS[b].label}</option>)}
                </select>
                <select aria-label={`${run.name} pattern`} value={pattern} onChange={(e) => boardEngine.setHolidayRun(run.id, { pattern: e.target.value as BulbPattern })} className="flex-1 bg-white/[0.06] rounded px-1 py-1 text-white [&>option]:bg-zinc-900">
                  <option value="steady">Steady</option><option value="twinkle">Twinkle</option><option value="chase">Chase</option>
                </select>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/70 tabular-nums">Shopping list: {total.bulbs.toLocaleString()} bulbs, {Math.round(total.metres * 3.281)} ft, about {Math.round(total.watts)} W ({(total.watts / 120).toFixed(1)} A at 120 V).</p>
      <p className="text-[11px] text-white/40">Estimates from typical bulb spacing and wattage. Use the box's numbers for the circuit. Pick colours in the Looks tab, Christmas shelf.</p>
    </div>
  );
}

export default function Stage3D() {
  const board = useBoard();
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<StageSim | null>(null);
  const [venueId, setVenueId] = useState('club');
  const [rooms, setRooms] = useState<CapturedRoom[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [view, setView] = useState<StageView>('foh');
  const [haze, setHaze] = useState(0.25);
  const [house, setHouse] = useState(0);
  const [meter, setMeter] = useState('');
  const [side, setSide] = useState<'venue' | 'photo'>('venue');

  const allVenues = useMemo<VenueSpec[]>(() => [...VENUES, ...rooms.map((r) => venueFromRoom(r, 6, 6))], [rooms]);
  const venue = allVenues.find((v) => v.id === venueId) ?? VENUES[1];

  useEffect(() => { void listRooms().then(setRooms).catch(() => {}); }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    const s = new StageSim(el, {
      look: () => boardEngine.liveLook,
      fixtures: () => boardEngine.show.fixtures,
      custom: () => boardEngine.show.customProfiles,
    });
    s.init().then(() => {
      if (cancelled) { s.dispose(); return; }
      sim.current = s;
      (window as any).stage = s;
      setReady(true);
    }).catch((e) => setFailed(e?.message || 'This device could not start the 3D view.'));
    const ro = new ResizeObserver(() => s.resize?.());
    ro.observe(el);
    const meterId = setInterval(() => setMeter(`${s.backend} · ${Math.round(1000 / Math.max(1, s.frameMs))} fps · ${s.lit} beams`), 700);
    return () => {
      cancelled = true;
      ro.disconnect();
      clearInterval(meterId);
      if (sim.current === s) { s.dispose(); sim.current = null; }
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !sim.current) return;
    const room = rooms.find((r) => `photo-${r.id}` === venue.id);
    void sim.current.loadVenue(venue, room).then(() => { setView('foh'); sim.current?.setHoliday(boardEngine.show.holiday ?? {}); });
  }, [ready, venue.id]);

  useEffect(() => { sim.current?.setHaze(haze); }, [haze, ready]);
  useEffect(() => { sim.current?.setHouseLights(house); }, [house, ready]);
  useEffect(() => { sim.current?.setHoliday(board.show.holiday ?? {}); }, [board.show.holiday, ready]);

  const isHouse = venue.kind === 'house';

  return (
    <div className="flex flex-col xl:flex-row h-full min-h-[34rem]">
      <div className="relative flex-1 min-h-[20rem] bg-black">
        <canvas ref={canvas} data-testid="stage-canvas" className="absolute inset-0 w-full h-full touch-none" />
        {failed && <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-sm text-center text-red-300">{failed}</p>}
        {!ready && !failed && <p className="absolute inset-0 grid place-items-center text-sm text-white/50">Starting the 3D stage…</p>}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {(['foh', 'stage', 'crowd', 'overhead'] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); sim.current?.setView(v); }} aria-pressed={view === v} className={`${btn} ${view === v ? 'bg-white text-black' : 'bg-black/60 text-white/80 hover:text-white'}`}>{{ foh: 'Front of house', stage: 'From stage', crowd: 'In the crowd', overhead: 'Overview' }[v]}</button>
          ))}
        </div>
        <span data-testid="stage-meter" className="absolute right-2 bottom-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white/60 tabular-nums">{meter}</span>
      </div>

      <aside className="xl:w-80 shrink-0 border-t xl:border-t-0 xl:border-l border-white/10 overflow-y-auto p-3 space-y-3 max-h-[46vh] xl:max-h-none">
        <div className="flex p-0.5 rounded-lg bg-white/[0.07]">
          {(['venue', 'photo'] as const).map((s) => (
            <button key={s} onClick={() => setSide(s)} aria-pressed={side === s} className={`flex-1 py-1.5 rounded-md text-xs font-medium ${side === s ? 'bg-white text-black' : 'text-white/60'}`}>{s === 'venue' ? 'Venues' : 'From photos'}</button>
          ))}
        </div>

        {side === 'photo' ? (
          <>
            <RoomBuilder onBuilt={(room) => { setRooms((r) => [room, ...r]); setVenueId(`photo-${room.id}`); setSide('venue'); }} />
            {rooms.length > 0 && (
              <ul className="space-y-1">
                {rooms.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 p-2 rounded bg-white/[0.04] text-xs">
                    <button onClick={() => setVenueId(`photo-${r.id}`)} className="flex-1 text-left truncate hover:underline">{r.name} <span className="text-white/40">· {r.photos.length} photo{r.photos.length > 1 ? 's' : ''}</span></button>
                    <button aria-label={`Delete ${r.name}`} onClick={() => { void deleteRoom(r.id); setRooms((all) => all.filter((x) => x.id !== r.id)); }} className="p-1 rounded hover:bg-white/10"><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1">
              {allVenues.map((v) => (
                <button key={v.id} onClick={() => setVenueId(v.id)} aria-pressed={v.id === venue.id} className={`p-2 rounded text-left border ${v.id === venue.id ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                  <span className="block text-xs font-medium truncate">{v.name}</span>
                  <span className="block text-[10px] text-white/50 truncate">{v.capacity}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-white/60">{venue.blurb}</p>
            {isHouse ? <ChristmasPanel /> : (
              <>
                {venue.rig.length > 0 && (
                  <button className={`${btn} w-full bg-white/10 hover:bg-white/[0.16]`} onClick={() => boardEngine.loadVenueRig(venue)}>
                    Add a starter rig: {venue.rig.map((r) => `${r.count} ${r.name.toLowerCase()}`).join(', ')}
                  </button>
                )}
                <label className="block text-xs text-white/60">Haze
                  <input type="range" min={0} max={100} value={Math.round(haze * 100)} onChange={(e) => setHaze(Number(e.target.value) / 100)} className="w-full accent-[#FF8C00]" />
                </label>
                <label className="block text-xs text-white/60">House lights
                  <input type="range" min={0} max={100} value={Math.round(house * 100)} onChange={(e) => setHouse(Number(e.target.value) / 100)} className="w-full accent-[#FF8C00]" />
                </label>
              </>
            )}
            {board.show.fixtures.length === 0 && !isHouse && <p className="text-xs text-amber-200/90">Nothing patched, so the stage is dark. Add the starter rig, then play a look.</p>}
          </>
        )}
      </aside>
    </div>
  );
}
