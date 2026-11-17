/**
 * Glass dropdowns: the browser's own option list is white with white text on this dark glass panel (unreadable), and it cannot be styled. Each <select> inside `root` is hidden and
 * replaced by a button that opens a frosted purple list with an orange highlight. The real select stays in the page and keeps working: choosing an item sets its value and fires `input`
 * and `change`, and the button's label follows the select when code changes its value.
 */
const CSS = `
.gs { position: relative; display: inline-block; min-width: 150px; max-width: 100%; }
.gs-btn { width: 100%; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer;
  background: rgba(40,10,64,.55); color: #eadcff; border: 1px solid rgba(208,188,255,.28); border-radius: 999px; padding: 5px 12px; font: 600 11px Outfit, Inter, sans-serif; letter-spacing: .02em;
  backdrop-filter: blur(10px); transition: border-color .15s, box-shadow .15s; }
.gs-btn:hover, .gs.open .gs-btn { border-color: #ff8c00; box-shadow: 0 0 14px rgba(255,140,0,.28); }
.gs-btn svg { flex: none; opacity: .8; transition: transform .15s; }
.gs.open .gs-btn svg { transform: rotate(180deg); }
.gs-list { position: fixed; z-index: 2147483000; display: none; overflow-y: auto; padding: 6px; border-radius: 16px; max-height: 46vh;
  background: linear-gradient(180deg, rgba(48,14,76,.96), rgba(20,4,36,.97)); border: 1px solid rgba(208,188,255,.3); box-shadow: 0 18px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(255,140,0,.12);
  backdrop-filter: blur(18px); scrollbar-width: thin; scrollbar-color: rgba(255,140,0,.6) transparent; }
.gs-list.open { display: block; }
.gs-opt { padding: 7px 12px; border-radius: 10px; cursor: pointer; color: #d8c8f5; font: 500 12px Inter, Outfit, sans-serif; white-space: nowrap; }
.gs-opt:hover, .gs-opt.hot { background: rgba(255,140,0,.9); color: #1b0830; }
.gs-opt.sel { color: #ffb347; font-weight: 700; }
.gs-opt.sel:hover, .gs-opt.sel.hot { color: #1b0830; }
.gs-opt.group { cursor: default; color: rgba(208,188,255,.5); font: 700 10px Outfit, sans-serif; letter-spacing: .18em; text-transform: uppercase; padding: 8px 12px 3px; }
.gs-opt.group:hover { background: none; color: rgba(208,188,255,.5); }
`;

let styled = false, openList: { close: () => void } | null = null;

function glassify1(sel: HTMLSelectElement): void {
  if ((sel as unknown as { _gs?: boolean })._gs) return;
  (sel as unknown as { _gs?: boolean })._gs = true;
  const wrap = document.createElement('span'); wrap.className = 'gs';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gs-btn';
  btn.innerHTML = '<span class="gs-label"></span><svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>';
  const list = document.createElement('div'); list.className = 'gs-list';
  sel.style.display = 'none';
  sel.parentElement?.insertBefore(wrap, sel); wrap.append(btn, sel);
  document.body.appendChild(list);
  const label = btn.querySelector('.gs-label') as HTMLElement;
  const text = (o: HTMLOptionElement): string => o.textContent ?? '';
  const refresh = (): void => { const o = sel.options[sel.selectedIndex]; label.textContent = o ? text(o) : ''; btn.disabled = sel.disabled; };
  const close = (): void => { list.classList.remove('open'); wrap.classList.remove('open'); if (openList?.close === close) openList = null; };
  const open = (): void => {
    openList?.close();
    list.innerHTML = '';
    let hot = -1;
    Array.from(sel.children).forEach((c) => {
      const addOpt = (o: HTMLOptionElement): void => {
        const d = document.createElement('div'); d.className = 'gs-opt' + (o.selected ? ' sel' : ''); d.textContent = text(o);
        if (o.disabled) d.style.opacity = '.4';
        d.onclick = (): void => { if (o.disabled) return; sel.value = o.value; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); refresh(); close(); };
        list.appendChild(d); if (o.selected) hot = list.children.length - 1;
      };
      if (c instanceof HTMLOptGroupElement) { const g = document.createElement('div'); g.className = 'gs-opt group'; g.textContent = c.label; list.appendChild(g); Array.from(c.children).forEach((o) => addOpt(o as HTMLOptionElement)); }
      else addOpt(c as HTMLOptionElement);
    });
    const r = btn.getBoundingClientRect();
    list.style.minWidth = Math.max(r.width, 180) + 'px';
    list.classList.add('open'); wrap.classList.add('open');
    // below the button, or above it when there is no room; kept inside the window
    const h = list.offsetHeight, below = innerHeight - r.bottom - 12, above = r.top - 12;
    list.style.maxHeight = Math.max(160, Math.min(innerHeight * 0.46, Math.max(below, above))) + 'px';
    const top = below >= Math.min(h, 220) || below >= above ? r.bottom + 6 : Math.max(8, r.top - Math.min(list.offsetHeight, above) - 6);
    list.style.top = top + 'px'; list.style.left = Math.min(r.left, innerWidth - list.offsetWidth - 8) + 'px';
    (list.children[Math.max(hot, 0)] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    openList = { close };
  };
  btn.onclick = (e): void => { e.stopPropagation(); if (list.classList.contains('open')) close(); else open(); };
  btn.onkeydown = (e): void => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1))); sel.selectedIndex = n; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); refresh(); }
  };
  addEventListener('pointerdown', (e) => { if (list.classList.contains('open') && !list.contains(e.target as Node) && !btn.contains(e.target as Node)) close(); }, true);
  addEventListener('resize', close);
  sel.addEventListener('change', refresh);
  refresh();
  // code sets select values without events (restoring saved settings): keep the label current while the panel is in use
  setInterval(() => { if (btn.offsetParent !== null) refresh(); }, 600);
}

export function glassSelects(root: ParentNode = document): void {
  if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  root.querySelectorAll('select').forEach((s) => glassify1(s as HTMLSelectElement));
}
