// The Melos Studio menu bar — File / Edit / View / Options, the proper DAW file menu the
// transport bar was impersonating with a row of nine buttons. Dumb on purpose: BeatsRoom
// declares the menus, this renders them. Click opens; hovering another menu while one is open
// switches to it (the way every desktop menu bar works).

import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import AnchoredPopover from '../../../ui/AnchoredPopover';

export interface MenuItem {
  id: string;
  label: string;
  /** Right-aligned hint — a shortcut or a state readout. */
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export type MenuEntry = MenuItem | 'sep';

export interface MenuGroup {
  label: string;
  items: MenuEntry[];
}

export const MenuBar: React.FC<{ menus: MenuGroup[] }> = ({ menus }) => {
  const [open, setOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (open === null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={rootRef} className="flex items-center gap-0.5">
      {menus.map((menu, i) => (
        <div key={menu.label} className="relative">
          <button
            ref={(el) => { if (el) triggers.current.set(i, el); else triggers.current.delete(i); }}
            aria-expanded={open === i}
            onClick={() => setOpen((v) => (v === i ? null : i))}
            onPointerEnter={() => { if (open !== null && open !== i) setOpen(i); }}
            className={`h-7 px-2.5 rounded-lg text-[11.5px] transition-colors ${open === i ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.06]'}`}
          >{menu.label}</button>
          {open === i && triggers.current.get(i) && (
            <AnchoredPopover anchor={triggers.current.get(i)!} onClose={() => setOpen(null)} className="w-[230px] rounded-xl border border-white/15 bg-[#0B0B0F]/98 backdrop-blur-xl shadow-2xl p-1">
              {menu.items.map((item, j) => item === 'sep' ? (
                <div key={`s${j}`} className="h-px my-1 bg-white/10" />
              ) : (
                <button
                  key={item.id}
                  disabled={item.disabled}
                  onClick={() => { setOpen(null); item.onSelect?.(); }}
                  className={`w-full h-7 px-2 rounded-lg flex items-center gap-2 text-[11.5px] text-left transition-colors disabled:opacity-35 ${item.danger ? 'text-[#FF6E6E] hover:bg-[#EF4444]/12' : 'text-white/75 hover:text-white hover:bg-white/[0.08]'}`}
                >
                  <span className="w-3.5 flex-none">{item.checked && <Check size={11} />}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-[10px] text-white/30 font-mono flex-none">{item.hint}</span>}
                </button>
              ))}
            </AnchoredPopover>
          )}
        </div>
      ))}
    </div>
  );
};
