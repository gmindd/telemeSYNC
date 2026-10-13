import { parseFit } from './fit.ts';
import { parseGpx } from './gpx.ts';
import type { RawTelemetry } from './types.ts';

/** Detects FIT vs GPX by content (falls back to extension) and parses it. */
export function parseTelemetryFile(fileName: string, data: ArrayBuffer | Uint8Array): RawTelemetry {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const isFit = bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
  if (isFit || /\.fit$/i.test(fileName)) return parseFit(bytes, fileName);
  const text = new TextDecoder('utf-8').decode(bytes);
  return parseGpx(text, fileName);
}
