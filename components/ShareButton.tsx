import React, { useState } from 'react';
import { Share2, Link as LinkIcon, Mail, X, Facebook, Check, MessageCircle, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  imageUrl?: string;
  className?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ title, text, url, imageUrl, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = url || window.location.href;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        const shareData: ShareData = { title, text, url: shareUrl };
        if (imageUrl && navigator.canShare) {
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const file = new File([blob], 'cover.jpg', { type: blob.type });
            const withFile = { ...shareData, files: [file] };
            if (navigator.canShare(withFile)) {
              await navigator.share(withFile);
              return;
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
        onClick={handleNativeShare}
        className={className || 'p-2 text-white/40 hover:text-white transition-all'}
      >
        <Share2 size={18} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[120]" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="absolute right-0 bottom-full mb-4 w-72 bg-black/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-[130] overflow-hidden p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Share</h4>
                <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white"><X size={14} /></button>
              </div>

              {/* Cover art preview */}
              {imageUrl && (
                <div className="mb-4 rounded-2xl overflow-hidden aspect-square w-full max-h-32 object-cover">
                  <img src={imageUrl} alt="" className="w-full h-full object-cover opacity-80" />
                </div>
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
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShareButton;
