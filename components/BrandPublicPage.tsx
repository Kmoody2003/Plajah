import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Music2, Users, ExternalLink, Globe, Instagram,
  Twitter, Mail, PlayCircle, ChevronRight, Star, Mic2,
  Download, Building2, Disc3, Send,
} from 'lucide-react';
import type { BrandPublicPageData } from '../types';

// ── ROLE BADGE ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'Lead Vocalist': '#ef4444',
  'Vocalist':      '#f97316',
  'Producer':      '#a855f7',
  'Manager':       '#6b7280',
  'A&R':           '#3b82f6',
  'Engineer':      '#10b981',
};

function roleBadgeColor(role?: string) {
  if (!role) return '#6b7280';
  return ROLE_COLORS[role] ?? '#6b7280';
}

// ── ROSTER CARD ───────────────────────────────────────────────────────────────

interface RosterMember {
  artistId: string;
  artistName: string;
  artistPhoto?: string;
  role?: string;
}

function RosterCard({ member }: { member: RosterMember }) {
  const color = roleBadgeColor(member.role);
  return (
    <motion.div
      className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:border-white/20 transition-colors"
      whileHover={{ x: 2 }}
    >
      {member.artistPhoto ? (
        <img src={member.artistPhoto} alt={member.artistName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Mic2 size={20} className="text-white/30" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-sm truncate">{member.artistName}</div>
        {member.role && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
            style={{ background: color + '20', color }}>
            {member.role}
          </span>
        )}
      </div>
      <ChevronRight size={16} className="text-white/20 flex-shrink-0" />
    </motion.div>
  );
}

// ── RELEASE CARD ──────────────────────────────────────────────────────────────

function ReleaseCard({ releaseId, index }: { releaseId: string; index: number }) {
  const colors = ['from-purple-600 to-pink-600', 'from-blue-600 to-cyan-500', 'from-amber-500 to-orange-600', 'from-green-500 to-teal-600'];
  return (
    <div className={`relative aspect-square rounded-2xl bg-gradient-to-br ${colors[index % colors.length]} overflow-hidden group cursor-pointer`}>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
        <PlayCircle size={32} className="text-white" />
      </div>
      <Disc3 size={48} className="absolute bottom-4 right-4 text-white/10 group-hover:rotate-180 transition-transform duration-700" />
      <div className="absolute bottom-4 left-4">
        <div className="text-white text-xs font-bold">Release</div>
        <div className="text-white/60 text-[10px]">#{releaseId.slice(0, 8)}</div>
      </div>
    </div>
  );
}

// ── CONTACT FORM ──────────────────────────────────────────────────────────────

interface ContactFormProps {
  brandName: string;
  contactEmail?: string;
}

function ContactForm({ brandName, contactEmail }: ContactFormProps) {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!form.name || !form.email || !form.message) return;
    setSent(true);
  };

  if (sent) {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center">
        <Send size={24} className="text-green-400 mx-auto mb-3" />
        <p className="text-green-400 font-bold">Message sent!</p>
        <p className="text-white/50 text-sm mt-1">We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="Your name"
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/50" />
        <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          placeholder="Your email" type="email"
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/50" />
      </div>
      <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
        placeholder="Subject (e.g. Booking inquiry)"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/50" />
      <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
        placeholder={`Message to ${brandName}...`} rows={4}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[--small-orange]/50" />
      <motion.button
        onClick={handleSend}
        className="flex items-center gap-2 bg-[--small-orange] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
        whileTap={{ scale: 0.97 }}
      >
        <Send size={14} /> Send Message
      </motion.button>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface BrandPublicPageProps {
  brand: BrandPublicPageData;
  onBack?: () => void;
  accentColor?: string;
}

export default function BrandPublicPage({ brand, onBack, accentColor }: BrandPublicPageProps) {
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'RELEASES' | 'ABOUT' | 'CONTACT'>('ROSTER');
  const accent = brand.accentColor ?? accentColor ?? 'var(--small-orange)';

  const tabs = [
    { id: 'ROSTER'   as const, label: `Roster (${brand.roster.length})`,               icon: <Users size={14} /> },
    { id: 'RELEASES' as const, label: `Releases (${brand.featuredReleaseIds.length})`,  icon: <Disc3 size={14} /> },
    { id: 'ABOUT'    as const, label: 'About',                                          icon: <Building2 size={14} /> },
    { id: 'CONTACT'  as const, label: 'Contact',                                        icon: <Mail size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Hero */}
      <div className="relative h-72 sm:h-96 overflow-hidden">
        {brand.coverImageUrl ? (
          <img src={brand.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}33 0%, #0a0a0a 100%)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />

        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {onBack && (
          <button onClick={onBack} className="absolute top-4 left-4 p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 transition-colors">
            <ArrowLeft size={18} />
          </button>
        )}

        {/* Press kit download */}
        {brand.pressKitUrl && (
          <a href={brand.pressKitUrl} target="_blank" rel="noreferrer"
            className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold px-3 py-2 rounded-full hover:bg-black/60 transition-colors">
            <Download size={13} /> Press Kit
          </a>
        )}
      </div>

      {/* Identity */}
      <div className="max-w-3xl mx-auto px-4 -mt-12 relative z-10">
        <div className="flex items-end gap-5 mb-6">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.brandName}
              className="w-24 h-24 rounded-2xl object-cover border-4 border-[#0a0a0a] shadow-2xl flex-shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center border-4 border-[#0a0a0a] shadow-2xl flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, #000)` }}>
              <Music2 size={32} className="text-white" />
            </div>
          )}
          <div className="pb-1 flex-1 min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-white">{brand.brandName}</h1>
            {brand.tagline && <p className="text-white/50 text-sm mt-0.5 italic">"{brand.tagline}"</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-white/50">
                <Users size={12} /> {brand.roster.length} artists
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/50">
                <Disc3 size={12} /> {brand.featuredReleaseIds.length} releases
              </div>
            </div>
          </div>
        </div>

        {/* Social links */}
        {brand.socialLinks && (
          <div className="flex gap-2 flex-wrap mb-6">
            {brand.socialLinks.instagram && (
              <a href={`https://instagram.com/${brand.socialLinks.instagram}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <Instagram size={12} /> @{brand.socialLinks.instagram}
              </a>
            )}
            {brand.socialLinks.twitter && (
              <a href={`https://twitter.com/${brand.socialLinks.twitter}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 bg-black border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <Twitter size={12} /> @{brand.socialLinks.twitter}
              </a>
            )}
            {brand.socialLinks.spotify && (
              <a href={brand.socialLinks.spotify} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 bg-[#1DB954] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <PlayCircle size={12} /> Spotify
              </a>
            )}
            {brand.socialLinks.website && (
              <a href={brand.socialLinks.website} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <Globe size={12} /> Website <ExternalLink size={10} className="text-white/40" />
              </a>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
              {t.icon} <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.id === 'ROSTER' ? 'Roster' : t.id === 'RELEASES' ? 'Music' : t.id === 'ABOUT' ? 'About' : 'Contact'}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-16">
            {activeTab === 'ROSTER' && (
              <div className="space-y-3">
                {brand.roster.length === 0 ? (
                  <div className="text-center py-12 text-white/30">
                    <Users size={32} className="mx-auto mb-3" />
                    <p className="text-sm">Roster not yet published</p>
                  </div>
                ) : (
                  <>
                    {/* Group by role */}
                    {['Lead Vocalist', 'Vocalist', 'Producer', 'A&R', 'Engineer', 'Manager', undefined].map(role => {
                      const members = brand.roster.filter(m => m.role === role || (role === undefined && !m.role));
                      if (members.length === 0) return null;
                      return (
                        <div key={role ?? 'other'}>
                          {role && (
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2 mt-4">{role}</h3>
                          )}
                          <div className="space-y-2">
                            {members.map(m => <RosterCard key={m.artistId} member={m} />)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {activeTab === 'RELEASES' && (
              <div>
                {brand.featuredReleaseIds.length === 0 ? (
                  <div className="text-center py-12 text-white/30">
                    <Disc3 size={32} className="mx-auto mb-3" />
                    <p className="text-sm">No featured releases yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {brand.featuredReleaseIds.map((id, i) => <ReleaseCard key={id} releaseId={id} index={i} />)}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ABOUT' && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{brand.about}</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Artists', value: brand.roster.length, icon: <Mic2 size={16} /> },
                    { label: 'Releases', value: brand.featuredReleaseIds.length, icon: <Disc3 size={16} /> },
                    { label: 'Est.', value: new Date(brand.createdAt).getFullYear(), icon: <Star size={16} /> },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/5 rounded-2xl p-4 text-center border border-white/10">
                      <div className="text-[--small-orange] flex justify-center mb-2">{stat.icon}</div>
                      <div className="text-white font-black text-xl">{stat.value}</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-widest">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'CONTACT' && (
              <div className="space-y-4">
                {brand.contactEmail && (
                  <a href={`mailto:${brand.contactEmail}`}
                    className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-[--small-orange]/30 transition-colors">
                    <Mail size={18} className="text-[--small-orange]" />
                    <div>
                      <div className="text-white text-sm font-semibold">Direct Email</div>
                      <div className="text-white/50 text-xs">{brand.contactEmail}</div>
                    </div>
                    <ExternalLink size={14} className="ml-auto text-white/30" />
                  </a>
                )}

                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <Send size={14} className="text-[--small-orange]" /> Send a Message
                  </h3>
                  <ContactForm brandName={brand.brandName} contactEmail={brand.contactEmail} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
