// Zoom of the round map (view radius around the rider), shared by the Sync step's map and the gadget.

/** View radius around the rider (m), from a few bends to a whole valley. */
export const MAP_ZOOMS = [50, 100, 200, 400, 800, 1600, 3200];

/** Next zoom step from the current radius (−1 = closer). The automatic size counts as 400 m. */
export function nextZoom(current: number | undefined, dir: -1 | 1): number {
  const i = MAP_ZOOMS.findIndex((z) => z >= (current ?? 400));
  const at = i < 0 ? MAP_ZOOMS.length - 1 : i;
  return MAP_ZOOMS[Math.max(0, Math.min(MAP_ZOOMS.length - 1, at + dir))];
}
