import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock3, Eye, Radio, RefreshCw, Send, Sparkles } from 'lucide-react';
import { auth } from '../../services/firebase';
import {
  buildProductionWorkItems, canPublishProductionAction, dispatchProductionAction, escalateProductionAction, subscribeProductionActions,
  type ProductionAction, type ProductionWorkItem,
} from '../../services/productionActionService';
import { acknowledgeProductionArtifact, subscribeAllArtifactAcknowledgements, type ProductionArtifactAcknowledgement } from '../../services/productionChatArtifacts';
import { acknowledgeRecipientDelivery } from '../../services/productionScheduleService';
import ProductionEntityCard from './ProductionEntityCard';
import { useProd } from './FilmProductionSuite';
import { Actions, Button, Chip, Eyebrow, Surface } from '../ui';

const urgencyColor = (urgency: ProductionWorkItem['urgency']) => urgency === 'URGENT' ? 'var(--pj-danger)' : urgency === 'IMPORTANT' ? 'var(--pj-orange)' : 'var(--text-secondary)';

const ProductionOperationsInbox: React.FC<{ onShowChannels?: () => void }> = ({ onShowChannels }) => {
  const { prod, me, tasks, deliveries, can, readOnly } = useProd();
  const [actions, setActions] = useState<ProductionAction[]>([]);
  const [acks, setAcks] = useState<ProductionArtifactAcknowledgement[]>([]);
  const [view, setView] = useState<'WORK' | 'CHANGES'>('WORK');
  const [selected, setSelected] = useState<ProductionWorkItem | null>(null);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const uid = auth.currentUser?.uid || '';
  useEffect(() => { if (!prod) return; return subscribeProductionActions(prod.id, setActions); }, [prod?.id]);
  useEffect(() => { if (!prod) return; return subscribeAllArtifactAcknowledgements(prod.id, setAcks); }, [prod?.id]);
  const work = useMemo(() => prod ? buildProductionWorkItems({ productionId: prod.id, uid, member: me, actions, acknowledgements: acks, tasks, deliveries, canPublish: can, canPublishAction: action => canPublishProductionAction(prod, uid, action) }) : [], [prod, uid, me, actions, acks, tasks, deliveries, can]);
  const overdue = actions.filter(action => action.dueAt && action.dueAt < Date.now() && action.requiredAcknowledgementUids.some(target => !acks.some(ack => ack.actionId === action.id && ack.uid === target && ack.state === 'ACKNOWLEDGED')));
  const canEscalate = can('MANAGE_ROSTER') || can('MANAGE_SCHEDULE') || can('MANAGE_CALL_SHEETS');
  const run = async (id: string, fn: () => Promise<unknown>) => { setBusyId(id); setMessage(''); try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The workflow could not be updated.'); } finally { setBusyId(''); } };
  const publish = (item: ProductionWorkItem) => prod && item.actionId ? run(item.id, () => dispatchProductionAction(prod.id, item.actionId!, uid)) : undefined;
  const confirmCall = (item: ProductionWorkItem) => {
    if (!prod || !me || !item.entity || !item.callSheetVersion) return;
    const matchingAction = actions.find(action => action.entity.entityType === 'CALL_SHEET' && action.entity.entityId === item.entity!.entityId && action.requiredAcknowledgementUids.includes(uid));
    run(item.id, async () => {
      await acknowledgeRecipientDelivery(prod.id, item.entity!.entityId, item.callSheetVersion!, me);
      if (matchingAction) await acknowledgeProductionArtifact({ ...matchingAction.entity, actionId: matchingAction.id }, uid, 'ACKNOWLEDGED');
    });
  };
  if (!prod) return null;
  return <div className="h-full min-h-0 overflow-y-auto p-4 md:p-6">
    <div className="mx-auto max-w-5xl pj-stack-5">
      <Surface level={2} shape="hero" brand>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><Eyebrow>My production work</Eyebrow><h2 className="type-title-xl mt-1">Operations Inbox</h2><p className="type-body-sm mt-2 max-w-2xl text-[var(--text-secondary)]">One accountable queue for changes, confirmations, assigned work, approvals, and escalations—filtered to your production authority.</p></div><div className="flex gap-2">{onShowChannels && <Button className="md:hidden" size="sm" variant="ghost" onClick={onShowChannels}>Channels</Button>}<Chip brand><Sparkles size={12} /> Live workflow</Chip></div></div>
        <div className="grid grid-cols-3 gap-3 mt-5"><Surface level={1} className="text-center"><p className="type-title-lg">{work.length}</p><Eyebrow>Needs you</Eyebrow></Surface><Surface level={1} className="text-center"><p className="type-title-lg">{work.filter(item => item.urgency === 'URGENT').length}</p><Eyebrow>Urgent</Eyebrow></Surface><Surface level={1} className="text-center"><p className="type-title-lg">{overdue.length}</p><Eyebrow>Overdue changes</Eyebrow></Surface></div>
      </Surface>
      <div className="flex gap-2"><Chip interactive selected={view === 'WORK'} onClick={() => setView('WORK')}><BellRing size={12} /> My queue</Chip><Chip interactive selected={view === 'CHANGES'} onClick={() => setView('CHANGES')}><Radio size={12} /> Change feed</Chip></div>
      {message && <Surface level={1}><p className="type-body-sm" role="status">{message}</p></Surface>}
      {view === 'WORK' ? <div className="grid lg:grid-cols-[minmax(0,1fr)_430px] gap-4 items-start">
        <div className="pj-stack-2">{work.map(item => <Surface key={item.id} level={selected?.id === item.id ? 3 : 1} className="flex items-start gap-3"><div className="w-9 h-9 rounded-control grid place-items-center bg-[var(--glass-2)] shrink-0" style={{ color: urgencyColor(item.urgency) }}>{item.kind === 'PUBLISH' ? <Send size={16} /> : item.kind === 'TASK' ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Chip>{item.kind.replace('_', ' ')}</Chip><Chip>{item.urgency}</Chip></div><p className="type-label-lg mt-2">{item.title}</p><p className="type-body-sm mt-1 text-[var(--text-secondary)]">{item.detail}</p>{item.dueAt && <p className="type-body-sm mt-1" style={{ color: item.dueAt < Date.now() ? 'var(--pj-danger)' : undefined }}>Due {new Date(item.dueAt).toLocaleString()}</p>}</div><Actions className="shrink-0">{readOnly && item.entity ? <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setSelected(item)}>Preview</Button> : item.kind === 'PUBLISH' ? <Button size="sm" variant="accent" icon={<Send />} loading={busyId === item.id} onClick={() => publish(item)}>Publish</Button> : item.kind === 'CALL_SHEET' ? <Button size="sm" variant="success" icon={<CheckCircle2 />} loading={busyId === item.id} onClick={() => confirmCall(item)}>Confirm</Button> : item.entity ? <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setSelected(item)}>Open</Button> : null}</Actions></Surface>)}{work.length === 0 && <Surface level={1} className="py-12 text-center"><CheckCircle2 className="mx-auto text-state-success" /><p className="type-title-md mt-3">You’re caught up</p><p className="type-body-sm mt-1 text-[var(--text-secondary)]">New role-owned work will appear here automatically.</p></Surface>}</div>
        <div className="lg:sticky lg:top-4">{selected?.entity ? <ProductionEntityCard reference={selected.entity} uid={uid} readOnly={readOnly} /> : <Surface level={1} className="text-center py-10"><Eye className="mx-auto text-[var(--text-secondary)]" /><p className="type-body-sm mt-2 text-[var(--text-secondary)]">Open an item to work with its live source record.</p></Surface>}</div>
      </div> : <div className="pj-stack-3">{actions.map(action => { const confirmed = acks.filter(ack => ack.actionId === action.id && ack.state === 'ACKNOWLEDGED').length; const isOverdue = !!action.dueAt && action.dueAt < Date.now() && confirmed < action.requiredAcknowledgementUids.length; return <Surface key={action.id} level={2}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><Chip brand>{action.trigger.replaceAll('_', ' ')}</Chip><Chip>{action.status}</Chip>{isOverdue && <Chip>OVERDUE</Chip>}</div><h3 className="type-title-md mt-3">{action.title}</h3><p className="type-body-sm mt-1 text-[var(--text-secondary)]">{action.impact.headline}</p></div><div className="text-right"><p className="type-title-md">{confirmed}/{action.requiredAcknowledgementUids.length}</p><Eyebrow>Acknowledged</Eyebrow></div></div><div className="grid md:grid-cols-2 gap-3 mt-4"><Surface level={1}><Eyebrow>Downstream effects</Eyebrow>{action.impact.consequences.map(row => <p key={row} className="type-body-sm mt-2">• {row}</p>)}</Surface><Surface level={1}><Eyebrow>Risks</Eyebrow>{action.impact.risks.length ? action.impact.risks.map(row => <p key={row} className="type-body-sm mt-2" style={{ color: 'var(--pj-warning)' }}>• {row}</p>) : <p className="type-body-sm mt-2 text-[var(--text-secondary)]">No known blockers.</p>}</Surface></div><Actions className="mt-4">{!readOnly && action.status === 'READY' && canPublishProductionAction(prod, uid, action) && <Button size="sm" variant="accent" icon={<RefreshCw />} loading={busyId === action.id} onClick={() => run(action.id, () => dispatchProductionAction(prod.id, action.id, uid))}>Retry publishing</Button>}{!readOnly && isOverdue && canEscalate && <Button size="sm" variant="danger-quiet" icon={<AlertTriangle />} loading={busyId === action.id} onClick={() => run(action.id, () => escalateProductionAction(prod.id, action.id, uid))}>Escalate</Button>}</Actions></Surface>; })}{actions.length === 0 && <Surface level={1} className="py-12 text-center"><p className="type-body-sm text-[var(--text-secondary)]">Production changes will create governed records here.</p></Surface>}</div>}
    </div>
  </div>;
};

export default ProductionOperationsInbox;
