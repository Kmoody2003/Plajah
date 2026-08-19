import React from 'react';
import { Photo } from '../../types';

/**
 * PORTFOLIO view — a case-study layout for designers and artists. A hero board
 * followed by a supporting grid, repeated. A gallery doubles as a portfolio.
 */
const GalleryPortfolio: React.FC<{ photos: Photo[]; title?: string }> = ({ photos, title }) => {
  if (!photos.length) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--pj-faint, #6E6480)' }}>
        No photos in this gallery yet.
      </div>
    );
  }

  // Break into "cases": each case = 1 hero + up to 6 grid photos.
  const cases: { hero: Photo; grid: Photo[] }[] = [];
  let i = 0;
  while (i < photos.length) {
    const hero = photos[i];
    const grid = photos.slice(i + 1, i + 7);
    cases.push({ hero, grid });
    i += 7;
  }

  return (
    <div style={{ padding: 20 }}>
      <style>{`
        .pjg-pcase{border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:16px;overflow:hidden;margin-bottom:14px;background:var(--pj-glass-1,rgba(255,255,255,.045))}
        .pjg-pcase .big{aspect-ratio:16/7;position:relative;background:#0a0812}
        .pjg-pcase .big img{width:100%;height:100%;object-fit:cover;display:block}
        .pjg-pcase .cap{padding:12px 14px;display:flex;align-items:center;gap:12px}
        .pjg-pcase .cap h4{font-style:italic;margin:0;font-size:1.05rem;font-weight:900;color:var(--text-primary,#F6F1FB)}
        .pjg-pcase .cap .tag{font-size:.6rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--pj-faint,#6E6480);margin-left:auto}
        .pjg-pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
        .pjg-pgrid .cell{aspect-ratio:4/3;border-radius:12px;overflow:hidden;border:1px solid var(--pj-border,rgba(255,255,255,.08));background:#0a0812}
        .pjg-pgrid .cell img{width:100%;height:100%;object-fit:cover;display:block}
      `}</style>

      {cases.map((c, ci) => (
        <React.Fragment key={c.hero.id}>
          <div className="pjg-pcase">
            <div className="big">
              <img src={c.hero.url} alt={c.hero.title || ''} referrerPolicy="no-referrer" loading="lazy" />
            </div>
            <div className="cap">
              <h4>{c.hero.title || (ci === 0 ? (title || 'Portfolio') : `Case ${ci + 1}`)}</h4>
              <span className="tag">{c.grid.length + 1} boards</span>
            </div>
          </div>
          {c.grid.length > 0 && (
            <div className="pjg-pgrid">
              {c.grid.map(p => (
                <div key={p.id} className="cell">
                  <img src={p.url} alt={p.title || ''} referrerPolicy="no-referrer" loading="lazy" />
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default GalleryPortfolio;
