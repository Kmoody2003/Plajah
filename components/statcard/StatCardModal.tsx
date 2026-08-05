import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Download, Link as LinkIcon, Check, Sparkles, ImagePlus, Loader2, ShoppingBag } from 'lucide-react';
import StatCard from './StatCard';
import type { Album, StatCardData, UserProfile } from '../../types';
import { loadProfileStatCard } from '../../services/statCardService';
import { uploadFile, updateUserProfile, auth } from '../../services/backendService';

interface StatCardModalProps {
  uid: string;
  profile?: UserProfile;
  content?: Album[];
  isOwn?: boolean;
  onClose: () => void;
  onOpenStore?: (uid: string) => void;
}

/** Wait for every <img> in the card to finish loading, so html2canvas captures a complete card
 *  (not a half-painted one) — important for the automatic background capture on open. */
async function waitForImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0)
    ? Promise.resolve()
    : new Promise<void>(res => { img.addEventListener('load', () => res(), { once: true }); img.addEventListener('error', () => res(), { once: true }); })));
}

/** Capture a fixed-size card face to a PNG data URL (crisp 3x). */
async function faceToPng(el: HTMLElement): Promise<string | null> {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null, logging: false });
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

const StatCardModal: React.FC<StatCardModalProps> = ({ uid, profile, content, isOwn, onClose, onOpenStore }) => {
  const [data, setData] = useState<StatCardData | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState<'save' | 'card' | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedCard, setSavedCard] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    let alive = true;
    loadProfileStatCard(uid, profile, content).then(d => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  const download = async () => {
    const el = (flipped ? backRef : frontRef).current;
    if (!el) return;
    setBusy('save');
    const png = await faceToPng(el);
    setBusy(null);
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = `${(data?.title || 'plajah').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_stat_card.png`;
    a.click();
  };

  const copyLink = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Owner: render the FRONT to an image, upload it, and set it as the profile's share/link-preview
  // card. Runs automatically in the background on open (silent) and can be re-triggered manually.
  const syncPreview = async (silent: boolean) => {
    if (!frontRef.current || !isOwn) return;
    if (!silent) setBusy('card');
    try {
      await waitForImages(frontRef.current);   // capture a fully-painted card, not a half-loaded one
      const png = await faceToPng(frontRef.current);
      if (png) {
        const blob = await (await fetch(png)).blob();
        const url = await uploadFile(`stat-cards/${uid}/profile.png`, blob);
        await updateUserProfile(uid, { statCardImageUrl: url });
        setPreviewReady(true);
        if (!silent) { setSavedCard(true); setTimeout(() => setSavedCard(false), 2200); }
      }
    } catch { /* */ }
    if (!silent) setBusy(null);
  };

  // Auto-set the card as the profile's link preview the moment it's ready, so "share your profile →
  // the card is the preview" just works with no extra tap. Once per open; images awaited inside.
  useEffect(() => {
    if (!isOwn || !data || autoRan.current) return;
    autoRan.current = true;
    const t = setTimeout(() => { syncPreview(true); }, 400); // let the card paint first
    return () => clearTimeout(t);
  }, [isOwn, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Owner customization: swap the hero / cover image (persisted to statCardConfig, live-previewed).
  const pickImage = (which: 'heroImage' | 'coverImage') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    const url = await uploadFile(`stat-cards/${uid}/${which}_${Date.now()}.jpg`, file).catch(() => '');
    if (!url) return;
    setData(d => d ? { ...d, [which]: url } : d);
    if (isOwn) updateUserProfile(uid, { statCardConfig: { ...(profile?.statCardConfig || {}), [which]: url } } as any).catch(() => {});
  };

  const merch = () => { onOpenStore?.(uid); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm flex flex-col items-center gap-5"
      >
        <button onClick={onClose} className="absolute -top-2 -right-2 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X size={16} /></button>

        {data ? (
          <StatCard data={data} flipped={flipped} frontRef={frontRef} backRef={backRef} onMerch={merch} />
        ) : (
          <div className="w-[340px] h-[524px] rounded-[22px] bg-white/5 border border-white/10 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-white/40" />
          </div>
        )}

        {/* actions */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => setFlipped(f => !f)} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all">
            <RefreshCw size={13} /> Flip
          </button>
          <button onClick={download} disabled={busy === 'save'} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
            {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Save image
          </button>
          <button onClick={copyLink} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all">
            {copied ? <Check size={13} className="text-green-400" /> : <LinkIcon size={13} />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        {isOwn && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={() => syncPreview(false)} disabled={busy === 'card'} title="Your profile link automatically previews as this card; tap to refresh it now" className="flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
              {busy === 'card' ? <Loader2 size={13} className="animate-spin" /> : (savedCard || previewReady) ? <Check size={13} /> : <Sparkles size={13} />}
              {busy === 'card' ? 'Updating…' : (savedCard || previewReady) ? 'Link preview ready' : 'Set as link preview'}
            </button>
            <button onClick={() => setShowCustomize(s => !s)} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all">
              <ImagePlus size={13} /> Customize
            </button>
          </div>
        )}

        {isOwn && showCustomize && (
          <div className="w-full max-w-[340px] flex flex-col gap-2 p-4 rounded-2xl bg-white/[0.05] border border-white/10">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Customize your card</p>
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all">
                <ImagePlus size={12} /> Profile photo
                <input type="file" accept="image/*" className="hidden" onChange={pickImage('heroImage')} />
              </label>
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all">
                <ImagePlus size={12} /> Cover image
                <input type="file" accept="image/*" className="hidden" onChange={pickImage('coverImage')} />
              </label>
            </div>
            <p className="text-[8px] text-white/30 leading-relaxed">The cover blends into the card. Your link preview auto-updates from this card — tap “Link preview ready” to refresh it now after customizing.</p>
          </div>
        )}

        <p className="text-[9px] text-white/30 text-center leading-relaxed max-w-[300px]">
          Flip the card for socials &amp; your merch store. Sharing your profile uses this card as the link preview.
        </p>
      </motion.div>
    </div>,
    document.body,
  );
};

export default StatCardModal;
