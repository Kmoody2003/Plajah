import React from 'react';
import { Photo } from '../../types';

/**
 * MODERN view — an editorial, minimalist photo flow. Big photos, generous space,
 * hover reveals an EXIF/title plate. The approachable default. Pure CSS, real photos.
 */
const GalleryModern: React.FC<{ photos: Photo[] }> = ({ photos }) => {
  if (!photos.length) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--pj-faint, #6E6480)' }}>
        No photos in this gallery yet.
      </div>
    );
  }

  const [hero, ...rest] = photos;

  // Chunk the remainder into an editorial rhythm: pair, full-width, pair, ...
  const rows: { photos: Photo[]; wide: boolean }[] = [];
  let i = 0;
  let step = 0;
  while (i < rest.length) {
    const wide = step % 3 === 2; // every third block is a single full-width photo
    if (wide) {
      rows.push({ photos: [rest[i]], wide: true });
      i += 1;
    } else {
      rows.push({ photos: rest.slice(i, i + 2), wide: false });
      i += 2;
    }
    step += 1;
  }

  const exif = (p: Photo) => {
    const bits: string[] = [];
    if (p.width && p.height) bits.push(`${p.width}×${p.height}`);
    if (p.tags?.length) bits.push(p.tags.slice(0, 2).join(' · '));
    return bits.join('  ·  ');
  };

  const Plate: React.FC<{ p: Photo }> = ({ p }) => (
    <div className="pjg-plate">
      {(p.title || p.description) && <div className="pjg-plate-t">{p.title || p.description}</div>}
      {exif(p) && <div className="pjg-plate-s">{exif(p)}</div>}
    </div>
  );

  return (
    <div style={{ padding: 20 }}>
      <style>{`
        .pjg-modern-hero{aspect-ratio:21/9;border-radius:14px;position:relative;overflow:hidden;margin-bottom:14px;border:1px solid var(--pj-border,rgba(255,255,255,.08));background:#0a0812}
        .pjg-modern-hero img,.pjg-mph img{width:100%;height:100%;object-fit:cover;display:block}
        .pjg-modern-hero .cap{position:absolute;left:16px;bottom:14px;font-weight:800;font-size:.9rem;text-shadow:0 1px 8px #000;color:#fff}
        .pjg-mrow{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .pjg-mrow.one{grid-template-columns:1fr}
        .pjg-mph{border-radius:12px;position:relative;overflow:hidden;border:1px solid var(--pj-border,rgba(255,255,255,.08));background:#0a0812;aspect-ratio:4/5}
        .pjg-mrow.one .pjg-mph{aspect-ratio:16/8}
        .pjg-plate{position:absolute;left:12px;bottom:11px;opacity:0;transition:.25s}
        .pjg-mph:hover .pjg-plate,.pjg-modern-hero:hover .pjg-plate{opacity:1}
        .pjg-plate-t{font-weight:700;font-size:.78rem;text-shadow:0 1px 6px #000;color:#fff}
        .pjg-plate-s{font-size:.66rem;color:rgba(255,255,255,.7)}
      `}</style>

      <div className="pjg-modern-hero">
        <img src={hero.url} alt={hero.title || ''} referrerPolicy="no-referrer" loading="lazy" />
        {(hero.title || hero.description) && <span className="cap">{hero.title || hero.description}</span>}
      </div>

      {rows.map((row, ri) => (
        <div key={ri} className={`pjg-mrow ${row.wide ? 'one' : ''}`}>
          {row.photos.map(p => (
            <div key={p.id} className="pjg-mph">
              <img src={p.url} alt={p.title || ''} referrerPolicy="no-referrer" loading="lazy" />
              <Plate p={p} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default GalleryModern;
