import React, { useEffect, useState } from 'react';
import { Music, Film, BookOpen, Check, ShoppingBag, Globe } from 'lucide-react';
import type { StatCardData, StatCardCategoryRow } from '../../types';

// The Plajah trading card. ONE renderer for any subject (profile / world / character / …). Fixed
// pixel size so html2canvas exports a crisp, deterministic image. Deliberately avoids backdrop-blur,
// mask and color-mix (html2canvas can't rasterize them) — all depth is done with solid gradients.

export const CARD_W = 340;
export const CARD_H = 524;

const BRAND = { purple: '#6B0099', magenta: '#D40055', orange: '#FF8C00' };
const BRAND_GRAD = `linear-gradient(135deg, ${BRAND.purple} 0%, ${BRAND.magenta} 55%, ${BRAND.orange} 100%)`;

const CAT_ICON: Record<string, React.ReactNode> = {
  MUSIC: <Music size={13} />, FILM: <Film size={13} />, BOOK: <BookOpen size={13} />,
};

// Score → collectible tier. Gives every card a rarity read at a glance (like a real trading card),
// and tints the score foil. Solid gradients only (html2canvas-safe).
type Tier = { label: string; from: string; to: string; text: string };
function tierFor(score: number): Tier {
  if (score >= 5000) return { label: 'Diamond', from: '#8be9fd', to: '#6b8cff', text: '#0b0910' };
  if (score >= 1500) return { label: 'Platinum', from: '#e8ecf0', to: '#a7c7d6', text: '#0b0910' };
  if (score >= 500)  return { label: 'Gold',     from: '#ffdf6e', to: '#d4a017', text: '#0b0910' };
  if (score >= 100)  return { label: 'Silver',   from: '#e6e6e6', to: '#9aa0a6', text: '#0b0910' };
  return { label: 'Bronze', from: '#e0a066', to: '#a9703c', text: '#1a0e05' };
}

// Diagonal foil sweep — the collectible-card sheen. Sits above artwork, below nothing interactive.
const FOIL_SHEEN = 'linear-gradient(118deg, transparent 34%, rgba(255,255,255,.05) 44%, rgba(255,255,255,.14) 50%, rgba(255,255,255,.05) 56%, transparent 66%)';

function useQr(url: string): string {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then(QR =>
      (QR.default || QR).toDataURL(url, { margin: 1, width: 220, color: { dark: '#0b0910', light: '#ffffff' } })
        .then((d: string) => { if (alive) setDataUrl(d); }).catch(() => {}),
    );
    return () => { alive = false; };
  }, [url]);
  return dataUrl;
}

const Face: React.FC<{ back?: boolean; children: React.ReactNode; innerRef?: React.Ref<HTMLDivElement> }> = ({ back, children, innerRef }) => (
  <div
    ref={innerRef}
    style={{
      position: 'absolute', inset: 0, width: CARD_W, height: CARD_H,
      borderRadius: 22, overflow: 'hidden',
      backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
      transform: back ? 'rotateY(180deg)' : 'none',
      background: '#0b0910',
      boxShadow: '0 24px 60px -24px rgba(0,0,0,.7)',
    }}
  >
    {/* gradient frame */}
    <div style={{ position: 'absolute', inset: 0, borderRadius: 22, padding: 2, background: BRAND_GRAD }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 20, background: '#0b0910', overflow: 'hidden', position: 'relative' }}>
        {children}
        {/* Foil sweep — subtle collectible sheen over the whole face */}
        <div style={{ position: 'absolute', inset: 0, background: FOIL_SHEEN, pointerEvents: 'none', zIndex: 6 }} />
      </div>
    </div>
  </div>
);

