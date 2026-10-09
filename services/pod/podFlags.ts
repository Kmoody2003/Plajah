// podFlags — launch switches for print-on-demand. Everything ships built but OFF; Kenne flips each one on (no redeploy) at
// Firestore doc `config/podFlags` ({ PRINT_ORDERING: true, ... }), same pattern as services/billingFlags.ts. Admins always
// see OFF features as a "preview" so the whole flow can be rehearsed against the Lulu sandbox before launch.
// Pure module: imported by routes/pod.ts (server) and services/podFlagsClient.ts (browser). No secrets here.

export type PodFlagKey = 'PRINT_EXPORT_PACKS' | 'PRINT_ORDERING' | 'PRINT_RETAIL';

export interface PodFlagMeta { key: PodFlagKey; label: string; blurb: string; needs: string[] }

export const POD_FLAGS: PodFlagMeta[] = [
  { key: 'PRINT_EXPORT_PACKS', label: 'Print edition setup + export packs',
    blurb: 'Authors design a print edition (trim, paper, cover) and download print-ready PDFs and metadata to upload to KDP, IngramSpark or Draft2Digital themselves. No orders, no money moves.',
    needs: ['Nothing external: works without any printer account'] },
  { key: 'PRINT_ORDERING', label: 'Direct printer ordering (proofs + author copies)',
    blurb: 'Authors order proof copies and bulk author copies straight from the printer through Plajah, paid by card at cost.',
    needs: ['LULU_CLIENT_KEY + LULU_CLIENT_SECRET (production keys, LULU_SANDBOX=false)', 'POD_FILE_SECRET and a public https POD_PUBLIC_BASE_URL the printer can reach', 'Printer webhook pointed at /api/pod/webhook/lulu', 'Stripe live keys + checkout.session.completed webhook', 'A real sandbox order completed end to end first'] },
  { key: 'PRINT_RETAIL', label: 'Sell print editions to readers',
    blurb: 'Readers buy a printed copy from the book page; the printer ships it and the author is credited the profit. Requires direct ordering to be on.',
    needs: ['Everything under direct ordering', 'Lulu cost quote verified against a real invoice', 'Refund and printer-rejection handling agreed (currently manual)'] },
];

export const ALL_POD_FLAGS_OFF = Object.fromEntries(POD_FLAGS.map(f => [f.key, false])) as Record<PodFlagKey, boolean>;

/** A flag only counts as on if the flags it depends on are on too. Retail without ordering would take money for nothing. */
export function effectivePodFlags(raw: Partial<Record<PodFlagKey, boolean>> | null | undefined): Record<PodFlagKey, boolean> {
  const f = { ...ALL_POD_FLAGS_OFF, ...(raw || {}) };
  const ordering = f.PRINT_ORDERING === true;
  return { PRINT_EXPORT_PACKS: f.PRINT_EXPORT_PACKS === true, PRINT_ORDERING: ordering, PRINT_RETAIL: ordering && f.PRINT_RETAIL === true };
}
