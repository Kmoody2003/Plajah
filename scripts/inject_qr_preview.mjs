import fs from 'fs';

const qrMap = JSON.parse(fs.readFileSync('scripts/qrMap.json', 'utf8'));
let html = fs.readFileSync('live-tv-qr-preview.html', 'utf8');

// replace canvas with img
html = html.replace(
  '<canvas id="qr-canvas" class="w-full h-full block rounded-lg"></canvas>',
  `<img id="qr-image" src="${qrMap['42.1']}" class="w-full h-full object-contain block rounded-lg" alt="Channel QR code" />`
);

// replace chevron SVG size & stroke
html = html.replace(
  '<svg width="13" height="13" viewBox="0 0 100 100" fill="none">',
  '<svg width="15" height="15" viewBox="0 0 100 100" fill="none" class="shrink-0">'
);
html = html.replace(
  'stroke-width="18"',
  'stroke-width="22"'
);

// replace QR generation code with QR map lookup
const oldSection = `    // Generate QR Code into canvas
    function renderQr(url) {
      const canvas = document.getElementById('qr-canvas');
      QRCode.toCanvas(canvas, url, {
        width: 180,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'M'
      }, function (err) {
        if (err) console.error(err);
      });
    }`;

const newSection = `    const QR_MAP = ${JSON.stringify(qrMap, null, 2)};

    function renderQr(chNum) {
      const img = document.getElementById('qr-image');
      if (img && QR_MAP[chNum]) {
        img.src = QR_MAP[chNum];
      }
    }`;

if (html.includes('function renderQr(url)')) {
  html = html.replace(oldSection, newSection);
}

html = html.replace("renderQr(currentChannel.shareUrl);", "renderQr(currentChannel.number);");
html = html.replace("renderQr(currentChannel.shareUrl);", "renderQr(currentChannel.number);");

fs.writeFileSync('live-tv-qr-preview.html', html, 'utf8');
console.log('Successfully injected inline QR codes and updated preview HTML!');
