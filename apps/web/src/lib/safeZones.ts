// Areas of a vertical 9:16 video that TikTok, Instagram Reels and YouTube Shorts cover with their own
// interface (name, description, like/comment/share buttons), in pixels of a 1080 × 1920 frame.
//
// 'ui' = covered on a normal post (measured margins for organic posts, e.g. vidova.ai's safe-zone guide).
// 'maybe' = may be covered: the official ad templates, which also leave room for long descriptions and
// buttons (TikTok Ads Manager In-Feed template; Meta Reels ads guide: 14 % top, 35 % bottom, 6 % sides;
// Google Ads "safe zones for vertical video ads"). The apps move things around between versions and
// screens, so these are guides, not exact positions.

export type SocialPlatform = 'tiktok' | 'instagram' | 'shorts';
export const SOCIAL_PLATFORMS: SocialPlatform[] = ['tiktok', 'instagram', 'shorts'];
export const PLATFORM_NAMES: Record<SocialPlatform, string> = { tiktok: 'TikTok', instagram: 'Instagram Reels', shorts: 'YouTube Shorts' };

export interface Zone {
  /** Fractions of the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  level: 'ui' | 'maybe';
}

const W = 1080;
const H = 1920;
const z = (x: number, y: number, w: number, h: number, level: Zone['level']): Zone => ({ x: x / W, y: y / H, w: w / W, h: h / H, level });

export const SAFE_ZONES: Record<SocialPlatform, Zone[]> = {
  tiktok: [
    z(0, 0, W, 130, 'ui'), // tabs, search, sound
    z(0, H - 320, W, 320, 'ui'), // name, description, sound
    z(W - 140, 840, 140, H - 320 - 840, 'ui'), // like / comment / share column
    z(0, 0, W, 240, 'maybe'),
    z(0, H - 660, W, 660, 'maybe'),
    z(0, 0, 120, H, 'maybe'),
    z(W - 120, 0, 120, H, 'maybe'),
    z(W - 300, 840, 300, H - 840, 'maybe'),
  ],
  instagram: [
    z(0, 0, W, 108, 'ui'), // "Reels" title, camera
    z(0, H - 320, W, 320, 'ui'), // name, description, audio
    z(W - 120, 960, 120, H - 320 - 960, 'ui'), // like / comment / share column
    z(0, 0, W, 269, 'maybe'),
    z(0, H - 672, W, 672, 'maybe'),
    z(0, 0, 65, H, 'maybe'),
    z(W - 65, 0, 65, H, 'maybe'),
  ],
  shorts: [
    z(0, 0, W, 180, 'ui'), // search, menu
    z(0, H - 380, W, 380, 'ui'), // channel, subscribe, title
    z(W - 150, 960, 150, H - 380 - 960, 'ui'), // like / dislike / comment / share column
    z(0, 0, W, 288, 'maybe'),
    z(0, H - 672, W, 672, 'maybe'),
    z(0, 0, 48, H, 'maybe'),
    z(W - 192, 0, 192, H, 'maybe'),
  ],
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Worst zone a box (fractions of the frame) touches on the chosen platforms: 'ui', 'maybe' or undefined. */
export function zoneHit(box: Box, platforms: SocialPlatform[]): Zone['level'] | undefined {
  let hit: Zone['level'] | undefined;
  for (const p of platforms) {
    for (const zone of SAFE_ZONES[p]) {
      if (!overlaps(box, zone)) continue;
      if (zone.level === 'ui') return 'ui';
      hit = 'maybe';
    }
  }
  return hit;
}

/** SVG path of every zone of one level on the chosen platforms, in a 1 × 1 box (one path = no double shading). */
export function zonesPath(platforms: SocialPlatform[], level: Zone['level']): string {
  return platforms
    .flatMap((p) => SAFE_ZONES[p].filter((zone) => zone.level === level))
    .map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`)
    .join('');
}
