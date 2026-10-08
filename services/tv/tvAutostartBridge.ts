// ─── Signage autostart bridge ─────────────────────────────────────────────────
// Typed wrapper over the native PlajahDevice Capacitor plugin (PlajahDevicePlugin.kt). A signage /
// receiver TV turns on "start Plajah when the TV powers on"; BootReceiver.kt relaunches the app
// after BOOT_COMPLETED / QUICKBOOT_POWERON when the flag is set.
//
// Android 10+ only lets a boot receiver open an activity if the app holds "Display over other
// apps" (SYSTEM_ALERT_WINDOW). Many Android TV firmwares have no settings screen for it — then
// requestAutostartPermission() answers { opened: false } and the installer runs:
//     adb shell appops set com.plajah.app SYSTEM_ALERT_WINDOW allow
//
// Typical flow:
//   await tvAutostart.setEnabled(true);
//   if (!(await tvAutostart.canAutostart())) {
//     const { opened } = await tvAutostart.requestPermission();
//     if (!opened) showInstallerHint(TV_AUTOSTART_ADB_COMMAND);
//   }
// Everything is a no-op (false / { opened: false }) off the native Android shell.

import { registerPlugin, Capacitor } from '@capacitor/core';

interface PlajahDeviceShape {
  setAutostartOnBoot(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getAutostartOnBoot(): Promise<{ enabled: boolean }>;
  canAutostart(): Promise<{ granted: boolean }>;
  requestAutostartPermission(): Promise<{ opened: boolean; granted?: boolean; adb?: string }>;
}

const PlajahDevice = registerPlugin<PlajahDeviceShape>('PlajahDevice');

export const TV_AUTOSTART_ADB_COMMAND = 'adb shell appops set com.plajah.app SYSTEM_ALERT_WINDOW allow';

export function isTvAutostartSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
      && Capacitor.isPluginAvailable('PlajahDevice');
  } catch { return false; }
}

export const tvAutostart = {
  /** Persist the "launch on boot" flag read by BootReceiver. */
  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!isTvAutostartSupported()) return false;
    try { return (await PlajahDevice.setAutostartOnBoot({ enabled })).enabled; } catch { return false; }
  },
  async isEnabled(): Promise<boolean> {
    if (!isTvAutostartSupported()) return false;
    try { return (await PlajahDevice.getAutostartOnBoot()).enabled; } catch { return false; }
  },
  /** True when Android will actually let the boot launch through (overlay permission held). */
  async canAutostart(): Promise<boolean> {
    if (!isTvAutostartSupported()) return false;
    try { return (await PlajahDevice.canAutostart()).granted; } catch { return false; }
  },
  /** Opens "Display over other apps" for Plajah; { opened: false } where the TV has no such screen. */
  async requestPermission(): Promise<{ opened: boolean; granted: boolean; adb: string }> {
    if (!isTvAutostartSupported()) return { opened: false, granted: false, adb: TV_AUTOSTART_ADB_COMMAND };
    try {
      const r = await PlajahDevice.requestAutostartPermission();
      return { opened: !!r.opened, granted: !!r.granted, adb: r.adb || TV_AUTOSTART_ADB_COMMAND };
    } catch {
      return { opened: false, granted: false, adb: TV_AUTOSTART_ADB_COMMAND };
    }
  },
};
