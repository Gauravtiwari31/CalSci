// Native capabilities with web fallbacks (spec §7.7, §8, §9).
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = () => Capacitor.isNativePlatform();

let hapticsOn = true;
export const setHapticsEnabled = (on: boolean) => {
  hapticsOn = on;
};

const vibrate = (ms: number) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* not allowed */
    }
  }
};

export const haptics = {
  key() {
    if (!hapticsOn) return;
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Light });
    else vibrate(10);
  },
  equals() {
    if (!hapticsOn) return;
    if (isNative()) void Haptics.impact({ style: ImpactStyle.Medium });
    else vibrate(18);
  },
  error() {
    if (!hapticsOn) return;
    if (isNative()) void Haptics.notification({ type: NotificationType.Error });
    else vibrate(40);
  },
};

export async function share(text: string) {
  if (isNative()) {
    await Share.share({ text });
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({ text });
    return true;
  }
  await copyText(text);
  return false;
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

/** Settings are mirrored to native preferences so a WebView storage wipe doesn't reset them. */
export const nativePrefs = {
  async get(key: string): Promise<string | null> {
    if (!isNative()) return null;
    return (await Preferences.get({ key })).value;
  },
  async set(key: string, value: string) {
    if (isNative()) await Preferences.set({ key, value });
  },
};

export async function syncStatusBar(dark: boolean) {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? '#15325C' : '#E8ECEF' });
  } catch {
    /* not available on this platform */
  }
}
