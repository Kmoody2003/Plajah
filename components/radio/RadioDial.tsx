import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, Globe, Pause, Play, Radio, Search } from 'lucide-react';
import './radioDial.css';
import { getRadioPresets, toggleRadioPreset, subscribeRadioPresets, type RadioPreset } from '../../services/radioPresetsService';

export interface DialStation {
  id: string;
  name: string;
  detail: string;
  image?: string;
  origin: 'On Plajah' | 'Worldwide';
  playing: boolean;
  status?: string;
  tune: () => void;
  streamUrl?: string;
}

export default function RadioDial({ stations, loading, onDirectory, onRefresh, nowPlaying, onSelectPreset }: {
  stations: DialStation[];
  loading: boolean;
  onDirectory: () => void;
  onRefresh: () => void;
  nowPlaying?: string;
  onSelectPreset?: (preset: RadioPreset) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [presets, setPresets] = useState<RadioPreset[]>(() => getRadioPresets());
  const index = Math.max(0, stations.findIndex(s => s.id === selectedId));
  const selected = stations[index];
  const drumRef = useRef<HTMLDivElement>(null);
  const wheel = useRef({ amount: 0, time: 0 });

  useEffect(() => {
    return subscribeRadioPresets(updated => setPresets(updated));
  }, []);

  useEffect(() => {
    const drum = drumRef.current;
    if (!drum) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || !event.deltaY || stations.length < 2) return;
      event.preventDefault();
      const now = performance.now();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 340 : 1);
      if (now - wheel.current.time > 180 || Math.sign(delta) !== Math.sign(wheel.current.amount)) wheel.current.amount = 0;
      wheel.current.time = now;
      wheel.current.amount += delta;
      if (Math.abs(wheel.current.amount) >= 40) {
        const direction = Math.sign(wheel.current.amount);
        setSelectedId(previous => {
          const at = Math.max(0, stations.findIndex(s => s.id === previous));
          return stations[Math.max(0, Math.min(stations.length - 1, at + direction))].id;
        });
        wheel.current.amount = 0;
      }
    };
    drum.addEventListener('wheel', onWheel, { passive: false });
    return () => drum.removeEventListener('wheel', onWheel);
  }, [stations]);
  useEffect(() => {
    if (!stations.some(s => s.id === selectedId)) setSelectedId(stations[0]?.id || '');
  }, [stations, selectedId]);
  const move = (amount: number) => setSelectedId(stations[Math.max(0, Math.min(stations.length - 1, index + amount))]?.id || '');

  return <main className="radio-dial">
    <div className="dial-intro"><div><p className="dial-eyebrow">A world of sound. One dial.</p><h1>The Dial<span>.</span></h1></div><p>Find your frequency.<br />Stay for what comes next.</p></div>
    <div className="dial-layout">
      <section className="dial-hero" aria-label="Selected station">
        <div className="dial-hero-top"><span className="dial-badge">{selected?.origin || 'Radio'}</span><span className="dial-eyebrow">{selected?.playing ? '● Listening now' : 'Ready to tune'}</span></div>
        <div className="dial-art">{selected?.image ? <img key={selected.image} src={selected.image} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} /> : null}<Radio size={76} strokeWidth={1} aria-hidden="true" /></div>
        <div className="dial-hero-copy"><p className="dial-eyebrow">{selected?.origin === 'Worldwide' ? 'Across the airwaves' : 'Independent voices. On Plajah.'}</p><h2>{selected?.name || (loading ? 'Finding your signal…' : 'No stations available')}</h2><p>{selected?.detail || 'Browse the directory to discover another station.'}</p></div>
        <div className="dial-transport">
          <button disabled={!selected} onClick={selected?.tune} className="dial-play">
            {selected?.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            {selected?.playing ? 'Pause' : 'Tune in'}
          </button>
          <button
            disabled={!selected}
            type="button"
            onClick={async () => {
              if (!selected) return;
              await toggleRadioPreset({
                id: selected.id,
                name: selected.name,
                detail: selected.detail,
                image: selected.image,
                origin: selected.origin,
                streamUrl: selected.streamUrl,
              });
            }}
            className={`dial-preset-btn ${selected && presets.some(p => p.id === selected.id) ? 'active' : ''}`}
            title={selected && presets.some(p => p.id === selected.id) ? 'Remove preset' : 'Save as preset'}
          >
            <Bookmark size={16} fill={selected && presets.some(p => p.id === selected.id) ? 'currentColor' : 'none'} />
            <span>{selected && presets.some(p => p.id === selected.id) ? 'Preset' : '+ Preset'}</span>
          </button>
          <span role="status">{selected?.status || 'Select a station, then tune in.'}</span>
        </div>
        {nowPlaying && <p className="dial-current">Current radio playback · {nowPlaying}</p>}
      </section>
      <section className="dial-tuner" aria-label="Station tuner">
        <div className="dial-tuner-heading"><div><p className="dial-eyebrow">Turn toward something new</p><h2>Tune the dial</h2></div><span>{stations.length ? `${index + 1} / ${stations.length}` : '—'}</span></div>
        <button className="dial-step" aria-label="Previous station" disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={18} /></button>
        <div ref={drumRef} className="dial-drum" role="listbox" aria-label="Choose a station" tabIndex={0} aria-activedescendant={selected ? `dial-${selected.id}` : undefined} onKeyDown={e => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            if (e.key === 'ArrowDown') move(1);
            else if (e.key === 'ArrowUp') move(-1);
            else if (e.key === 'Home') move(-stations.length);
            else if (e.key === 'End') move(stations.length);
            else selected?.tune();
          }
        }}>
          <div className="dial-reticle" aria-hidden="true" />
          {stations.slice(Math.max(0, index - 2), index + 3).map(s => {
            const distance = stations.indexOf(s) - index;
            return <div key={s.id} id={`dial-${s.id}`} role="option" aria-selected={distance === 0} className={`dial-option ${distance === 0 ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)} style={{ transform: `translateY(${distance * 76}px) rotateX(${distance * -16}deg) scale(${1 - Math.abs(distance) * .07})`, opacity: 1 - Math.abs(distance) * .28 }}>
              <span className="dial-mark">{String(stations.indexOf(s) + 1).padStart(2, '0')}</span><div><strong>{s.name}</strong><small>{s.origin} · {s.detail}</small></div>{s.origin === 'Worldwide' ? <Globe size={17} /> : <Radio size={17} />}
            </div>;
          })}
          {!stations.length && <p className="dial-empty">{loading ? 'Loading stations…' : 'No stations found.'}</p>}
        </div>
        <button className="dial-step" aria-label="Next station" disabled={!stations.length || index === stations.length - 1} onClick={() => move(1)}><ArrowDown size={18} /></button>
        <p className="dial-hint">Scroll or use ↑ ↓ to explore · Enter to tune in</p>
      </section>
    </div>

    <div className="dial-presets-bar" aria-label="Quick radio presets">
      <div className="dial-presets-label">
        <span className="dial-eyebrow">Radio Presets</span>
        <small>{presets.length ? `${presets.length} saved · Click slot to tune` : 'Save your top 6 stations for 1-click tuning'}</small>
      </div>
      <div className="dial-presets-grid" role="group" aria-label="Preset stations">
        {[1, 2, 3, 4, 5, 6].map(num => {
          const preset = presets[num - 1];
          const isCurrent = preset && selected?.id === preset.id;
          return (
            <button
              key={num}
              type="button"
              className={`dial-preset-slot ${preset ? 'filled' : 'empty'} ${isCurrent ? 'active' : ''}`}
              onClick={async () => {
                if (preset) {
                  const target = stations.find(s => s.id === preset.id);
                  if (target) {
                    setSelectedId(target.id);
                    target.tune();
                  } else if (onSelectPreset) {
                    onSelectPreset(preset);
                  }
                } else if (selected) {
                  await toggleRadioPreset({
                    id: selected.id,
                    name: selected.name,
                    detail: selected.detail,
                    image: selected.image,
                    origin: selected.origin,
                    streamUrl: selected.streamUrl,
                  });
                }
              }}
              title={preset ? `Preset ${num}: ${preset.name}` : (selected ? `Set preset ${num} to ${selected.name}` : `Preset ${num} (empty)`)}
            >
              <span className="preset-num">[{num}]</span>
              <span className="preset-name">{preset ? preset.name : (selected ? `+ Set ${num}` : 'Empty')}</span>
            </button>
          );
        })}
      </div>
    </div>

    <footer className="dial-footer"><div><Search size={19} /><div><strong>Looking for something specific?</strong><p>Search by station, country, or genre in the full directory.</p></div></div><button onClick={onDirectory}>Open directory →</button><button onClick={onRefresh} disabled={loading}>Refresh stations</button></footer>
  </main>;
}
