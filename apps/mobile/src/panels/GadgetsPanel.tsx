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
  formatClock,
  formatPace,
  GHOST_DISTANCES,
  paceUnit,
  parseClock,
  SPORTS,
} from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { offeredOverlays } from '../lib/project.ts';
import { clipStart, DEFAULT_LOOK, placements, STYLE, styleOf, useProject } from '../state.ts';

type Category = 'dials' | 'live' | 'panels' | 'numbers' | 'maps' | 'natal';
const CATEGORIES: Category[] = ['dials', 'live', 'panels', 'numbers', 'maps', 'natal'];
const PANELS = new Set<OverlayId>(Object.values(PANEL_IDS));

function categoryOf(id: OverlayId): Category {
  if (overlayTheme(id) === 'natal') return 'natal';
  if (overlayGroup(id) === 'live') return 'live';
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
  // Segment laps need segments chosen on the desktop: not offered here yet (splits, the PR ghost and snow runs are)
  const offered = offeredOverlays(ride).filter((id) => !isSegmentOverlay(id) && overlaySports(id).includes(sport));
  const cats = CATEGORIES.filter((c) => offered.some((id) => categoryOf(id) === c));
  const current = cats.includes(cat) ? cat : (cats[0] ?? 'dials');
  const shown = offered.filter((id) => categoryOf(id) === current);
  const sel = s.selected && s.overlays.includes(s.selected) ? s.selected : undefined;
  const selP = sel ? placements(s)[sel] : undefined;
  // One style object while the settings don't change, so the thumbnails don't redraw for nothing
  const style = useMemo(() => styleOf({ look: s.look, mapZoomM: s.mapZoomM, pr: s.pr, rideStart: s.ride?.startTime }), [s.look, s.mapZoomM, s.pr, s.ride]);

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

      {/* The PR right under the gadgets on the video: without it the ghost draws nothing */}
      {s.overlays.includes('runGhost') && <PrSettings />}
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
              {c === 'live' ? t(sport === 'snow' ? 'cat.liveSnow' : 'cat.live') : t(`cat.${c}`)}
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
                <Thumb id={id} ride={ride} at={at} style={thumbStyle(gadgetStyle(style, id), id, ride)} />
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

/** Thumbnails of the PR ghost before a PR is entered: a 5 km PR at the activity's own pace, so it shows something. */
function thumbStyle(style: OverlayStyle, id: OverlayId, ride: RideData): OverlayStyle {
  if (id !== 'runGhost' || style.ghost) return style;
  const avg = ride.totals.distanceM / Math.max(1, (ride.endTime - ride.startTime) / 1000);
  const timeMs = Math.round(5000 / Math.max(0.5, avg)) * 1000;
  return { ...style, ghost: { distanceM: 5000, timeMs, startMs: null } };
}

const PR_NAMES = ['pr.5k', 'pr.10k', 'pr.half', 'pr.marathon'] as const;

/** The personal record raced by the PR ghost: distance, time and where the race starts (as on the desktop). */
function PrSettings() {
  const pr = useProject((st) => st.pr);
  const setPr = useProject((st) => st.setPr);
  const ride = useProject((st) => st.ride);
  const videoStart = useProject((st) => (st.ride ? clipStart(st) : undefined));
  const known = pr ? GHOST_DISTANCES.findIndex((d) => Math.abs(d - pr.distanceM) < 1) : 0;
  const [dist, setDist] = useState(known >= 0 ? String(GHOST_DISTANCES[known]) : 'custom');
  const [customKm, setCustomKm] = useState(pr && known < 0 ? String(Math.round(pr.distanceM / 10) / 100) : '');
  const [timeText, setTimeText] = useState(pr ? formatClock(pr.timeMs) : '');
  const [startText, setStartText] = useState(pr?.startOffsetMs ? formatClock(pr.startOffsetMs) : '');
  const distanceM = dist === 'custom' ? Number(customKm.replace(',', '.')) * 1000 : Number(dist);
  const timeMs = parseClock(timeText);
  // Blank (or 0:00) = the start of the activity
  const startOffset = (text: string) => (text.trim() ? parseClock(text) : null);
  const badStart = startText.trim() !== '' && startOffset(startText) === null && !/^0+([:.,]0+)*$/.test(startText.trim());
  const save = (d: number, ms: number | null, startText2: string) => setPr(d > 0 && ms ? { distanceM: d, timeMs: ms, startOffsetMs: startOffset(startText2) } : null);
  // Time of the video's start into the activity, offered as a shortcut
  const videoOffset = ride && videoStart !== undefined && videoStart > ride.startTime ? videoStart - ride.startTime : null;
  return (
    <div className="pr">
      <h3>{t('pr.title')}</h3>
      <p className="fine">{t('pr.lead')}</p>
      <div className="pr__row">
        <label className="field">
          <span>{t('pr.distance')}</span>
          <select
            className="num-input"
            value={dist}
            onChange={(e) => {
              setDist(e.target.value);
              if (e.target.value !== 'custom') save(Number(e.target.value), timeMs, startText);
            }}
          >
            {GHOST_DISTANCES.map((d, i) => (
              <option key={d} value={String(d)}>
                {t(PR_NAMES[i])}
              </option>
            ))}
            <option value="custom">{t('pr.custom')}</option>
          </select>
        </label>
        {dist === 'custom' && (
          <label className="field">
            <span>{t('pr.km')}</span>
            <input
              className="num-input"
              type="text"
              inputMode="decimal"
              value={customKm}
              onChange={(e) => {
                setCustomKm(e.target.value);
                save(Number(e.target.value.replace(',', '.')) * 1000, timeMs, startText);
              }}
            />
          </label>
        )}
        <label className="field">
          <span>{t('pr.time')}</span>
          <input
            className="num-input"
            type="text"
            inputMode="numeric"
            placeholder="28:00"
            value={timeText}
            onChange={(e) => {
              setTimeText(e.target.value);
              save(distanceM, parseClock(e.target.value), startText);
            }}
            // "2800" typed on a number pad shows as 28:00 once done
            onBlur={() => timeMs && setTimeText(formatClock(timeMs))}
          />
        </label>
      </div>
      <label className="field">
        <span>{t('pr.start')}</span>
        <input
          className="num-input"
          type="text"
          inputMode="numeric"
          placeholder={t('pr.startPlaceholder')}
          value={startText}
          onChange={(e) => {
            setStartText(e.target.value);
            save(distanceM, timeMs, e.target.value);
          }}
          onBlur={() => {
            const off = startOffset(startText);
            setStartText(off ? formatClock(off) : '');
          }}
        />
        <span className="fine">{t('pr.startHint')}</span>
      </label>
      {videoOffset !== null && (
        <button
          type="button"
          className="chip-btn"
          onClick={() => {
            const text = formatClock(videoOffset);
            setStartText(text);
            save(distanceM, timeMs, text);
          }}
        >
          {t('pr.startVideo', { time: formatClock(videoOffset) })}
        </button>
      )}
      {timeText && !timeMs ? (
        <p className="warn">{t('pr.badTime')}</p>
      ) : badStart ? (
        <p className="warn">{t('pr.badStart')}</p>
      ) : pr ? (
        <p className="fine">{t('pr.pace', { pace: `${formatPace(pr.distanceM / (pr.timeMs / 1000), STYLE.units)} ${paceUnit(STYLE.units)}` })}</p>
      ) : (
        <p className="warn">{t('pr.need')}</p>
      )}
    </div>
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
