import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Lock, Globe, Check, X, Plus, Loader2, ChevronRight,
  Film, Star, Ticket, MessageSquare, Heart, Crown,
} from 'lucide-react';
import {
  createClub, createClubEvent, fetchUserClubs, joinClub,
  updateAlbum, auth,
} from '../services/backendService';
import type { Album, Club, ClubJoinProcess } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClubTier = 'FREE' | 'PAID';
type Step = 'SETUP' | 'MEMBERSHIP' | 'FEATURES' | 'DONE';

interface Props {
  album: Album;
  onClose: () => void;
  onCreated?: (club: Club) => void;
}

// ── Join process options ──────────────────────────────────────────────────────

const JOIN_OPTIONS: { id: ClubJoinProcess; label: string; desc: string }[] = [
  { id: 'AUTO',          label: 'Open — anyone can join',       desc: 'Instant membership, broadest reach'   },
  { id: 'REVIEW',        label: 'Approval required',            desc: 'You approve each member request'      },
  { id: 'QUESTIONNAIRE', label: 'Questionnaire before join',    desc: 'Screen members with questions first'  },
];

const PERKS = [
  { id: 'CHAT',      label: 'Live chat room',            icon: <MessageSquare size={14} />, always: true  },
  { id: 'EVENTS',    label: 'Exclusive events & watch parties', icon: <Ticket size={14} />,       always: true  },
  { id: 'GALLERY',   label: 'Behind-the-scenes gallery', icon: <Film size={14} />,               always: false },
  { id: 'MEMBERS',   label: 'Member directory',          icon: <Users size={14} />,              always: false },
  { id: 'EARLY',     label: 'Early access to releases',  icon: <Star size={14} />,               always: false },
  { id: 'MERCH',     label: 'Merch store',               icon: <Crown size={14} />,              always: false },
];

// ── Reusable card ─────────────────────────────────────────────────────────────

