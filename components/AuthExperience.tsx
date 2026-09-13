import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Mail, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, Check,
  Music2, Clapperboard, BookOpen, Video, Globe, Heart,
} from 'lucide-react';
import {
  registerWithEmail, loginWithEmail, sendPasswordReset,
  loginWithGoogle, loginWithFacebook, loginWithMicrosoft, loginWithTwitter,
  WrongProviderError, auth,
} from '../services/backendService';
import Logo from './Logo';
import { GoogleIcon, FacebookIcon, MicrosoftIcon, XIcon } from './ui/ProviderIcons';

// A beautiful email-first sign-up / sign-in experience that also showcases the platform's
// major capabilities while the visitor creates their account. Uses Firebase email auth
// (registerWithEmail / loginWithEmail / sendPasswordReset). On success we call
// onAuthenticated() and close — see the prop's note for why we can't rely on the auth
// listener alone.

interface Props {
  onClose: () => void;
  initialMode?: 'REGISTER' | 'SIGN_IN';
  /**
   * Called after a successful sign-in, in addition to onClose. Firebase only fires
   * onAuthStateChanged when the USER changes, so signing in again as the account you're
   * already in resolves silently and the app never routes anywhere — the modal closed onto
   * a landing page the person was already stuck on. The host passes its "enter the app"
   * handler here so entry never depends on the listener firing.
   */
  onAuthenticated?: () => void;
}

const FEATURES = [
  { icon: Music2, name: 'Chora', tag: 'Music', color: '#8B5CF6', desc: 'Stream and release music, keep a private library, and connect straight to the artists.' },
  { icon: Clapperboard, name: 'Taleo', tag: 'Film & TV', color: '#D40055', desc: 'Watch and distribute movies, series and films — cinema-grade and creator-first.' },
  { icon: BookOpen, name: 'Lorea', tag: 'Books & Comics', color: '#FF8C00', desc: 'Read and publish novels, comics and manga in a best-in-class reader.' },
  { icon: Video, name: 'Reello', tag: 'Video', color: '#0070FF', desc: 'Post videos and shorts, build a channel, and grow a real audience.' },
  { icon: Globe, name: 'Creator Worlds', tag: 'Your IP', color: '#00C878', desc: 'Build universes and characters — your work follows you everywhere you go.' },
  { icon: Heart, name: 'Get Paid', tag: 'Monetize', color: '#FF4D8D', desc: 'Sanctuary support, stores and direct fan connection — keep more of what you earn.' },
];

// Keyed by Firebase providerId so a "you signed up with Google" error can offer the exact
// button that will actually work.
const OAUTH = [
  { id: 'google.com',    label: 'Google',    Icon: GoogleIcon,    fn: () => loginWithGoogle(), bg: 'bg-white text-black' },
  { id: 'facebook.com',  label: 'Facebook',  Icon: FacebookIcon,  fn: loginWithFacebook,       bg: 'bg-[#1877F2] text-white' },
  { id: 'microsoft.com', label: 'Microsoft', Icon: MicrosoftIcon, fn: loginWithMicrosoft,      bg: 'bg-[#2f2f2f] border border-white/15 text-white' },
  { id: 'twitter.com',   label: 'X',         Icon: XIcon,         fn: loginWithTwitter,        bg: 'bg-black border border-white/20 text-white' },
] as const;

