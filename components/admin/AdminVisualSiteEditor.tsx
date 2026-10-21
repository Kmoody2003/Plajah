import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Edit3, Eye, Users, Radio, Image as ImageIcon, Layers, BookOpen,
  Palette, Wand2, Plus, Trash2, Check, X, ChevronRight, ChevronUp, ChevronDown,
  Upload, Compass, ShieldCheck, Music, Film, Sliders, RefreshCw, ExternalLink,
  Activity, MapPin, MessageSquareQuote, LayoutGrid, CheckCircle2, ArrowUpRight
} from 'lucide-react';
import { AppView } from '../../types';
import {
  PageVisualConfig,
  PlajahGradientPreset,
  PlajahVisualizerPreset,
  PlajahSectionTemplateType,
  CustomPageSection,
  EditableCarouselItem,
  PLAJAH_GRADIENT_CSS,
  PRESET_HERO_PLATES,
  isGlobalEditModeEnabled,
  setGlobalEditModeEnabled,
  subscribeGlobalEditMode,
  subscribePageVisualConfig,
  savePageVisualConfig,
  updateInlineTextSlot,
  updateHeroArtSlot,
  createPrewiredSection,
  runAdminCouncilDeliberation,
  AdminCouncilDeliberation,
} from '../../services/siteVisualEditorService';
import {
  LiveTelemetrySnapshot,
  subscribeLiveTelemetry,
  updatePresenceView,
  isSimulatedTrafficEnabled,
  setSimulatedTrafficEnabled,
  getViewMeta,
} from '../../services/liveTelemetryService';
import { uploadLandingBgAsset } from '../../services/backendService';
import { COUNCIL_LIST } from '../../services/council/councilDirectors';
import { WORSHIP_COUNCIL_BUILDS } from '../../services/ambo/worshipVisualizers/councilBuilds';

interface AdminVisualSiteEditorProps {
  currentView: AppView | string;
  onNavigate: (view: AppView) => void;
  isAdmin: boolean;
  userEmail?: string | null;
  onOpenToolModal?: (tool: 'LIVING_BOOK' | 'CURATED_BUILDER' | 'TELA_STUDIO' | 'PIXELS' | 'AMBO_STAGE') => void;
}

type EditorTab = 'INLINE_COPY' | 'HERO_ART' | 'CAROUSELS' | 'SECTIONS' | 'COUNCILS' | 'TELEMETRY';

