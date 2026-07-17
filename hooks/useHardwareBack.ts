import { useEffect } from 'react';
import { getPlatformInfo } from './usePlatform';

// Android hardware / gesture back button.
//
// Capacitor's default behaviour when nothing handles the `backButton` event is to EXIT the app —
// which is why the back button was dropping users to the home screen instead of going back a screen.
// This registers a handler that, on a back press:
//   1. lets any open overlay/modal consume it first (dispatch a cancelable `plajah:hardware-back`;
//      a modal calls preventDefault() to keep the press and close itself),
//   2. otherwise navigates back through the in-app history (window.history.back() → the app's
//      popstate handler restores the previous view),
//   3. and only calls exitApp() from the true root, when there's nowhere left to go back to.
//
// No-op on web and non-native platforms. Requires @capacitor/app to be synced into the native
// project (an APK rebuild) to take effect on device.
export function useHardwareBack(): void {
  useEffect(() => {
    if (!getPlatformInfo().isNative) return;

    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          // 1) Give an open overlay/sheet/modal the chance to absorb the back press.
          const consumed = !window.dispatchEvent(new CustomEvent('plajah:hardware-back', { cancelable: true }));
          if (consumed) return;

          // 2) Navigate back within the app.
          if (canGoBack || window.history.length > 1) {
            window.history.back();
            return;
          }

          // 3) Nothing to go back to → leave the app (root screen only).
          App.exitApp();
        });

        if (cancelled) { handle.remove(); return; }
        remove = () => handle.remove();
      } catch {
        /* @capacitor/app unavailable (web build, or plugin not yet synced into the APK) */
      }
    })();

    return () => { cancelled = true; remove?.(); };
  }, []);
}
