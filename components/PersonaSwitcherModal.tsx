/**
 * PersonaSwitcherModal.tsx — Mobile Contextual Account & Persona Switcher.
 *
 * Triggered by a 400ms long-press on either the Home or Profile tab in the bottom bar,
 * or via header quick jump. Allows instant role/account switching across:
 * - Personal (Media, Creator, Social)
 * - Business (POS, Inventory, Storefront)
 * - Academia (Classrooms, Labs, Edurail)
 * - Elevate (Sanctuary, Lectio, Praise)
 * - Creative (Production, Melos, Fabula)
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Plus, ShieldCheck, ChevronRight, Sparkles } from 'lucide-react';
import {
  PERSONAS_CONFIG,
  type PersonaKey,
  PERSONA_KEYS,
  DEFAULT_PERSONAS
} from '../services/personaService';

interface PersonaSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePersonaKey: PersonaKey;
  onSelectPersona: (key: PersonaKey) => void;
  userProfile?: any;
}

export const PersonaSwitcherModal: React.FC<PersonaSwitcherModalProps> = ({
  isOpen,
  onClose,
  activePersonaKey,
  onSelectPersona,
  userProfile,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex flex-col justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Bottom Sheet Container */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="relative z-10 w-full max-w-lg mx-auto bg-[#0d0015]/95 border-t border-white/20 rounded-t-[34px] p-5 pb-8 shadow-[0_-20px_60px_rgba(0,0,0,0.9)] max-h-[85vh] overflow-y-auto space-y-4"
        >
          {/* Top Pill Handle */}
          <div className="w-12 h-1.5 bg-white/25 rounded-full mx-auto mb-1" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold font-display text-white tracking-tight">
                Switch Context & Persona
              </h3>
              <p className="text-[11px] text-white/60">
                Select an enrolled role, organization, or storefront
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Persona Accounts List */}
          <div className="space-y-2.5 pt-1">
            {PERSONA_KEYS.map((key) => {
              const p = DEFAULT_PERSONAS[key];
              const isCurrent = p.id === activePersonaKey;
              const avatar = (key === 'personal' && userProfile?.photoURL)
                ? userProfile.photoURL
                : (p.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200`);

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectPersona(p.id);
                    onClose();
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                    isCurrent
                      ? 'bg-white/10 border-white/40 shadow-lg'
                      : 'bg-black/40 border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Glowing Avatar / Badge Frame */}
                    <div
                      className="relative w-11 h-11 rounded-xl p-[2px] flex-shrink-0"
                      style={{ background: p.gradient }}
                    >
                      <div className="w-full h-full rounded-[10px] bg-black/60 overflow-hidden flex items-center justify-center">
                        <img
                          src={avatar}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {isCurrent && (
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black" />
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-display truncate">
                          {p.name}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-bold border"
                          style={{
                            background: `${p.brandColor}22`,
                            color: p.brandColor,
                            borderColor: `${p.brandColor}44`,
                          }}
                        >
                          {p.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/50 truncate">
                        {p.role} • {p.orgName}
                      </div>
                    </div>
                  </div>

                  {/* Badges & Selection Indicator */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {Boolean(p.notificationCount) && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FF8C00]/20 text-[#FF8C00] font-bold text-[9px] border border-[#FF8C00]/30">
                        {p.notificationCount}
                      </span>
                    )}
                    {isCurrent ? (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                        style={{ background: p.brandColor }}
                      >
                        <Check size={14} />
                      </div>
                    ) : (
                      <ChevronRight size={16} className="text-white/30" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <button
              onClick={() => {
                alert('Join Organization: Search and connect to registered campuses, ministries, studios, or businesses.');
              }}
              className="flex items-center gap-1.5 text-purple-300 font-bold hover:underline"
            >
              <Plus size={14} />
              <span>Join or Register Organization</span>
            </button>
            <span className="text-[10px] text-white/40 font-mono">
              Role-adaptive nav v1.0
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PersonaSwitcherModal;