function SelectCard({ selected, onClick, children }: {
  selected: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border transition-all"
      style={{
        background:   selected ? 'rgba(244,114,182,0.08)' : 'rgba(255,255,255,0.02)',
        borderColor:  selected ? 'rgba(244,114,182,0.35)' : 'rgba(255,255,255,0.07)',
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmClubCreator({ album, onClose, onCreated }: Props) {
  const [step, setStep]               = useState<Step>('SETUP');
  const [clubName, setClubName]       = useState(`${album.title} Fan Club`);
  const [description, setDescription] = useState(`Official fan community for ${album.title}.`);
  const [isPrivate, setIsPrivate]     = useState(false);
  const [joinProcess, setJoinProcess] = useState<ClubJoinProcess>('AUTO');
  const [tier, setTier]               = useState<ClubTier>('FREE');
  const [monthlyPrice, setMonthlyPrice] = useState('4.99');
  const [yearlyPrice, setYearlyPrice]   = useState('39.99');
  const [enabledPerks, setEnabledPerks] = useState<Set<string>>(new Set(['CHAT', 'EVENTS']));
  const [loading, setLoading]         = useState(false);
  const [createdClub, setCreatedClub] = useState<Club | null>(null);

  const togglePerk = (id: string) => {
    setEnabledPerks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!auth.currentUser || loading) return;
    setLoading(true);
    try {
      const club = await createClub({
        name: clubName.trim(),
        description: description.trim(),
        category: 'Film & TV',
        tags: [album.genre || 'Film', 'Fan Club', album.title],
        isPrivate,
        joinProcess,
        type: 'CLUB',
        allowedAssetTypes: ['VIDEO', 'PHOTO', 'ARTICLE', 'LINK'],
        linksAllowed: true,
        hasLiveChat: enabledPerks.has('CHAT'),
        hasMerchStore: enabledPerks.has('MERCH'),
        hasExclusiveEvents: enabledPerks.has('EVENTS'),
        monthlyPrice: tier === 'PAID' ? parseFloat(monthlyPrice) || 0 : undefined,
        yearlyPrice:  tier === 'PAID' ? parseFloat(yearlyPrice)  || 0 : undefined,
        memberCount: 1,
      });

      if (club) {
        // Link club to the album
        if (album.id) {
          await updateAlbum(album.id, {
            tags: [...(album.tags ?? []), `club:${club.id}`],
          });
        }
        // Creator auto-joins as OWNER
        await joinClub(club.id, 'OWNER');
        setCreatedClub(club);
        setStep('DONE');
        onCreated?.(club);
      }
    } catch (err) {
      console.error('[FilmClubCreator]', err);
    } finally {
      setLoading(false);
    }
  };

  const inputCls  = 'w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls  = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2';
  const STEPS: Step[] = ['SETUP', 'MEMBERSHIP', 'FEATURES'];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-[#0d0d0d] border border-white/8 rounded-[2.5rem] flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-pink-500/12">
              <Users size={18} className="text-pink-400" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Create Fan Club</h3>
              <p className="text-[9px] text-white/25 font-black uppercase tracking-widest">{album.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-colors rounded-xl">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'DONE' && (
          <div className="px-8 py-4 flex items-center gap-2 border-b border-white/5 flex-shrink-0">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black transition-all"
                    style={{
                      background: s === step ? '#f472b6' : STEPS.indexOf(step) > i ? '#f472b6' : 'rgba(255,255,255,0.08)',
                      color: s === step || STEPS.indexOf(step) > i ? '#000' : 'rgba(255,255,255,0.2)',
                    }}>
                    {STEPS.indexOf(step) > i ? <Check size={9} /> : i + 1}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest hidden sm:block ${s === step ? 'text-white' : 'text-white/15'}`}>
                    {s === 'SETUP' ? 'Setup' : s === 'MEMBERSHIP' ? 'Membership' : 'Features'}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px" style={{ background: STEPS.indexOf(step) > i ? 'rgba(244,114,182,0.4)' : 'rgba(255,255,255,0.07)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <AnimatePresence mode="wait">
            {step === 'SETUP' && (
              <motion.div key="setup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div>
                  <label className={labelCls}>Club name</label>
                  <input value={clubName} onChange={e => setClubName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                </div>

                {/* Privacy */}
                <div className="space-y-2">
                  <label className={labelCls}>Visibility</label>
                  {[
                    { val: false, label: 'Public', desc: 'Discoverable by everyone', icon: <Globe size={14} /> },
                    { val: true,  label: 'Private', desc: 'Only visible to members', icon: <Lock size={14} /> },
                  ].map(opt => (
                    <SelectCard key={String(opt.val)} selected={isPrivate === opt.val} onClick={() => setIsPrivate(opt.val)}>
                      <div className="flex items-center gap-3">
                        <span className={`${isPrivate === opt.val ? 'text-pink-400' : 'text-white/25'}`}>{opt.icon}</span>
                        <div className="flex-1">
                          <p className={`text-xs font-black uppercase tracking-widest ${isPrivate === opt.val ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                          <p className="text-[9px] text-white/25">{opt.desc}</p>
                        </div>
                        {isPrivate === opt.val && <Check size={12} className="text-pink-400" />}
                      </div>
                    </SelectCard>
                  ))}
                </div>

                {/* Join process */}
                <div className="space-y-2">
                  <label className={labelCls}>How do people join?</label>
                  {JOIN_OPTIONS.map(opt => (
                    <SelectCard key={opt.id} selected={joinProcess === opt.id} onClick={() => setJoinProcess(opt.id)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-xs font-black uppercase tracking-widest ${joinProcess === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                          <p className="text-[9px] text-white/25">{opt.desc}</p>
                        </div>
                        {joinProcess === opt.id && <Check size={12} className="text-pink-400" />}
                      </div>
                    </SelectCard>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'MEMBERSHIP' && (
              <motion.div key="membership" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="space-y-2">
                  <label className={labelCls}>Membership model</label>
                  {[
                    { id: 'FREE', label: 'Free — anyone can join',  desc: 'No payment required, build the widest community' },
                    { id: 'PAID', label: 'Paid membership',         desc: 'Recurring subscription for exclusive access' },
                  ].map(opt => (
                    <SelectCard key={opt.id} selected={tier === opt.id} onClick={() => setTier(opt.id as ClubTier)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-xs font-black uppercase tracking-widest ${tier === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                          <p className="text-[9px] text-white/25">{opt.desc}</p>
                        </div>
                        {tier === opt.id && <Check size={12} className="text-pink-400" />}
                      </div>
                    </SelectCard>
                  ))}
                </div>

                {tier === 'PAID' && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className={labelCls}>Monthly price (USD)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={monthlyPrice}
                          onChange={e => setMonthlyPrice(e.target.value)}
                          className={`${inputCls} pl-8`} placeholder="4.99" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Yearly price (USD)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={yearlyPrice}
                          onChange={e => setYearlyPrice(e.target.value)}
                          className={`${inputCls} pl-8`} placeholder="39.99" />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'FEATURES' && (
              <motion.div key="features" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                <label className={labelCls}>Club features</label>
                {PERKS.map(perk => {
                  const on = enabledPerks.has(perk.id);
                  return (
                    <button key={perk.id} onClick={() => !perk.always && togglePerk(perk.id)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
                      style={{
                        background: on ? 'rgba(244,114,182,0.06)' : 'rgba(255,255,255,0.02)',
                        borderColor: on ? 'rgba(244,114,182,0.25)' : 'rgba(255,255,255,0.07)',
                        opacity: perk.always ? 0.65 : 1,
                        cursor: perk.always ? 'default' : 'pointer',
                      }}>
                      <span className={on ? 'text-pink-400' : 'text-white/20'}>{perk.icon}</span>
                      <div className="flex-1">
                        <p className={`text-xs font-black uppercase tracking-widest ${on ? 'text-white' : 'text-white/35'}`}>{perk.label}</p>
                        {perk.always && <p className="text-[8px] text-white/20">Always included</p>}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${on ? 'border-pink-400 bg-pink-400' : 'border-white/15'}`}>
                        {on && <Check size={9} className="text-black" />}
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}

            {step === 'DONE' && createdClub && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-5 py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-pink-500/15 flex items-center justify-center">
                  <Check size={28} className="text-pink-400" />
                </div>
                <div>
                  <p className="text-lg font-black uppercase tracking-tight text-white">{createdClub.name}</p>
                  <p className="text-[10px] text-white/30 mt-1">Fan club created and linked to {album.title}</p>
                </div>
                <div className="w-full space-y-2">
                  {[
                    { label: 'Visibility',   val: isPrivate ? 'Private' : 'Public'     },
                    { label: 'Membership',   val: tier === 'FREE' ? 'Free' : `$${monthlyPrice}/mo` },
                    { label: 'Join process', val: joinProcess                            },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/3">
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/25">{row.label}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{row.val}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onClose}
                  className="px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-pink-400 text-black hover:scale-105 transition-all mt-2">
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        {step !== 'DONE' && (
          <div className="px-8 pb-8 pt-4 border-t border-white/5 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => setStep(s => s === 'SETUP' ? 'SETUP' : s === 'MEMBERSHIP' ? 'SETUP' : 'MEMBERSHIP')}
              disabled={step === 'SETUP'}
              className="px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-all disabled:opacity-0"
            >
              ← Back
            </button>

            {step !== 'FEATURES' ? (
              <button
                onClick={() => setStep(s => s === 'SETUP' ? 'MEMBERSHIP' : 'FEATURES')}
                disabled={!clubName.trim()}
                className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-pink-400 text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
              >
                Continue <ChevronRight size={12} />
              </button>
            ) : (
              <button onClick={handleCreate} disabled={loading}
                className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-pink-400 text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-40">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} /> Create Club</>}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
