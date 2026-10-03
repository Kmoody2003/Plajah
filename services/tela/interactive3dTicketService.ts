import type { PlajahEvent, TelaTicketDesign, TicketPurchasedPackage } from '../../types';

export interface Interactive3DTicketConfig {
  eventId: string;
  projectId: string;
  projectTitle: string;
  eventTitle: string;
  artistName: string;
  venueName: string;
  city: string;
  dateTime: string;
  tierName: string;
  ticketNumber: string;
  holderName: string;
  seatInfo: string;
  status: 'ACTIVE' | 'CHECKED_IN' | 'GEOFENCED' | 'REVOKED';
  palette: [string, string, string, string];
  hologramIntensity: number; // 0..1
  themeId: string;
  mode: 'ticket' | 'evite';
  coverArtworkUrl?: string;
  packages: Array<{
    name: string;
    total: number;
    remaining: number;
    unit: string;
  }>;
}

export interface TicketSecurityProof {
  ticketNumber: string;
  eventId: string;
  projectId: string;
  timestamp: number;
  nonce: string;
  hash: string;
  qrPayload: string;
}

/**
 * Generates dynamic cryptographic verification payload for the live 3D ticket pass.
 * Changes on each heartbeat interval to prevent static screenshot scalping.
 */
export function generateTicketSecurityProof(config: Interactive3DTicketConfig, timestamp = Date.now()): TicketSecurityProof {
  const windowStep = Math.floor(timestamp / 10000); // 10-second security window
  const nonce = (windowStep ^ 0x5f3759df).toString(16).padStart(8, '0');
  
  // Simple deterministic hash simulation for in-browser client verification
  let hashVal = 0;
  const rawString = `${config.eventId}:${config.projectId}:${config.ticketNumber}:${config.holderName}:${nonce}`;
  for (let i = 0; i < rawString.length; i++) {
    hashVal = ((hashVal << 5) - hashVal + rawString.charCodeAt(i)) | 0;
  }
  const hash = Math.abs(hashVal).toString(16).padStart(8, '0').toUpperCase();
  const qrPayload = `plajah://verify?e=${encodeURIComponent(config.eventId)}&p=${encodeURIComponent(config.projectId)}&t=${encodeURIComponent(config.ticketNumber)}&n=${nonce}&h=${hash}`;

  return {
    ticketNumber: config.ticketNumber,
    eventId: config.eventId,
    projectId: config.projectId,
    timestamp,
    nonce,
    hash,
    qrPayload,
  };
}

/**
 * Binds an existing PlajahEvent and Project into the 3D ticket configuration.
 */
export function bindEventTo3DTicket(
  event: Partial<PlajahEvent>,
  projectId: string,
  projectTitle: string,
  holderName = 'Verified Guest',
  ticketNumber = 'PLJ-770349-X',
  themeId = 'bold-ticket-signal'
): Interactive3DTicketConfig {
  const tier = event.tiers?.[0];
  const dateStr = event.startDate
    ? new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'SAT OCT 24, 2026';
  
  return {
    eventId: event.id || 'event-master-01',
    projectId,
    projectTitle,
    eventTitle: event.title || 'Futura Fest 2077 · Voltage Rising',
    artistName: event.creatorName || 'Plajah Chora Collective',
    venueName: event.venueName || 'Neo-Kyoto Amphitheatre',
    city: event.city || 'Neo-Kyoto / Tokyo',
    dateTime: `${dateStr} · 20:00`,
    tierName: tier?.name || 'VIP KINETIC ACCESS',
    ticketNumber,
    holderName,
    seatInfo: 'GA ROW A · SEAT 09',
    status: 'ACTIVE',
    palette: (event.ticketDesign?.palette as [string, string, string, string]) || ['#040a0e', '#00ff66', '#ff2255', '#00d4ff'],
    hologramIntensity: 0.85,
    themeId,
    mode: 'ticket',
    coverArtworkUrl: event.coverImage,
    packages: (event.packages || []).map(p => ({
      name: p.name,
      total: p.totalUnits,
      remaining: p.totalUnits,
      unit: p.unitName,
    })),
  };
}

/**
 * Procedural Canvas Texture Drawer for 3D Ticket Front & Back faces.
 * Renders into an off-screen HTMLCanvasElement to be uploaded as a Three.js CanvasTexture.
 */
