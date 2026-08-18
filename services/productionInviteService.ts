import { collection, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { DeptKey, Production, ProductionMember, ProductionRoleKey } from './filmProductionService';
import { announceProductionMemberJoined } from './productionActionService';

export interface ProductionInvite {
  token: string; productionId: string; productionTitle: string; position: string;
  department: DeptKey; roleKey: 'CREW' | 'CAST' | 'VIEWER';
  createdBy: string; createdAt: number; expiresAt: number; maxUses: number; uses: number; active: boolean;
}

export async function createProductionInvite(prod: Production, input: { position: string; department: DeptKey; roleKey: 'CREW'|'CAST'|'VIEWER'; maxUses?: number; expiresInDays?: number }): Promise<ProductionInvite> {
  const u = auth.currentUser; if (!u) throw new Error('Sign in to create an invite.');
  const token = `${crypto.randomUUID().replace(/-/g, '')}${Date.now().toString(36)}`;
  const invite: ProductionInvite = { token, productionId: prod.id, productionTitle: prod.title, position: input.position.trim() || 'Crew', department: input.department, roleKey: input.roleKey, createdBy: u.uid, createdAt: Date.now(), expiresAt: Date.now() + (input.expiresInDays || 7) * 86400000, maxUses: Math.max(1, input.maxUses || 1), uses: 0, active: true };
  await setDoc(doc(db, 'productionInvites', token), invite); return invite;
}

export function productionInviteUrl(token: string): string { return `${window.location.origin}${window.location.pathname}?productionInvite=${encodeURIComponent(token)}`; }

export async function acceptProductionInvite(token: string): Promise<{ productionId: string; productionTitle: string }> {
  const u = auth.currentUser; if (!u) throw new Error('Sign in to join this production.');
  const inviteRef = doc(db, 'productionInvites', token);
  const result = await runTransaction(db, async tx => {
    const snap = await tx.get(inviteRef); if (!snap.exists()) throw new Error('This production invite is invalid.');
    const invite = snap.data() as ProductionInvite;
    if (!invite.active || invite.expiresAt < Date.now() || invite.uses >= invite.maxUses) throw new Error('This production invite has expired or reached its limit.');
    const prodRef = doc(db, 'productions', invite.productionId); const ps = await tx.get(prodRef); if (!ps.exists()) throw new Error('Production not found.');
    const prod = ps.data() as Production;
    const member: ProductionMember & { inviteToken: string; productionId: string; joinedVia: 'INVITE'; joinedAt: number } = { id: u.uid, uid: u.uid, name: u.displayName || 'Plajah member', role: invite.position, roleKey: invite.roleKey as ProductionRoleKey, dept: invite.department, isCast: invite.roleKey === 'CAST', status: 'ACTIVE', createdAt: Date.now(), productionId: invite.productionId, joinedVia: 'INVITE', joinedAt: Date.now(), inviteToken: token };
    tx.set(doc(db, 'productions', invite.productionId, 'members', u.uid), member);
    tx.update(prodRef, { memberUids: [...new Set([...(prod.memberUids || []), u.uid])], updatedAt: Date.now() });
    tx.update(inviteRef, { uses: invite.uses + 1, active: invite.uses + 1 < invite.maxUses });
    return { productionId: invite.productionId, productionTitle: invite.productionTitle, member };
  });
  announceProductionMemberJoined(result.productionId, result.member, u.uid, result.member.name, 'INVITE')
    .catch(error => console.warn('[production-actions] joined member announcement queued', error));
  return { productionId: result.productionId, productionTitle: result.productionTitle };
}
