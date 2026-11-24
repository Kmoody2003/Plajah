import React, { useEffect, useRef, useState } from 'react';

/**
 * Small popover menu used by the profile header ("More" for visitors, "My tools" for the owner).
 * Closes on outside click and Escape. Items stay plain buttons so every action that used to be a
 * pill is still one click away, just not on screen all the time.
 */
export const MENU_ITEM_CLS =
  'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[13px] font-bold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00DAF3] transition-colors disabled:opacity-50';

export const MenuHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.25em] text-white/60">{children}</div>
);

export const MenuDivider: React.FC = () => <div className="my-1.5 mx-2 h-px bg-white/10" />;

export const MenuItem: React.FC<{
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  disabled?: boolean;
}> = ({ onClick, icon, title, sub, disabled }) => (
  <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={MENU_ITEM_CLS}>
    {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.08]">{icon}</span>}
    <span className="min-w-0">
      <span className="block truncate">{title}</span>
      {sub && <span className="block truncate text-[11px] font-medium text-white/60">{sub}</span>}
    </span>
  </button>
);

interface ProfileMenuProps {
  /** Renders the trigger button. Spread `aria` onto it. */
  trigger: (o: { open: boolean; toggle: () => void; aria: Record<string, any> }) => React.ReactNode;
  /** Menu body. Call `close()` after an action that should dismiss the menu. */
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({ trigger, children, align = 'left', width = 300 }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen(o => !o), aria: { 'aria-haspopup': 'menu', 'aria-expanded': open } })}
      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-2 rounded-[22px] border border-white/15 bg-[#0e0b17] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)] ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ width, maxWidth: 'calc(100vw - 32px)' }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
