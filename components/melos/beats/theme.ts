// Melos Beats — instrument-tier tokens. Per the two-tier rule (PLAJAH_MELOS_BLUEPRINT.md §6),
// the instrument surface is matte #0A0A0D in EVERY Melos skin; only the skin's accent crosses
// the Beats door. Semantic colors are strict — never decorative:
export const SURFACE = '#0A0A0D';       // matte slab (pads, steps, knobs, console)
export const SURFACE_RAISED = '#111116';
export const SURFACE_CELL = '#17171C';
export const WASH_BG = '#0C0812';       // page ground under the glass panels
export const ARMED = '#FF8C00';         // armed / recording / live signal
export const PLAYHEAD = '#00DAF3';      // playhead / realtime
export const SELECT = '#D40055';        // selection / focus
export const BRAND_A = '#6B0099';       // brand chrome ONLY (wordmark, publish CTA)
export const BRAND_B = '#D40055';
export const ACCENT_DEFAULT = '#D0BCFF'; // Lamplight accent — future Melos shell overrides via prop

export const GROUP_COLORS = ['#FF8C00', '#D40055', '#00DAF3', '#D0BCFF'] as const;

export const glassPanel =
  'bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl';
export const slabPanel =
  'bg-[#0E0E12] border border-white/[0.16] rounded-[20px] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]';
