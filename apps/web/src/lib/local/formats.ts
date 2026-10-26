import type { OutputFormat } from '@telemesync/core';

/** VP9 profile 0, level 1.0, 8 bits (the level is a hint; encoders accept any size). */
export const VP9_CODEC = 'vp09.00.10.08';

/**
 * Formats the in-app exporter can write: QuickTime Animation and PNG always (encoded in JavaScript),
 * WebM VP9 with alpha when this WebView can encode VP9. ProRes and FFV1 need FFmpeg (computer only).
 */
export async function localFormats(): Promise<OutputFormat[]> {
  const formats: OutputFormat[] = ['animation', 'png'];
  try {
    if (typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
      const { supported } = await VideoEncoder.isConfigSupported({ codec: VP9_CODEC, width: 1920, height: 1080, framerate: 30, bitrate: 8_000_000 });
      if (supported) formats.splice(1, 0, 'webm');
    }
  } catch {
    /* no WebCodecs */
  }
  return formats;
}
