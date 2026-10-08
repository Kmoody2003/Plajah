// ticketPlugins - the plug-in seam between the generic ticket UI (TicketsBoard / TicketDetail) and pack-specific UI.
// A pack lists ids in TicketConfig.ui.detailPanels / ui.boardTools; this registry maps an id to a lazy component.
// Unknown ids and packs without `ui` render nothing, so auto repair (and any future pack) is untouched.
import React, { lazy, Suspense } from 'react';
import type { Ticket, TicketConfig } from '../../services/ticketCore';
import type { TicketApi } from '../../services/ticketService';

export interface PanelProps { api: TicketApi; cfg: TicketConfig; ticket: Ticket; apply: (t: Ticket) => void; closed: boolean }
export interface ToolProps { api: TicketApi; cfg: TicketConfig; tickets: Ticket[]; onOpenTicket: (t: Ticket) => void; onChanged: () => void; businessName?: string }

const PANELS: Record<string, React.LazyExoticComponent<React.ComponentType<PanelProps>>> = {
  'laundry-weighin': lazy(() => import('./laundry/WeighInPanel')),
  'laundry-bags': lazy(() => import('./laundry/BagTagsPanel')),
  'laundry-delivery': lazy(() => import('./laundry/DeliveryPanel')),
  'laundry-account': lazy(() => import('./laundry/AccountPanel')),
  'laundry-pickup': lazy(() => import('./laundry/PickupPanel')),
};
const TOOLS: Record<string, React.LazyExoticComponent<React.ComponentType<ToolProps>>> = {
  'laundry-desk': lazy(() => import('./laundry/LaundryDesk')),
};

export function TicketPanels({ ids, ...p }: PanelProps & { ids?: string[] }) {
  if (!ids?.length) return null;
  return <>{ids.map(id => { const C = PANELS[id]; return C ? <Suspense key={id} fallback={null}><C {...p} /></Suspense> : null; })}</>;
}
export function BoardTools({ ids, ...p }: ToolProps & { ids?: string[] }) {
  if (!ids?.length) return null;
  return <>{ids.map(id => { const C = TOOLS[id]; return C ? <Suspense key={id} fallback={null}><C {...p} /></Suspense> : null; })}</>;
}
