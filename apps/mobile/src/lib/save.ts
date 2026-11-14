// Hands the exported video to the phone: written to the app's cache and offered through the system share sheet
// (Instagram, TikTok, YouTube, WhatsApp, Photos, Drive…). In a browser it is downloaded instead.
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const CHUNK = 3 * 1024 * 1024;

/** Base64 of a blob, without the data: prefix (FileReader is much faster than btoa for megabytes). */
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shareVideo(data: Uint8Array, fileName: string): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  // The native bridge carries strings: the file is written in pieces so a long video never sits in memory twice.
  for (let pos = 0; pos < blob.size; pos += CHUNK) {
    const piece = await base64(blob.slice(pos, pos + CHUNK));
    const opts = { path: fileName, directory: Directory.Cache, data: piece };
    if (pos === 0) await Filesystem.writeFile(opts);
    else await Filesystem.appendFile(opts);
  }
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
  await Share.share({ title: 'telemeSYNC', files: [uri] });
}
