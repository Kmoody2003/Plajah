import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogIn } from 'lucide-react';
import { loginWithGoogle, loginWithTwitter } from '../services/backendService';

interface SignInPromptProps {
  action?: string;
  onClose: () => void;
}

const SignInPrompt: React.FC<SignInPromptProps> = ({ action = 'interact', onClose }) => {
  const handleGoogle = async () => {
    onClose();
    await loginWithGoogle();
  };

  const handleTwitter = async () => {
    onClose();
    await loginWithTwitter();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <LogIn size={18} className="text-white/60" />
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-full transition-all text-white/30 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <h2 className="text-lg font-black uppercase tracking-tight mb-1">Sign in to {action}</h2>
        <p className="text-xs text-white/40 font-bold mb-7 leading-relaxed">
          You can browse all public content freely. Sign in to interact with creators and the community.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleGoogle}
            className="flex items-center gap-3 w-full px-5 py-3.5 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/90 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.165 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleTwitter}
            className="flex items-center gap-3 w-full px-5 py-3.5 bg-[#1a1a1a] border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Continue with X / Twitter
          </button>
        </div>

        <p className="text-[9px] text-white/20 font-bold text-center mt-5 uppercase tracking-widest">
          Free to browse · Sign in to engage
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SignInPrompt;
