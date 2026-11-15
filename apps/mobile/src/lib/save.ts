// Hands the exported video to the phone: saved where the user picks, with the name they choose (the system's "save
// as" dialog, see android/…/SaveAsPlugin.java), or offered through the share sheet (Instagram, TikTok, YouTube,
// WhatsApp, Photos, Drive…). Either way it is first written once to the app's cache. In a browser it is downloaded.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const CHUNK = 3 * 1024 * 1024;
const DIR = 'exports';
const LAST_SAVE_KEY = 'telemesync-last-save';

interface SaveAsResult {
  cancelled: boolean;
  uri?: string;
  name?: string;
  /** Folder on the phone's storage ("Movies/telemeSYNC"), when the destination is there. */
  folder?: string | null;
}
const SaveAs = registerPlugin<{ save(o: { path: string; name: string; mimeType?: string; initialUri?: string }): Promise<SaveAsResult> }>('SaveAs');

/** File name the user typed, made safe for any storage: no folders or reserved characters, ".mp4" at the end. */
export function fileNameFor(input: string): string {
  const base = input
    .trim()
    .replace(/\.mp4$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.]+$/g, '')
    .slice(0, 80);
  return `${base || 'telemesync'}.mp4`;
}

/** Suggested name: "telemesync-2026-10-11-0840" from the clip's local start time, plus the social format. */
export function defaultName(startMs: number | undefined, format?: string): string {
  const d = new Date(startMs ?? Date.now());
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `telemesync-${stamp}${format && format !== 'original' ? `-${format.replace(':', 'x')}` : ''}`;
}

/** Base64 of a blob, without the data: prefix (FileReader is much faster than btoa for megabytes). */
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

let cached: { data: Uint8Array; path: string } | null = null;

/** Writes the video to the cache once per export (saving and then sharing reuse it); older exports are removed. */
async function cacheFile(data: Uint8Array): Promise<string> {
  if (cached?.data === data) return cached.path;
  await Filesystem.rmdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
  const path = `${DIR}/video-${Date.now()}.mp4`;
  const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
  // The native bridge carries strings: the file is written in pieces so a long video never sits in memory twice.
  for (let pos = 0; pos < blob.size; pos += CHUNK) {
    const piece = await base64(blob.slice(pos, pos + CHUNK));
    const opts = { path, directory: Directory.Cache, data: piece };
    if (pos === 0) await Filesystem.writeFile({ ...opts, recursive: true });
    else await Filesystem.appendFile(opts);
  }
  cached = { data, path };
  return path;
}

function download(data: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'video/mp4' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the system's "save as" dialog (in the folder of the previous save); null when the user cancels. */
export async function saveVideoAs(data: Uint8Array, fileName: string): Promise<{ name: string; folder?: string | null } | null> {
  if (!Capacitor.isNativePlatform()) {
    download(data, fileName);
    return { name: fileName };
  }
  const path = await cacheFile(data);
  let initialUri: string | undefined;
  try {
    initialUri = localStorage.getItem(LAST_SAVE_KEY) ?? undefined;
  } catch {
    /* storage unavailable: the dialog opens in its default folder */
  }
  const r = await SaveAs.save({ path, name: fileName, mimeType: 'video/mp4', initialUri });
  if (r.cancelled || !r.uri) return null;
  try {
    localStorage.setItem(LAST_SAVE_KEY, r.uri);
  } catch {
    /* not remembered */
  }
  return { name: r.name ?? fileName, folder: r.folder };
}

/** Share sheet, with the file under the chosen name (what the other app and the recipient see). */
export async function shareVideo(data: Uint8Array, fileName: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return download(data, fileName);
  const path = await cacheFile(data);
  const named = `${DIR}/share/${fileName}`;
  await Filesystem.deleteFile({ path: named, directory: Directory.Cache }).catch(() => undefined);
  await Filesystem.mkdir({ path: `${DIR}/share`, directory: Directory.Cache, recursive: true }).catch(() => undefined);
  await Filesystem.copy({ from: path, to: named, directory: Directory.Cache, toDirectory: Directory.Cache });
  const { uri } = await Filesystem.getUri({ path: named, directory: Directory.Cache });
  await Share.share({ title: fileName, files: [uri] });
}
