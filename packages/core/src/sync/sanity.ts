import type { ClipMetadata } from '../media/types.ts';
import { formatDateTime } from '../util/timezone.ts';
import type { CameraProfile, ResolvedStart, SyncWarning } from './types.ts';

export interface SanityInput {
  meta: ClipMetadata;
  profile: CameraProfile;
  resolved: ResolvedStart;
  /** Effective start after offsets. */
  startUtcMs?: number;
  rideStartUtcMs: number;
  rideEndUtcMs: number;
  timeZone: string;
}

const HOUR = 3600_000;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function sanityChecks(i: SanityInput): SyncWarning[] {
  const w: SyncWarning[] = [];
  if (i.startUtcMs === undefined) {
    w.push({ code: 'noTimestamp', message: 'Não foi possível determinar a hora de início. Indique-a manualmente.' });
    return w;
  }
  const s = i.startUtcMs;
  const e = s + i.meta.durationMs;
  const ov = overlap(s, e, i.rideStartUtcMs, i.rideEndUtcMs);
  if (ov === 0) {
    w.push({ code: 'outsideRide', message: `O clip (${formatDateTime(s, i.timeZone)}) está fora da janela da volta.` });
    // Exact 1 h / 2 h shift that puts the clip inside the ride → probably a time zone mistake.
    for (const k of [-1, 1, -2, 2]) {
      const shift = k * HOUR;
      if (overlap(s + shift, e + shift, i.rideStartUtcMs, i.rideEndUtcMs) > 0) {
        w.push({
          code: 'timezoneSuspect',
          message: `Desvio de ${Math.abs(k)} h exata(s): provável problema de fuso horário. Corrigir ${k > 0 ? '+' : '−'}${Math.abs(k)} h?`,
          suggestedOffsetMs: shift,
        });
        break;
      }
    }
  } else if (ov < i.meta.durationMs - 1000) {
    w.push({ code: 'partiallyOutside', message: 'Parte do clip fica fora da janela da volta (sem dados nesse troço).' });
  }

  // Insta360 Studio export: creation_time is the export date, well after the ride.
  const ct = i.resolved.candidates.find((c) => c.resolver === 'creationTime');
  if (ct && ct.startUtcMs > i.rideEndUtcMs + 2 * HOUR && (i.profile.id === 'insta360' || /\.mp4$/i.test(i.meta.fileName))) {
    w.push({
      code: 'exportedSuspect',
      message:
        'O creation_time é posterior ao fim da volta: parece um MP4 exportado (ex.: Insta360 Studio). Associe o .insv original, use o nome do ficheiro ou ajuste manualmente.',
    });
  }

  const c = i.resolved.candidates;
  if (c.length >= 2) {
    const spread = Math.max(...c.map((x) => x.startUtcMs)) - Math.min(...c.map((x) => x.startUtcMs));
    if (spread > 5000 && !w.some((x) => x.code === 'exportedSuspect')) {
      w.push({ code: 'resolversDisagree', message: `As fontes de hora divergem ${Math.round(spread / 1000)} s; foi usada: ${c[0].description}.` });
    }
  }
  return w;
}