const AuthExperience: React.FC<Props> = ({ onClose, initialMode = 'REGISTER', onAuthenticated }) => {
  const [mode, setMode] = useState<'REGISTER' | 'SIGN_IN' | 'RESET'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [featureIdx, setFeatureIdx] = useState(0);
  // When the failure is "this address belongs to Google, not a password", we don't just print
  // it — we surface the provider's own button right under the message so it's one tap out.
  const [suggestProviders, setSuggestProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Auto-rotate the capability showcase.
  useEffect(() => {
    const t = setInterval(() => setFeatureIdx(i => (i + 1) % FEATURES.length), 3600);
    return () => clearInterval(t);
  }, []);

  const fail = (err: any, fallback: string) => {
    const msg = err?.message || fallback;
    // A WrongProviderError carries the providerIds that DO work — hand them to the UI.
    setSuggestProviders(err instanceof WrongProviderError ? err.providers.filter((p: string) => p !== 'password') : []);
    setError(/operation-not-allowed/i.test(msg) ? 'Email sign-up isn’t enabled yet. Please try a social login for now.' : msg);
  };

  const succeed = () => { onAuthenticated?.(); onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuggestProviders([]);
    if (mode === 'RESET') {
      if (!email.trim()) { setError('Enter your email to reset your password.'); return; }
      setLoading(true);
      try { await sendPasswordReset(email.trim()); setResetSent(true); }
      catch (err: any) { fail(err, 'Could not send reset email.'); }
      finally { setLoading(false); }
      return;
    }
    if (!email.trim() || !password) { setError('Enter your email and a password.'); return; }
    if (mode === 'REGISTER' && !displayName.trim()) { setError('Choose a name for your profile.'); return; }
    setLoading(true);
    try {
      if (mode === 'REGISTER') await registerWithEmail(email.trim(), password, displayName.trim());
      else await loginWithEmail(email.trim(), password);
      succeed();
    } catch (err: any) {
      fail(err, 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const oauth = (id: string, fn: () => Promise<any>) => async () => {
    setError(''); setSuggestProviders([]); setBusy(id);
    try {
      await fn();
      // Only enter if a session actually exists — a cancelled popup resolves to null.
      if (auth.currentUser) succeed();
    } catch (e: any) {
      setError(e?.message || 'Sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const field = 'w-full bg-white/[0.06] border border-white/12 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-small-orange/60 transition-colors';
  const F = FEATURES[featureIdx];
  const FIcon = F.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[800] flex items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[760px] sm:rounded-[2rem] overflow-hidden border border-white/10 bg-[#08080c] flex flex-col lg:flex-row shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
          <X size={18} />
        </button>

        {/* ── Showcase panel ───────────────────────────────────────── */}
        <div className="relative lg:w-1/2 shrink-0 overflow-hidden p-8 lg:p-10 flex flex-col justify-between min-h-[220px]">
          <div className="absolute inset-0 -z-10 transition-colors duration-1000" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${F.color}55 0%, transparent 55%), linear-gradient(160deg, #12081f 0%, #08080c 70%)` }} />
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] flex items-center justify-center shadow-lg"><Logo size={24} fluid /></div>
            <span className="text-lg font-black uppercase tracking-tight text-white italic">Plajah</span>
          </div>

          <div className="hidden lg:block">
            <AnimatePresence mode="wait">
              <motion.div key={F.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: `${F.color}22`, border: `1px solid ${F.color}55` }}>
                  <FIcon size={26} style={{ color: F.color }} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-2" style={{ color: F.color }}>{F.tag}</p>
                <h2 className="text-4xl font-black uppercase tracking-tight text-white leading-none mb-3">{F.name}</h2>
                <p className="text-sm text-white/60 leading-relaxed max-w-xs">{F.desc}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Compact feature strip on mobile */}
          <div className="lg:hidden flex items-center gap-2 mt-4">
            <FIcon size={16} style={{ color: F.color }} />
            <span className="text-xs font-black uppercase tracking-widest text-white">{F.name}</span>
            <span className="text-[10px] text-white/40">· {F.tag}</span>
          </div>

          <div className="flex gap-1.5 mt-6">
            {FEATURES.map((f, i) => (
              <button key={f.name} onClick={() => setFeatureIdx(i)} className="h-1 rounded-full transition-all" style={{ width: i === featureIdx ? 26 : 8, background: i === featureIdx ? f.color : 'rgba(255,255,255,0.18)' }} />
            ))}
          </div>
        </div>

        {/* ── Auth form panel ──────────────────────────────────────── */}
        <div className="lg:w-1/2 flex-1 min-h-0 overflow-y-auto bg-[#0c0c12] p-8 lg:p-10 flex flex-col justify-center">
          <div className="max-w-sm w-full mx-auto">
            {mode !== 'RESET' && (
              <div className="flex gap-1 p-1 bg-white/5 rounded-full mb-7 border border-white/10">
                {(['REGISTER', 'SIGN_IN'] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(''); }} className={`flex-1 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black' : 'text-white/45 hover:text-white'}`}>
                    {m === 'REGISTER' ? 'Create account' : 'Sign in'}
                  </button>
                ))}
              </div>
            )}

            <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-1">
              {mode === 'REGISTER' ? 'Join Plajah' : mode === 'SIGN_IN' ? 'Welcome back' : 'Reset password'}
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/35 mb-6">
              {mode === 'REGISTER' ? 'One account. Every creative surface.' : mode === 'SIGN_IN' ? 'Pick up right where you left off.' : 'We’ll email you a reset link.'}
            </p>

            {resetSent ? (
              <div className="flex flex-col items-center text-center gap-3 py-6">
                <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center"><Check size={22} className="text-green-400" /></div>
                <p className="text-sm font-black text-white">Check your inbox</p>
                <p className="text-[11px] text-white/45">We sent a password reset link to {email}.</p>
                <button onClick={() => { setMode('SIGN_IN'); setResetSent(false); }} className="mt-2 text-[11px] font-black uppercase tracking-widest text-small-orange hover:text-white">Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                {mode === 'REGISTER' && (
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" autoComplete="name" className={field} />
                )}
                <div className="relative">
                  <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="email" className={`${field} pl-11`} />
                </div>
                {mode !== 'RESET' && (
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? 'text' : 'password'} placeholder={mode === 'REGISTER' ? 'Create a password' : 'Password'} autoComplete={mode === 'REGISTER' ? 'new-password' : 'current-password'} className={`${field} pr-11`} />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                )}

                {error && (
                  <div className="flex flex-col gap-2.5 text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
                    </div>
                    {/* The way out, not just the diagnosis. */}
                    {suggestProviders.map(pid => {
                      const o = OAUTH.find(x => x.id === pid);
                      if (!o) return null;
                      return (
                        <button
                          key={pid} type="button" onClick={oauth(o.id, o.fn)} disabled={!!busy}
                          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 ${o.bg}`}
                        >
                          {busy === o.id ? <Loader2 size={14} className="animate-spin" /> : <o.Icon size={14} />}
                          Continue with {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-black text-[12px] font-black uppercase tracking-widest bg-gradient-to-r from-small-orange to-[#FFB020] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <>{mode === 'REGISTER' ? 'Create account' : mode === 'SIGN_IN' ? 'Sign in' : 'Send reset link'} <ArrowRight size={15} /></>}
                </button>

                {mode === 'SIGN_IN' && (
                  <>
                    <button type="button" onClick={() => { setMode('RESET'); setError(''); setSuggestProviders([]); }} className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-white/35 hover:text-white transition-colors pt-1">Forgot password?</button>
                    {/* The single most common way people lock themselves out: an account made
                        with Google has no password to type here, and no amount of retrying
                        will change that. Say it before they try. */}
                    <p className="text-[10px] text-white/35 leading-relaxed text-center pt-1">
                      This form is for accounts created with an email &amp; password. If you joined
                      with Google, Facebook, Microsoft or X, use that button below — there’s no
                      password on your account to type here.
                    </p>
                  </>
                )}
                {mode === 'RESET' && (
                  <>
                    <button type="button" onClick={() => { setMode('SIGN_IN'); setError(''); setSuggestProviders([]); }} className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-white/35 hover:text-white transition-colors pt-1">Back to sign in</button>
                    <p className="text-[10px] text-white/35 leading-relaxed text-center pt-1">
                      Reset only works for accounts created with an email &amp; password. Signed up
                      with Google, Facebook, Microsoft or X? There’s no password to reset — use
                      that button instead.
                    </p>
                  </>
                )}
              </form>
            )}

            {mode !== 'RESET' && !resetSent && (
              <>
                <div className="flex items-center gap-3 my-6">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">or continue with</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {OAUTH.map(o => (
                    <button
                      key={o.id} onClick={oauth(o.id, o.fn)} disabled={!!busy}
                      title={`Continue with ${o.label}`} aria-label={`Continue with ${o.label}`}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:hover:scale-100 ${o.bg}`}
                    >
                      {busy === o.id ? <Loader2 size={15} className="animate-spin" /> : <o.Icon size={15} />}
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AuthExperience;
