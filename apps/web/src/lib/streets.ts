// Streets and paths around the active clip for the round maps (OpenStreetMap, through OpenFreeMap's vector tiles,
// read by the core). Asked for while a round map is on screen (the Sync step's map, or the gadget chosen), for the
// clip's stretch with a margin that follows the map's zoom. The export reads them again on the local server.
import { useEffect } from 'react';
import { effectiveStart, fetchStreets, needsStreets, streetsArea } from '@telemesync/core';
import { useApp } from './store.ts';

export function useStreets() {
  const s = useApp();
  const clip = s.sync.clips.find((c) => c.id === s.activeClipId) ?? s.sync.clips[0];
  const cam = clip ? s.sync.cameras.find((c) => c.id === clip.cameraId) : undefined;
  const start = clip && cam ? effectiveStart(clip, cam) : undefined;
  const wanted = !!s.ride && (s.step === 'sync' || needsStreets(s.overlays));
  const bbox = wanted && s.ride && start !== undefined ? streetsArea(s.ride, start, start + clip!.meta.durationMs, s.style.mapRadiusM) : undefined;
  const key = bbox?.join(',');
  useEffect(() => {
    if (!bbox) return;
    let alive = true;
    const { setStreets } = useApp.getState();
    setStreets(useApp.getState().streets, 'loading');
    void fetchStreets(bbox).then((streets) => {
      if (!alive) return;
      if (streets) setStreets(streets, 'ok');
      else setStreets(useApp.getState().streets, 'failed');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.streetsRetry]);
}
