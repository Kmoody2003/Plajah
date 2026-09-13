import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogIn, Mail, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { loginWithGoogle, loginWithTwitter, loginWithFacebook, loginWithMicrosoft, loginWithEmail, registerWithEmail, sendPasswordReset, WrongProviderError, auth } from '../services/backendService';
import { GoogleIcon, FacebookIcon, MicrosoftIcon, XIcon } from './ui/ProviderIcons';
import { childLogin } from '../services/learnerAuthService';

type Mode = 'SOCIAL' | 'EMAIL' | 'STUDENT';
type EmailMode = 'SIGN_IN' | 'REGISTER' | 'RESET';

// Keyed by Firebase providerId so a "you signed up with Google" error can offer the exact
// button that will actually work.
const SOCIALS = [
  { id: 'google.com',    label: 'Google',        Icon: GoogleIcon,    fn: () => loginWithGoogle(), bg: 'bg-white text-black' },
  { id: 'twitter.com',   label: 'X / Twitter',   Icon: XIcon,         fn: loginWithTwitter,        bg: 'bg-[#1a1a1a] border border-white/10 text-white' },
  { id: 'facebook.com',  label: 'Facebook',      Icon: FacebookIcon,  fn: loginWithFacebook,       bg: 'bg-[#1877F2] text-white' },
  { id: 'microsoft.com', label: 'Microsoft',     Icon: MicrosoftIcon, fn: loginWithMicrosoft,      bg: 'bg-[#2f2f2f] border border-white/10 text-white' },
] as const;

interface SignInPromptProps {
  action?: string;
  initialMode?: Mode;
  onClose: () => void;
}

