// Sport of an activity: decides which metrics the app offers (pace instead of speed for running,
// vertical drop for ski…) and which overlay themes it recommends first.

export type Sport = 'cycling' | 'running' | 'ski' | 'hiking' | 'other';
export const SPORTS: Sport[] = ['cycling', 'running', 'ski', 'hiking'];

/** FIT `sport` enum (session field 5, sport field 0) → our sport; undefined when unknown or generic. */
export function sportFromFit(code: number | undefined): Sport | undefined {
  switch (code) {
    case 1:
      return 'running';
    case 2:
    case 21: // e-biking
      return 'cycling';
    case 11: // walking
    case 16: // mountaineering
    case 17: // hiking
      return 'hiking';
    case 12: // cross-country skiing
    case 13: // alpine skiing
    case 14: // snowboarding
      return 'ski';
    default:
      return undefined;
  }
}

/** Activity type as text (Strava sport_type / type, GPX <type>) → our sport. */
export function sportFromName(name: string | undefined): Sport | undefined {
  if (!name) return undefined;
  const s = name.toLowerCase().replace(/[^a-z]/g, '');
  if (/ski|snowboard/.test(s)) return 'ski';
  if (/trailrun|run/.test(s)) return 'running';
  if (/hike|walk|mountaineer|snowshoe/.test(s)) return 'hiking';
  if (/ride|cycl|bik|gravel|mtb|velo/.test(s)) return 'cycling';
  return undefined;
}

/**
 * Guess when the file does not say: by the average moving speed (m/s), and whether there is a lot of
 * descending at speed with little climbing distance (ski lifts climb without moving much along the ground).
 */
export function guessSport(avgMovingSpeed: number, hasPower: boolean): Sport {
  if (hasPower) return 'cycling';
  if (!(avgMovingSpeed > 0)) return 'other';
  if (avgMovingSpeed < 1.8) return 'hiking';
  if (avgMovingSpeed < 4.2) return 'running';
  return 'cycling';
}
