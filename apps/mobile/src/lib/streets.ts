// Streets and paths around the clip for the round map: OpenStreetMap data from OpenFreeMap's vector tiles (free, no
// key, served from a CDN), read by the core (map/fetchStreets.ts, shared with the desktop app). Only the few tiles
// around the clip's stretch are read; each one stays in memory while the app runs.
import { useEffect } from 'react';
import { fetchStreets, streetsBbox } from '@telemesync/core';
import { clipStart, useProject } from '../state.ts';

export { fetchStreets };

/**
 * Keeps the project's streets for the round map up to date: asked for when a round map is on screen (the gadget,
 * or the Sync tab's map), for the clip's stretch with a margin that follows the map's zoom.
 */
export function useStreets() {
  const s = useProject();
  const wanted = !!s.ride?.available.has('map') && (s.tab === 'sync' || s.overlays.includes('dialMap'));
  const start = s.ride ? clipStart(s) : 0;
  const end = start + (s.trim.end || s.info?.durationS || 60) * 1000;
  const margin = Math.min(1500, Math.max(400, s.mapZoomM * 1.3));
  const bbox = wanted && s.ride && s.mapZoomM <= 1600 ? streetsBbox(s.ride, start - 30_000, end + 30_000, margin) : undefined;
  const key = bbox?.join(',');
  useEffect(() => {
    if (!bbox) return;
    let alive = true;
    const { setStreets } = useProject.getState();
    setStreets(useProject.getState().streets, 'loading');
    void fetchStreets(bbox).then((streets) => {
      if (!alive) return;
      if (streets) setStreets(streets, 'ok');
      else setStreets(useProject.getState().streets, 'failed');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.streetsRetry]);
}
