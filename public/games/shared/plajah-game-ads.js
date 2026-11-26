/*
 * Plajah web-game ads: Google's AdSense for Games (H5 Games Ads), set up in Plajah's admin
 * (Ad Platform → Rotation mix → Network ads). Include once in a game page:
 *
 *   <script src="/games/shared/plajah-game-ads.js" defer></script>
 *
 * What it does on its own: one short ad as the game loads (a "preroll"), when the network and game
 * ads are switched on and the viewer may see network ads. Child, under-18 and education accounts
 * never get one: the main app records the viewer's ad audience in localStorage (plajah.adAudience).
 *
 * Optional, from game code, at natural pauses (both are no-ops when ads are off):
 *   PlajahGameAds.interstitial('level-complete', { before: pauseGame, after: resumeGame })
 *   PlajahGameAds.rewarded('extra-life', { onReward: giveLife, before: pauseGame, after: resumeGame })
 */
(function () {
  'use strict';
  var noop = function () {};
  var api = { ready: false, interstitial: noop, rewarded: function (_n, o) { if (o && o.onUnavailable) o.onUnavailable(); } };
  window.PlajahGameAds = api;

  var audience = null;
  try { audience = localStorage.getItem('plajah.adAudience'); } catch (e) { /* storage off */ }
  if (audience === 'restricted') return;

  fetch('/api/ads/network', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var c = j && j.config;
      if (!c || !c.enabled || !c.gamesEnabled) return;
      if (!audience && c.restrictSignedOut) return; // never seen by the app: unknown viewer
      var pub = c.adsensePubId || (c.testMode ? 'ca-pub-0000000000000000' : '');
      if (!/^ca-pub-\d{10,20}$/.test(pub)) return;

      var s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(pub);
      if (c.testMode) s.setAttribute('data-adbreak-test', 'on');
      document.head.appendChild(s);

      window.adsbygoogle = window.adsbygoogle || [];
      var push = function (o) { window.adsbygoogle.push(o); };
      push({ preloadAdBreaks: 'on', sound: 'on' });
      push({ type: 'preroll', adBreakDone: noop });

      api.ready = true;
      api.interstitial = function (name, o) {
        o = o || {};
        push({ type: 'next', name: String(name || 'break'), beforeAd: o.before || noop, afterAd: o.after || noop, adBreakDone: o.done || noop });
      };
      api.rewarded = function (name, o) {
        o = o || {};
        push({
          type: 'reward', name: String(name || 'reward'),
          beforeAd: o.before || noop, afterAd: o.after || noop,
          beforeReward: function (showAdFn) { showAdFn(); },
          adViewed: o.onReward || noop,
          adDismissed: o.onDismissed || noop,
          adBreakDone: function (info) { if (info && info.breakStatus !== 'viewed' && o.onUnavailable) o.onUnavailable(); },
        });
      };
    })
    .catch(noop);
})();
