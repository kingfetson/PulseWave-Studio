export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export interface BatchCompletionSummary {
  completedCount: number;
  failedCount: number;
  totalElapsedMs: number;
  cancelled: boolean;
}

export interface BatchAlertResult {
  desktopSent: boolean;
  titleUpdated: boolean;
  chimePlayed: boolean;
}

const NOTIFY_STORAGE_KEY = 'pulsewave_notify_batch_complete_v1';

let activeTitleCleanup: (() => void) | null = null;

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    return window.Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    if (window.Notification.permission === 'granted' || window.Notification.permission === 'denied') {
      return window.Notification.permission;
    }
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export function loadNotifyOnBatchComplete(): boolean {
  try {
    const raw = localStorage.getItem(NOTIFY_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function persistNotifyOnBatchComplete(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors gracefully
  }
}

export function playBatchCompletionChime(): boolean {
  if (typeof window === 'undefined') return false;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    // Soft two-note ascending studio chime (C5 -> G5)
    playTone(523.25, 0.0, 0.24, 0.06);
    playTone(783.99, 0.14, 0.42, 0.075);

    setTimeout(() => {
      if (ctx.state !== 'closed') {
        void ctx.close();
      }
    }, 800);

    return true;
  } catch {
    return false;
  }
}

function setBackgroundTabCompletionTitle(badgeTitle: string): boolean {
  if (typeof document === 'undefined' || !document.hidden) return false;

  if (activeTitleCleanup) {
    activeTitleCleanup();
  }

  const originalTitle = document.title;
  document.title = badgeTitle;

  const restore = () => {
    if (!document.hidden || document.hasFocus()) {
      document.title = originalTitle;
      cleanup();
    }
  };

  const cleanup = () => {
    document.removeEventListener('visibilitychange', restore);
    window.removeEventListener('focus', restore);
    activeTitleCleanup = null;
  };

  document.addEventListener('visibilitychange', restore);
  window.addEventListener('focus', restore);
  activeTitleCleanup = () => {
    document.title = originalTitle;
    cleanup();
  };

  return true;
}

export function triggerBatchCompletionAlert(
  summary: BatchCompletionSummary,
  options: { enableDesktop: boolean; enableSound: boolean }
): BatchAlertResult {
  if (summary.cancelled || (summary.completedCount === 0 && summary.failedCount === 0)) {
    return { desktopSent: false, titleUpdated: false, chimePlayed: false };
  }

  const elapsedSec = (summary.totalElapsedMs / 1000).toFixed(1);
  const fileWord = summary.completedCount === 1 ? 'MP4 file' : 'MP4 files';

  let title = 'PulseWave Batch Export Complete';
  let body = `${summary.completedCount} ${fileWord} rendered and ready in ${elapsedSec}s.`;

  if (summary.completedCount === 0 && summary.failedCount > 0) {
    title = 'PulseWave Batch Export Finished with Errors';
    body = `${summary.failedCount} export ${summary.failedCount === 1 ? 'job' : 'jobs'} failed.`;
  } else if (summary.failedCount > 0) {
    body = `${summary.completedCount} ${fileWord} ready (${summary.failedCount} failed) in ${elapsedSec}s.`;
  }

  let desktopSent = false;
  if (options.enableDesktop && getBrowserNotificationPermission() === 'granted') {
    try {
      const notification = new window.Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'pulsewave-batch-complete',
      });
      notification.onclick = () => {
        try {
          window.focus();
        } catch {
          // Ignore focus restrictions
        }
        notification.close();
      };
      desktopSent = true;
    } catch {
      desktopSent = false;
    }
  }

  const chimePlayed =
    options.enableSound && summary.completedCount > 0 ? playBatchCompletionChime() : false;

  const tabBadge =
    summary.completedCount > 0
      ? `✓ ${summary.completedCount} MP4 Ready — PulseWave Studio`
      : `Batch Export Finished — PulseWave Studio`;
  const titleUpdated = setBackgroundTabCompletionTitle(tabBadge);

  return { desktopSent, titleUpdated, chimePlayed };
}
