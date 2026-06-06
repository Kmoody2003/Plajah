/**
 * Plajah Ordinals Service — Creation Certificates
 *
 * Inscribes the cryptographic fingerprint (SHA-256 hash) of creative works
 * onto the Bitcoin blockchain via Ordinals. This creates permanent, immutable,
 * timestamped proof of authorship.
 *
 * What gets inscribed: a JSON payload containing:
 *   - SHA-256 hash of the original content file
 *   - Creator's Plajah user ID and display name
 *   - Platform identifier ("plajah")
 *   - Content title, type, and vertical
 *   - ISO timestamp
 *   - Plajah content ID
 *
 * The actual audio/video/text is NEVER inscribed (too large, unnecessary).
 * Only the fingerprint is inscribed. The fingerprint proves the file existed
 * at the timestamp without exposing the content.
 *
 * Inscription provider: Ordinalsbot.com API (handles Bitcoin node complexity)
 * Alternative: self-hosted Bitcoin node with ord CLI
 *
 * Cost: $5–15 per inscription in Bitcoin fees + Plajah $5 service fee
 * Presented to users as: "Creation Certificate"
 *
 * Dependencies (install when activating):
 *   No additional npm packages needed — uses fetch API
 */

import { db } from './firebase';
import {
  doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp,
} from 'firebase/firestore';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContentType = 'TRACK' | 'ALBUM' | 'FILM' | 'TV_SERIES' | 'BOOK' | 'SCORE' | 'ARTICLE' | 'IP_WORLD' | 'CHARACTER';

export interface CreationCertificate {
  certificateId: string;       // Plajah-internal ID
  contentId: string;           // Plajah content ID (track ID, book ID, etc.)
  contentType: ContentType;
  vertical: string;
  creatorId: string;
  creatorName: string;
  title: string;
  contentHash: string;         // SHA-256 of original file
  inscriptionId?: string;      // Bitcoin Ordinals inscription ID (txid:index)
  inscriptionTxid?: string;    // Bitcoin transaction ID
  ordinalNumber?: number;      // The ordinal number assigned
  satoshisInscribed?: number;  // Which satoshi carries the inscription
  bitcoinFeeUsd: string;       // Actual fee paid
  platformFeeUsd: string;      // Plajah service fee
  status: 'PENDING' | 'QUEUED' | 'INSCRIBED' | 'FAILED';
  ordinalsbotOrderId?: string;
  explorerUrl?: string;        // https://ordinals.com/inscription/{id}
  createdAt: Date;
  inscribedAt?: Date;
}

export interface CertificatePayload {
  platform: 'plajah';
  version: '1.0';
  contentId: string;
  contentType: ContentType;
  contentHash: string;
  title: string;
  creator: {
    id: string;
    name: string;
  };
  timestamp: string;           // ISO 8601
  vertical: string;
}

// ─── Hash Content ──────────────────────────────────────────────────────────────

/**
 * Generate a SHA-256 hash of a file's content.
 * For audio files: hash the raw bytes.
 * For text content (articles, book chapters): hash the UTF-8 encoded text.
 */
