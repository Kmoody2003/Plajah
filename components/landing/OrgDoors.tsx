import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';

/**
 * The organization doors on the landing page: four real doors in one row, on every screen size.
 * A door says WHO it is for (school, church, job, studio) in plain words; tapping it swings it open
 * and the room behind it asks one question — "who are you here?" — with at most two big answers.
 * Personal sign-in lives above this, apart, so the doors read as "through your organization".
 */

export interface DoorChoice {
  label: string;
  /** One line under the label: when to pick this. */
  hint: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  onPick: () => void;
}

export interface OrgDoor {
  key: string;
  /** Brand name painted on the door (Academia, Elevate…). */
  brand: string;
  /** Plain word under the door — the thing people recognize (School, Church…). */
  noun: string;
  who: string;
  color: string;
  /** Lighter text tint for dark backgrounds. */
  tint: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Headline inside the room. */
  welcome: string;
  choices: DoorChoice[];
  /** Smaller ways in (tour, sign in, set up an org). */
  extras?: { label: string; onPick: () => void }[];
}

const Door: React.FC<{ door: OrgDoor; open: boolean; dim: boolean; onOpen: () => void }> = ({ door, open, dim, onOpen }) => {
  const reduce = useReducedMotion();
  const { Icon } = door;
  return (
    <button
      onClick={onOpen}
      aria-expanded={open}
      aria-label={`${door.noun} door — ${door.brand}, for ${door.who}`}
      className={`group flex flex-col items-center text-center min-w-0 transition-opacity duration-300 ${dim ? 'opacity-45 hover:opacity-80' : 'opacity-100'}`}
    >
      {/* Frame: arched opening with the room's light behind the door */}
      <div
        className="relative w-full aspect-[5/8] sm:aspect-[3/5] rounded-t-[999px] p-[3px] sm:p-1.5"
        style={{ background: `linear-gradient(180deg, ${door.color}cc, ${door.color}44)`, perspective: 900 }}
      >
        <div
          className="absolute inset-[3px] sm:inset-1.5 rounded-t-[999px] overflow-hidden"
          style={{ background: `radial-gradient(ellipse at 50% 70%, ${door.tint} 0%, ${door.color} 35%, #050208 85%)` }}
        />
        {/* The door leaf, hinged on the left */}
        <motion.div
          className="absolute inset-[3px] sm:inset-1.5 rounded-t-[999px] flex flex-col items-center justify-between overflow-hidden border border-white/10"
          style={{
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
            background: `linear-gradient(160deg, #1b1622 0%, #0c0910 60%, #07050a 100%)`,
            boxShadow: `inset 0 0 0 1px ${door.color}33`,
          }}
          initial={false}
          animate={{ rotateY: open ? (reduce ? 0 : -62) : 0, opacity: open && reduce ? 0.25 : 1 }}
          whileHover={open || reduce ? undefined : { rotateY: -14 }}
          transition={{ type: 'spring', damping: 20, stiffness: 140 }}
        >
          {/* Two recessed panels, like a real door */}
          <div className="absolute inset-x-[14%] top-[16%] h-[34%] rounded-t-[999px] border" style={{ borderColor: `${door.color}40`, background: `${door.color}0d` }} />
          <div className="absolute inset-x-[14%] bottom-[8%] h-[30%] rounded-md border" style={{ borderColor: `${door.color}30`, background: `${door.color}08` }} />
          {/* Sign on the upper panel */}
          <div className="relative z-10 mt-[26%] flex flex-col items-center gap-1 sm:gap-2 px-1">
            <span className="w-8 h-8 sm:w-12 sm:h-12 rounded-full grid place-items-center" style={{ background: `${door.color}26`, color: door.tint }}>
              <Icon size={18} className="sm:hidden" />
              <Icon size={24} className="hidden sm:block" />
            </span>
            <span className="text-[7.5px] sm:text-[12px] font-black uppercase tracking-[0.02em] sm:tracking-[0.22em] text-white/85 leading-tight">{door.brand}</span>
          </div>
          {/* Knob */}
          <span className="absolute right-[12%] top-[58%] w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full" style={{ background: door.tint, boxShadow: `0 0 10px ${door.color}` }} />
        </motion.div>
        {/* Light spilling under the door */}
        <div className="absolute -bottom-2 inset-x-2 h-3 rounded-full blur-md opacity-60 group-hover:opacity-100 transition-opacity" style={{ background: door.color }} />
      </div>
      {/* Threshold label: the plain word people look for */}
      <span className="mt-3 sm:mt-4 text-[13px] sm:text-xl font-black text-white leading-tight">{door.noun}</span>
      <span className="mt-0.5 text-[10px] sm:text-[13px] font-semibold text-white/55 leading-snug">{door.who}</span>
    </button>
  );
};

