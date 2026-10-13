import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

async function generate() {
  const channels = {
    '42.1': 'https://plajah.com/share?type=channel&id=owner:plajah_culture&n=42.1&source=fast_42',
    '8.1': 'https://plajah.com/share?type=channel&id=plajah:endless-hour&n=8.1&source=plajah_8',
    '12.4': 'https://plajah.com/share?type=channel&id=owner:artist_neon&n=12.4&source=fast_neon',
    '1.1': 'https://plajah.com/share?type=channel&id=plajah:news&n=1.1&source=plajah_news',
  };

  const qrMap = {};
  for (const [k, url] of Object.entries(channels)) {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
    qrMap[k] = dataUrl;
  }

  console.log('Generated QR codes for channels:', Object.keys(qrMap));
  fs.writeFileSync('scripts/qrMap.json', JSON.stringify(qrMap, null, 2));
}

generate();
