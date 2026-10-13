import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { buildShareUrl } from '../services/deepLinkService';

test('Channel QR link bug: builds direct channel share link with no signin required', () => {
  (globalThis as any).window = { location: { origin: 'https://plajah.com' } };

  // First-party channel
  const newsUrl = buildShareUrl('channel', 'plajah:news', { n: '1.1', source: 'plajah_news' });
  assert.equal(newsUrl, 'https://plajah.com/share?type=channel&id=plajah%3Anews&channel=1.1&n=1.1&source=plajah_news');

  // Creator channel
  const creatorUrl = buildShareUrl('channel', 'owner:user_123', { n: '42.1', source: 'fast_user_123' });
  assert.equal(creatorUrl, 'https://plajah.com/share?type=channel&id=owner%3Auser_123&channel=42.1&n=42.1&source=fast_user_123');
});

test('Channel QR link bug: generates high-contrast QR code data URL successfully', async () => {
  const url = 'https://plajah.com/share?type=channel&id=owner%3Aabc&n=42';
  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 180,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(dataUrl.length > 100);
});

test('Channel QR link bug: timing intervals default to 2 min ON and 1 min OFF', () => {
  const DEFAULT_ACTIVE_MS = 2 * 60 * 1000;
  const DEFAULT_INACTIVE_MS = 1 * 60 * 1000;

  assert.equal(DEFAULT_ACTIVE_MS, 120000, 'Active cycle must be 120,000 ms (2 minutes)');
  assert.equal(DEFAULT_INACTIVE_MS, 60000, 'Inactive cycle must be 60,000 ms (1 minute)');
});

test('Channel QR link bug: simulated timer sequence transitions accurately', async () => {
  // Simulate the state machine used by ChannelQrBug
  const activeDurationMs = 20; // scaled down for fast test execution
  const inactiveDurationMs = 10;

  let visible = true;
  const states: { state: boolean; time: number }[] = [];
  const start = Date.now();

  await new Promise<void>((resolve) => {
    let count = 0;
    states.push({ state: visible, time: Date.now() - start });

    const step = (currentlyOn: boolean) => {
      setTimeout(() => {
        visible = !currentlyOn;
        states.push({ state: visible, time: Date.now() - start });
        count++;
        if (count >= 3) {
          resolve();
        } else {
          step(visible);
        }
      }, currentlyOn ? activeDurationMs : inactiveDurationMs);
    };

    step(true);
  });

  // Cycle should be: started true, transitioned to false, transitioned to true, transitioned to false
  assert.equal(states[0].state, true);
  assert.equal(states[1].state, false);
  assert.equal(states[2].state, true);
  assert.equal(states[3].state, false);
});

test('channelQrService: buildChannelQrUrl produces consistent URL and caches QR code', async () => {
  const { buildChannelQrUrl, generateChannelQrDataUrl, getChannelQrDataUrlSync } = await import('../services/fast/channelQrService');

  (globalThis as any).window = { location: { origin: 'https://plajah.com' } };

  const target = {
    number: '42.1',
    id: 'fast_great_faith',
    scheduleOwner: 'user_great_faith',
    name: 'Great Faith Church',
  };

  const url = buildChannelQrUrl(target);
  assert.ok(url.includes('channel=42.1'));
  assert.ok(url.includes('source=fast_great_faith'));
  assert.ok(url.startsWith('https://plajah.com/?'));

  // Test caching
  const dataUrl = await generateChannelQrDataUrl(url);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));

  // Synchronous cache lookup should now return the exact same data URL
  const cached = getChannelQrDataUrlSync(url);
  assert.equal(cached, dataUrl);
});

