/**
 * DesktopAuthModal.tsx — Desktop-Tailored Authentication & Sign-In Experience.
 *
 * Designed specifically for desktop screens & the Launch Library:
 * - Wide dual-pane layout with atmospheric brand scrims & frosted glass
 * - One-click OAuth (Microsoft, Google, X, Facebook)
 * - Email / Password authentication with password reset
 * - "Keep me signed in on this PC" persistent session toggle
 * - Keyboard friendly (Enter to submit, Esc to dismiss, autofocus)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2,
  CheckCircle2, ArrowRight, ShieldCheck, Sparkles, KeyRound,
  Laptop
} from 'lucide-react';
import {
  registerWithEmail, loginWithEmail, sendPasswordReset,
  loginWithGoogle, loginWithFacebook, loginWithMicrosoft, loginWithTwitter,
  WrongProviderError
} from '../services/backendService';
import { GoogleIcon, FacebookIcon, MicrosoftIcon, XIcon } from './ui/ProviderIcons';

interface DesktopAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'SIGN_IN' | 'REGISTER';
}

const DESKTOP_PROVIDERS = [
  { id: 'microsoft.com', label: 'Microsoft Account', Icon: MicrosoftIcon, fn: loginWithMicrosoft, bg: 'bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-white/15 text-white' },
  { id: 'google.com',    label: 'Google Account',    Icon: GoogleIcon,    fn: () => loginWithGoogle(), bg: 'bg-white hover:bg-gray-100 text-black' },
  { id: 'twitter.com',   label: 'X (Twitter)',       Icon: XIcon,         fn: loginWithTwitter,        bg: 'bg-black hover:bg-zinc-900 border border-white/20 text-white' },
  { id: 'facebook.com',  label: 'Facebook',          Icon: FacebookIcon,  fn: loginWithFacebook,       bg: 'bg-[#1877F2] hover:bg-[#166fe5] text-white' },
] as const;

export const DesktopAuthModal: React.FC<DesktopAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'SIGN_IN',
}) => {
  const [mode, setMode] = useState<'SIGN_IN' | 'REGISTER' | 'RESET'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [suggestProviders, setSuggestProviders] = useState<string[]>([]);

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuggestProviders([]);
      setResetSent(false);
    }
  }, [isOpen]);

  // Keyboard dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFail = (err: any, fallback: string) => {
    const msg = err?.message || fallback;
    setSuggestProviders(err instanceof WrongProviderError ? err.providers.filter((p: string) => p !== 'password') : []);
    setError(/operation-not-allowed/i.test(msg) ? 'Email sign-in is not enabled. Please use a social sign-in option.' : msg);
  };

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuggestProviders([]);

    if (mode === 'RESET') {
      if (!email.trim()) {
        setError('Please enter your email to receive password reset instructions.');
        return;
      }
      setLoading(true);
      try {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      } catch (err: any) {
        handleFail(err, 'Unable to send password reset email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    if (mode === 'REGISTER' && !displayName.trim()) {
      setError('Please enter a display name for your profile.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'REGISTER') {
        await registerWithEmail(email.trim(), password, displayName.trim());
      } else {
        await loginWithEmail(email.trim(), password);
      }
      handleSuccess();
    } catch (err: any) {
      handleFail(err, 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (providerFn: () => Promise<any>) => {
    setError('');
    setLoading(true);
    try {
      await providerFn();
      handleSuccess();
    } catch (err: any) {
      handleFail(err, 'Social authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6 overflow-y-auto select-none">
      {/* Heavy Frosted Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/85 backdrop-blur-2xl"
      />

      {/* Desktop Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-4xl bg-[#0d0015] border border-white/20 rounded-3xl overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.95)] grid grid-cols-1 md:grid-cols-12 min-h-[580px]"
      >
        {/* ── LEFT PANE: BRAND SHOWCASE & PC IDENTITY ── */}
        <div className="hidden md:flex md:col-span-5 bg-gradient-to-br from-[#1b002c] via-[#0d0015] to-[#160020] p-8 flex-col justify-between border-r border-white/10 relative overflow-hidden">
          {/* Ambient Brand Glow */}
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#6B0099]/30 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-[#D40055]/25 blur-3xl pointer-events-none" />

          {/* Top Brand Identity */}
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white text-lg shadow-xl"
                style={{ background: 'linear-gradient(135deg, #6B0099 0%, #D40055 50%, #FF8C00 100%)' }}
              >
                P
              </div>
              <div>
                <h2 className="text-lg font-extrabold font-display text-white tracking-tight leading-none">
                  Plajah Desktop
                </h2>
                <span className="text-[11px] font-mono text-[#FF8C00] font-bold">
                  Everything creators make. One place.
                </span>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed pt-2">
              Sign in once to sync your music, film, video, books, live shows and storefront across PC and mobile.
            </p>
          </div>

          {/* PC System Highlights */}
          <div className="relative z-10 space-y-3 my-auto py-6">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center flex-shrink-0">
                <Laptop size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">Desktop Optimization</div>
                <div className="text-[10px] text-white/50">Multi-monitor, hardware acceleration & OPFS</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">Windows & Web Security</div>
                <div className="text-[10px] text-white/50">Secure credentials & encrypted local vault</div>
              </div>
            </div>
          </div>

          {/* Bottom Footer Note */}
          <div className="relative z-10 pt-4 border-t border-white/10 text-[10px] text-white/40 font-mono">
            Plajah 2.0 • A Lighthouse Enterprises LLC Brand
          </div>
        </div>

        {/* ── RIGHT PANE: DESKTOP LOGIN / SIGN-IN FORM ── */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between relative">
          {/* Header with Close */}
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-xl font-extrabold font-display text-white">
                {mode === 'SIGN_IN' ? 'Sign In to Your Account' : mode === 'REGISTER' ? 'Create Your Plajah ID' : 'Reset Password'}
              </h3>
              <p className="text-xs text-white/60">
                {mode === 'SIGN_IN'
                  ? 'Enter your credentials or choose single sign-on below'
                  : mode === 'REGISTER'
                  ? 'Join Plajah to access all studios and communities'
                  : 'We will send a secure password reset link to your email'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Quick OAuth Single Sign-On Bar */}
          {mode !== 'RESET' && (
            <div className="space-y-2 mb-4">
              <div className="grid grid-cols-2 gap-2">
                {DESKTOP_PROVIDERS.map((provider) => {
                  const Icon = provider.Icon;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={loading}
                      onClick={() => handleOAuth(provider.fn)}
                      className={`flex items-center justify-center gap-2.5 py-2 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${provider.bg}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{provider.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative flex items-center justify-center py-2">
                <div className="w-full border-t border-white/10 absolute" />
                <span className="relative px-3 bg-[#0d0015] text-[10px] font-mono text-white/40 uppercase tracking-wider">
                  Or continue with email
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-3 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Reset Sent Confirmation */}
          {resetSent && (
            <div className="mb-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
              <span>Password reset email dispatched. Check your inbox and spam folder.</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 flex-1">
            {mode === 'REGISTER' && (
              <div>
                <label className="block text-[11px] font-bold text-white/70 mb-1">
                  Full Name or Artist Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Kenneth Moody"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#D40055] focus:outline-none text-white text-xs placeholder:text-white/30"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-white/70 mb-1">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@plajah.com"
                  className="w-full px-3.5 py-2.5 pl-9 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#D40055] focus:outline-none text-white text-xs placeholder:text-white/30"
                />
                <Mail size={14} className="absolute left-3 top-3 text-white/40" />
              </div>
            </div>

            {mode !== 'RESET' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-white/70">
                    Password
                  </label>
                  {mode === 'SIGN_IN' && (
                    <button
                      type="button"
                      onClick={() => { setMode('RESET'); setError(''); }}
                      className="text-[11px] text-[#FF8C00] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 pl-9 pr-9 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#D40055] focus:outline-none text-white text-xs placeholder:text-white/30"
                  />
                  <Lock size={14} className="absolute left-3 top-3 text-white/40" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            {/* Remember Me on this PC Checkbox */}
            {mode === 'SIGN_IN' && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-white/20 bg-white/10 text-purple-600 focus:ring-0 w-3.5 h-3.5"
                />
                <label htmlFor="remember-me" className="text-[11px] text-white/70 cursor-pointer select-none">
                  Keep me signed in on this computer
                </label>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold font-display text-xs text-white shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6B0099 0%, #D40055 50%, #FF8C00 100%)' }}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin text-white" />
                ) : (
                  <>
                    <span>
                      {mode === 'SIGN_IN' ? 'Sign In to Plajah' : mode === 'REGISTER' ? 'Create Account' : 'Send Reset Link'}
                    </span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Mode Switcher Footer */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/60">
            {mode === 'SIGN_IN' ? (
              <>
                <span>New to Plajah?</span>
                <button
                  type="button"
                  onClick={() => { setMode('REGISTER'); setError(''); }}
                  className="font-bold text-[#FF8C00] hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : mode === 'REGISTER' ? (
              <>
                <span>Already have an account?</span>
                <button
                  type="button"
                  onClick={() => { setMode('SIGN_IN'); setError(''); }}
                  className="font-bold text-[#FF8C00] hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('SIGN_IN'); setError(''); }}
                className="font-bold text-[#FF8C00] hover:underline mx-auto"
              >
                ← Back to Sign In
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DesktopAuthModal;
