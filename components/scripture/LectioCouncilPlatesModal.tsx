// components/scripture/LectioCouncilPlatesModal.tsx
// Interactive Lectio & Lorea Sacred Text Plates Gallery:
// Renders the 12 Art-Council-Directed Non-Scripture Religious Text Treatments
// with their radically distinct silhouettes, column architectures, textures,
// and typographic hierarchies—plus the Public-Domain Hymns & Catholic/Orthodox Prayers.

import React, { useState } from 'react';
import { X, Sparkles, BookOpen, ScrollText, Music, Check } from 'lucide-react';
import {
  LECTIO_COUNCIL_PLATES,
  openCouncilPlateInLorea,
  getActiveLectioCouncilPlateId,
  setActiveLectioCouncilPlateId,
  type ArtCouncilLens,
  type LectioCouncilPlate,
} from '../../services/lectioNonScriptureCouncil';
import {
  PUBLIC_DOMAIN_HYMNS,
  CATHOLIC_AND_ORTHODOX_PRAYERS,
  openHymnOrPrayerInLorea,
} from '../../data/sacredHymnsAndPrayers';

interface LectioCouncilPlatesModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'PLATES_12' | 'HYMNS_AND_PRAYERS';
}

const LENS_FILTERS: Array<{ id: 'ALL' | ArtCouncilLens; label: string }> = [
  { id: 'ALL', label: 'All 12 Plates' },
  { id: 'CLASSICAL', label: 'Classical (01, 02)' },
  { id: 'RADICAL_MINIMAL', label: 'Radical Minimal (03, 12)' },
  { id: 'REBEL', label: 'Rebel (04, 11)' },
  { id: 'WORLD_ECLECTIC', label: 'World Eclectic (05, 08)' },
  { id: 'FUTURIST', label: 'Futurist (06, 10)' },
  { id: 'BAROQUE', label: 'Baroque (07, 09)' },
];

