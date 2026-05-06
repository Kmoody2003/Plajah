import React, { useState } from 'react';
import { Share2, Link as LinkIcon, Mail, Twitter, Facebook, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareButtonProps {
  title: string;
  text: string;
  url: string;
  className?: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ title, text, url, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareData = {
    title,
    text,
    url: url || window.location.href
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
        setIsOpen(true);
      }
    } else {
      setIsOpen(true);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareData.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareData.url)}`, '_blank');
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`, '_blank');
  };

  const shareViaEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + shareData.url)}`;
  };

  return (
    <div className="relative">
      <button 
        onClick={handleNativeShare}
        className={className || "p-2 text-white/40 hover:text-white transition-all"}
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
              className="absolute right-0 bottom-full mb-4 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-[130] overflow-hidden p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Share Content</h4>
                <button onClick={() => setIsOpen(false)} className="text-white/20 hover:text-white"><X size={14} /></button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={copyToClipboard}
                  className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-small-orange group-hover:text-white transition-all">
                    {copied ? <Check size={18} /> : <LinkIcon size={18} />}
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-widest">{copied ? 'Copied' : 'Link'}</span>
                </button>

                <button 
                  onClick={shareViaEmail}
                  className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                    <Mail size={18} />
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-widest">Email</span>
                </button>

                <button 
                  onClick={shareToTwitter}
                  className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                    <X size={18} />
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-widest">X</span>
                </button>

                <button 
                  onClick={shareToFacebook}
                  className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Facebook size={18} />
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-widest">Facebook</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShareButton;
