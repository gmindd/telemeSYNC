// Gadget picker: live thumbnails (drawn by the core at the current moment of the clip) grouped like the website,
// the gadgets already on the video, and the selected gadget's size and actions.
import { memo, useEffect, useRef, useState } from 'react';
import {
  getOverlay,
  isDialOverlay,
  isSegmentOverlay,
  overlayLabel,
  overlayPixelSize,
  overlayTheme,
  PANEL_IDS,
  renderOverlayFrame,
  type Ctx2D,
  type OverlayId,
  type RideData,
} from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { offeredOverlays } from '../lib/project.ts';
import { clipStart, placements, STYLE, useProject } from '../state.ts';

type Category = 'dials' | 'panels' | 'numbers' | 'maps' | 'natal';
const CATEGORIES: Category[] = ['dials', 'panels', 'numbers', 'maps', 'natal'];
const PANELS = new Set<OverlayId>(Object.values(PANEL_IDS));

function categoryOf(id: OverlayId): Category {
  if (overlayTheme(id) === 'natal') return 'natal';
  if (isDialOverlay(id)) return 'dials';
  if (PANELS.has(id)) return 'panels';
  if (id === 'map' || id === 'elevationProfile') return 'maps';
  return 'numbers';
}

/** One gadget drawn at a moment of the ride (UTC ms). */
const Thumb = memo(function Thumb({ id, ride, at }: { id: OverlayId; ride: RideData; at: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getOverlay(id);
  const { width, height } = overlayPixelSize(def, STYLE);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) renderOverlayFrame(ctx as unknown as Ctx2D, def, at, STYLE, { ride, clipStart: at, clipEnd: at + 60_000 });
  }, [def, ride, at]);
  return <canvas ref={ref} width={width} height={height} />;
});

export function GadgetsPanel() {
  const s = useProject();
  const [cat, setCat] = useState<Category>('dials');
  if (!s.ride) return null;
  const ride = s.ride;
  // Thumbnails show the moment under the playhead, rounded to 5 s so they don't redraw while playing
  const now = clipStart(s) + s.playheadS * 1000;
  const at = Math.min(ride.endTime, Math.max(ride.startTime, Math.round(now / 5000) * 5000));
  const offered = offeredOverlays(ride).filter((id) => !isSegmentOverlay(id));
  const cats = CATEGORIES.filter((c) => offered.some((id) => categoryOf(id) === c));
  const shown = offered.filter((id) => categoryOf(id) === cat);
  const sel = s.selected && s.overlays.includes(s.selected) ? s.selected : undefined;
  const selP = sel ? placements(s)[sel] : undefined;

  return (
    <div className="panel">
      {sel && selP ? (
        <div className="selected">
          <div className="selected__head">
            <b>{overlayLabel(sel, LANG)}</b>
            <button type="button" className="link" onClick={() => s.select(undefined)}>
              {t('gadgets.done')}
            </button>
          </div>
          <label className="field">
            <span>
              {t('gadgets.size')} <b>{Math.round(selP.w * 100)} %</b>
            </span>
            <input
              type="range"
              min={6}
              max={100}
              value={Math.round(selP.w * 100)}
              onChange={(e) => {
                const w = Number(e.target.value) / 100;
                s.place(sel, { ...selP, x: selP.x + (selP.w - w) / 2, w });
              }}
              onPointerUp={() => s.settle(sel)}
            />
          </label>
          <div className="row">
            <button type="button" className="chip-btn" onClick={() => s.resetPlace(sel)}>
              {t('gadgets.reset')}
            </button>
            <button type="button" className="chip-btn danger" onClick={() => s.toggleOverlay(sel)}>
              {t('gadgets.remove')}
            </button>
          </div>
          <p className="fine">{t('gadgets.hint')}</p>
        </div>
      ) : (
        <div className="onvideo">
          <h3>{t('gadgets.onVideo')}</h3>
          {s.overlays.length ? (
            <div className="chips">
              {s.overlays.map((id) => (
                <button key={id} type="button" className="chip" onClick={() => s.select(id)}>
                  {overlayLabel(id, LANG)}
                </button>
              ))}
            </div>
          ) : (
            <p className="fine">{t('gadgets.none')}</p>
          )}
        </div>
      )}

      {/* Every category in view (they wrap): a sideways-scrolling bar hid the last ones on phones */}
      <div className="cats" role="tablist">
        {cats.map((c) => {
          const n = offered.filter((id) => categoryOf(id) === c).length;
          const used = s.overlays.filter((id) => categoryOf(id) === c).length;
          return (
            <button key={c} type="button" role="tab" aria-selected={c === cat} className={`cat${c === cat ? ' is-on' : ''}`} onClick={() => setCat(c)}>
              {t(`cat.${c}`)}
              <span className="cat__n">{used ? `${used}/${n}` : n}</span>
            </button>
          );
        })}
      </div>
      <div className={`thumbs thumbs--${cat}`}>
        {shown.map((id) => {
          const on = s.overlays.includes(id);
          return (
            <button key={id} type="button" className={`thumb${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => s.toggleOverlay(id)}>
              <span className="thumb__img">
                <Thumb id={id} ride={ride} at={at} />
                {on && <span className="thumb__check" aria-hidden="true">✓</span>}
              </span>
              <span className="thumb__label">{overlayLabel(id, LANG)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
