// panelRegistry - plug-in seam for vertical-specific ticket UI. A pack's TicketConfig names panels by id
// (`cfg.panels`, `cfg.intakePanel`); the generic board/detail look them up here and lazy-load them, so a pack
// that does not use a panel never ships its code. Add a pack's panels by adding lines below.
import React, { lazy } from 'react';
import type { Ticket, TicketConfig } from '../../../services/ticketCore';
import type { TicketApi } from '../../../services/ticketService';

export interface DetailPanelProps { api: TicketApi; cfg: TicketConfig; ticket: Ticket; closed: boolean; onChanged: (t: Ticket) => void }
export interface IntakePanelProps { api: TicketApi; cfg: TicketConfig; subject: Record<string, any>; onSubject: (patch: Record<string, any>) => void }
export interface BoardPanelProps { api: TicketApi; cfg: TicketConfig }

export const detailPanels: Record<string, React.LazyExoticComponent<React.ComponentType<DetailPanelProps>>> = {
  auto_vehicle: lazy(() => import('../auto/VehiclePanel')),
  auto_inspection: lazy(() => import('../auto/InspectionPanel')),
  auto_passport: lazy(() => import('../auto/PassportPanel')),
};
export const intakePanels: Record<string, React.LazyExoticComponent<React.ComponentType<IntakePanelProps>>> = {
  auto_vehicle_intake: lazy(() => import('../auto/VehicleIntake')),
};
export const boardPanels: Record<string, React.LazyExoticComponent<React.ComponentType<BoardPanelProps>>> = {
  auto_reminders: lazy(() => import('../auto/RemindersBoard')),
};
