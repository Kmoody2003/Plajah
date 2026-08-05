import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trash2, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, Mail, ExternalLink } from 'lucide-react';
import { auth, logout } from '../services/backendService';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

interface Props {
  onBack?: () => void;
}

export default function DeleteAccountPage({ onBack }: Props) {
  const [step, setStep] = useState<'INFO' | 'CONFIRM' | 'DONE'>('INFO');
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const currentUser = auth.currentUser;

  const handleDelete = async () => {
    if (!currentUser) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteUser(currentUser);
      setStep('DONE');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('For security, please sign out and sign back in, then return to this page to delete your account.');
      } else {
        setError(err.message || 'Something went wrong. Please try again or contact support.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const faqs = [
    {
      q: 'What data gets deleted?',
      a: 'All data associated with your account is permanently deleted: your profile, posts, comments, messages, uploads (music, videos, photos), playlists, world creations, club memberships, and any earned points or achievements.',
    },
    {
      q: 'Is deletion permanent?',
      a: 'Yes. Once your account is deleted, there is no way to recover it. All your content and data will be permanently removed from our servers within 30 days.',
    },
    {
      q: 'What about content I shared with others?',
      a: 'Publicly shared posts and comments may remain visible briefly during the deletion processing period (up to 30 days) but will be fully removed afterward.',
    },
    {
      q: 'Will I lose my subscriptions or purchases?',
      a: 'Any active paid subscriptions should be cancelled before deleting your account. Purchases made through third-party platforms (Apple, Google) must be cancelled separately through those platforms.',
    },
    {
      q: 'Can I just deactivate instead?',
      a: 'You can stop using your account at any time without deleting it. Your data will remain on file. If you want a full removal, deletion is the only option.',
    },
    {
      q: 'I connected via Facebook / Google / Microsoft — does that get unlinked?',
      a: 'Yes. Deleting your Plajah account removes the connection to all linked social login providers. Your accounts on those platforms are not affected.',
    },
  ];

  if (step === 'DONE') {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center p-6 text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
            <ShieldCheck size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-black mb-3">Account Deleted</h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            Your account and all associated data have been scheduled for permanent deletion. This process completes within 30 days.
          </p>
          <p className="text-white/40 text-xs">
            If you have questions, email us at{' '}
            <a href="mailto:support@plajah.com" className="text-violet-400 underline">support@plajah.com</a>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-black/40 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <h1 className="font-black text-base leading-tight">Delete Your Account</h1>
            <p className="text-xs text-white/40">Plajah · Data Deletion Request</p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="ml-auto text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 hover:bg-white/5 rounded-lg"
            >
              ← Back to Help
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {step === 'INFO' && (
          <>
            {/* Intro */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="text-xl font-bold mb-3">How to delete your account</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                You can permanently delete your Plajah account and all associated data at any time. This action is <span className="text-white font-semibold">irreversible</span>.
              </p>
            </motion.div>

            {/* Steps */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Steps to delete your account</h3>
              <div className="space-y-3">
                {[
                  { n: '1', title: 'Sign in to Plajah', body: 'Go to plajah.com and sign in with the account you wish to delete.' },
                  { n: '2', title: 'Open your Profile', body: 'Click your avatar or name in the top navigation to open your profile.' },
                  { n: '3', title: 'Go to Settings', body: 'Navigate to Settings → Account → Delete Account.' },
                  { n: '4', title: 'Confirm deletion', body: 'Read the warning, check the confirmation box, and press "Delete My Account". Your data will be fully removed within 30 days.' },
                ].map(step => (
                  <div key={step.n} className="flex gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 text-violet-300 text-xs font-black">
                      {step.n}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{step.title}</div>
                      <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Alternative: delete from this page if logged in */}
            {currentUser ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle size={18} className="text-red-400 shrink-0" />
                    <span className="font-bold text-sm text-red-300">Delete directly from this page</span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed mb-4">
                    You are signed in as <span className="text-white font-medium">{currentUser.email || currentUser.displayName || currentUser.uid}</span>. You can delete your account immediately using the button below.
                  </p>
                  <button
                    onClick={() => setStep('CONFIRM')}
                    className="w-full py-3 bg-red-600/80 hover:bg-red-600 border border-red-500/40 rounded-xl font-bold text-sm transition-colors text-white"
                  >
                    Continue to Account Deletion
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center gap-4">
                  <Mail size={20} className="text-violet-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-sm mb-0.5">Need help? Contact us</div>
                    <a href="mailto:support@plajah.com" className="text-xs text-violet-400 hover:underline flex items-center gap-1">
                      support@plajah.com <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </motion.div>
            )}

            {/* FAQ */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Frequently asked questions</h3>
              <div className="space-y-2">
                {faqs.map((faq, i) => (
                  <div key={i} className="border border-white/[0.06] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="font-semibold text-sm">{faq.q}</span>
                      {expandedFaq === i ? <ChevronUp size={15} className="text-white/40 shrink-0" /> : <ChevronDown size={15} className="text-white/40 shrink-0" />}
                    </button>
                    {expandedFaq === i && (
                      <div className="px-4 pb-4 text-sm text-white/55 leading-relaxed border-t border-white/[0.06] pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Legal notice */}
            <p className="text-[11px] text-white/25 leading-relaxed border-t border-white/[0.06] pt-6">
              This page is provided in compliance with app store policies and platform data regulations including GDPR, CCPA, and Meta Platform Terms.
              Deletion requests are processed within 30 days. Backup data may be retained for fraud prevention and legal obligations for up to 90 days.
              For questions, contact <a href="mailto:support@plajah.com" className="underline">support@plajah.com</a>.
            </p>
          </>
        )}

        {step === 'CONFIRM' && currentUser && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-red-400" />
              </div>
              <h2 className="text-xl font-black mb-2">Are you absolutely sure?</h2>
              <p className="text-white/50 text-sm leading-relaxed">
                This will permanently delete the account for<br />
                <span className="text-white font-semibold">{currentUser.email || currentUser.displayName || currentUser.uid}</span>
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {[
                'All your posts, comments, and messages',
                'All uploaded music, videos, and photos',
                'Your profile, worlds, and club memberships',
                'All points, achievements, and unlocks',
              ].map(item => (
                <div key={item} className="flex items-center gap-3 text-sm text-white/60">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <label className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl cursor-pointer mb-5 hover:border-white/20 transition-colors">
              <input
                type="checkbox"
                checked={understood}
                onChange={e => setUnderstood(e.target.checked)}
                className="mt-0.5 accent-red-500 w-4 h-4 shrink-0"
              />
              <span className="text-sm text-white/70 leading-relaxed">
                I understand this action is permanent and cannot be undone. All my data will be deleted.
              </span>
            </label>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('INFO'); setError(null); setUnderstood(false); }}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!understood || deleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete My Account'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
