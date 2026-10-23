// "Play on open": a page that hands the viewer to a film's landing page (Ravencrest's billboards
// and paintings) asks for the film to start straight away, exactly as if Watch Now were pressed
// (studio ident first). The next film page opened within a few seconds consumes the request;
// leaving the player then lands on that film's page as usual.
const KEY = 'plajah_film_autoplay_at';
const WINDOW_MS = 20000;

export function requestAutoplay() {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
}

/** True once, for the first film page opened after a request. */
export function consumeAutoplay(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    if (!at) return false;
    sessionStorage.removeItem(KEY);
    return Date.now() - at < WINDOW_MS;
  } catch { return false; }
}
