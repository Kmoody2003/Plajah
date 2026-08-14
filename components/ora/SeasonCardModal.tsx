import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Link as LinkIcon, Check, RotateCw, Loader2 } from 'lucide-react';
import StatCard from '../statcard/StatCard';
import { Button, IconButton } from '../ui';
import { buildSeasonCard } from '../../services/oraSeasonCard';
import type { StatCardData } from '../../types';

/**
 * Ora — the Season Card modal.
 *
 * A thin shell around the shared StatCard renderer: build the card from real
 * season data, let the user flip it, download it as an image, or copy the link.
 * The image-export path is the same html2canvas 3× capture the profile card uses.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §3.5
 */

async function faceToPng(el: HTMLElement): Promise<string | null> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null, logging: false });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export const SeasonCardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [data, setData] = useState<StatCardData | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    buildSeasonCard().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Escape closes; the modal owns focus while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    const el = (flipped ? backRef : frontRef).current;
    if (!el) return;
    setBusy(true);
    const png = await faceToPng(el);
    setBusy(false);
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = `ora_season_card.png`;
    a.click();
  };

  const copyLink = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.shareUrl).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Season card"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'grid', placeItems: 'center', padding: 'var(--pj-space-6)',
        background: 'color-mix(in srgb, var(--bg-color) 78%, transparent)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 'var(--pj-space-5)', placeItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pj-space-3)', width: '100%' }}>
          <p className="pj-eyebrow" style={{ marginRight: 'auto' }}>Your season</p>
          <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
        </div>

        {data ? (
          <StatCard data={data} flipped={flipped} frontRef={frontRef} backRef={backRef} />
        ) : (
          <div style={{ width: 340, height: 524, display: 'grid', placeItems: 'center' }}>
            <Loader2 className="animate-spin" style={{ color: 'var(--on-surface-variant)' }} />
          </div>
        )}

        <div className="pj-row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon={<RotateCw />} onClick={() => setFlipped((f) => !f)}>
            Flip
          </Button>
          <Button variant="secondary" size="sm" icon={copied ? <Check /> : <LinkIcon />} onClick={copyLink} disabled={!data}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button variant="primary" size="sm" icon={<Download />} loading={busy} onClick={download} disabled={!data}>
            Save image
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SeasonCardModal;
