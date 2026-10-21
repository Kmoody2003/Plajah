/**
 * Ops preset registry — resolve the events / CRM / correspondence / social / marketing / commerce wiring
 * for any business page or org. Pure; see ./types.ts for the model.
 *
 *   opsPresetFor({ kind: 'business', packId: page.subtype || page.packId, vertical: page.businessType })
 *   opsPresetFor({ kind: 'org', orgType: org.orgType, templateId: org.templateId })
 */
import type { OpsPreset, PresetSubject, CorrespondenceTemplate, CrmPipeline, EventPlaybook } from './types';
import { BUSINESS_PRESETS, VERTICAL_FALLBACK } from './business';
import { ORG_PRESETS } from './org';

export * from './types';

const BY_PACK = new Map(BUSINESS_PRESETS.map(p => [p.id, p] as const));

/** Org templates (services/businessTemplates.ts) that are really businesses map onto a business preset. */
const ORG_TEMPLATE_TO_PACK: Record<string, string> = {
  restaurant: 'restaurant_cafe', real_estate: 'real_estate_brokerage', club: 'event_venue',
  grocery_store: 'supermarket', furniture_store: 'furniture_store', car_dealership: 'car_dealership',
  event_venue: 'event_venue', event_planner: 'event_planner',
};
const ORG_TYPE_TO_PACK: Record<string, string> = { RESTAURANT: 'restaurant_cafe', REALTY: 'real_estate_brokerage' };

export function opsPresetFor(subject: PresetSubject): OpsPreset {
  if (subject.kind === 'business') {
    const byPack = subject.packId ? BY_PACK.get(subject.packId) : undefined;
    if (byPack) return byPack;
    return VERTICAL_FALLBACK[(subject.vertical || 'OTHER').toUpperCase()] ?? VERTICAL_FALLBACK.OTHER;
  }
  const viaTemplate = subject.templateId ? ORG_TEMPLATE_TO_PACK[subject.templateId] : undefined;
  if (viaTemplate && BY_PACK.has(viaTemplate)) return BY_PACK.get(viaTemplate)!;
  const t = (subject.orgType || 'OTHER').toUpperCase();
  const viaType = ORG_TYPE_TO_PACK[t];
  if (viaType && BY_PACK.has(viaType)) return BY_PACK.get(viaType)!;
  return ORG_PRESETS[t] ?? ORG_PRESETS.OTHER;
}

/** Convenience for BusinessPage-shaped objects. */
export const opsPresetForPage = (page?: { subtype?: string; packId?: string; businessType?: string } | null): OpsPreset =>
  opsPresetFor({ kind: 'business', packId: page?.subtype || page?.packId, vertical: page?.businessType });

/** Convenience for Organization-shaped objects. */
export const opsPresetForOrg = (org?: { orgType?: string; templateId?: string } | null): OpsPreset =>
  opsPresetFor({ kind: 'org', orgType: org?.orgType, templateId: org?.templateId });

export const ALL_BUSINESS_PRESETS = BUSINESS_PRESETS;
export const ALL_ORG_PRESETS = ORG_PRESETS;

export const templateById = (preset: OpsPreset, id?: string | null): CorrespondenceTemplate | undefined =>
  id ? preset.correspondence.find(t => t.id === id) : undefined;

export const pipelineById = (preset: OpsPreset, id?: string | null): CrmPipeline =>
  preset.crm.pipelines.find(p => p.id === id) ?? preset.crm.pipelines[0];

export const playbookByKey = (preset: OpsPreset, key?: string | null): EventPlaybook | undefined =>
  key ? preset.events.find(e => e.key === key) : undefined;

/**
 * Structural problems in a preset (used by tests and the dev gallery): every stage template exists,
 * segment pipelines exist, ids are unique, pillar shares sum to ~100.
 */
export function presetProblems(p: OpsPreset): string[] {
  const out: string[] = [];
  const tplIds = new Set<string>();
  for (const t of p.correspondence) { if (tplIds.has(t.id)) out.push(`${p.id}: duplicate template ${t.id}`); tplIds.add(t.id); }
  const pipeIds = new Set<string>();
  for (const pl of p.crm.pipelines) {
    if (pipeIds.has(pl.id)) out.push(`${p.id}: duplicate pipeline ${pl.id}`);
    pipeIds.add(pl.id);
    const st = new Set<string>();
    for (const s of pl.stages) {
      if (st.has(s.id)) out.push(`${p.id}/${pl.id}: duplicate stage ${s.id}`);
      st.add(s.id);
      if (s.templateId && !tplIds.has(s.templateId)) out.push(`${p.id}/${pl.id}/${s.id}: missing template ${s.templateId}`);
    }
    if (!pl.stages.some(s => s.kind === 'won')) out.push(`${p.id}/${pl.id}: no won stage`);
  }
  for (const t of p.correspondence) {
    if (t.trigger?.on === 'stage_enter' && t.trigger.stageId && !p.crm.pipelines.some(pl => pl.stages.some(s => s.id === t.trigger!.stageId)))
      out.push(`${p.id}: template ${t.id} triggers on unknown stage ${t.trigger.stageId}`);
  }
  for (const s of p.crm.segments) if (s.rule.pipelineId && !pipeIds.has(s.rule.pipelineId)) out.push(`${p.id}: segment ${s.id} -> unknown pipeline`);
  const segIds = new Set(p.crm.segments.map(s => s.id));
  for (const m of p.marketing) if (m.mail?.segmentId && !segIds.has(m.mail.segmentId)) out.push(`${p.id}: play ${m.id} -> unknown segment ${m.mail.segmentId}`);
  const evKeys = new Set<string>();
  for (const e of p.events) { if (evKeys.has(e.key)) out.push(`${p.id}: duplicate event ${e.key}`); evKeys.add(e.key); }
  const share = p.social.pillars.reduce((a, x) => a + x.share, 0);
  if (Math.abs(share - 100) > 1) out.push(`${p.id}: pillar shares sum to ${share}`);
  for (const b of p.marketing) if (b.billboard && b.billboard.line.split(/\s+/).length > 7) out.push(`${p.id}: billboard line over 7 words (${b.id})`);
  return out;
}
