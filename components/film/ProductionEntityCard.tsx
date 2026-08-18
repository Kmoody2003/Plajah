import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, ClipboardCheck, Clapperboard, ExternalLink, FileText, ListChecks, MapPin, Radio, RefreshCw, UserRound } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { patchTask, type Production } from '../../services/filmProductionService';
import {
  acknowledgeProductionArtifact, canEditProductionEntity, subscribeArtifactAcknowledgements,
  subscribeProductionEntity, updateProductionAlert, updateProductionDecision,
  type ProductionArtifactAcknowledgement, type ProductionEntityRef,
} from '../../services/productionChatArtifacts';
import { Button, Chip, Surface, Eyebrow } from '../ui';
import { patchBreakdownWithAction, patchSceneWithAction } from '../../services/productionActionService';

const ICONS = { TASK: ListChecks, SCENE: Clapperboard, BREAKDOWN: ClipboardCheck, CALL_SHEET: FileText, SCHEDULE: Calendar, DECISION: CheckCircle2, ALERT: AlertTriangle, MEMBER: UserRound, LOCATION: MapPin };

const ProductionEntityCard: React.FC<{ reference: ProductionEntityRef; uid: string; readOnly?: boolean }> = ({ reference, uid, readOnly = false }) => {
  const [entity, setEntity] = useState<Record<string, any> | null>(null);
  const [production, setProduction] = useState<Production | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<ProductionArtifactAcknowledgement[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeProductionEntity(reference, setEntity), [reference.productionId, reference.entityType, reference.entityId]);
  useEffect(() => onSnapshot(doc(db, 'productions', reference.productionId), snapshot => setProduction(snapshot.exists() ? snapshot.data() as Production : null)), [reference.productionId]);
  useEffect(() => subscribeArtifactAcknowledgements(reference, setAcknowledgements), [reference.productionId, reference.entityType, reference.entityId]);
  const mine = acknowledgements.find(row => row.uid === uid);
  const editable = canEditProductionEntity(production, uid, reference.entityType, entity);
  const Icon = ICONS[reference.entityType];

  const view = useMemo(() => {
    if (!entity) return { title: 'Unavailable production item', detail: 'The original record was removed or you no longer have access.', meta: [] as string[] };
    switch (reference.entityType) {
      case 'TASK': return { title: entity.title, detail: entity.assigneeName || entity.dept || 'Unassigned', meta: [entity.status, entity.priority, entity.due ? `Due ${entity.due}` : ''] };
      case 'SCENE': return { title: `Scene ${entity.sceneNum} · ${entity.set}`, detail: entity.synopsis, meta: [entity.intExt, entity.dayNight, `${entity.pages || 0} pages`, entity.status] };
      case 'BREAKDOWN': return { title: entity.name, detail: entity.notes || `${entity.quantity || 1} needed`, meta: [entity.department, entity.category, entity.status] };
      case 'CALL_SHEET': return { title: `Call Sheet · Day ${entity.shootDay}`, detail: `${entity.date || 'Date TBD'} · ${entity.locationName || 'Location TBD'}`, meta: [`Call ${entity.generalCall}`, `v${entity.version}`, entity.status] };
      case 'SCHEDULE': return { title: entity.label || 'Production schedule', detail: `${entity.days?.length || 0} shoot days · ${entity.strips?.filter((row: any) => row.type === 'SCENE').length || 0} scenes`, meta: [`v${entity.version}`, entity.status] };
      case 'DECISION': return { title: entity.title, detail: entity.outcome || entity.detail, meta: [entity.status, `By ${entity.authorName || 'production'}`] };
      case 'ALERT': return { title: entity.title, detail: entity.detail, meta: [entity.severity, entity.status, `By ${entity.authorName || 'production'}`] };
      case 'MEMBER': return { title: entity.name || 'Production member', detail: entity.role || entity.position || 'Crew', meta: [entity.dept, entity.roleKey, entity.status] };
      case 'LOCATION': return { title: entity.name || 'Production location', detail: [entity.address, entity.city].filter(Boolean).join(', ') || 'Address pending', meta: [entity.type, entity.permitStatus, entity.contactName] };
    }
  }, [entity, reference.entityType]);

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const editAction = () => {
    if (!entity) return;
    if (reference.entityType === 'TASK') {
      const status = entity.status === 'TODO' ? 'DOING' : entity.status === 'DOING' ? 'DONE' : 'TODO';
      return run(() => patchTask(reference.productionId, entity.id, { status }));
    }
    if (reference.entityType === 'SCENE') {
      const status = entity.status === 'NOT_SHOT' ? 'PARTIAL' : entity.status === 'PARTIAL' ? 'SHOT' : 'NOT_SHOT';
      return run(() => patchSceneWithAction(reference.productionId, entity.id, { status }, uid, production?.title || 'Production'));
    }
    if (reference.entityType === 'BREAKDOWN') {
      const status = entity.status === 'BLOCKED' ? 'READY' : entity.status === 'READY' ? 'BLOCKED' : 'READY';
      return run(() => patchBreakdownWithAction(reference.productionId, entity as any, { status }, uid, production?.title || 'Production'));
    }
    if (reference.entityType === 'DECISION') {
      const outcome = window.prompt('Record the decision outcome:', entity.outcome || '');
      if (outcome != null) return run(() => updateProductionDecision(reference.productionId, entity.id, { status: 'DECIDED', outcome }));
    }
    if (reference.entityType === 'ALERT') return run(() => updateProductionAlert(reference.productionId, entity.id, { status: entity.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE' }));
  };
  const editLabel = reference.entityType === 'TASK' ? 'Advance task' : reference.entityType === 'SCENE' ? 'Update scene' : reference.entityType === 'BREAKDOWN' ? 'Toggle readiness' : reference.entityType === 'DECISION' ? 'Record outcome' : reference.entityType === 'ALERT' ? (entity?.status === 'ACTIVE' ? 'Resolve alert' : 'Reopen alert') : '';
  const assets = entity ? [
    ...(entity.attachments || []).map((asset: any) => ({ name: asset.name || 'Production asset', url: asset.url, contentType: asset.contentType || '', kind: asset.kind || 'MEDIA' })),
    ...(entity.mediaUrls || []).map((url: string, index: number) => ({ name: `Media ${index + 1}`, url, contentType: '', kind: 'MEDIA' })),
    ...(entity.documentUrls || []).map((url: string, index: number) => ({ name: `Document ${index + 1}`, url, contentType: '', kind: 'DOCUMENT' })),
  ].filter((asset: any) => asset.url).slice(0, 4) : [];

  return (
    <Surface level={2} shape="card" className="w-[min(430px,76vw)] p-4 text-[var(--text-primary)]">
      <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-control grid place-items-center bg-[var(--pj-orange-soft)] text-brand-orange shrink-0"><Icon size={18} /></div><div className="min-w-0 flex-1"><Eyebrow>Live {reference.entityType.replace('_', ' ')}</Eyebrow><h4 className="type-title-md mt-1">{view.title}</h4><p className="type-body-sm text-[var(--text-secondary)] mt-1">{view.detail}</p></div><RefreshCw size={13} className="text-state-success" aria-label="Live linked" /></div>
      <div className="flex flex-wrap gap-2 mt-3">{view.meta.filter(Boolean).map(item => <Chip key={item}>{String(item).replace(/_/g, ' ')}</Chip>)}<Chip><Radio size={12} /> {acknowledgements.length} responses</Chip></div>
      {assets.length > 0 && <div className="grid grid-cols-2 gap-2 mt-3">{assets.map((asset: any) => {
        const isImage = asset.contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(asset.url);
        return isImage
          ? <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="relative aspect-video overflow-hidden rounded-control border border-[var(--m3-border)] bg-black/20"><img src={asset.url} alt={asset.name} className="h-full w-full object-cover" /><span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 type-label-sm text-white">{asset.name}</span></a>
          : <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-control border border-[var(--m3-border)] p-3 type-label-sm hover:border-brand-orange"><FileText size={15} /><span className="truncate flex-1">{asset.name}</span><ExternalLink size={12} /></a>;
      })}</div>}
      <div className="flex flex-wrap gap-2 mt-4">
        {!readOnly && <Button size="sm" variant={mine?.state === 'ACKNOWLEDGED' ? 'success' : 'secondary'} onClick={() => run(() => acknowledgeProductionArtifact(reference, uid, 'ACKNOWLEDGED'))}>{mine?.state === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Acknowledge'}</Button>}
        {!readOnly && <Button size="sm" variant="ghost" onClick={() => { const note = window.prompt('What needs clarification?'); if (note) run(() => acknowledgeProductionArtifact(reference, uid, 'NEEDS_CLARIFICATION', note)); }}>Needs clarification</Button>}
        {!readOnly && editable && editLabel && <Button size="sm" variant="outline" loading={busy} onClick={editAction}>{editLabel}</Button>}
      </div>
      <p className="type-body-sm text-[var(--text-secondary)] mt-3">Linked to the original record. Authorized author changes appear here automatically.</p>
    </Surface>
  );
};

export default ProductionEntityCard;
