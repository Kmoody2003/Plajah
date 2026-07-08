// Device-level preference for suppressing native `title` tooltips. On mobile /
// in the WebView, long-pressing a control pops its title tooltip, which is
// distracting — this lets the user turn all tooltips off. See TooltipSuppressor,
// which strips `title` attributes app-wide when this is on, and the toggle in the
// GlobalPlayer overflow sheet.
const KEY = 'plajah:tooltips-off';
export const TOOLTIPS_EVENT = 'plajah:tooltips-changed';

export const areTooltipsOff = (): boolean => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export const setTooltipsOff = (off: boolean): void => {
  try { localStorage.setItem(KEY, off ? '1' : '0'); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(TOOLTIPS_EVENT, { detail: off }));
};