/** Renders each plate with its unique architectural layout & typography */
export const CouncilPlatePreviewCard: React.FC<{
  plate: LectioCouncilPlate;
  isSelected: boolean;
  onSelect: (plate: LectioCouncilPlate) => void;
  onOpenLorea: (plate: LectioCouncilPlate) => void;
}> = ({ plate, isSelected, onSelect, onOpenLorea }) => {
  const renderArchitecturalBody = () => {
    switch (plate.layoutArchetype) {
      case 'apse-arch':
        return (
          <div
            className="rounded-t-[110px] rounded-b-xl p-5 border-2 text-center relative overflow-hidden"
            style={{
              background: 'radial-gradient(circle at 50% 12%, #681838 0%, #2A0716 62%, #13030A 100%)',
              borderColor: 'rgba(232,193,112,0.55)',
            }}
          >
            <div className="mx-auto mb-2.5 w-11 h-11 rounded-full border-2 border-[#FFD97D] bg-[#FFD97D]/15 flex items-center justify-center text-[9px] font-black tracking-widest text-[#FFD97D]">
              IC·XC
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#FFD97D]/80 font-bold mb-2">
              {plate.documentTitle}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left border-t border-[#FFD97D]/25 pt-3">
              <p className="text-[11.5px] leading-relaxed text-[#FFF3D1]/90 font-serif italic">
                {plate.secondaryOrOriginalExcerpt}
              </p>
              <p className="text-[11.5px] leading-relaxed text-[#FFF8E7] font-serif border-l border-[#FFD97D]/25 pl-3">
                {plate.primaryExcerpt}
              </p>
            </div>
          </div>
        );

      case 'glossa-nested':
        return (
          <div
            className="rounded-md p-3.5 border-2 text-[#1E1610]"
            style={{
              background: 'linear-gradient(180deg, #F6EEDB 0%, #EAE0C8 100%)',
              borderColor: '#8B6F47',
            }}
          >
            <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-[#9E1B1B] border-b border-[#8B6F47]/40 pb-1 mb-2.5 flex justify-between">
              <span>{plate.documentTitle}</span>
              <span>FOLIO XII · R</span>
            </div>
            <div className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-3 text-[9.5px] leading-snug text-[#5A4632] italic border-r border-[#8B6F47]/35 pr-2">
                {plate.marginalGlossLeft}
              </div>
              <div className="col-span-6 bg-[#FAF5E8] border border-[#9E1B1B]/45 p-2.5 shadow-inner">
                <span className="float-left text-2xl font-black text-[#9E1B1B] mr-1.5 leading-none font-serif">
                  R
                </span>
                <p className="text-[11px] leading-relaxed text-[#1B130E] font-serif">
                  {plate.primaryExcerpt}
                </p>
              </div>
              <div className="col-span-3 text-[9.5px] leading-snug text-[#5A4632] italic border-l border-[#8B6F47]/35 pl-2">
                {plate.marginalGlossRight}
              </div>
            </div>
          </div>
        );

      case 'desert-monolith':
        return (
          <div
            className="rounded-none p-5 border flex flex-col justify-between min-h-[210px]"
            style={{
              background: '#09090B',
              borderColor: 'rgba(200,184,152,0.28)',
            }}
          >
            <div className="flex items-center justify-between text-[8.5px] font-mono tracking-[0.35em] text-[#C8B898]/45 uppercase">
              <span>SCETIS · SILENTIUM</span>
              <span>68% VOID</span>
            </div>
            <div className="my-auto py-4" />
            <div className="ml-auto max-w-[78%] text-right border-r-2 border-[#C8B898]/60 pr-3">
              <p className="text-[12.5px] leading-relaxed text-[#ECE4D4] font-serif">
                {plate.primaryExcerpt}
              </p>
              <div className="mt-1.5 text-[9px] font-mono tracking-[0.25em] text-[#C8B898]/70 uppercase">
                {plate.secondaryOrOriginalExcerpt}
              </div>
            </div>
          </div>
        );

      case 'woodcut-broadside':
        return (
          <div
            className="p-4 border-[3px] border-[#181310] text-[#181310] shadow-[4px_4px_0px_#181310]"
            style={{ background: '#EFE7D6' }}
          >
            <div className="flex items-center justify-between border-b-2 border-[#181310] pb-1.5 mb-2.5">
              <span className="px-1.5 py-0.5 bg-[#B81D13] text-white text-[9px] font-black tracking-widest uppercase">
                DISPUTATIO · 1518
              </span>
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider">
                WITTENBERG PRESS
              </span>
            </div>
            <div className="flex gap-3 items-start">
              <div className="text-2xl font-black text-[#B81D13] leading-none font-serif border-2 border-[#181310] px-2 py-1 bg-[#FAF5EA]">
                28
              </div>
              <p className="text-[11.5px] font-serif font-semibold leading-snug text-[#181310]">
                {plate.primaryExcerpt}
              </p>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-[#181310]/40 text-[9px] font-mono font-bold text-[#B81D13] uppercase tracking-wider">
              {plate.secondaryOrOriginalExcerpt}
            </div>
          </div>
        );

      case 'axumite-brana-3col':
        return (
          <div
            className="rounded-lg overflow-hidden border-2"
            style={{ background: '#F6EBC8', borderColor: '#8B2518' }}
          >
            <div
              className="h-4 w-full"
              style={{
                background:
                  'repeating-linear-gradient(45deg, #8B2518 0px, #8B2518 6px, #D99B26 6px, #D99B26 12px, #1D4D3E 12px, #1D4D3E 18px)',
              }}
            />
            <div className="p-3.5 text-[#1F140E]">
              <div className="text-center text-[11px] font-bold text-[#8B2518] mb-2">
                {plate.secondaryOrOriginalExcerpt}
              </div>
              <div className="grid grid-cols-3 gap-2.5 text-[10px] leading-snug font-serif border-t border-b border-[#8B2518]/35 py-2.5">
                <div className="border-r border-[#8B2518]/25 pr-2">
                  <span className="text-[#C8281E] font-bold">From before the world</span> and forever afterward, God is in His Trinity.
                </div>
                <div className="border-r border-[#8B2518]/25 pr-2">
                  <span className="text-[#C8281E] font-bold">God is in His Divinity;</span> and God is in His Kingdom.
                </div>
                <div>
                  <span className="text-[#C8281E] font-bold">Late have I loved Thee,</span> O Beauty ever ancient, ever new!
                </div>
              </div>
            </div>
          </div>
        );

      case 'futurist-breath-hud':
        return (
          <div
            className="rounded-2xl p-4 border relative overflow-hidden"
            style={{
              background: 'radial-gradient(circle at 50% 0%, rgba(56,189,248,0.28), #050816 72%)',
              borderColor: 'rgba(56,189,248,0.45)',
            }}
          >
            <div className="flex items-center justify-between text-[9px] font-mono text-[#38BDF8] mb-2.5">
              <span>HESYCHIA · TABORIC RAY</span>
              <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/15 border border-[#38BDF8]/40">
                7.5 BPM CADENCE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="p-2 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/30">
                <div className="text-[8.5px] font-mono uppercase text-[#38BDF8]">Inhale · 4.0s</div>
                <div className="text-[11px] text-white font-semibold">
                  “Lord Jesus Christ, Son of God…”
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/35">
                <div className="text-[8.5px] font-mono uppercase text-[#D8B4FE]">Exhale · 4.0s</div>
                <div className="text-[11px] text-white font-semibold">
                  “…have mercy on me, a sinner.”
                </div>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed text-[#E0F2FE]/80">
              {plate.primaryExcerpt}
            </p>
          </div>
        );

      case 'tenebrist-diagonal':
        return (
          <div
            className="rounded-xl p-4 border relative overflow-hidden"
            style={{
              background:
                'linear-gradient(128deg, rgba(229,184,75,0.26) 0%, rgba(19,12,8,0.96) 46%, #050302 100%)',
              borderColor: 'rgba(229,184,75,0.45)',
            }}
          >
            <div className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-8">
                <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-[#E5B84B] mb-1">
                  SUSCIPE · IGNATIAN RELIK
                </div>
                <p className="text-[11.5px] leading-relaxed text-[#FFF6E0] font-serif italic">
                  {plate.primaryExcerpt}
                </p>
              </div>
              <div className="col-span-4 border-l-2 border-[#E5B84B] pl-2.5 text-[10px] font-serif text-[#E5B84B]">
                “{plate.secondaryOrOriginalExcerpt}”
              </div>
            </div>
          </div>
        );

      case 'kells-carpet-split':
        return (
          <div className="rounded-xl overflow-hidden border border-[#5EEAD4]/40 grid grid-cols-12">
            <div
              className="col-span-4 p-3 flex flex-col justify-between text-center border-r border-[#5EEAD4]/35"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, #115E59 0%, #062C26 100%)',
              }}
            >
              <div className="text-[8.5px] font-mono uppercase tracking-widest text-[#5EEAD4]">
                IONA · KELLS
              </div>
              <div className="my-2 mx-auto w-12 h-12 rounded-lg border-2 border-[#F59E0B] bg-[#F59E0B]/15 flex items-center justify-center text-xl font-black text-[#FDE68A] font-serif">
                ☧
              </div>
              <div className="text-[8px] font-mono text-[#99F6E4]">LORICA SHIELD</div>
            </div>
            <div className="col-span-8 p-3.5 bg-[#F4ECD8] text-[#142620]">
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#0F5246] mb-1">
                {plate.documentTitle}
              </div>
              <p className="text-[11px] leading-relaxed font-serif text-[#12221D]">
                {plate.primaryExcerpt}
              </p>
            </div>
          </div>
        );

      case 'gregorian-neume-ruled':
        return (
          <div
            className="rounded-xl p-4 border"
            style={{
              background: 'linear-gradient(180deg, #0D214F 0%, #07122E 100%)',
              borderColor: 'rgba(243,208,120,0.5)',
            }}
          >
            {/* 4-Line Red Gregorian Staff with Square Neumes */}
            <div className="relative py-2 mb-2.5">
              <div className="space-y-1.5">
                <div className="h-[1px] bg-[#EF4444]/65" />
                <div className="h-[1px] bg-[#EF4444]/65" />
                <div className="h-[1px] bg-[#EF4444]/65" />
                <div className="h-[1px] bg-[#EF4444]/65" />
              </div>
              <div className="absolute inset-0 flex items-center justify-around px-4 text-[#F3D078] font-serif text-sm font-black">
                <span>𝄞</span>
                <span>■</span>
                <span>■■</span>
                <span>◆</span>
                <span>■</span>
                <span>■■</span>
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-[#FFF8E7] font-serif italic">
              {plate.primaryExcerpt}
            </p>
            <div className="mt-2 text-[9.5px] text-[#F3D078] font-mono">
              {plate.secondaryOrOriginalExcerpt}
            </div>
          </div>
        );

      case 'crystal-mandala-7':
        return (
          <div
            className="rounded-2xl p-4 border text-center relative overflow-hidden"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(240,171,252,0.28) 0%, rgba(88,28,135,0.35) 45%, #120722 100%)',
              borderColor: 'rgba(240,171,252,0.45)',
            }}
          >
            <div className="mx-auto mb-2 px-3 py-1 rounded-full border border-[#F0ABFC]/50 bg-[#F0ABFC]/15 inline-block text-[9px] font-mono uppercase tracking-widest text-[#F5D0FE]">
              {plate.secondaryOrOriginalExcerpt}
            </div>
            <p className="text-[11.5px] leading-relaxed text-white font-serif max-w-md mx-auto">
              {plate.primaryExcerpt}
            </p>
          </div>
        );

      case 'syriac-antiphon':
        return (
          <div
            className="rounded-lg p-4 border-2 space-y-2"
            style={{
              background: 'linear-gradient(180deg, #381912 0%, #240F0B 100%)',
              borderColor: '#C26D48',
            }}
          >
            <div className="bg-[#4B231A] border-l-4 border-[#FDBA74] p-2 rounded-r text-[10.5px] text-[#FFEDD5] font-serif">
              <span className="text-[8.5px] font-mono uppercase tracking-wider text-[#FDBA74] block">
                Choir I · Strophe
              </span>
              {plate.primaryExcerpt}
            </div>
            <div className="bg-[#2D140E] border-r-4 border-[#F97316] p-2 rounded-l text-right text-[10.5px] text-[#FED7AA] font-serif ml-6">
              <span className="text-[8.5px] font-mono uppercase tracking-wider text-[#FB923C] block">
                Choir II · Antiphonal Response
              </span>
              “Blessed is He who by His cross unlocked the gate of Paradise!”
            </div>
          </div>
        );

      case 'westminster-altar-triptych':
      default:
        return (
          <div
            className="p-3.5 border-double border-4 text-[#181512]"
            style={{
              background: '#FAF7F0',
              borderColor: '#9A7B3E',
            }}
          >
            <div className="text-center border-b border-[#9A7B3E]/40 pb-1.5 mb-2">
              <span className="text-[#B91C1C] font-bold mr-1">✠</span>
              <span className="text-[10px] font-serif font-bold tracking-[0.2em] uppercase">
                {plate.documentTitle}
              </span>
              <span className="text-[#B91C1C] font-bold ml-1">✠</span>
            </div>
            <p className="text-[11px] leading-relaxed font-serif text-center text-[#1C1917]">
              {plate.primaryExcerpt}
            </p>
            <div className="mt-2 pt-1.5 border-t border-[#9A7B3E]/40 text-center text-[9.5px] font-serif text-[#B91C1C] font-semibold">
              {plate.secondaryOrOriginalExcerpt}
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className={`rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 ${
        isSelected ? 'ring-2 ring-[#E8C170]' : ''
      }`}
      style={{
        background: 'rgba(18, 9, 36, 0.85)',
        borderColor: isSelected ? '#E8C170' : 'rgba(224, 206, 255, 0.16)',
      }}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-wider bg-[#6B0099]/40 border border-[#E0CEFF]/25 text-[#E0CEFF]">
            Plate {plate.plateNumber} · {plate.lens}
          </span>
          <span className="text-[9.5px] font-mono text-[#E8C170]">
            {plate.layoutArchitectureName}
          </span>
        </div>

        <h3 className="text-base font-bold text-white leading-snug">{plate.title}</h3>
        <p className="text-[11px] text-[#E0CEFF]/70 mb-3">{plate.subtitle}</p>

        {/* Distinct Architectural Surface */}
        {renderArchitecturalBody()}

        <div className="mt-3 text-[10.5px] text-white/65 leading-snug">
          <span className="text-[#E8C170] font-semibold">{plate.genreLabel}:</span>{' '}
          {plate.provenanceNote}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
        <button
          onClick={() => onSelect(plate)}
          className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1.5 border transition-all"
          style={
            isSelected
              ? {
                  background: 'rgba(232,193,112,0.2)',
                  borderColor: '#E8C170',
                  color: '#FFE399',
                }
              : {
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                }
          }
        >
          <Check size={12} />
          <span>{isSelected ? 'Active Verse Plate' : 'Use Plate in Verse'}</span>
        </button>

        <button
          onClick={() => onOpenLorea(plate)}
          className="px-3 py-1.5 rounded-lg text-[10.5px] font-black text-black flex items-center gap-1.5 hover:brightness-110 transition-all"
          style={{ background: '#E8C170' }}
        >
          <BookOpen size={12} />
          <span>Open in Lorea</span>
        </button>
      </div>
    </div>
  );
};

export const LectioCouncilPlatesModal: React.FC<LectioCouncilPlatesModalProps> = ({
  open,
  onClose,
  initialTab = 'PLATES_12',
}) => {
  const [tab, setTab] = useState<'PLATES_12' | 'HYMNS_AND_PRAYERS'>(initialTab);
  const [lensFilter, setLensFilter] = useState<'ALL' | ArtCouncilLens>('ALL');
  const [activePlateId, setActivePlateId] = useState<string>(() => getActiveLectioCouncilPlateId());

  if (!open) return null;

  const filteredPlates = LECTIO_COUNCIL_PLATES.filter(
    p => lensFilter === 'ALL' || p.lens === lensFilter
  );

  const handleSelectPlate = (plate: LectioCouncilPlate) => {
    setActiveLectioCouncilPlateId(plate.id);
    setActivePlateId(plate.id);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        className="w-full max-w-6xl max-h-[90vh] rounded-3xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(165deg, #130924 0%, #090414 55%, #05020A 100%)',
          borderColor: 'rgba(232, 193, 112, 0.35)',
        }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#E8C170]">
              <Sparkles size={12} />
              <span>Plajah Art Council · Verse & Lorea Sacred Treasury</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-0.5">
              12 Non-Scripture Sacred Text Plates, Public-Domain Hymnal & Liturgical Prayers
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('PLATES_12')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                tab === 'PLATES_12'
                  ? 'bg-[#6B0099] text-white border-[#E0CEFF]/40'
                  : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
              }`}
            >
              <ScrollText size={13} />
              <span>12 Art Council Text Plates</span>
            </button>
            <button
              onClick={() => setTab('HYMNS_AND_PRAYERS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                tab === 'HYMNS_AND_PRAYERS'
                  ? 'bg-[#D40055] text-white border-[#E8C170]/40'
                  : 'bg-white/5 text-white/65 border-white/10 hover:text-white'
              }`}
            >
              <Music size={13} />
              <span>Hymns, Scores & Catholic/Orthodox Prayers</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/75"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {tab === 'PLATES_12' ? (
          <>
            {/* Lens Filter Strip */}
            <div className="px-6 py-2.5 border-b border-white/10 flex items-center gap-2 overflow-x-auto flex-none bg-black/30">
              {LENS_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setLensFilter(f.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                    lensFilter === f.id
                      ? 'bg-[#E8C170] text-black'
                      : 'bg-white/5 text-white/65 hover:text-white border border-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 12 Plates Grid */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-5 custom-scrollbar">
              {filteredPlates.map(plate => (
                <CouncilPlatePreviewCard
                  key={plate.id}
                  plate={plate}
                  isSelected={activePlateId === plate.id}
                  onSelect={handleSelectPlate}
                  onOpenLorea={openCouncilPlateInLorea}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* Public Domain Hymns with Provenance & SATB Scores */}
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#E8C170] mb-3">
                Public-Domain Hymns · Lorea Provenance & 4-Part SATB Accompaniment Scores
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PUBLIC_DOMAIN_HYMNS.map(hymn => (
                  <div
                    key={hymn.id}
                    className="rounded-2xl p-4 border border-[#E0CEFF]/20 bg-[#140A28]/90 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-[#E8C170] font-mono mb-1">
                        <span>{hymn.year}</span>
                        {hymn.score && (
                          <span>
                            Tune: {hymn.score.tuneName} ({hymn.score.defaultKey} · {hymn.score.timeSignature})
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-white">{hymn.title}</h4>
                      <div className="text-[11px] text-[#E0CEFF]/70 mb-2">{hymn.author}</div>
                      <p className="text-[11px] text-white/80 leading-relaxed line-clamp-3 mb-2">
                        {hymn.historyEssay}
                      </p>
                      {hymn.score && (
                        <div className="p-2 rounded-lg bg-black/40 border border-[#E8C170]/25 text-[10px] text-[#FFE399] font-mono">
                          Keys: {hymn.score.availableKeys.join(' · ')} | Cadence:{' '}
                          {hymn.score.chordProgression.join(' → ')}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => openHymnOrPrayerInLorea(hymn)}
                        className="px-3 py-1.5 rounded-lg text-[10.5px] font-black text-black flex items-center gap-1.5"
                        style={{ background: '#E8C170' }}
                      >
                        <BookOpen size={12} />
                        <span>Open Hymn, History & Score in Lorea</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Catholic & Orthodox Liturgical Prayers */}
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#E0CEFF] mb-3">
                Catholic & Eastern Orthodox Liturgical Prayers · Parallel Ancient & English
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CATHOLIC_AND_ORTHODOX_PRAYERS.map(prayer => (
                  <div
                    key={prayer.id}
                    className="rounded-2xl p-4 border border-[#E0CEFF]/20 bg-[#140A28]/90 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-[#E0CEFF] font-mono mb-1">
                        <span>{prayer.tradition}</span>
                        <span>{prayer.year}</span>
                      </div>
                      <h4 className="text-base font-bold text-white">
                        {prayer.title}{' '}
                        {prayer.originalTitle ? (
                          <span className="text-white/55 font-normal">({prayer.originalTitle})</span>
                        ) : null}
                      </h4>
                      <p className="text-[11px] text-white/80 leading-relaxed line-clamp-3 my-2">
                        {prayer.historyEssay}
                      </p>
                      {prayer.originalStanzas?.[0] && (
                        <div className="p-2 rounded-lg bg-black/40 border border-white/10 text-[10.5px] italic text-[#E0CEFF]">
                          {prayer.originalStanzas[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => openHymnOrPrayerInLorea(prayer)}
                        className="px-3 py-1.5 rounded-lg text-[10.5px] font-black text-black flex items-center gap-1.5"
                        style={{ background: '#E0CEFF' }}
                      >
                        <BookOpen size={12} />
                        <span>Open Prayer in Lorea</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LectioCouncilPlatesModal;
