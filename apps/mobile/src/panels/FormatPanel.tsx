// Format of the exported video (the clip's own or a social network's shape) with its framing, still or moving between
// keyframes, and the areas TikTok, Instagram Reels and YouTube Shorts cover, with the option to keep gadgets out of them.
import { gadgetZones, PLATFORM_NAMES, SOCIAL_PLATFORMS } from '@telemesync/core';
import { num, t } from '../i18n.ts';
import { cropsSideways, FORMATS, formatAspect, isVertical, posAt, type FormatId } from '../lib/formats.ts';
import { seek } from '../lib/player.ts';
import { frameAspect, KEY_SNAP_S, placements, STYLE, useProject } from '../state.ts';

const NAMES: Record<FormatId, () => string> = {
  original: () => t('format.original'),
  '9:16': () => t('format.vertical'),
  '4:5': () => t('format.portrait'),
  '1:1': () => t('format.square'),
  '16:9': () => t('format.landscape'),
};

export function FormatPanel() {
  const s = useProject();
  if (!s.info) return null;
  const { width, height } = s.info;
  const aspect = frameAspect(s);
  const sideways = cropsSideways(s.format, width, height);
  const vertical = isVertical(aspect);
  const covered = vertical ? Object.values(gadgetZones(s.overlays, placements(s), aspect, STYLE, s.platforms)).filter((z) => z === 'ui').length : 0;

  return (
    <div className="panel">
      <h3>{t('format.title')}</h3>
      <div className="formats">
        {FORMATS.map((f) => {
          const a = formatAspect(f, width, height);
          const box = a >= 1 ? { w: 30, h: 30 / a } : { w: 30 * a, h: 30 };
          return (
            <button key={f} type="button" className={`format${s.format === f ? ' is-on' : ''}`} aria-pressed={s.format === f} onClick={() => s.setFormat(f)}>
              <span className="format__shape">
                <span style={{ width: box.w, height: box.h }} />
              </span>
              <b>{f === 'original' ? `${width}×${height}` : f}</b>
              <span>{NAMES[f]()}</span>
            </button>
          );
        })}
      </div>
      {sideways && <Framing />}

      <h3>{t('format.zones')}</h3>
      {vertical ? (
        <>
          <p className="fine">{t('format.zonesHint')}</p>
          <div className="chips">
            {SOCIAL_PLATFORMS.map((p) => (
              <button key={p} type="button" className={`chip${s.platforms.includes(p) ? ' is-on' : ''}`} aria-pressed={s.platforms.includes(p)} onClick={() => s.togglePlatform(p)}>
                {PLATFORM_NAMES[p]}
              </button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={s.blockZones} onChange={(e) => s.setBlockZones(e.target.checked)} />
            <span>{t('format.block')}</span>
          </label>
          {covered > 0 && (
            <div className="notice">
              <span>{t('format.covered', { n: covered })}</span>
              <button type="button" className="chip-btn" onClick={() => s.settleAll(true)}>
                {t('format.moveNow')}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="fine">{t('format.zonesOnlyVertical')}</p>
      )}
    </div>
  );
}

/** Framing: where the picture sits in the frame, at the playhead; with keyframes it slides from one to the next. */
function Framing() {
  const s = useProject();
  const now = s.playheadS;
  const here = s.cropKeys.find((k) => Math.abs(k.t - now) <= KEY_SNAP_S);
  return (
    <div className="framing">
      <label className="field">
        <span>
          {t('format.crop')}
          {s.cropKeys.length > 0 && <b className="framing__at"> · {here ? t('format.keyHere') : t('format.keyAuto')}</b>}
        </span>
        <input type="range" min={0} max={1} step={0.005} value={posAt(s.cropKeys, s.cropPos, now)} onChange={(e) => s.frameAt(Number(e.target.value), now)} />
      </label>
      <p className="fine">{t('format.dragHint')}</p>
      <div className="row">
        {here ? (
          <button type="button" className="chip-btn" onClick={() => s.removeCropKey(now)}>
            {t('format.keyRemove')}
          </button>
        ) : (
          <button type="button" className="chip-btn" onClick={() => s.addCropKey(now)}>
            ◆ {t('format.keyAdd')}
          </button>
        )}
        {s.cropKeys.length > 0 && (
          <button type="button" className="chip-btn danger" onClick={() => s.clearCropKeys()}>
            {t('format.keyClear')}
          </button>
        )}
      </div>
      {s.cropKeys.length > 0 && (
        <div className="chips">
          {s.cropKeys.map((k) => (
            <button key={k.t} type="button" className={`chip${k === here ? ' is-on' : ''}`} onClick={() => seek(k.t)}>
              ◆ {num(k.t, 1)} s
            </button>
          ))}
        </div>
      )}
      <p className="fine">{s.cropKeys.length < 2 ? t('format.keyHint') : t('format.keyMoving')}</p>
    </div>
  );
}
