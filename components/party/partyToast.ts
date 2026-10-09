// Gentle, non-blocking party toasts. Any surface can call partyToast('…'); the mounted PartyBar
// renders them (bottom-centre pill, auto-dismiss). No modals, no alerts.

export const PARTY_TOAST_EVENT = 'plajah:party-toast';

export function partyToast(message: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(new CustomEvent(PARTY_TOAST_EVENT, { detail: { message, tone } }));
}
