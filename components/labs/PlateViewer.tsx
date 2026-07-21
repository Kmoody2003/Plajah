// PlateViewer — the Combat Atlas's reading room for real archival plates.
//
// Two ways to look at a 4,000-year-old wall:
//   • REGISTERS — each wrestling band as a native-resolution filmstrip you
//     scroll left-to-right, the way the wall was meant to be read. This is the
//     only way to actually see individual holds at legible size.
//   • FULL PLATE — the whole sheet, click-to-zoom with drag-to-pan.
//
// Images are Plajah holdings (Newberry, Beni Hasan II, 1893 — public domain),
// extracted from our own JP2 bundle rather than hotlinked.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Layers, Rows3 } from 'lucide-react';
import { TYPE } from '../../src/lib/designSystem';
import { ARCHIVE_PLATES, plateUrl, type ArchivePlate } from '../../data/combatAtlasData';

const MURAL = { plaster: '#D9C8A0', red: '#A03A20', umber: '#4A3020', ink: '#2E2013', body: '#4A3A26', caption: '#6B5638' };

// ── One register: a wide, thin strip the reader scrolls along ────────────────
const RegisterStrip: React.FC<{ file: string; label: string; index: number }> = ({ file, label, index }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${MURAL.umber}33`, background: '#00000008' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" style={{ background: `${MURAL.umber}12` }}>
        <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: MURAL.umber }}>
          {String(index + 1).padStart(2, '0')} · {label.toUpperCase()}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(1, +(z - 0.5).toFixed(1)))} aria-label="Zoom out"
            className="w-6 h-6 rounded flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: MURAL.umber }}><ZoomOut size={12} /></button>
          <span className={`${TYPE.labelSm} font-black tabular-nums w-8 text-center`} style={{ color: MURAL.caption }}>{zoom}×</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.5).toFixed(1)))} aria-label="Zoom in"
            className="w-6 h-6 rounded flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: MURAL.umber }}><ZoomIn size={12} /></button>
          <button onClick={() => nudge(-1)} aria-label="Scroll left"
            className="w-6 h-6 rounded flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: MURAL.umber }}><ChevronLeft size={13} /></button>
          <button onClick={() => nudge(1)} aria-label="Scroll right"
            className="w-6 h-6 rounded flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ color: MURAL.umber }}><ChevronRight size={13} /></button>
        </div>
      </div>
      <div ref={scroller} className="overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ background: MURAL.plaster }}>
        <img
          src={plateUrl(file)}
          alt={label}
          loading="lazy"
          style={{ height: `${72 * zoom}px`, maxWidth: 'none', display: 'block', imageRendering: 'auto' }}
        />
      </div>
    </div>
  );
};

// ── Full plate: click to zoom, drag to pan ──────────────────────────────────
const FullPlate: React.FC<{ plate: ArchivePlate }> = ({ plate }) => {
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    if (zoom === 1 || !box.current) return;
    drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop };
  }, [zoom]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current || !box.current) return;
      box.current.scrollLeft = drag.current.l - (e.clientX - drag.current.x);
      box.current.scrollTop = drag.current.t - (e.clientY - drag.current.y);
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${MURAL.umber}33` }}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" style={{ background: `${MURAL.umber}12` }}>
        <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: MURAL.umber }}>
          FULL PLATE {zoom > 1 ? '· DRAG TO PAN' : '· TAP TO ZOOM'}
        </p>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`px-2 py-0.5 rounded ${TYPE.labelSm} font-black transition-all`}
              style={zoom === z
                ? { background: MURAL.umber, color: MURAL.plaster }
                : { border: `1px solid ${MURAL.umber}44`, color: MURAL.umber }}>{z}×</button>
          ))}
        </div>
      </div>
      <div ref={box}
        className={`overflow-auto scrollbar-hide ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        style={{ background: MURAL.plaster, maxHeight: 520 }}
        onMouseDown={onDown}
        onClick={() => zoom === 1 && setZoom(2)}>
        <img src={plateUrl(plate.file)} alt={plate.title} loading="lazy" draggable={false}
          style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }} />
      </div>
    </div>
  );
};

// ── The reading room ────────────────────────────────────────────────────────
const PlateViewer: React.FC = () => {
  const [activeId, setActiveId] = useState(ARCHIVE_PLATES[0].id);
  const [mode, setMode] = useState<'registers' | 'full'>('registers');
  const plate = ARCHIVE_PLATES.find(p => p.id === activeId)!;

  // Context plates have no register slices — always show them whole.
  const effectiveMode = plate.registers.length ? mode : 'full';

  return (
    <div className="space-y-4">
      {/* Plate selector */}
      <div className="flex flex-wrap gap-2">
        {ARCHIVE_PLATES.map(p => {
          const on = p.id === activeId;
          return (
            <button key={p.id} onClick={() => setActiveId(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${TYPE.labelSm} font-black transition-all`}
              style={on
                ? { background: MURAL.umber, color: MURAL.plaster, border: `1px solid ${MURAL.umber}` }
                : { border: `1px solid ${MURAL.umber}55`, color: MURAL.umber }}>
              {p.wrestling && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: on ? MURAL.plaster : MURAL.red }} />}
              {p.plate}
            </button>
          );
        })}
      </div>

      {/* Caption block */}
      <motion.div key={plate.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight" style={{ color: MURAL.ink }}>{plate.title}</h3>
          <p className={`${TYPE.labelSm} font-black tracking-[0.16em]`} style={{ color: MURAL.red }}>
            {plate.tomb.toUpperCase()} · {plate.wall.toUpperCase()}
          </p>
        </div>
        <p className="text-[13px] leading-relaxed mt-1.5 max-w-3xl" style={{ color: MURAL.body }}>{plate.blurb}</p>
      </motion.div>

      {/* Mode toggle — only meaningful where registers exist */}
      {plate.registers.length > 0 && (
        <div className="flex gap-2">
          {([['registers', 'Registers', Rows3], ['full', 'Full plate', Maximize2]] as const).map(([m, label, Icon]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${TYPE.labelSm} font-black transition-all`}
              style={mode === m
                ? { background: MURAL.red, color: MURAL.plaster }
                : { border: `1px solid ${MURAL.umber}44`, color: MURAL.umber }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* The plates themselves */}
      {effectiveMode === 'registers' ? (
        <div className="space-y-2.5">
          <p className="text-[12px] leading-relaxed" style={{ color: MURAL.caption }}>
            Each band below is one register of the wall at full scan resolution — scroll it left to right and the
            sequence reads as it was painted: grip, entry, counter, throw, pin. Zoom to inspect a single hold.
          </p>
          {plate.registers.map((r, i) => <RegisterStrip key={r.file} file={r.file} label={r.label} index={i} />)}
        </div>
      ) : (
        <FullPlate plate={plate} />
      )}

      {/* Provenance */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className={`${TYPE.labelSm} font-black tracking-[0.1em]`} style={{ color: MURAL.caption }}>
          <Layers size={10} className="inline mr-1 -mt-0.5" />
          NEWBERRY, BENI HASAN II (EGYPT EXPLORATION FUND, 1893) · PUBLIC DOMAIN · PLAJAH HOLDINGS
        </p>
      </div>
    </div>
  );
};

export default PlateViewer;