export async function hashContent(content: File | Blob | string): Promise<string> {
  let buffer: ArrayBuffer;

  if (typeof content === 'string') {
    buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
  } else {
    buffer = await content.arrayBuffer();
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a file from a URL (for already-uploaded content).
 * Fetches the file and computes its hash.
 */
export async function hashContentFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch content for hashing: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Request Inscription ───────────────────────────────────────────────────────

/**
 * Request a Bitcoin Ordinals inscription for a piece of content.
 * Returns immediately with a pending certificate.
 * Inscription happens asynchronously (5–60 minutes depending on Bitcoin network).
 */
export async function requestCreationCertificate(params: {
  contentId: string;
  contentType: ContentType;
  vertical: string;
  creatorId: string;
  creatorName: string;
  title: string;
  contentHash: string;         // Pre-computed SHA-256 hash
}): Promise<CreationCertificate> {
  const certificateId = `cert_${params.contentId}_${Date.now()}`;

  const payload: CertificatePayload = {
    platform: 'plajah',
    version: '1.0',
    contentId: params.contentId,
    contentType: params.contentType,
    contentHash: params.contentHash,
    title: params.title,
    creator: {
      id: params.creatorId,
      name: params.creatorName,
    },
    timestamp: new Date().toISOString(),
    vertical: params.vertical,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);

  // Estimate fee (Ordinalsbot charges based on file size + network congestion)
  const estimatedBtcFeeUsd = estimateFee(payloadBytes.length);

  const certificate: CreationCertificate = {
    certificateId,
    contentId: params.contentId,
    contentType: params.contentType,
    vertical: params.vertical,
    creatorId: params.creatorId,
    creatorName: params.creatorName,
    title: params.title,
    contentHash: params.contentHash,
    bitcoinFeeUsd: estimatedBtcFeeUsd.toFixed(2),
    platformFeeUsd: '5.00',
    status: 'PENDING',
    createdAt: new Date(),
  };

  // Store pending certificate in Firestore
  await setDoc(doc(db, 'creationCertificates', certificateId), {
    ...certificate,
    _payload: payloadJson,
    createdAt: serverTimestamp(),
  });

  // Queue inscription with Ordinalsbot (or self-hosted ord)
  try {
    const ordersResponse = await submitToOrdinalsbot(payloadJson, certificateId);
    await setDoc(
      doc(db, 'creationCertificates', certificateId),
      {
        status: 'QUEUED',
        ordinalsbotOrderId: ordersResponse.orderId,
        bitcoinFeeUsd: ordersResponse.feeUsd,
      },
      { merge: true },
    );
    certificate.status = 'QUEUED';
    certificate.ordinalsbotOrderId = ordersResponse.orderId;
  } catch (err) {
    console.error('[Ordinals] Failed to submit to Ordinalsbot:', err);
    // Certificate remains PENDING — retry worker will pick it up
  }

  return certificate;
}

/**
 * Poll Ordinalsbot for inscription status and update Firestore when confirmed.
 * Called by a backend cron job every 10 minutes for QUEUED certificates.
 */
export async function pollInscriptionStatus(): Promise<void> {
  const queued = await getDocs(
    query(collection(db, 'creationCertificates'), where('status', '==', 'QUEUED')),
  );

  for (const certDoc of queued.docs) {
    const cert = certDoc.data() as CreationCertificate;
    if (!cert.ordinalsbotOrderId) continue;

    try {
      const status = await checkOrdinalsbotOrder(cert.ordinalsbotOrderId);

      if (status.state === 'completed') {
        await setDoc(
          doc(db, 'creationCertificates', cert.certificateId),
          {
            status: 'INSCRIBED',
            inscriptionId: status.inscriptionId,
            inscriptionTxid: status.txid,
            ordinalNumber: status.ordinalNumber,
            satoshisInscribed: status.satoshi,
            explorerUrl: `https://ordinals.com/inscription/${status.inscriptionId}`,
            inscribedAt: serverTimestamp(),
          },
          { merge: true },
        );
        console.log(`[Ordinals] Inscription confirmed: ${status.inscriptionId}`);
      }
    } catch (err) {
      console.error(`[Ordinals] Poll failed for order ${cert.ordinalsbotOrderId}:`, err);
    }
  }
}

// ─── Certificate Retrieval ─────────────────────────────────────────────────────

export async function getCertificate(certificateId: string): Promise<CreationCertificate | null> {
  const snap = await getDoc(doc(db, 'creationCertificates', certificateId));
  if (!snap.exists()) return null;
  const { _payload: _, ...cert } = snap.data();
  return cert as CreationCertificate;
}

export async function getCertificatesForContent(contentId: string): Promise<CreationCertificate[]> {
  const snaps = await getDocs(
    query(collection(db, 'creationCertificates'), where('contentId', '==', contentId)),
  );
  return snaps.docs.map(d => {
    const { _payload: _, ...cert } = d.data();
    return cert as CreationCertificate;
  });
}

export async function getCertificatesForCreator(creatorId: string): Promise<CreationCertificate[]> {
  const snaps = await getDocs(
    query(collection(db, 'creationCertificates'), where('creatorId', '==', creatorId)),
  );
  return snaps.docs.map(d => {
    const { _payload: _, ...cert } = d.data();
    return cert as CreationCertificate;
  });
}

// ─── Ordinalsbot API integration ───────────────────────────────────────────────

const ORDINALSBOT_API = 'https://api.ordinalsbot.com';

async function submitToOrdinalsbot(
  payloadJson: string,
  orderId: string,
): Promise<{ orderId: string; feeUsd: string }> {
  const apiKey = process.env.VITE_ORDINALSBOT_API_KEY;
  if (!apiKey) throw new Error('[Ordinals] VITE_ORDINALSBOT_API_KEY not configured');

  const response = await fetch(`${ORDINALSBOT_API}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      files: [
        {
          name: `plajah_certificate_${orderId}.json`,
          dataURL: `data:application/json;base64,${btoa(payloadJson)}`,
        },
      ],
      lowPostage: false,      // prioritize confirmation speed
      referral: 'plajah',
    }),
  });

  if (!response.ok) throw new Error(`Ordinalsbot error: ${response.status}`);
  const data = await response.json();

  return {
    orderId: data.id,
    feeUsd: (data.charge?.amount / 100).toFixed(2) ?? '10.00',
  };
}

async function checkOrdinalsbotOrder(ordinalsbotOrderId: string): Promise<{
  state: 'pending' | 'completed' | 'failed';
  inscriptionId?: string;
  txid?: string;
  ordinalNumber?: number;
  satoshi?: number;
}> {
  const apiKey = process.env.VITE_ORDINALSBOT_API_KEY ?? '';
  const response = await fetch(`${ORDINALSBOT_API}/order/${ordinalsbotOrderId}`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!response.ok) throw new Error(`Ordinalsbot status error: ${response.status}`);
  const data = await response.json();

  return {
    state: data.status === 'sent' ? 'completed' : data.status === 'error' ? 'failed' : 'pending',
    inscriptionId: data.files?.[0]?.inscriptionId,
    txid: data.files?.[0]?.tx?.txid,
    ordinalNumber: data.files?.[0]?.ordinal,
    satoshi: data.files?.[0]?.sat,
  };
}

// ─── Fee estimation ────────────────────────────────────────────────────────────

function estimateFee(payloadBytes: number): number {
  // Rough estimate: $0.05 per byte + $3 base at current sat/vbyte rates
  // In practice, use Ordinalsbot's fee estimation endpoint
  const byteFee = payloadBytes * 0.00005;
  return Math.max(3 + byteFee, 5);
}