const Room: React.FC<{ door: OrgDoor; onClose: () => void }> = ({ door, onClose }) => (
  <div className="text-left">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: door.tint }}>{door.brand} · {door.noun}</p>
        <h3 className="text-lg sm:text-2xl font-black text-white leading-tight mt-1">{door.welcome}</h3>
        <p className="text-[12px] sm:text-[13px] text-white/55 mt-1">Who are you here?</p>
      </div>
      <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white" aria-label="Close this door"><X size={16} /></button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
      {door.choices.map((c, i) => (
        <button
          key={c.label}
          onClick={() => { onClose(); c.onPick(); }}
          className="group flex items-center gap-3 rounded-2xl p-3.5 sm:p-4 text-left active:scale-[0.98] transition-all border hover:brightness-110"
          style={i === 0
            ? { background: `linear-gradient(135deg, ${door.color}, ${door.color}aa)`, borderColor: 'transparent' }
            : { background: 'rgba(255,255,255,0.06)', borderColor: `${door.color}55` }}
        >
          <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center bg-black/25 text-white"><c.Icon size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] sm:text-[15px] font-black text-white leading-tight">{c.label}</span>
            <span className={`block text-[11px] sm:text-[12px] leading-snug mt-0.5 ${i === 0 ? 'text-white/85' : 'text-white/55'}`}>{c.hint}</span>
          </span>
          <ArrowRight size={16} className="shrink-0 text-white/80 group-hover:translate-x-0.5 transition-transform" />
        </button>
      ))}
    </div>
    {!!door.extras?.length && (
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3.5">
        {door.extras.map(x => (
          <button key={x.label} onClick={() => { onClose(); x.onPick(); }} className="text-[11px] sm:text-[12px] font-bold text-white/70 hover:text-white transition-colors">
            {x.label} →
          </button>
        ))}
      </div>
    )}
  </div>
);

const OrgDoors: React.FC<{ doors: OrgDoor[] }> = ({ doors }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = doors.find(d => d.key === openKey) || null;
  // Phone: the room is a bottom sheet (thumb reach). Wider: it opens in place under the doors.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 gap-2.5 sm:gap-8 items-start max-w-3xl mx-auto">
        {doors.map(d => (
          <Door key={d.key} door={d} open={openKey === d.key} dim={!!openKey && openKey !== d.key} onOpen={() => setOpenKey(k => (k === d.key ? null : d.key))} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {open && !narrow && (
          <motion.div
            key={open.key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-6 rounded-3xl border bg-[#0b0710]/90 backdrop-blur-xl p-5 sm:p-6"
            style={{ borderColor: `${open.color}66`, boxShadow: `0 0 50px ${open.color}22` }}
          >
            <Room door={open} onClose={() => setOpenKey(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && narrow && (
          <>
            <motion.div key="scrim" className="fixed inset-0 z-[110] bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpenKey(null)} />
            <motion.div
              key={`sheet-${open.key}`}
              role="dialog"
              aria-label={`${open.noun} door`}
              className="fixed inset-x-0 bottom-0 z-[111] rounded-t-[28px] border-t bg-[#0b0710] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
              style={{ borderColor: `${open.color}88`, boxShadow: `0 -20px 60px ${open.color}33` }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
              <Room door={open} onClose={() => setOpenKey(null)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrgDoors;
