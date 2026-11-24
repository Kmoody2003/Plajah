import React, { useEffect, useState } from 'react';
import { useEffectiveThemeSpec } from '../services/themeRuntime';
import { backgroundCss, backgroundLuminance } from '../services/themeBackground';
import { setBackgroundTone, clearBackgroundTone } from '../services/themeContrast';

/**
 * Draws the active ThemeSpec's background (solid / gradient / pattern / photo-video slideshow)
 * inside #universal-background, and tells the contrast engine how bright it is. Synthetic
 * backgrounds are measured from their colours, so no image sampling is needed.
 */
const ThemeSpecBackground: React.FC = () => {
  const spec = useEffectiveThemeSpec();
  const bg = spec?.background;
  const css = backgroundCss(bg);
  const media = bg?.kind === 'media' ? (spec?.mediaAssets ?? []) : [];
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [spec?.id, media.length]);

  // Photos advance on a timer; videos advance when they end (see onEnded below).
  useEffect(() => {
    if (media.length < 2) return;
    const cur = media[idx % media.length];
    if (cur.type === 'VIDEO') return;
    const t = window.setTimeout(() => setIdx(i => (i + 1) % media.length), Math.max(4, spec?.slideSeconds ?? 12) * 1000);
    return () => window.clearTimeout(t);
  }, [idx, media.length, spec?.slideSeconds]);

  const active = css || media.length > 0;
  useEffect(() => {
    const body = document.body;
    if (!active) { body.classList.remove('has-theme-bg', 'theme-bg-media'); return; }
    body.classList.add('has-theme-bg');
    body.classList.toggle('theme-bg-media', media.length > 0);
    const lum = css ? backgroundLuminance(bg) : null;
    if (lum !== null) setBackgroundTone(lum); else if (media.length) setBackgroundTone(null);
    return () => { body.classList.remove('has-theme-bg', 'theme-bg-media'); if (!body.classList.contains('has-custom-background')) clearBackgroundTone(); };
  }, [active, spec?.id, spec?.updatedAt, css?.backgroundColor, css?.background, css?.backgroundImage]);

  if (!active) return null;
  const cur = media.length ? media[idx % media.length] : null;

  return (
    <div className="absolute inset-0 transition-opacity duration-700" aria-hidden>
      {css && <div className="absolute inset-0" style={css as React.CSSProperties} />}
      {cur && (cur.type === 'VIDEO' ? (
        <video key={cur.id} src={cur.url} autoPlay muted playsInline loop={media.length < 2}
          onEnded={() => setIdx(i => (i + 1) % media.length)}
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div key={cur.id} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${cur.url})` }} />
      ))}
    </div>
  );
};

export default ThemeSpecBackground;
