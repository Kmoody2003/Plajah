import Foundation

/// Injected at document start in every frame. Recreates the WebView2 surface the web layer was
/// written against, on top of WKWebView's message handler:
///
///   window.chrome.webview.postMessage(json)          → NativeBridge (webkit.messageHandlers.plajahHost)
///   window.chrome.webview.addEventListener('message') ← NativeBridge.post(...)  (e.data = JSON string)
///   window.__plajahMediaEngine.invoke(cmd, args)     → MEDIA_ENGINE_INVOKE / MEDIA_ENGINE_RESULT
///
/// With chrome.webview present, isWindowsApp() in services/windowsBridgeService.ts is true, so the
/// desktop title bar, explorer, Voca and studio paths light up. __PLAJAH_PLATFORM__ is 'macos'
/// (not 'windows'), so Windows-only code paths (ASIO, DirectML, NVENC budgets) stay off.
///
/// Local files: the Windows shell serves them at https://localmedia.plajah/… (a WebView2 virtual
/// host). WKWebView can't intercept https, so the same URLs are rewritten on the way out to
/// plajah-media://localmedia/… (LocalMediaSchemeHandler). Web code keeps building and comparing
/// the Windows URLs; only the network request changes.
enum BridgeScript {
    static let source = #"""
(function () {
  if (window.__PLAJAH_MAC__) return;
  window.__PLAJAH_MAC__ = true;
  window.__PLAJAH_PLATFORM__ = 'macos';
  window.__PLAJAH_DESKTOP_HOST__ = 'mac';

  var host = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.plajahHost;
  if (!host) return;

  // ── chrome.webview shim ───────────────────────────────────────────────────
  var listeners = [];
  var webview = {
    postMessage: function (msg) {
      try { host.postMessage(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) {}
    },
    addEventListener: function (type, fn) { if (type === 'message' && typeof fn === 'function') listeners.push(fn); },
    removeEventListener: function (type, fn) {
      var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
    },
    hostObjects: {}
  };
  window.chrome = window.chrome || {};
  window.chrome.webview = webview;
  // Native → web. Called by NativeBridge.post with the JSON string, like PostWebMessageAsString.
  window.__plajahHostDispatch = function (json) {
    var evt = { data: json, source: webview };
    listeners.slice().forEach(function (fn) { try { fn(evt); } catch (e) { console.error('[PlajahMac] listener', e); } });
  };

  // ── /api/* → plajah.com (Windows local-shell parity; harmless on the live site) ──
  var LOCAL = 'https://localmedia.plajah/';
  var MAPPED = 'plajah-media://localmedia/';
  function mapUrl(u) { return (typeof u === 'string' && u.indexOf(LOCAL) === 0) ? MAPPED + u.slice(LOCAL.length) : u; }
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (typeof input === 'string') {
        if (input.indexOf('/api/') === 0 && location.hostname !== 'plajah.com') input = 'https://plajah.com' + input;
        input = mapUrl(input);
      } else if (input && input.url && input.url.indexOf(LOCAL) === 0) {
        input = new Request(mapUrl(input.url), input);
      }
    } catch (e) {}
    return origFetch.call(this, input, init);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments); args[1] = mapUrl(url);
    return origOpen.apply(this, args);
  };
  // <img>/<video>/<audio>/<source> src + setAttribute('src'|'poster')
  [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLSourceElement].forEach(function (C) {
    if (!C) return;
    var d = Object.getOwnPropertyDescriptor(C.prototype, 'src');
    if (!d || !d.set) return;
    Object.defineProperty(C.prototype, 'src', {
      configurable: true, enumerable: d.enumerable,
      get: d.get, set: function (v) { d.set.call(this, mapUrl(v)); }
    });
  });
  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'src' || name === 'poster' || name === 'href') value = mapUrl(value);
    return origSetAttr.call(this, name, value);
  };

  // ── Media engine (same surface as the WinUI injection) ───────────────────
  var pme = {
    capabilities: {
      host: 'mac', platform: 'macos', hardwareGenlock: false, ndi: false, brawDecode: false, webgpu: true,
      sources: { decklink: false, ndi: false, srt: false, rtmp: false, webrtc: true, uvc: true, file: true, braw: false, ambo: true, switcher: true },
      cameraControl: false, mainconceptMpeg2: false, videotoolbox: true
    },
    invoke: function (cmd, args) {
      return new Promise(function (resolve) {
        var id = 'me_' + Math.random().toString(36).substr(2, 9);
        function handler(e) {
          try {
            var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            if (data.type === 'MEDIA_ENGINE_RESULT' && data.requestId === id) {
              webview.removeEventListener('message', handler);
              resolve(data.result);
            }
          } catch (err) {}
        }
        webview.addEventListener('message', handler);
        webview.postMessage(JSON.stringify({ type: 'MEDIA_ENGINE_INVOKE', requestId: id, cmd: cmd, args: args || {} }));
      });
    },
    invokeNative: function (cmd, args) { return this.invoke(cmd, args); }
  };
  window.__plajahMediaEngine = pme;
  window.plajahMediaEngine = pme;

  // Windows shell parity: no service worker inside the native shell (stale bundles after deploys).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
})();
"""#
}
