import QRCode from 'qrcode';

/** Encode the supplied admission payload. Encoding does not authenticate a ticket. */
export function ticketQrSvg(payload: string, size = 110): string {
  if (!payload || payload.length > 2000) return '';
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const side = qr.modules.size + 8;
  let path = '';
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ticket QR code" width="${size}" height="${size}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
