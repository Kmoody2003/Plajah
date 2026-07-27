import React, { useState, useEffect } from 'react';
import { Share2, Link as LinkIcon, Mail, X, Facebook, Check, MessageCircle, Instagram, Sparkles, Loader2, Download, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Portal from './Portal';
import EmbedShareGuide from './EmbedShareGuide';
import { generateShareCard } from '../src/lib/shareCard';

// Show the "your link plays music" guide at most once per session.
let _embedGuideShown = false;

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  imageUrl?: string;
  /** Artist/creator — drawn on the auto-generated share card. */
  artist?: string;
  className?: string;
  /** Optional visible text next to the icon (turns the icon-only control into a labeled pill). */
  label?: string;
  /** Icon size (px). Defaults to 18. */
  iconSize?: number;
  /** When provided, the menu shows a "Post to Plajah feed" action that runs this
   *  (e.g. createPost). The button then always opens the menu so it's reachable. */
  onPostToPlajah?: () => void | Promise<void>;
  plajahLabel?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ title, text, url, imageUrl, artist, className, label, iconSize = 18, onPostToPlajah, plajahLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [card, setCard] = useState<{ dataUrl: string; blob: Blob | null } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const shareUrl = url || window.location.href;
  // Album/track/video links render a playable mini-player when shared — show the guide.
  const isEmbedLink = /[?&]type=(album|video|feed)\b/.test(shareUrl) || shareUrl.includes('/embed') || shareUrl.includes('/share?');

  // First time a user opens share for an embed link this session, surface the guide.
  useEffect(() => {
    if (isOpen && isEmbedLink && !_embedGuideShown) { _embedGuideShown = true; setShowGuide(true); }
  }, [isOpen, isEmbedLink]);

  // Paint the gorgeous share card (cover + caption) when the menu opens.
  useEffect(() => {
    if (!isOpen || card) return;
    let alive = true;
    generateShareCard({ coverUrl: imageUrl, title, artist }).then(c => { if (alive) setCard(c); });
    return () => { alive = false; };
  }, [isOpen, imageUrl, title, artist]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadCard = () => {
    if (!card) return;
    const a = document.createElement('a');
    a.href = card.dataUrl;
    a.download = `${(title || 'plajah').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_plajah.jpg`;
    a.click();
  };

  const postToPlajah = async () => {
    if (!onPostToPlajah || posting) return;
    setPosting(true);
    try { await onPostToPlajah(); setPosted(true); setTimeout(() => { setPosted(false); setIsOpen(false); }, 1400); }
    catch { /* keep menu open on failure */ }
    finally { setPosting(false); }
  };

  // With a Plajah action present, open the menu directly (so it's never skipped
  // by the native share sheet); otherwise prefer the OS share sheet.
  const handleButtonClick = () => { if (onPostToPlajah) setIsOpen(true); else handleNativeShare(); };

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        const shareData: ShareData = { title, text, url: shareUrl };
        // Prefer the gorgeous generated card; else the raw cover.
        if (navigator.canShare) {
          try {
            const c = card || await generateShareCard({ coverUrl: imageUrl, title, artist });
            let blob = c?.blob || null;
            if (!blob && imageUrl) { blob = await (await fetch(imageUrl)).blob(); }
            if (blob) {
              const file = new File([blob], 'plajah-share.jpg', { type: blob.type || 'image/jpeg' });
              const withFile = { ...shareData, files: [file] };
              if (navigator.canShare(withFile)) { await navigator.share(withFile); return; }
            }
          } catch {
            // fall through to share without file
          }
        }
        await navigator.share(shareData);
      } catch (err) {
        setIsOpen(true);
      }
    } else {
      setIsOpen(true);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank'
    );
  };

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank'
    );
  };

  const shareToWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text + '\n\n' + shareUrl)}`,
      '_blank'
    );
  };

  const shareToInstagram = () => {
    // Instagram doesn't have a direct web share URL, copy the link and prompt user
    navigator.clipboard.writeText(shareUrl);
    window.open('https://www.instagram.com/', '_blank');
  };

  const shareViaEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + shareUrl)}`;
  };

  const SHARE_OPTIONS = [
    {
      label: 'Copy Link',
      icon: copied ? <Check size={18} /> : <LinkIcon size={18} />,
      onClick: copyToClipboard,
      hoverClass: 'group-hover:bg-small-orange group-hover:text-white',
    },
    {
      label: 'Email',
      icon: <Mail size={18} />,
      onClick: shareViaEmail,
      hoverClass: 'group-hover:bg-blue-500 group-hover:text-white',
    },
    {
      label: copied ? 'Copied!' : 'X / Twitter',
      icon: <X size={18} />,
      onClick: shareToX,
      hoverClass: 'group-hover:bg-white group-hover:text-black',
    },
    {
      label: 'Facebook',
      icon: <Facebook size={18} />,
      onClick: shareToFacebook,
      hoverClass: 'group-hover:bg-blue-600 group-hover:text-white',
    },
    {
      label: 'WhatsApp',
      icon: <MessageCircle size={18} />,
      onClick: shareToWhatsApp,
      hoverClass: 'group-hover:bg-green-500 group-hover:text-white',
    },
    {
      label: 'Instagram',
      icon: <Instagram size={18} />,
      onClick: shareToInstagram,
      hoverClass: 'group-hover:bg-gradient-to-br group-hover:from-purple-500 group-hover:to-pink-500 group-hover:text-white',
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={handleButtonClick}
        className={className || 'p-2 text-white/40 hover:text-white transition-all'}
      >
        <Share2 size={iconSize} />
        {label && <span>{label}</span>}
      </button>

      <Portal>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 14 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-sm max-h-[88dvh] overflow-y-auto custom-scrollbar bg-[#0c0c0c] border border-white/10 rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Share</h4>
                <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white"><X size={14} /></button>
              </div>

              {/* Auto-generated share card — cover art + caption over the bottom */}
              {(card?.dataUrl || imageUrl) && (
                <div className="mb-4">
                  <div className="relative rounded-2xl overflow-hidden w-full aspect-square max-w-[260px] mx-auto bg-white/5 ring-1 ring-white/10">
                    <img src={card?.dataUrl || imageUrl} alt="" className="w-full h-full object-cover" />
                    {!card && imageUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Loader2 size={18} className="animate-spin text-white/50" />
                      </div>
                    )}
                  </div>
                  {card && (
                    <button onClick={downloadCard} className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest transition-all">
                      <Download size={12} /> Save share card
                    </button>
                  )}
                </div>
              )}

              {/* Embed links render a playable mini-player when shared — quick guide. */}
              {isEmbedLink && (
                <button
                  onClick={() => setShowGuide(true)}
                  className="w-full mb-3 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-small-orange/10 border border-small-orange/30 text-small-orange text-[10px] font-bold hover:bg-small-orange/20 transition-all"
                >
                  <Music size={13} /> This link plays music when shared — see how
                </button>
              )}

              {/* Post to Plajah's own feed */}
              {onPostToPlajah && (
                <>
                  <button
                    onClick={postToPlajah}
                    disabled={posting || posted}
                    className={`w-full mb-3 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${posted ? 'bg-green-500 text-white' : 'bg-small-orange text-black hover:brightness-110'}`}
                  >
                    {posted ? <><Check size={14} /> Shared to Plajah</>
                      : posting ? <><Loader2 size={14} className="animate-spin" /> Posting…</>
                      : <><Sparkles size={14} /> {plajahLabel || 'Post to Plajah feed'}</>}
                  </button>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/25">Or share to</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                </>
              )}

              {/* URL preview chip */}
              <div className="mb-4 px-4 py-2 bg-white/5 rounded-xl flex items-center gap-2 overflow-hidden">
                <LinkIcon size={10} className="text-white/20 shrink-0" />
                <span className="text-[9px] font-bold text-white/30 truncate">{shareUrl}</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {SHARE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={opt.onClick}
                    className="group flex flex-col items-center gap-2 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all"
                  >
                    <div className={`w-10 h-10 rounded-full bg-white/5 flex items-center justify-center transition-all ${opt.hoverClass}`}>
                      {opt.icon}
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest leading-tight text-center">{opt.label}</span>
                  </button>
                ))}
              </div>

              <p className="mt-4 text-[8px] font-bold text-white/20 text-center uppercase tracking-widest">
                Link embeds with cover art on X, Facebook & WhatsApp
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </Portal>
      {showGuide && <EmbedShareGuide title={title} imageUrl={imageUrl} onClose={() => setShowGuide(false)} />}
    </div>
  );
};

export default ShareButton;