const StatChip: React.FC<{ label: string; value: React.ReactNode; hint?: string; color?: string }> = ({ label, value, hint, color }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <div style={{ fontSize: 22, fontWeight: 900, color: color || '#fff', lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{hint ? `${hint} ` : ''}{label}</div>
  </div>
);

const CategoryRow: React.FC<{ row: StatCardCategoryRow }> = ({ row }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 74, color: '#ff5c9d' }}>
      {CAT_ICON[row.key] || <Music size={13} />}
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)' }}>{row.label}</span>
    </div>
    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
      {row.thumbnails.length ? row.thumbnails.slice(0, 4).map((t, i) => (
        <div key={i} style={{ width: 30, height: 30, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,.06)', flex: 'none' }}>
          <img src={t} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        </div>
      )) : <span style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', fontWeight: 700 }}>—</span>}
    </div>
    <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>{row.count}</div>
  </div>
);

const StatCardFront: React.FC<{ data: StatCardData; qr: string; innerRef?: React.Ref<HTMLDivElement> }> = ({ data, qr, innerRef }) => {
  const scoreStat = data.stats.find(s => s.hint === 'Score' || /score/i.test(s.label));
  const scoreNum = typeof scoreStat?.value === 'number' ? scoreStat.value : parseInt(String(scoreStat?.value || '0'), 10) || 0;
  const tier = tierFor(scoreNum);
  const tierGrad = `linear-gradient(135deg, ${tier.from}, ${tier.to})`;
  return (
  <Face innerRef={innerRef}>
    {/* Cover blends into the card background */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 168 }}>
      {data.coverImage && <img src={data.coverImage} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
      <div style={{ position: 'absolute', inset: 0, background: data.coverImage ? 'linear-gradient(180deg, rgba(11,9,16,.15) 0%, rgba(11,9,16,.55) 55%, #0b0910 100%)' : BRAND_GRAD }} />
      {!data.coverImage && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,9,16,0) 40%, #0b0910 100%)' }} />}
    </div>

    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: 16 }}>
      {/* brand eyebrow */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.3em', textTransform: 'uppercase', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>Plajah · Stat Card</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* Collectible tier — rarity read at a glance */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: tierGrad, color: tier.text, fontSize: 7.5, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, boxShadow: '0 2px 8px -2px rgba(0,0,0,.5)' }}>★ {tier.label}</span>
          {data.verified && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: BRAND_GRAD, color: '#fff', fontSize: 7.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 999 }}><Check size={9} /> Verified</span>}
        </div>
      </div>

      {/* hero + name */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 60 }}>
        <div style={{ width: 76, height: 76, borderRadius: 16, padding: 2, background: BRAND_GRAD, flex: 'none' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', background: '#1b1522' }}>
            {data.heroImage && <img src={data.heroImage} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
          <div style={{ fontSize: data.title.length > 14 ? 19 : 24, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-.02em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.title}</div>
          {data.subtitle && <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.5)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.subtitle}</div>}
        </div>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: 4, marginTop: 16, padding: '12px 4px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        {data.stats.slice(0, 3).map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />}
            <StatChip label={s.label} value={typeof s.value === 'number' ? s.value.toLocaleString() : s.value} hint={s.hint} color={s === scoreStat ? tier.from : undefined} />
          </React.Fragment>
        ))}
      </div>

      {/* category rows */}
      <div style={{ marginTop: 12, flex: 1 }}>
        {data.categories.map(row => <CategoryRow key={row.key} row={row} />)}
      </div>

      {/* footer: QR + wordmark */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', background: BRAND_GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Plajah</div>
          <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{data.footnote || 'plajah.com'}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 10, background: '#fff', padding: 4 }}>
            {qr && <img src={qr} style={{ width: '100%', height: '100%' }} alt="QR" />}
          </div>
          <div style={{ fontSize: 6.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginTop: 4 }}>Scan to view</div>
        </div>
      </div>
    </div>
  </Face>
  );
};

const StatCardBack: React.FC<{ data: StatCardData; onMerch?: () => void; innerRef?: React.Ref<HTMLDivElement> }> = ({ data, onMerch, innerRef }) => (
  <Face back innerRef={innerRef}>
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,140,0,.14), transparent 55%), radial-gradient(120% 80% at 0% 100%, rgba(139,47,214,.16), transparent 55%)' }} />
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: 18 }}>
      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Connect</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-.02em', marginTop: 2, marginBottom: 14 }}>{data.title}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {(data.socials && data.socials.length) ? data.socials.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', textDecoration: 'none' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff' }}>{s.platform}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{s.url.replace(/^https?:\/\//, '')}</span>
          </a>
        )) : <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', padding: '8px 0' }}>No social links added yet.</div>}
      </div>

      {data.merch && (
        <button onClick={onMerch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 14, border: 0, cursor: 'pointer', background: BRAND_GRAD, color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 8 }}>
          <ShoppingBag size={13} /> {data.merch.label}
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}><Globe size={10} /> {(data.footnote || 'plajah.com')}</span>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-.02em', background: BRAND_GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Plajah</span>
      </div>
    </div>
  </Face>
);

interface StatCardProps {
  data: StatCardData;
  flipped?: boolean;
  onMerch?: () => void;
  /** Refs to each face for html2canvas export (the parent's 3D transform is bypassed). */
  frontRef?: React.Ref<HTMLDivElement>;
  backRef?: React.Ref<HTMLDivElement>;
}

const StatCard: React.FC<StatCardProps> = ({ data, flipped = false, onMerch, frontRef, backRef }) => {
  const qr = useQr(data.qrUrl);
  return (
    <div style={{ width: CARD_W, height: CARD_H, perspective: 1400 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform .6s cubic-bezier(.2,.7,.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none' }}>
        <StatCardFront data={data} qr={qr} innerRef={frontRef} />
        <StatCardBack data={data} onMerch={onMerch} innerRef={backRef} />
      </div>
    </div>
  );
};

export default StatCard;
