// credentialService — Phase 6. Turns an earned competency into a portable, verifiable
// credential in the Open Badges 3.0 data model (which is a W3C Verifiable Credential), with
// cross-framework alignments baked in and a SHA-256 content-hash anchor (the same anchoring
// idea as the Creator Passport — a tamper-evident fingerprint + timestamp).
//
// HONEST SCOPE: this produces the real, spec-shaped credential JSON and a real content hash.
// Full cryptographic signing (a DID + key pair, an LD-Proof) is the next step (Phase 6b) — the
// `proof` block here is a timestamp/hash anchor, clearly labeled, not a DID signature yet.

import { standardById, crosswalkOf, frameworkById, bandFor } from '../data/educationStandards';

export interface CredentialInput {
  learnerId: string;
  learnerName?: string;
  standardId: string;
  mastery: number;       // 0–100
  evidence?: string;     // optional link/description
  issuedAtISO: string;   // pass new Date().toISOString() from the caller (kept out of the pure builder)
}

async function sha256Hex(input: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/** Build an Open Badges 3.0 / W3C VC credential for a mastered standard. */
export async function buildCredential(input: CredentialInput): Promise<Record<string, any>> {
  const std = standardById(input.standardId);
  const fw = std ? frameworkById(std.framework) : undefined;
  const band = bandFor(input.mastery);

  // Cross-framework alignments — the portability payload: this competency counts everywhere.
  const alignment = [
    ...(std ? [{ type: ['Alignment'], targetName: std.code, targetFramework: fw?.name || std.framework, targetCode: std.code, targetDescription: std.statement }] : []),
    ...crosswalkOf(input.standardId).map(x => ({ type: ['Alignment'], targetName: x.code, targetFramework: frameworkById(x.framework)?.name || x.framework, targetCode: x.code, targetDescription: x.statement })),
  ];

  const credential: Record<string, any> = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: `urn:uuid:plajah-${input.standardId.replace(/[^a-z0-9]/gi, '')}-${input.learnerId}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: `${std?.code || input.standardId} — ${band.label}`,
    issuer: { id: 'https://plajah.app', type: ['Profile'], name: 'Plajah' },
    validFrom: input.issuedAtISO,
    credentialSubject: {
      type: ['AchievementSubject'],
      id: `did:plajah:learner:${input.learnerId}`,
      ...(input.learnerName ? { name: input.learnerName } : {}),
      achievement: {
        id: `https://plajah.app/standards/${input.standardId}`,
        type: ['Achievement'],
        name: std?.statement || input.standardId,
        description: std ? `${std.domain} (${std.framework} ${std.code})` : input.standardId,
        criteria: { narrative: `Demonstrated ${band.label} proficiency (${input.mastery}%) on ${std?.code || input.standardId} through Plajah learning activities.` },
        alignment,
      },
      result: [{ type: ['Result'], achievedLevel: band.label, value: String(input.mastery) }],
      ...(input.evidence ? { evidence: [{ type: ['Evidence'], narrative: input.evidence }] } : {}),
    },
  };

  // Tamper-evident anchor: hash the canonical credential body. (Phase 6b: replace with a DID LD-Proof.)
  const contentHash = await sha256Hex(JSON.stringify(credential));
  credential.proof = {
    type: 'PlajahTimestampAnchor2026',
    created: input.issuedAtISO,
    contentHash: `sha256:${contentHash}`,
    note: 'Content-hash anchor (Creator Passport model). DID/LD-Proof signing arrives in Phase 6b.',
  };
  return credential;
}

/** Trigger a browser download of the credential JSON. */
export function downloadCredential(credential: Record<string, any>, filename: string): void {
  try {
    const blob = new Blob([JSON.stringify(credential, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* download optional */ }
}
