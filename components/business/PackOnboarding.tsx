/**
 * PackOnboarding — the live wiring between a BusinessPage and the vertical-pack UI.
 * Shows the "What kind of business?" call-to-action until a pack is applied, then the Go-live checklist with
 * progress detected from real data (products, offers, orders, CRM, staff, signage, page flags).
 * The dashboard mounts this once at the top of OVERVIEW.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import type { BusinessPage } from '../../types';
import { packForPage, type VerticalTab } from '../../services/verticalPacks';
import { computeChecklist, emptySnapshot, type BusinessSnapshot } from '../../services/verticalPacks/checklist';
import { applyPack, loadSnapshot, setManualStep, deleteSampleProducts } from '../../services/verticalPacks/applyPack';
import PackPicker from './PackPicker';
import GoLiveChecklist from './GoLiveChecklist';

interface Props {
  page: BusinessPage;
  orderCount: number;
  contactCount: number;
  slideCount: number;
  onPageChange: (p: BusinessPage) => void;
  onGoTab: (tab: VerticalTab) => void;
}

const PackOnboarding: React.FC<Props> = ({ page, orderCount, contactCount, slideCount, onPageChange, onGoTab }) => {
  const pack = packForPage(page);
  const [showPicker, setShowPicker] = useState(false);
  const [snap, setSnap] = useState<BusinessSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!packForPage(page)) return;
    try { setSnap(await loadSnapshot(page, { orderCount, contactCount, slideCount })); } catch { /* keep last snapshot */ }
  }, [page, orderCount, contactCount, slideCount]);

  useEffect(() => { refresh(); }, [refresh]);

  const progress = useMemo(() => pack ? computeChecklist(pack, snap ?? emptySnapshot(page as any)) : null, [pack, snap, page]);

  return (
    <>
      {!pack || !progress ? (
        <button onClick={() => setShowPicker(true)}
          className="w-full text-left p-5 rounded-3xl border border-[#FF8C00]/30 bg-gradient-to-br from-[#FF8C00]/10 via-[#D40055]/[0.07] to-[#6B0099]/10 hover:border-[#FF8C00]/60 transition-all flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 bg-[#FF8C00]/20 text-[#FF8C00]"><Sparkles size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl text-white leading-none" style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontStyle: 'italic' }}>What kind of business?</span>
            <span className="block text-[11px] text-white/50 mt-1.5 leading-snug">Pick yours and we set up the menu, prices, hours, deals and roles in one tap. Go live in about 15 minutes.</span>
          </span>
          <ChevronRight size={18} className="text-white/40 shrink-0" />
        </button>
      ) : (
        <GoLiveChecklist
          pack={pack}
          progress={progress}
          sampleCount={snap?.sampleCount ?? 0}
          busy={busy}
          onGoTab={onGoTab}
          onChangePack={() => setShowPicker(true)}
          onToggleManual={async (id, done) => {
            const prev = page;
            const optimistic = { ...page, packManualDone: done ? [...new Set([...(page.packManualDone ?? []), id])] : (page.packManualDone ?? []).filter(x => x !== id) } as BusinessPage;
            onPageChange(optimistic);
            try { onPageChange(await setManualStep(prev, id, done)); } catch { onPageChange(prev); }
          }}
          onClearSamples={async () => {
            if (busy || !window.confirm('Delete every sample item that came with your starter pack? Items you added yourself are kept.')) return;
            setBusy(true);
            try { await deleteSampleProducts(); await refresh(); } finally { setBusy(false); }
          }}
        />
      )}

      {showPicker && (
        <PackPicker
          currentPackId={pack?.id}
          onClose={() => { setShowPicker(false); refresh(); }}
          onApply={async (p, onProgress) => {
            const r = await applyPack(page, p, (done, total, label) => onProgress({ done, total, label }));
            onPageChange(r.page);
            const bits = [`${r.productsCreated} items added`, r.productsSkipped ? `${r.productsSkipped} already there` : '', r.offersCreated ? `${r.offersCreated} deals` : '', r.failed ? `${r.failed} could not be saved, run setup again to retry` : ''].filter(Boolean);
            return { summary: bits.join(', ') + '.' };
          }}
        />
      )}
    </>
  );
};

export default PackOnboarding;
