import { safeName } from '@telemesync/core';

/**
 * Bridge the Android app adds to its WebView as `window.TelemeSYNCAndroid` (apps/android, WebAppBridge.kt).
 * Paths are relative to the shared storage root ("Documents/telemeSYNC/…"); files go through MediaStore.
 * Calls are synchronous and return '' on success or an error message.
 */
export interface AndroidBridge {
  appVersion(): string;
  defaultOutputDir(): string;
  /** JSON {"id": n} or {"error": "…"}. Creates (or replaces) the file, hidden until close(). */
  createFile(relPath: string, mime: string): string;
  write(id: number, base64: string): string;
  writeAt(id: number, offset: number, base64: string): string;
  close(id: number): string;
  /** Deletes a file that was not finished. */
  abort(id: number): void;
  writeText(relPath: string, text: string, mime: string): string;
  /** Opens the folder in the Files app; false when no app can show it. */
  openFolder(relPath: string): boolean;
  /** Keeps the screen on (Android pauses the page, and the export, when the screen turns off). */
  keepAwake(on: boolean): void;
}

/** Development only: `?androidMock=http://127.0.0.1:5175` talks to scripts/android-bridge-mock.mjs instead. */
function devMock(): AndroidBridge | undefined {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const url = new URLSearchParams(location.search).get('androidMock');
  if (!url) return undefined;
  const call = (op: string, args: unknown[]) => {
    const x = new XMLHttpRequest();
    x.open('POST', url, false); // synchronous, like the real bridge
    x.send(JSON.stringify({ op, args }));
    return JSON.parse(x.responseText);
  };
  return new Proxy({} as AndroidBridge, { get: (_, op: string) => (...args: unknown[]) => call(op, args) });
}

export const android: AndroidBridge | undefined = (globalThis as { TelemeSYNCAndroid?: AndroidBridge }).TelemeSYNCAndroid ?? devMock();

/** Top folders of shared storage where the app may create any kind of file. */
export const ANDROID_OUTPUT_ROOTS = ['Documents', 'Download'];

/** "Documents\telemeSYNC/" → "Documents/telemeSYNC"; undefined when outside the allowed folders. */
export function normalizeOutputDir(dir: string): string | undefined {
  const parts = dir.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.includes('.')) return undefined;
  const root = ANDROID_OUTPUT_ROOTS.find((r) => r.toLowerCase() === parts[0].toLowerCase());
  if (!root) return undefined;
  return [root, ...parts.slice(1).map((p) => safeName(p))].join('/');
}

export function mimeOf(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  return (
    { mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', png: 'image/png', txt: 'text/plain', json: 'application/json' }[ext ?? ''] ??
    'application/octet-stream'
  );
}
