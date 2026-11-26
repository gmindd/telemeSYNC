// Step 4, "Background of each gadget": every gadget uses the shared background opacity ("Gadget background" in the
// style options) until it is given its own here. Stored in style.gadgetOpacity (core overlays/layout.ts gadgetStyle);
// the preview and the export follow it. Moving the shared slider puts every gadget back on it.
import { overlayLabel, type OverlayId } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';

function BackgroundRow({ id }: { id: OverlayId }) {
  const { style, setStyle } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const own = style.gadgetOpacity?.[id];
  const op = own ?? style.panelOpacity;
  const set = (v: number | undefined) => {
    const { [id]: _old, ...rest } = style.gadgetOpacity ?? {};
    setStyle({ gadgetOpacity: v === undefined ? rest : { ...rest, [id]: v } });
  };
  const name = overlayLabel(id, lang);
  return (
    <div className={`bg-row${own !== undefined ? ' on' : ''}`}>
      <span className="cond-name">{name}</span>
      <input type="range" min={0} max={1} step={0.05} value={op} aria-label={t('ov.bg.of', { name })} onChange={(e) => set(Number(e.target.value))} />
      <b className="bg-row__val">{Math.round(op * 100)} %</b>
      {own !== undefined ? (
        <button className="link-inline" onClick={() => set(undefined)}>
          {t('ov.bg.same')}
        </button>
      ) : (
        <span className="muted small">{t('ov.bg.shared')}</span>
      )}
    </div>
  );
}

export function GadgetBackgroundPanel() {
  const { ride, overlays, style } = useApp();
  const t = useT();
  if (!ride || !overlays.length) return null;
  const n = overlays.filter((o) => style.gadgetOpacity?.[o] !== undefined).length;
  return (
    <details className="card cond-panel bg-panel" open={n > 0}>
      <summary>
        <h3>{t('ov.bg.title')}</h3>
        <span className="muted">{n ? t('ov.bg.count', { n }) : t('ov.bg.none', { pct: Math.round(style.panelOpacity * 100) })}</span>
      </summary>
      <p className="lead">{t('ov.bg.lead')}</p>
      {overlays.map((id) => (
        <BackgroundRow key={id} id={id} />
      ))}
    </details>
  );
}