const SignInPrompt: React.FC<SignInPromptProps> = ({ action = 'interact', initialMode = 'SOCIAL', onClose }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [emailMode, setEmailMode] = useState<EmailMode>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  // Set when the failure is "this address belongs to Google/Facebook/…, not a password", so the
  // error can carry the button that actually works instead of just naming the problem.
  const [suggestProviders, setSuggestProviders] = useState<string[]>([]);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setLoading(true);
    setError('');
    try {
      await childLogin(username.trim(), password);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Wrong username or password.');
    } finally {
      setLoading(false);
    }
  };

  // Await the popup BEFORE closing. Closing first meant a blocked popup, a cancelled sign-in
  // or a provider error all looked identical to success: the sheet vanished and nothing
  // happened, with the explanation set on a component that no longer existed.
  const handle = async (fn: () => Promise<any>) => {
    setLoading(true);
    setError('');
    setSuggestProviders([]);
    try {
      await fn();
      if (auth.currentUser) onClose();
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required.'); return; }
    setLoading(true);
    setError('');
    try {
      setSuggestProviders([]);
      if (emailMode === 'RESET') {
        await sendPasswordReset(email);
        setResetSent(true);
        setLoading(false);
        return;
      }
      if (emailMode === 'REGISTER') {
        if (!displayName.trim()) { setError('Name is required.'); setLoading(false); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
        await registerWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
      onClose();
    } catch (e: any) {
      setSuggestProviders(e instanceof WrongProviderError ? e.providers.filter((x: string) => x !== 'password') : []);
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
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
        <p className="text-xs text-white/40 font-bold mb-5 leading-relaxed">
          Browse freely. Sign in to interact with creators and the community.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-2xl mb-6">
          {(['SOCIAL', 'EMAIL', 'STUDENT'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                mode === m ? 'bg-white text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              {m === 'SOCIAL' ? 'Social' : m === 'EMAIL' ? 'Email' : 'Student'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'SOCIAL' && (
            <motion.div key="social" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-col gap-3">
              {error && (
                <div className="flex items-start gap-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}
              {/* Google */}
              <button
                onClick={() => handle(loginWithGoogle)}
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

              {/* Twitter/X */}
              <button
                onClick={() => handle(loginWithTwitter)}
                className="flex items-center gap-3 w-full px-5 py-3.5 bg-[#1a1a1a] border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Continue with X / Twitter
              </button>

              {/* Facebook */}
              <button
                onClick={() => handle(loginWithFacebook)}
                className="flex items-center gap-3 w-full px-5 py-3.5 bg-[#1877F2] text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-[#1877F2]/90 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Continue with Facebook
              </button>

              {/* Microsoft */}
              <button
                onClick={() => handle(loginWithMicrosoft)}
                className="flex items-center gap-3 w-full px-5 py-3.5 bg-[#2f2f2f] border border-white/10 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Continue with Microsoft
              </button>
            </motion.div>
          )}
          {mode === 'EMAIL' && (
            <motion.div key="email" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {resetSent ? (
                <div className="text-center py-4">
                  <div className="text-sm font-black text-white mb-2">Check your email</div>
                  <p className="text-xs text-white/40">Password reset link sent to {email}</p>
                  <button onClick={() => { setResetSent(false); setEmailMode('SIGN_IN'); }} className="mt-4 text-[10px] text-white/40 hover:text-white underline">Back to sign in</button>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
                  {emailMode === 'REGISTER' && (
                    <input
                      type="text"
                      placeholder="Display Name"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
                    />
                  )}
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
                  />
                  {emailMode !== 'RESET' && (
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-11 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-3.5 text-white/30 hover:text-white">
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}
                  {error && (
                    <div className="flex flex-col gap-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
                      <div className="flex items-start gap-2"><AlertCircle size={12} className="shrink-0 mt-0.5" /> <span>{error}</span></div>
                      {/* The way out, not just the diagnosis. */}
                      {suggestProviders.map(pid => {
                        const o = SOCIALS.find(x => x.id === pid);
                        if (!o) return null;
                        return (
                          <button
                            key={pid} type="button" onClick={() => handle(o.fn)} disabled={loading}
                            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 ${o.bg}`}
                          >
                            {loading ? <Loader2 size={13} className="animate-spin" /> : <o.Icon size={13} />}
                            Continue with {o.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-small-orange text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight size={14} />}
                    {emailMode === 'RESET' ? 'Send Reset Link' : emailMode === 'REGISTER' ? 'Create Account' : 'Sign In'}
                  </button>
                  {/* An account made with Google has no password to type here. Saying so up front
                      is the difference between one tap and a locked-out support email. */}
                  {emailMode !== 'REGISTER' && (
                    <p className="text-[10px] text-white/35 leading-relaxed">
                      {emailMode === 'RESET'
                        ? 'Reset only works for accounts created with an email & password. Joined with Google, Facebook, Microsoft or X? There\u2019s no password to reset \u2014 use the Social tab.'
                        : 'This is for accounts created with an email & password. If you joined with Google, Facebook, Microsoft or X, use the Social tab instead.'}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">
                    {emailMode === 'SIGN_IN' ? (
                      <>
                        <button type="button" onClick={() => { setEmailMode('REGISTER'); setError(''); }} className="hover:text-white transition-colors">Create account</button>
                        <button type="button" onClick={() => { setEmailMode('RESET'); setError(''); }} className="hover:text-white transition-colors">Forgot password?</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => { setEmailMode('SIGN_IN'); setError(''); }} className="hover:text-white transition-colors">Back to sign in</button>
                    )}
                  </div>
                </form>
              )}
            </motion.div>
          )}
          {mode === 'STUDENT' && (
            <motion.div key="student" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <form onSubmit={handleStudentSubmit} className="flex flex-col gap-3">
                <p className="text-[11px] text-white/40 font-bold leading-relaxed">Students sign in with the username and password from a parent or teacher — no email needed.</p>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
                />
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-11 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-all"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-3.5 text-white/30 hover:text-white">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-[10px] text-red-400">
                    <AlertCircle size={12} /> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-small-orange text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight size={14} />}
                  Sign In
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[9px] text-white/20 font-bold text-center mt-5 uppercase tracking-widest">
          Free to browse · Sign in to engage
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SignInPrompt;