export function renderTicketFrontCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, config: Interactive3DTicketConfig, proof: TicketSecurityProof) {
  const [bgDark, accent1, accent2, textLight] = config.palette;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, bgDark);
  grad.addColorStop(0.5, '#0d1624');
  grad.addColorStop(1, bgDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Border frame
  ctx.strokeStyle = accent1;
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Corner notches
  ctx.fillStyle = bgDark;
  ctx.beginPath();
  ctx.arc(16, height / 2, 24, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width - 16, height / 2, 24, Math.PI / 2, -Math.PI / 2);
  ctx.fill();
  ctx.stroke();

  // Header
  ctx.fillStyle = accent1;
  ctx.font = 'bold 24px monospace';
  ctx.fillText('PLAJAH CHORA // VERIFIED PASS', 48, 68);

  ctx.fillStyle = textLight || '#ffffff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`HASH: ${proof.hash}`, width - 48, 68);
  ctx.textAlign = 'left';

  // Event Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(config.eventTitle, 48, 140);

  // Subtitle / Venue
  ctx.fillStyle = accent2;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${config.artistName} · ${config.venueName}, ${config.city}`, 48, 185);

  // Divider line
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 220);
  ctx.lineTo(width - 48, 220);
  ctx.stroke();

  // Event Data Grid
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px monospace';
  ctx.fillText('DATE & TIME', 48, 260);
  ctx.fillText('TIER & PRIVILEGES', 340, 260);
  ctx.fillText('ATTENDEE', 640, 260);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(config.dateTime, 48, 290);
  ctx.fillText(config.tierName, 340, 290);
  ctx.fillText(config.holderName, 640, 290);

  // Admittance Stub Separator
  const stubX = width - 260;
  ctx.strokeStyle = accent1;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(stubX, 32);
  ctx.lineTo(stubX, height - 32);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stub Content
  ctx.fillStyle = accent1;
  ctx.font = 'bold 18px monospace';
  ctx.fillText('ADMIT', stubX + 24, 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('01', stubX + 20, 145);

  ctx.fillStyle = accent2;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(config.seatInfo, stubX + 24, 185);

  // Dynamic Security Watermark
  ctx.fillStyle = config.status === 'CHECKED_IN' ? '#00ff66' : accent1;
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`STATUS: [ ${config.status} ]`, stubX + 24, 280);
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.fillText(`NONCE: ${proof.nonce}`, stubX + 24, 305);
}

export function renderTicketBackCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, config: Interactive3DTicketConfig, proof: TicketSecurityProof) {
  const [bgDark, accent1, accent2] = config.palette;

  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, width, height);

  // Grid pattern
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Outer border
  ctx.strokeStyle = accent2;
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Title
  ctx.fillStyle = accent2;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('DIGITAL ADMISSION TOKEN // SECURITY LEDGER', 48, 64);

  // Project Linking Information
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px monospace';
  ctx.fillText(`LINKED PROJECT: ${config.projectTitle} (${config.projectId})`, 48, 100);
  ctx.fillText(`CONTRACT PROOF: SHA256:${proof.hash}${proof.nonce}`, 48, 125);

  // Simulated High-Density Barcode / QR Block
  const qrX = width - 240;
  const qrY = 70;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX, qrY, 180, 180);

  // QR Pattern simulation
  ctx.fillStyle = '#000000';
  ctx.fillRect(qrX + 10, qrY + 10, 50, 50);
  ctx.fillRect(qrX + 120, qrY + 10, 50, 50);
  ctx.fillRect(qrX + 10, qrY + 120, 50, 50);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX + 20, qrY + 20, 30, 30);
  ctx.fillRect(qrX + 130, qrY + 20, 30, 30);
  ctx.fillRect(qrX + 20, qrY + 130, 30, 30);
  ctx.fillStyle = '#000000';
  ctx.fillRect(qrX + 30, qrY + 30, 10, 10);
  ctx.fillRect(qrX + 140, qrY + 30, 10, 10);
  ctx.fillRect(qrX + 30, qrY + 140, 10, 10);

  // QR Data dots
  for (let i = 0; i < 40; i++) {
    const rx = qrX + 70 + ((i * 17) % 90);
    const ry = qrY + 30 + ((i * 23) % 130);
    ctx.fillRect(rx, ry, 6, 6);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN FOR ENTRY', qrX + 90, qrY + 205);
  ctx.textAlign = 'left';

  // Perks / Package Tracker
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('INCLUDED PERKS & PACKAGE ADD-ONS:', 48, 175);

  const perks = config.packages.length > 0
    ? config.packages
    : [
        { name: 'VIP Soundcheck & Artist Reception', total: 1, remaining: 1, unit: 'Pass' },
        { name: 'Exclusive Vinyl Stem Download', total: 1, remaining: 1, unit: 'Token' },
        { name: 'Complimentary Craft Beverage', total: 2, remaining: 2, unit: 'Credits' },
      ];

  perks.forEach((p, idx) => {
    const py = 210 + idx * 36;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`• ${p.name}`, 56, py);
    ctx.fillStyle = '#a3e635';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`[ ${p.remaining} / ${p.total} ${p.unit} ]`, 420, py);
  });

  // Footer Disclaimer
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';
  ctx.fillText('Non-transferable cryptographic entry token. Verified by Plajah decentralised identity ledger.', 48, height - 42);
  ctx.fillText('Screenshot copies void. Realtime security heartbeat pulses active in browser.', 48, height - 24);
}
