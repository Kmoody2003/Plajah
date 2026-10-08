import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { ticketQrSvg } from '../services/tela/ticketQr';

test('ticket QR carries the actual payload and a four-module quiet zone', () => {
  const payload = 'plajah://admission/test-ticket-123';
  const matrix = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const svg = ticketQrSvg(payload);
  const paths = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
  const cells = new Set(paths.map(m => `${Number(m[1])-4},${Number(m[2])-4}`));
  for(let r=0;r<matrix.modules.size;r++) for(let c=0;c<matrix.modules.size;c++) {
    assert.equal(cells.has(`${c},${r}`), !!matrix.modules.get(r,c));
  }
  assert.notEqual(ticketQrSvg(payload), ticketQrSvg(payload + '4'));
  assert.equal(ticketQrSvg(''), '');
});
