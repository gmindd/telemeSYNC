// Gadget picker: live thumbnails (drawn by the core at the current moment of the clip) grouped like the website,
// the gadgets already on the video, the selected gadget's size and actions, and the gadgets' settings (background,
// heart rate and power zones), as on the desktop.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOverlay,
  isDialOverlay,
  isSegmentOverlay,
  overlayLabel,
  overlayPixelSize,
  OVERLAY_THEMES,
  overlayTheme,
  PANEL_IDS,
  POWER_ZONES,
  renderOverlayFrame,
  type Ctx2D,
  type OverlayId,
  type OverlayStyle,
  type RideData,
} from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { offeredOverlays } from '../lib/project.ts';
import { clipStart, DEFAULT_LOOK, placements, STYLE, styleOf, useProject } from '../state.ts';

type Category = 'dials' | 'panels' | 'numbers' | 'maps' | 'glass' | 'natal';
/** Gadget categories; the glass one only while its theme is offered (see OVERLAY_THEMES). */
const CATEGORIES = (['dials', 'panels', 'numbers', 'maps', 'glass', 'natal'] as Category[]).filter((c) => c !== 'glass' || OVERLAY_THEMES.includes('glass'));
const PANELS = new Set<OverlayId>(Object.values(PANEL_IDS));

function categoryOf(id: OverlayId): Category {
  const theme = overlayTheme(id);
  if (theme === 'natal' || theme === 'glass') return theme;
  if (isDialOverlay(id)) return 'dials';
  if (PANELS.has(id)) return 'panels';
  if (id === 'map' || id === 'elevationProfile') return 'maps';
  return 'numbers';
}

/** One gadget drawn at a moment of the ride (UTC ms). */
const Thumb = memo(function Thumb({ id, ride, at, style }: { id: OverlayId; ride: RideData; at: number; style: OverlayStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getOverlay(id);
  const { width, height } = overlayPixelSize(def, STYLE);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) renderOverlayFrame(ctx as unknown as Ctx2D, def, at, style, { ride, clipStart: at, clipEnd: at + 60_000 });
  }, [def, ride, at, style]);
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
  // One style object while the settings don't change, so the thumbnails don't redraw for nothing
  const style = useMemo(() => styleOf({ look: s.look, mapZoomM: s.mapZoomM }), [s.look, s.mapZoomM]);

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
                <Thumb id={id} ride={ride} at={at} style={style} />
                {on && <span className="thumb__check" aria-hidden="true">✓</span>}
              </span>
              <span className="thumb__label">{overlayLabel(id, LANG)}</span>
            </button>
          );
        })}
      </div>

      <LookSettings ride={ride} />
    </div>
  );
}

/** Number box that lets a value be typed digit by digit, keeping it only once it is valid (and on leaving the box). */
function NumField({ value, min, max, onCommit, label }: { value: number | ''; min: number; max: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  return (
    <input
      className="num-input"
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      value={editing ? text : String(value)}
      onFocus={() => {
        setText(String(value));
        setEditing(true);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = Math.round(Number(e.target.value));
        if (e.target.value !== '' && v >= min && v <= max) onCommit(v);
      }}
      onBlur={() => setEditing(false)}
    />
  );
}

/** Background opacity, heart-rate zones and FTP: the desktop's settings, kept for the next videos. */
function LookSettings({ ride }: { ride: RideData }) {
  const look = useProject((st) => st.look);
  const setLook = useProject((st) => st.setLook);
  const hasHr = ride.available.has('heartRate');
  const hasPower = ride.available.has('power');
  const defaultHr = look.hrMax <= 0 && look.hrZones.join() === DEFAULT_LOOK.hrZones.join();
  const setZone = (k: number, v: number) => {
    const z = [...look.hrZones];
    z[k] = v;
    setLook({ hrZones: z, hrMax: 0 });
  };
  return (
    <details className="look">
      <summary>
        <h3>{t('look.title')}</h3>
      </summary>
      <div className="look__body">
        <label className="field">
          <span>
            {t('look.bg')} <b>{Math.round(look.panelOpacity * 100)} %</b>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={look.panelOpacity} onChange={(e) => setLook({ panelOpacity: Number(e.target.value) })} />
          <span className="fine">{t('look.bgHint')}</span>
        </label>

        {hasHr && (
          <div className="field">
            <span>{t('look.hr')}</span>
            <label className="field">
              <span>{t('look.hrMax')}</span>
              <NumField
                label={t('look.hrMax')}
                value={look.hrMax > 0 ? look.hrMax : ''}
                min={100}
                max={240}
                onCommit={(max) => setLook({ hrMax: max, hrZones: [0.6, 0.7, 0.8, 0.9].map((f) => Math.round(max * f)) })}
              />
            </label>
            <div className="look__zones">
              {look.hrZones.map((v, k) => (
                <label key={k}>
                  <span>
                    <i className="zone-dot" style={{ background: STYLE.hrZoneColors[k] }} />
                    {t('look.zoneUpTo', { n: k + 1 })}
                  </span>
                  <NumField label={t('look.zoneUpTo', { n: k + 1 })} value={v} min={60} max={230} onCommit={(z) => setZone(k, z)} />
                </label>
              ))}
            </div>
            <span className="fine">{defaultHr ? t('look.hrDefault') : t('look.hrAbove', { bpm: look.hrZones[3] })}</span>
            <label className="switch">
              <input type="checkbox" checked={look.colorByZone} onChange={(e) => setLook({ colorByZone: e.target.checked })} />
              <span>{t('look.zoneColor')}</span>
            </label>
          </div>
        )}

        {hasPower && (
          <label className="field">
            <span>{t('look.ftp')}</span>
            <NumField label={t('look.ftp')} value={look.ftp} min={50} max={600} onCommit={(ftp) => setLook({ ftp })} />
            <span className="fine">
              {look.ftp === DEFAULT_LOOK.ftp ? `${t('look.ftpDefault', { ftp: DEFAULT_LOOK.ftp })} ` : ''}
              {t('look.powerZones')} {POWER_ZONES.map((f, i) => `Z${i + 1} ${Math.round(f * look.ftp)}`).join(' · ')} W
            </span>
          </label>
        )}
        {(look.panelOpacity !== DEFAULT_LOOK.panelOpacity || look.colorByZone !== DEFAULT_LOOK.colorByZone) && (
          <button type="button" className="chip-btn" onClick={() => setLook({ panelOpacity: DEFAULT_LOOK.panelOpacity, colorByZone: DEFAULT_LOOK.colorByZone })}>
            {t('look.reset')}
          </button>
        )}
      </div>
    </details>
  );
}
