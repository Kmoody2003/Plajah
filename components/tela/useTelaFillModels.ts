import { useEffect, useState } from 'react';
import { TELA_FILL_MODEL_OPTIONS, fetchInstalledFillModels } from '../../services/tela/telaInpaintService';

/** The fill model picker's options, with models the Tela runtime has not got on disk marked as such. */
export function useTelaFillModels() {
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    fetchInstalledFillModels().then((s) => live && setInstalled(s));
    return () => { live = false; };
  }, []);
  return TELA_FILL_MODEL_OPTIONS.map((o) => {
    const available = o.id === 'auto' || o.id === 'patchmatch' || !installed || installed.has(o.id);
    return { ...o, available, label: available ? o.label : `${o.label} — not installed` };
  });
}