export const AdminVisualSiteEditor: React.FC<AdminVisualSiteEditorProps> = ({
  currentView,
  onNavigate,
  isAdmin,
  userEmail,
  onOpenToolModal,
}) => {
  const [editMode, setEditMode] = useState<boolean>(() => isGlobalEditModeEnabled());
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('HERO_ART');
  const [telemetryQuickOpen, setTelemetryQuickOpen] = useState<boolean>(false);
  // The floating dock rests collapsed; hovering or focusing it opens the full pill.
  const [dockHover, setDockHover] = useState(false);
  const [config, setConfig] = useState<PageVisualConfig | null>(null);
  const [telemetry, setTelemetry] = useState<LiveTelemetrySnapshot | null>(null);
  const [simTraffic, setSimTraffic] = useState<boolean>(() => isSimulatedTrafficEnabled());

  // Inline click-to-edit popover state for global WYSIWYG
  const [selectedSlot, setSelectedSlot] = useState<{
    key: string;
    label: string;
    value: string;
    rect?: { top: number; left: number };
  } | null>(null);

  // Council deliberation state
  const [selectedCouncilType, setSelectedCouncilType] = useState<
    'ART_DIRECTORS' | 'AMBO_WORSHIP' | 'LIVING_BOOK_COMPOSER' | 'COMIC_SAFE_ZONE' | 'LECTIO_EDITORIAL'
  >('ART_DIRECTORS');
  const [deliberation, setDeliberation] = useState<AdminCouncilDeliberation | null>(null);

  // File upload state
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetHeroSlot, setTargetHeroSlot] = useState<string>('primary_hero');

  // Allow admin access if isAdmin OR running on localhost for immediate visual testing
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const canUseAdminEditor = isAdmin || isLocalhost;

  useEffect(() => {
    const unsubEdit = subscribeGlobalEditMode(enabled => {
      setEditMode(enabled);
    });
    return unsubEdit;
  }, []);

  useEffect(() => {
    const viewKey = String(currentView || AppView.DASHBOARD);
    updatePresenceView(viewKey);
    const unsubCfg = subscribePageVisualConfig(viewKey, cfg => {
      setConfig(cfg);
    });
    return unsubCfg;
  }, [currentView]);

  useEffect(() => {
    const unsubTel = subscribeLiveTelemetry(snap => {
      setTelemetry(snap);
    });
    return unsubTel;
  }, []);

  // Apply textOverrides from PageVisualConfig to any matching [data-pj-edit] elements in the DOM
  useEffect(() => {
    if (!config || typeof document === 'undefined') return;
    const elements = document.querySelectorAll<HTMLElement>('[data-pj-edit]');
    elements.forEach(el => {
      const key = el.getAttribute('data-pj-edit');
      if (key && config.textOverrides[key] !== undefined) {
        if (el.innerText !== config.textOverrides[key]) {
          el.innerText = config.textOverrides[key];
        }
      }
    });
  }, [config, currentView, editMode]);

  // Global WYSIWYG click interceptor when Edit Mode is ON
  useEffect(() => {
    if (!editMode || !canUseAdminEditor || typeof document === 'undefined') {
      document.body.classList.remove('pj-wysiwyg-edit-active');
      return;
    }
    document.body.classList.add('pj-wysiwyg-edit-active');

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside the Admin Editor UI itself
      if (target.closest('[data-pj-admin-editor-ui="true"]')) return;

      // Check for explicit [data-pj-edit] or editable text elements (h1, h2, h3, h4, p, span, button)
      const explicitSlot = target.closest<HTMLElement>('[data-pj-edit]');
      if (explicitSlot) {
        e.preventDefault();
        e.stopPropagation();
        const key = explicitSlot.getAttribute('data-pj-edit')!;
        const label = explicitSlot.getAttribute('data-pj-label') || key.replace(/_/g, ' ');
        const r = explicitSlot.getBoundingClientRect();
        setSelectedSlot({
          key,
          label,
          value: explicitSlot.innerText.trim(),
          rect: {
            top: Math.min(window.innerHeight - 280, Math.max(20, r.bottom + 10)),
            left: Math.min(window.innerWidth - 420, Math.max(20, r.left)),
          },
        });
        return;
      }

      // Generic DOM heading/copy element support across any page on the platform
      const genericEditable = target.closest<HTMLElement>('h1, h2, h3, h4, p, blockquote');
      if (genericEditable && genericEditable.innerText.trim().length > 0) {
        e.preventDefault();
        e.stopPropagation();
        let key = genericEditable.getAttribute('data-pj-edit');
        if (!key) {
          const tag = genericEditable.tagName.toLowerCase();
          const snippet = genericEditable.innerText
            .trim()
            .slice(0, 24)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_');
          key = `auto_${String(currentView).toLowerCase()}_${tag}_${snippet}`;
          genericEditable.setAttribute('data-pj-edit', key);
        }
        const r = genericEditable.getBoundingClientRect();
        setSelectedSlot({
          key,
          label: `${genericEditable.tagName} Text Copy`,
          value: genericEditable.innerText.trim(),
          rect: {
            top: Math.min(window.innerHeight - 280, Math.max(20, r.bottom + 10)),
            left: Math.min(window.innerWidth - 420, Math.max(20, r.left)),
          },
        });
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.body.classList.remove('pj-wysiwyg-edit-active');
    };
  }, [editMode, canUseAdminEditor, currentView]);

  if (!canUseAdminEditor) return null;

  const viewKey = String(currentView || AppView.DASHBOARD);
  const viewMeta = getViewMeta(viewKey);
  const currentViewViewers =
    telemetry?.byView.find(b => String(b.view) === viewKey)?.count || 1;

  const toggleEditMode = () => {
    const next = !editMode;
    setGlobalEditModeEnabled(next);
    if (next && !drawerOpen) {
      setDrawerOpen(true);
    }
    if (!next) {
      setSelectedSlot(null);
    }
  };

  const handleSaveInlineSlot = () => {
    if (!selectedSlot) return;
    updateInlineTextSlot(viewKey, selectedSlot.key, selectedSlot.value);
    const el = document.querySelector<HTMLElement>(`[data-pj-edit="${selectedSlot.key}"]`);
    if (el) {
      el.innerText = selectedSlot.value;
    }
    setSelectedSlot(null);
  };

  const handleHeroFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlot(targetHeroSlot);
    try {
      const { url } = await uploadLandingBgAsset(file);
      updateHeroArtSlot(viewKey, targetHeroSlot, {
        backgroundUrl: url,
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
      });
    } catch {
      // Fallback to local object/data URL for instant preview
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateHeroArtSlot(viewKey, targetHeroSlot, {
            backgroundUrl: reader.result,
            mediaType: file.type.startsWith('video/') ? 'video' : 'image',
          });
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleAddSection = (template: PlajahSectionTemplateType) => {
    if (!config) return;
    const newSec = createPrewiredSection(template, 'BAROQUE');
    const next: PageVisualConfig = {
      ...config,
      customSections: [...(config.customSections || []), newSec],
    };
    savePageVisualConfig(next);
  };

  const handleDeleteSection = (secId: string) => {
    if (!config) return;
    const next: PageVisualConfig = {
      ...config,
      customSections: (config.customSections || []).filter(s => s.id !== secId),
    };
    savePageVisualConfig(next);
  };

  const handleMoveSection = (index: number, dir: -1 | 1) => {
    if (!config) return;
    const arr = [...(config.customSections || [])];
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    const temp = arr[index];
    arr[index] = arr[targetIdx];
    arr[targetIdx] = temp;
    savePageVisualConfig({ ...config, customSections: arr });
  };

  const handleSummonCouncil = () => {
    const currentH1 =
      document.querySelector<HTMLElement>('[data-pj-edit="elevate_hero_title"], h1')?.innerText ||
      'Where Every Spirit Finds Its Sanctuary.';
    const res = runAdminCouncilDeliberation(selectedCouncilType, currentH1);
    setDeliberation(res);
  };

  const handleApplyCouncilDeliberation = () => {
    if (!deliberation || !config) return;
    // Apply headline, subtitle, handwritten note, and hero art preset
    const nextText = {
      ...config.textOverrides,
      elevate_hero_title: deliberation.headlineSuggestion,
      elevate_hero_subtitle: deliberation.subtitleSuggestion,
      elevate_hero_handwritten: deliberation.handwrittenSuggestion,
    };
    const existingHero = config.heroArt['primary_hero'] || {
      slotId: 'primary_hero',
      label: 'Primary Sanctuary Hero Stage',
      backgroundUrl: PRESET_HERO_PLATES[0].url,
      mediaType: 'image' as const,
      gradientPreset: 'warm' as PlajahGradientPreset,
      overlayOpacity: 45,
      visualizerPreset: 'calm-01-gethsemane-olive-dusk' as PlajahVisualizerPreset,
    };
    const next: PageVisualConfig = {
      ...config,
      textOverrides: nextText,
      heroArt: {
        ...config.heroArt,
        primary_hero: {
          ...existingHero,
          gradientPreset: deliberation.gradientSuggestion,
          visualizerPreset: deliberation.visualizerSuggestion,
        },
      },
    };
    savePageVisualConfig(next);
  };

  const currentHeroArt = config?.heroArt?.['primary_hero'] || {
    slotId: 'primary_hero',
    label: 'Primary Hero Stage',
    backgroundUrl: PRESET_HERO_PLATES[0].url,
    mediaType: 'image',
    gradientPreset: 'warm' as PlajahGradientPreset,
    overlayOpacity: 42,
    visualizerPreset: 'calm-01-gethsemane-olive-dusk' as PlajahVisualizerPreset,
  };

  return (
    <>
      {/* Global CSS for WYSIWYG hover outlines when Edit Mode is active */}
      <style>{`
        body.pj-wysiwyg-edit-active [data-pj-edit] {
           outline: 1.5px dashed rgba(255, 140, 0, 0.55);
           outline-offset: 4px;
           border-radius: 6px;
           cursor: pointer !important;
           transition: outline-color 0.18s ease, background-color 0.18s ease;
        }
        body.pj-wysiwyg-edit-active [data-pj-edit]:hover {
           outline: 2px solid #FF8C00;
           background-color: rgba(212, 0, 85, 0.14);
        }
      `}</style>

      {/* Hidden file input for background/hero art uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleHeroFileUpload}
      />

      {/* ── 1. RENDER ADMIN-ADDED CUSTOM SECTIONS (PLAJAH DESIGN SYSTEM) ── */}
      {config && config.customSections && config.customSections.length > 0 && (
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-8 pb-24 space-y-12">
          {config.customSections.map((sec, idx) => {
            const grad = PLAJAH_GRADIENT_CSS[sec.gradientPreset || 'warm'];
            return (
              <section
                key={sec.id}
                className="relative rounded-[36px] overflow-hidden border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
                style={{
                  background: '#13111C',
                  fontFamily: 'var(--font-body, Inter, sans-serif)',
                }}
              >
                {/* Background image + Plajah gradient scrim */}
                {sec.backgroundUrl && (
                  <img
                    src={sec.backgroundUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
                  />
                )}
                <div
                  className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{ background: grad.css }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09080D] via-[#09080D]/75 to-transparent pointer-events-none" />

                {/* Admin Section Quick Controls when in Edit Mode */}
                {editMode && (
                  <div
                    data-pj-admin-editor-ui="true"
                    className="relative z-30 flex items-center justify-between px-6 py-2.5 bg-black/70 backdrop-blur-xl border-b border-white/10 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#D40055]/30 text-[#FF8C00] border border-[#FF8C00]/30">
                        Plajah Template · {sec.template.replace(/_/g, ' ')}
                      </span>
                      {sec.councilNote && (
                        <span className="text-white/50 italic truncate max-w-md hidden md:inline">
                          {sec.councilNote}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleMoveSection(idx, -1)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70"
                        title="Move Section Up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => handleMoveSection(idx, 1)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70"
                        title="Move Section Down"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSection(sec.id)}
                        className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300"
                        title="Remove Section"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative z-10 p-8 sm:p-12 lg:p-14">
                  <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.07] border border-white/10 mb-4">
                      <Sparkles size={12} className="text-[#FF8C00]" />
                      <span
                        data-pj-edit={`${sec.id}_eyebrow`}
                        className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#D0BCFF]"
                        style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                      >
                        {config.textOverrides[`${sec.id}_eyebrow`] ?? sec.eyebrow}
                      </span>
                    </div>

                    {sec.handwrittenCallout && (
                      <p
                        data-pj-edit={`${sec.id}_handwritten`}
                        className="text-lg text-[#FF8C00] mb-1"
                        style={{ fontFamily: 'var(--font-handwritten, "Gochi Hand", cursive)' }}
                      >
                        {config.textOverrides[`${sec.id}_handwritten`] ?? sec.handwrittenCallout}
                      </p>
                    )}

                    <h2
                      data-pj-edit={`${sec.id}_title`}
                      className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.06] mb-4"
                      style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                    >
                      {config.textOverrides[`${sec.id}_title`] ?? sec.title}
                    </h2>

                    <p
                      data-pj-edit={`${sec.id}_subtitle`}
                      className="text-base sm:text-lg text-[#B5B0C4] leading-relaxed mb-8"
                    >
                      {config.textOverrides[`${sec.id}_subtitle`] ?? sec.subtitle}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mb-8">
                      <button
                        onClick={() =>
                          sec.ctaPrimaryTarget && onNavigate(sec.ctaPrimaryTarget as AppView)
                        }
                        className="px-6 py-3 rounded-full font-bold text-sm text-white shadow-lg flex items-center gap-2 transition-transform hover:scale-[1.02]"
                        style={{
                          background: grad.css,
                          fontFamily: 'var(--font-display, Outfit, sans-serif)',
                        }}
                      >
                        <span data-pj-edit={`${sec.id}_cta1`}>
                          {config.textOverrides[`${sec.id}_cta1`] ?? sec.ctaPrimaryLabel}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                      {sec.ctaSecondaryLabel && (
                        <button
                          onClick={() =>
                            sec.ctaSecondaryTarget && onNavigate(sec.ctaSecondaryTarget as AppView)
                          }
                          className="px-6 py-3 rounded-full font-bold text-sm text-white/90 bg-white/[0.07] hover:bg-white/[0.12] border border-white/15 transition-all"
                          style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                        >
                          <span data-pj-edit={`${sec.id}_cta2`}>
                            {config.textOverrides[`${sec.id}_cta2`] ?? sec.ctaSecondaryLabel}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Optional Cards inside the Custom Section */}
                  {sec.cards && sec.cards.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
                      {sec.cards.map(card => (
                        <div
                          key={card.id}
                          className="group relative rounded-[24px] p-6 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] hover:border-white/20 transition-all overflow-hidden"
                        >
                          {card.imageUrl && (
                            <div className="h-36 -mx-6 -mt-6 mb-5 overflow-hidden relative">
                              <img
                                src={card.imageUrl}
                                alt={card.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#13111C] via-transparent to-transparent" />
                            </div>
                          )}
                          <span
                            data-pj-edit={`${card.id}_badge`}
                            className="inline-block text-[10px] font-black uppercase tracking-[0.14em] px-2.5 py-1 rounded-full mb-3"
                            style={{
                              background: `${card.accentColor}22`,
                              color: card.accentColor,
                              fontFamily: 'var(--font-display, Outfit, sans-serif)',
                            }}
                          >
                            {config.textOverrides[`${card.id}_badge`] ?? card.badge}
                          </span>
                          <h3
                            data-pj-edit={`${card.id}_title`}
                            className="text-lg font-extrabold text-white mb-2"
                            style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                          >
                            {config.textOverrides[`${card.id}_title`] ?? card.title}
                          </h3>
                          <p
                            data-pj-edit={`${card.id}_body`}
                            className="text-sm text-[#B5B0C4] leading-relaxed"
                          >
                            {config.textOverrides[`${card.id}_body`] ?? card.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── 2. FLOATING INLINE WYSIWYG POPOVER WHEN CLICKING ANY PAGE TEXT ── */}
      {editMode && selectedSlot && (
        <div
          data-pj-admin-editor-ui="true"
          className="fixed z-[9999] w-[390px] rounded-[24px] bg-[#13111C]/95 backdrop-blur-2xl border border-[#FF8C00]/50 shadow-[0_24px_60px_rgba(0,0,0,0.85)] p-5 text-white"
          style={{
            top: selectedSlot.rect?.top ?? 120,
            left: selectedSlot.rect?.left ?? 120,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
              <span
                className="text-[11px] font-black uppercase tracking-widest text-[#D0BCFF]"
                style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
              >
                Inline WYSIWYG · {selectedSlot.label}
              </span>
            </div>
            <button
              onClick={() => setSelectedSlot(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60"
            >
              <X size={14} />
            </button>
          </div>

          <textarea
            value={selectedSlot.value}
            onChange={e => setSelectedSlot({ ...selectedSlot, value: e.target.value })}
            rows={3}
            className="w-full rounded-2xl bg-black/50 border border-white/15 focus:border-[#FF8C00] px-3.5 py-2.5 text-sm text-white focus:outline-none mb-3"
          />

          {/* Quick AI Council Copy Polish */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              onClick={() => {
                const polished = `${selectedSlot.value.replace(/\.$/, '')} — Gathered in Living Light.`;
                setSelectedSlot({ ...selectedSlot, value: polished });
              }}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-[#D0BCFF] flex items-center justify-center gap-1.5"
            >
              <Wand2 size={12} className="text-[#FF8C00]" />
              Baroque Polish
            </button>
            <button
              onClick={() => {
                const words = selectedSlot.value.split(/\s+/);
                const minimal = words.length > 6 ? words.slice(0, 6).join(' ') + '.' : selectedSlot.value;
                setSelectedSlot({ ...selectedSlot, value: minimal });
              }}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-[#00DAF3] flex items-center justify-center gap-1.5"
            >
              <Sparkles size={12} />
              Minimalist Cut
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setSelectedSlot(null)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveInlineSlot}
              className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
              }}
            >
              <Check size={13} />
              Save to Live Page
            </button>
          </div>
        </div>
      )}

      {/* ── 3. FLOATING ADMIN COMMAND BAR & LIVE TELEMETRY PILL ── */}
      <div
        data-pj-admin-editor-ui="true"
        className="fixed bottom-5 right-5 z-[9990] flex flex-col items-end gap-2.5"
      >
        {/* Quick Telemetry Popover when clicking the Live Presence counter */}
        {telemetryQuickOpen && telemetry && (
          <div className="w-[380px] sm:w-[420px] rounded-[28px] bg-[#13111C]/95 backdrop-blur-2xl border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.85)] p-5 text-white mb-1">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <div>
                  <h4
                    className="text-xs font-black uppercase tracking-widest text-white"
                    style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                  >
                    Live Platform Telemetry
                  </h4>
                  <p className="text-[11px] text-white/50">
                    Real-time presence across all Plajah rooms
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTelemetryQuickOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/60"
              >
                <X size={15} />
              </button>
            </div>

            {/* Summary KPI row */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div
                  className="text-2xl font-black text-emerald-400"
                  style={{ fontFamily: 'var(--font-mono-tech, "JetBrains Mono", monospace)' }}
                >
                  {telemetry.totalActiveNow}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  On Site Now
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div
                  className="text-2xl font-black text-[#FF8C00]"
                  style={{ fontFamily: 'var(--font-mono-tech, "JetBrains Mono", monospace)' }}
                >
                  {currentViewViewers}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  On This Page
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div
                  className="text-2xl font-black text-[#00DAF3]"
                  style={{ fontFamily: 'var(--font-mono-tech, "JetBrains Mono", monospace)' }}
                >
                  {telemetry.byView.length}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Active Rooms
                </div>
              </div>
            </div>

            {/* Where People Are Right Now */}
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center justify-between">
              <span>Where People Are Right Now</span>
              <span>Click to Visit</span>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {telemetry.byView.map(bucket => {
                const isHere = String(bucket.view) === viewKey;
                return (
                  <button
                    key={String(bucket.view)}
                    onClick={() => onNavigate(bucket.view as AppView)}
                    className={`w-full text-left rounded-2xl p-2.5 border transition-all flex items-center justify-between gap-3 ${
                      isHere
                        ? 'bg-white/[0.09] border-[#FF8C00]/50'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.07]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: bucket.color }}
                        />
                        <span className="text-xs font-bold text-white truncate">
                          {bucket.label}
                        </span>
                        {isHere && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#FF8C00]/20 text-[#FF8C00]">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/45 truncate mt-0.5 pl-4">
                        {bucket.sessions
                          .slice(0, 2)
                          .map(s => `${s.displayName} (${s.activeSection || 'Stage'})`)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-black px-2.5 py-1 rounded-full"
                        style={{
                          background: `${bucket.color}22`,
                          color: bucket.color,
                          fontFamily: 'var(--font-mono-tech, monospace)',
                        }}
                      >
                        {bucket.count}
                      </span>
                      <ChevronRight size={14} className="text-white/30" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-2 text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simTraffic}
                  onChange={e => {
                    setSimTraffic(e.target.checked);
                    setSimulatedTrafficEnabled(e.target.checked);
                  }}
                  className="rounded accent-[#D40055]"
                />
                <span>Include Sanctuary Fleet Simulation</span>
              </label>
              <button
                onClick={() => {
                  setTelemetryQuickOpen(false);
                  setDrawerOpen(true);
                  setActiveTab('TELEMETRY');
                }}
                className="text-[#FF8C00] font-bold hover:underline"
              >
                Full Telemetry →
              </button>
            </div>
          </div>
        )}

        {/* Primary Floating Admin Pill — rests as a small live dot so it never sits on top of the
            page's own controls; opens on hover / keyboard focus, and stays open while editing or
            while one of its panels is up. */}
        {!(dockHover || editMode || telemetryQuickOpen || drawerOpen) ? (
          <button
            type="button"
            onMouseEnter={() => setDockHover(true)}
            onFocus={() => setDockHover(true)}
            onClick={() => setDockHover(true)}
            aria-label={`Admin tools · ${telemetry?.totalActiveNow ?? 1} live`}
            title="Admin tools"
            className="h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 bg-[#13111C]/80 border border-white/12 text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.5)] opacity-70 hover:opacity-100 transition-opacity"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-bold tabular-nums" style={{ fontFamily: 'var(--font-mono-tech, monospace)' }}>{telemetry?.totalActiveNow ?? 1}</span>
          </button>
        ) : (
        <div
          onMouseLeave={() => setDockHover(false)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDockHover(false); }}
          className="flex items-center gap-2 rounded-full p-1.5 bg-[#13111C]/90 backdrop-blur-2xl border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.75)]"
        >
          {/* Live Telemetry Counter Pill */}
          <button
            onClick={() => setTelemetryQuickOpen(!telemetryQuickOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white transition-all"
            title="View Real-Time Site Presence & Where People Are"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span
              className="text-xs font-black tracking-tight"
              style={{ fontFamily: 'var(--font-mono-tech, monospace)' }}
            >
              {telemetry?.totalActiveNow ?? 1} Live
            </span>
            <span className="text-[10px] text-white/50 hidden sm:inline">
              · {currentViewViewers} here
            </span>
          </button>

          {/* Toggle Visual WYSIWYG Edit Mode */}
          <button
            onClick={toggleEditMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all ${
              editMode
                ? 'text-white shadow-[0_0_25px_rgba(212,0,85,0.6)]'
                : 'bg-white/[0.07] hover:bg-white/[0.14] text-white/90'
            }`}
            style={
              editMode
                ? {
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                    fontFamily: 'var(--font-display, Outfit, sans-serif)',
                  }
                : { fontFamily: 'var(--font-display, Outfit, sans-serif)' }
            }
          >
            <Edit3 size={13} />
            <span>{editMode ? 'WYSIWYG Edit: ON' : 'Edit Page'}</span>
          </button>

          {/* Open Studio Drawer Button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="p-2 rounded-full bg-white/[0.07] hover:bg-white/[0.15] text-[#D0BCFF] transition-all"
            title="Open Admin Web Page Studio & Councils"
          >
            <Sliders size={15} />
          </button>
        </div>
        )}
      </div>

      {/* ── 4. FULL ADMIN VISUAL SITE EDITOR & COUNCILS DRAWER ── */}
      {drawerOpen && (
        <div
          data-pj-admin-editor-ui="true"
          className="fixed top-4 right-4 bottom-20 z-[9995] w-[430px] max-w-[calc(100vw-2rem)] rounded-[32px] bg-[#0D0B14]/95 backdrop-blur-3xl border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-white"
        >
          {/* Drawer Header */}
          <div
            className="p-5 border-b border-white/10"
            style={{
              background:
                'linear-gradient(135deg, rgba(107,0,153,0.35) 0%, rgba(212,0,85,0.22) 55%, rgba(255,140,0,0.18) 100%)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30">
                  Plajah Visual Studio
                </span>
                <span className="text-[11px] text-white/60 font-medium truncate">
                  {viewMeta.label}
                </span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80"
              >
                <X size={15} />
              </button>
            </div>
            <h3
              className="text-lg font-black tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
            >
              Site Editor, Creative Tools & Councils
            </h3>
            <p className="text-xs text-white/65 mt-0.5">
              {editMode
                ? 'Click any headline, text, or button on the page to edit inline, or use the pre-wired studio tools below.'
                : 'Turn on WYSIWYG Edit Mode to click-and-edit any text directly on the page.'}
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 bg-black/40 border-b border-white/10 overflow-x-auto no-scrollbar">
            {[
              { id: 'HERO_ART' as EditorTab, label: 'Hero & Art', icon: ImageIcon },
              { id: 'SECTIONS' as EditorTab, label: '+ Sections', icon: Layers },
              { id: 'COUNCILS' as EditorTab, label: 'Councils', icon: Sparkles },
              { id: 'CAROUSELS' as EditorTab, label: 'Tools & Books', icon: BookOpen },
              { id: 'TELEMETRY' as EditorTab, label: 'Telemetry', icon: Activity },
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white shadow'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                  style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* ── TAB 1: HERO & BACKGROUND ART STUDIO ── */}
            {activeTab === 'HERO_ART' && (
              <div className="space-y-5">
                <div className="rounded-2xl p-4 bg-white/[0.04] border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-[#FF8C00]">
                      Direct On-Page Text Editing
                    </span>
                    <button
                      onClick={toggleEditMode}
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        editMode
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {editMode ? 'Active · Click Any Text' : 'Enable Click-to-Edit'}
                    </button>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    When enabled, click any header, subtitle, badge, or card copy on{' '}
                    <strong className="text-white">{viewMeta.label}</strong> to edit it visually in place.
                  </p>
                </div>

                {/* Upload or Pick Hero / Section Background Artwork */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black uppercase tracking-wider text-white/80">
                      Hero Stage Background Art
                    </label>
                    <button
                      onClick={() => {
                        setTargetHeroSlot('primary_hero');
                        fileInputRef.current?.click();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D40055]/25 hover:bg-[#D40055]/40 border border-[#D40055]/50 text-[11px] font-bold text-[#FF8C00]"
                    >
                      <Upload size={12} />
                      <span>{uploadingSlot ? 'Uploading…' : 'Upload Custom Art'}</span>
                    </button>
                  </div>

                  {/* Current Hero Art Preview */}
                  <div className="relative h-32 rounded-2xl overflow-hidden border border-white/15 mb-3">
                    <img
                      src={currentHeroArt.backgroundUrl}
                      alt="Hero Background"
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          PLAJAH_GRADIENT_CSS[currentHeroArt.gradientPreset || 'warm'].css,
                        opacity: (currentHeroArt.overlayOpacity ?? 42) / 100,
                      }}
                    />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-bold text-white drop-shadow">
                      <span>Active Hero Backdrop</span>
                      <span className="px-2 py-0.5 rounded bg-black/60 text-[#D0BCFF]">
                        Scrim: {currentHeroArt.overlayOpacity ?? 42}%
                      </span>
                    </div>
                  </div>

                  {/* Custom Image URL Input */}
                  <input
                    type="text"
                    value={currentHeroArt.backgroundUrl}
                    onChange={e =>
                      updateHeroArtSlot(viewKey, 'primary_hero', {
                        backgroundUrl: e.target.value,
                      })
                    }
                    placeholder="Paste image or video URL..."
                    className="w-full rounded-xl bg-black/50 border border-white/15 px-3 py-2 text-xs text-white mb-3 focus:outline-none focus:border-[#FF8C00]"
                  />

                  {/* Preset Sanctuary & Editorial Plates */}
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-2">
                    Sanctuary Plates & Plajah Art Library
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_HERO_PLATES.map(plate => {
                      const selected = currentHeroArt.backgroundUrl === plate.url;
                      return (
                        <button
                          key={plate.id}
                          onClick={() =>
                            updateHeroArtSlot(viewKey, 'primary_hero', {
                              backgroundUrl: plate.url,
                            })
                          }
                          className={`group relative h-20 rounded-xl overflow-hidden border text-left p-2 flex flex-col justify-end transition-all ${
                            selected
                              ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/40'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <img
                            src={plate.url}
                            alt={plate.label}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                          <span className="relative z-10 text-[10px] font-bold text-white leading-tight line-clamp-2">
                            {plate.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Plajah Design System Gradient Scrim Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black uppercase tracking-wider text-white/80">
                      Plajah Brand Gradient Atmosphere
                    </label>
                    <span className="text-[11px] text-white/50">
                      Opacity: {currentHeroArt.overlayOpacity ?? 42}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={85}
                    value={currentHeroArt.overlayOpacity ?? 42}
                    onChange={e =>
                      updateHeroArtSlot(viewKey, 'primary_hero', {
                        overlayOpacity: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#FF8C00] mb-3"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(PLAJAH_GRADIENT_CSS) as PlajahGradientPreset[]).map(gKey => {
                      const g = PLAJAH_GRADIENT_CSS[gKey];
                      const active = currentHeroArt.gradientPreset === gKey;
                      return (
                        <button
                          key={gKey}
                          onClick={() =>
                            updateHeroArtSlot(viewKey, 'primary_hero', {
                              gradientPreset: gKey,
                            })
                          }
                          className={`rounded-xl p-2.5 border text-left transition-all flex items-center gap-2.5 ${
                            active
                              ? 'border-[#FF8C00] bg-white/10'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                          }`}
                        >
                          <span
                            className="w-5 h-5 rounded-full shrink-0 border border-white/20"
                            style={{ background: g.css }}
                          />
                          <span className="text-[11px] font-bold text-white truncate">
                            {g.label.split(' (')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ambo Council Visualizer Preset */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-white/80 mb-2">
                    Pre-Wired Stage Council Visualizer Pass
                  </label>
                  <div className="space-y-1.5">
                    {Object.values(WORSHIP_COUNCIL_BUILDS)
                      .slice(0, 5)
                      .map(build => {
                        const active = currentHeroArt.visualizerPreset === build.id;
                        return (
                          <button
                            key={build.id}
                            onClick={() =>
                              updateHeroArtSlot(viewKey, 'primary_hero', {
                                visualizerPreset: build.id as PlajahVisualizerPreset,
                                councilBuildId: build.id,
                              })
                            }
                            className={`w-full text-left rounded-xl p-2.5 border transition-all flex items-center justify-between ${
                              active
                                ? 'bg-[#6B0099]/30 border-[#FF8C00]'
                                : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold text-white">{build.title}</div>
                              <div className="text-[10px] text-white/50">
                                Director: {build.director} · Counterpoint: {build.counterpoint}
                              </div>
                            </div>
                            {active && <CheckCircle2 size={15} className="text-[#FF8C00]" />}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: ADD PRE-WIRED PLAJAH SECTIONS ── */}
            {activeTab === 'SECTIONS' && (
              <div className="space-y-4">
                <p className="text-xs text-white/65 leading-relaxed">
                  Add pre-wired sections to <strong className="text-white">{viewMeta.label}</strong>. Every template automatically enforces the Plajah Design Language (`Outfit` display headers, `--pj-grad-warm` accents, Glass Elevation L2–L3, and 24px–36px radii).
                </p>

                <div className="space-y-2.5">
                  {[
                    {
                      type: 'SANCTUARY_HERO_STAGE' as PlajahSectionTemplateType,
                      title: 'Sanctuary Hero & Stage Banner',
                      desc: 'Full-bleed 36px stage with Stage optical pass, handwritten callout, and dual CTAs.',
                      badge: 'Hero Stage',
                    },
                    {
                      type: 'CURATED_CAROUSEL_SHELF' as PlajahSectionTemplateType,
                      title: 'Curated Sanctuary & Media Shelf',
                      desc: '3-card showcase pre-wired to Lorea Living Books, Chora Stems, and Stage Visualizers.',
                      badge: 'Carousel Shelf',
                    },
                    {
                      type: 'LIVING_BOOK_SPOTLIGHT' as PlajahSectionTemplateType,
                      title: 'Living Book & Scripture Spotlight',
                      desc: 'Pre-wired with the Melos Composer Council and Graphic Novel 5-Rule Safe-Zone guard.',
                      badge: 'Lorea Studio',
                    },
                    {
                      type: 'AMBO_VISUALIZER_STAGE' as PlajahSectionTemplateType,
                      title: 'Stage Council Visualizer Stage',
                      desc: 'Embeds a real Council of Art Directors worship build with geometry & lyric specs.',
                      badge: 'Visualizer',
                    },
                    {
                      type: 'BENTO_PILLAR_GRID' as PlajahSectionTemplateType,
                      title: '3-Column Plajah Bento Grid',
                      desc: 'Glass L2 cards with specular hairlines for pillars, ministries, or features.',
                      badge: 'Bento Grid',
                    },
                    {
                      type: 'EDITORIAL_CALLOUT_BANNER' as PlajahSectionTemplateType,
                      title: 'Editorial Callout & Invitation',
                      desc: 'High-contrast callout banner with Gochi Hand annotation and action pills.',
                      badge: 'Callout',
                    },
                  ].map(item => (
                    <div
                      key={item.type}
                      className="rounded-2xl p-4 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 transition-all flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#D40055]/25 text-[#FF8C00] mb-1.5">
                          {item.badge}
                        </span>
                        <h4
                          className="text-sm font-extrabold text-white"
                          style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                        >
                          {item.title}
                        </h4>
                        <p className="text-xs text-white/55 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => handleAddSection(item.type)}
                        className="shrink-0 px-3.5 py-2 rounded-full text-xs font-black uppercase tracking-wider text-white flex items-center gap-1 shadow-lg"
                        style={{
                          background:
                            'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                        }}
                      >
                        <Plus size={13} />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 3: PLATFORM AI COUNCILS HUB ── */}
            {activeTab === 'COUNCILS' && (
              <div className="space-y-4">
                <p className="text-xs text-white/65 leading-relaxed">
                  All councils built in code are pre-wired here for admins. Select a Council to critique this page, generate headlines & copy, or assign visualizers and layout rules.
                </p>

                <div className="space-y-2">
                  {[
                    {
                      id: 'ART_DIRECTORS' as const,
                      name: 'Aria Council of 6 Art Directors',
                      sub: 'Classical Mind, Rebellious Hand, Futurist, World-Eclectic, Baroque, Minimalist',
                    },
                    {
                      id: 'AMBO_WORSHIP' as const,
                      name: 'Stage Sanctuary Visualizer Council',
                      sub: '72 Sanctuary Visualizers · Cantus Firmus Luminance Grid & 40m Lyric Projection',
                    },
                    {
                      id: 'LIVING_BOOK_COMPOSER' as const,
                      name: 'Living Book & Melos Composer Council',
                      sub: 'Children’s-Song, Film Scorer, Sound Designer & Wellbeing Audio Lenses',
                    },
                    {
                      id: 'COMIC_SAFE_ZONE' as const,
                      name: 'Comic & Graphic Novel Safe-Zone Council',
                      sub: 'Enforces the 5 Non-Negotiable Lettering Rules (Zero Face/Action Occlusion)',
                    },
                    {
                      id: 'LECTIO_EDITORIAL' as const,
                      name: 'Verse & Inter-Tradition Editorial Council',
                      sub: 'Provenance, sanctuary hospitality, and multi-tradition liturgical care',
                    },
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCouncilType(c.id)}
                      className={`w-full text-left rounded-2xl p-3 border transition-all ${
                        selectedCouncilType === c.id
                          ? 'bg-[#6B0099]/35 border-[#FF8C00]'
                          : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white">{c.name}</span>
                        {selectedCouncilType === c.id && (
                          <Sparkles size={13} className="text-[#FF8C00]" />
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 mt-0.5">{c.sub}</p>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSummonCouncil}
                  className="w-full py-3 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
                    fontFamily: 'var(--font-display, Outfit, sans-serif)',
                  }}
                >
                  <MessageSquareQuote size={15} />
                  <span>Summon Council Deliberation on This Page</span>
                </button>

                {deliberation && (
                  <div className="rounded-2xl p-4 bg-white/[0.05] border border-[#FF8C00]/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                        {deliberation.councilName}
                      </span>
                      <span className="text-[10px] text-[#D0BCFF]">
                        Lead: {deliberation.leadDirector}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-white/40">
                        Proposed Headline & Copy
                      </div>
                      <div
                        className="text-sm font-black text-white"
                        style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                      >
                        “{deliberation.headlineSuggestion}”
                      </div>
                      <div className="text-xs text-white/70">{deliberation.subtitleSuggestion}</div>
                      <div
                        className="text-sm text-[#FF8C00]"
                        style={{ fontFamily: 'var(--font-handwritten, "Gochi Hand", cursive)' }}
                      >
                        {deliberation.handwrittenSuggestion}
                      </div>
                    </div>

                    <p className="text-xs text-white/65 italic leading-relaxed">
                      {deliberation.critique}
                    </p>

                    <div className="space-y-1">
                      {deliberation.ruleChecklist.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-emerald-300">
                          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleApplyCouncilDeliberation}
                      className="w-full py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all"
                    >
                      Apply Council Direction to Live Page
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 4: CREATIVE TOOLS & LIVING BOOKS LAUNCHER ── */}
            {activeTab === 'CAROUSELS' && (
              <div className="space-y-4">
                <p className="text-xs text-white/65 leading-relaxed">
                  Launch any of Plajah’s creative studios pre-wired for admins—author Living Books, build Curated Shelves, design in Tela, or paint hero backgrounds in Plajah Pixels.
                </p>

                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    {
                      title: 'Lorea · Living Book Authoring Studio',
                      desc: 'Author interactive books with Melos adaptive scores, narration ducking, and Comic 5-Rule Safe-Zone panels.',
                      badge: 'Living Books',
                      color: '#D0BCFF',
                      action: () => {
                        if (onOpenToolModal) onOpenToolModal('LIVING_BOOK');
                        else onNavigate(AppView.BOOKS);
                      },
                    },
                    {
                      title: 'Tela · Publication & Graphic Studio',
                      desc: 'Design sanctuary bulletins, book covers, sermon slides, and carousel artwork.',
                      badge: 'Tela Studio',
                      color: '#FF8C00',
                      action: () => onNavigate(AppView.TELA_STUDIO),
                    },
                    {
                      title: 'Plajah Pixels · AI & Procedural Art Lab',
                      desc: 'Create custom hero backgrounds, stained-glass plates, and visualizers.',
                      badge: 'Pixels Art',
                      color: '#00DAF3',
                      action: () => onNavigate(AppView.PLAJAH_PIXELS),
                    },
                    {
                      title: 'Curated Shelf & Playlist Builder',
                      desc: 'Curate featured carousels, worship sets, and editorial shelves across the platform.',
                      badge: 'Curation',
                      color: '#D40055',
                      action: () => {
                        if (onOpenToolModal) onOpenToolModal('CURATED_BUILDER');
                        else onNavigate(AppView.ADMIN);
                      },
                    },
                    {
                      title: 'Plajah Elevate · Living Sanctuary Stage',
                      desc: 'Jump directly to the Living Sanctuary landing experience & Stage stage.',
                      badge: 'Living Sanctuary',
                      color: '#10B981',
                      action: () => onNavigate(AppView.PLAJAH_ELEVATE),
                    },
                  ].map((tool, i) => (
                    <button
                      key={i}
                      onClick={tool.action}
                      className="w-full text-left rounded-2xl p-4 bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-all flex items-center justify-between gap-3"
                    >
                      <div>
                        <span
                          className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-1.5"
                          style={{ background: `${tool.color}22`, color: tool.color }}
                        >
                          {tool.badge}
                        </span>
                        <h4
                          className="text-sm font-extrabold text-white"
                          style={{ fontFamily: 'var(--font-display, Outfit, sans-serif)' }}
                        >
                          {tool.title}
                        </h4>
                        <p className="text-xs text-white/55 mt-0.5 leading-relaxed">{tool.desc}</p>
                      </div>
                      <ExternalLink size={16} className="text-white/40 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 5: FULL LIVE TELEMETRY & SPATIAL HEATMAP ── */}
            {activeTab === 'TELEMETRY' && telemetry && (
              <div className="space-y-4">
                <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                      Real-Time Active Audience
                    </div>
                    <div
                      className="text-3xl font-black text-white mt-0.5"
                      style={{ fontFamily: 'var(--font-mono-tech, monospace)' }}
                    >
                      {telemetry.totalActiveNow}{' '}
                      <span className="text-sm font-normal text-white/60">people on site</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-white/70">
                    <div>
                      <strong className="text-white">{telemetry.authenticatedCount}</strong> Members
                    </div>
                    <div>
                      <strong className="text-white">{telemetry.guestCount}</strong> Visitors
                    </div>
                  </div>
                </div>

                {/* Breakdown by View / Page */}
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-white/80 mb-2">
                    Where People Are on the Site
                  </div>
                  <div className="space-y-2.5">
                    {telemetry.byView.map(bucket => (
                      <div
                        key={String(bucket.view)}
                        className="rounded-2xl p-3 bg-white/[0.04] border border-white/10"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <button
                            onClick={() => onNavigate(bucket.view as AppView)}
                            className="text-xs font-extrabold text-white hover:text-[#FF8C00] flex items-center gap-1.5"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: bucket.color }}
                            />
                            <span>{bucket.label}</span>
                            <ArrowUpRight size={12} className="opacity-60" />
                          </button>
                          <span
                            className="text-xs font-black text-white"
                            style={{ fontFamily: 'var(--font-mono-tech, monospace)' }}
                          >
                            {bucket.count} ({bucket.percent}%)
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(6, bucket.percent)}%`,
                              background: bucket.color,
                            }}
                          />
                        </div>

                        {/* Active sessions inside this view */}
                        <div className="flex flex-wrap gap-1.5">
                          {bucket.sessions.map(ses => (
                            <span
                              key={ses.sessionId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] text-white/75"
                            >
                              <MapPin size={9} style={{ color: bucket.color }} />
                              <span className="font-semibold">{ses.displayName}</span>
                              {ses.activeSection && (
                                <span className="text-white/45">· {ses.activeSection}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminVisualSiteEditor;
