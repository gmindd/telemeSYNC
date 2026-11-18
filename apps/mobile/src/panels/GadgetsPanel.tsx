// Gadget picker: live thumbnails (drawn by the core at the current moment of the clip) grouped like the website,
// the gadgets already on the video, the selected gadget's size and actions, and the gadgets' settings (background,
// heart rate and power zones), as on the desktop.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  gadgetStyle,
  getOverlay,
  isDialOverlay,
  isSegmentOverlay,
  overlayLabel,
  overlayGroup,
  overlayPixelSize,
  overlaySports,
  overlayTheme,
  PANEL_IDS,
  POWER_ZONES,
  renderOverlayFrame,
  type Ctx2D,
  type OverlayId,
  type OverlayStyle,
  type RideData,
  type Sport,
  SPORTS,
} from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { offeredOverlays } from '../lib/project.ts';
import { clipStart, DEFAULT_LOOK, placements, STYLE, styleOf, useProject } from '../state.ts';

type Category = 'dials' | 'panels' | 'numbers' | 'maps' | 'natal';
const CATEGORIES: Category[] = ['dials', 'panels', 'numbers', 'maps', 'natal'];
const PANELS = new Set<OverlayId>(Object.values(PANEL_IDS));

function categoryOf(id: OverlayId): Category {
  if (overlayTheme(id) === 'natal') return 'natal';
  if (isDialOverlay(id) || overlayGroup(id) === 'dial') return 'dials';
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
  // Each sport has its own catalogue (running and snow dials, pace, slope…); the ride's own sport first
  const [sportPick, setSport] = useState<Sport | undefined>(undefined);
  if (!s.ride) return null;
  const ride = s.ride;
  const sport = sportPick ?? ride.sport ?? 'cycling';
  // Thumbnails show the moment under the playhead, rounded to 5 s so they don't redraw while playing
  const now = clipStart(s) + s.playheadS * 1000;
  const at = Math.min(ride.endTime, Math.max(ride.startTime, Math.round(now / 5000) * 5000));
  // Laps, splits, ghost and runs need segments chosen on the desktop: not offered here yet
  const offered = offeredOverlays(ride).filter((id) => !isSegmentOverlay(id) && overlayGroup(id) !== 'live' && overlaySports(id).includes(sport));
  const cats = CATEGORIES.filter((c) => offered.some((id) => categoryOf(id) === c));
  const current = cats.includes(cat) ? cat : (cats[0] ?? 'dials');
  const shown = offered.filter((id) => categoryOf(id) === current);
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
          <GadgetBackground id={sel} />
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

      <div className="sports" role="tablist" aria-label={t('sport.label')}>
        {SPORTS.map((sp) => (
          <button key={sp} type="button" role="tab" aria-selected={sp === sport} className={`sport${sp === sport ? ' is-on' : ''}`} onClick={() => setSport(sp)}>
            {t(`sport.${sp}`)}
            {ride.sport === sp && <span className="sport__file">{t('sport.fromFile')}</span>}
          </button>
        ))}
      </div>
      {/* Every category in view (they wrap): a sideways-scrolling bar hid the last ones on phones */}
      <div className="cats" role="tablist">
        {cats.map((c) => {
          const n = offered.filter((id) => categoryOf(id) === c).length;
          const used = s.overlays.filter((id) => categoryOf(id) === c && offered.includes(id)).length;
          return (
            <button key={c} type="button" role="tab" aria-selected={c === current} className={`cat${c === current ? ' is-on' : ''}`} onClick={() => setCat(c)}>
              {t(`cat.${c}`)}
              <span className="cat__n">{used ? `${used}/${n}` : n}</span>
            </button>
          );
        })}
      </div>
      <div className={`thumbs thumbs--${current}`}>
        {shown.map((id) => {
          const on = s.overlays.includes(id);
          return (
            <button key={id} type="button" className={`thumb${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => s.toggleOverlay(id)}>
              <span className="thumb__img">
                <Thumb id={id} ride={ride} at={at} style={gadgetStyle(style, id)} />
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

/** Background opacity of the selected gadget: the shared one until moved, then its own. */
function GadgetBackground({ id }: { id: OverlayId }) {
  const look = useProject((st) => st.look);
  const setGadgetOpacity = useProject((st) => st.setGadgetOpacity);
  const own = look.gadgetOpacity?.[id];
  const op = own ?? look.panelOpacity;
  return (
    <div className="gadget-bg">
      <label className="field">
        <span>
          {t('gadgets.bg')} <b>{Math.round(op * 100)} %</b>
          {own !== undefined && <b className="framing__at"> · {t('gadgets.bgOwn')}</b>}
        </span>
        <input type="range" min={0} max={1} step={0.05} value={op} onChange={(e) => setGadgetOpacity(id, Number(e.target.value))} />
      </label>
      {own !== undefined && (
        <button type="button" className="chip-btn" onClick={() => setGadgetOpacity(id, undefined)}>
          {t('gadgets.bgSame')}
        </button>
      )}
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
        {(look.panelOpacity !== DEFAULT_LOOK.panelOpacity || look.colorByZone !== DEFAULT_LOOK.colorByZone || Object.keys(look.gadgetOpacity ?? {}).length > 0) && (
          <button type="button" className="chip-btn" onClick={() => setLook({ panelOpacity: DEFAULT_LOOK.panelOpacity, colorByZone: DEFAULT_LOOK.colorByZone })}>
            {t('look.reset')}
          </button>
        )}
      </div>
    </details>
  );
}
