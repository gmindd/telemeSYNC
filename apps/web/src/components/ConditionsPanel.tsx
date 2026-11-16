// Step 4, "When they appear": a condition per chosen gadget, e.g. speed only above 30 km/h, heart rate only above
// 170 bpm, gradient below −5 % or above +5 %, hidden a few seconds after it stops holding. Stored in base units in
// style.conditions (core overlays/visibility.ts); the preview and the export follow it.
import { useEffect, useState } from 'react';
import {
  CONDITION_METRICS,
  conditionMetricAvailable,
  defaultCondition,
  overlayLabel,
  ownConditionMetric,
  startingThresholds,
  tr as coreTr,
  type ConditionMetric,
  type GadgetCondition,
  type OverlayId,
  type RideData,
  type Units,
} from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';
import { useApp } from '../lib/store.ts';
import { conditionStep, conditionUnit, fromDisplay, toDisplay } from '../lib/conditionUnits.ts';

/** A number (or m:ss pace) field that keeps what is being typed and passes on only valid values. */
function ValueField(props: { metric: ConditionMetric; value: number | null; units: Units; onChange: (v: number | null) => void; label: string; steps?: boolean }) {
  const { metric, value, units } = props;
  const shown = toDisplay(metric, value, units);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <label className="field cond-value">
      {props.label}
      <span className="cond-input">
        <input
          type={metric === 'pace' ? 'text' : 'number'}
          inputMode={metric === 'pace' ? 'numeric' : 'decimal'}
          step={conditionStep(metric)}
          placeholder={metric === 'pace' ? '5:00' : '—'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = fromDisplay(metric, e.target.value, units);
            if (v !== undefined) props.onChange(v);
          }}
          onBlur={() => setText(toDisplay(metric, value, units))}
        />
        <span className="muted">{conditionUnit(metric, units, props.steps)}</span>
      </span>
    </label>
  );
}

function ConditionRow(props: { id: OverlayId; ride: RideData }) {
  const { id, ride } = props;
  const { style, setStyle } = useApp();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const c = style.conditions?.[id];
  const set = (next: GadgetCondition | undefined) => {
    const all = { ...style.conditions };
    if (next) all[id] = next;
    else delete all[id];
    setStyle({ conditions: all });
  };
  const own = ownConditionMetric(id);
  const metrics = CONDITION_METRICS.filter((m) => conditionMetricAvailable(ride, m)).sort((a, b) => (a === own ? -1 : b === own ? 1 : 0));
  const pace = c?.metric === 'pace';
  // Running cadence is in steps per minute (running files, and the running gadgets).
  const steps = ride.sport === 'running' || id.startsWith('run');
  return (
    <div className={`cond-row${c ? ' on' : ''}`}>
      <span className="cond-name">{overlayLabel(id, lang)}</span>
      <select value={c ? 'when' : 'always'} onChange={(e) => set(e.target.value === 'when' ? defaultCondition(id, ride) : undefined)} aria-label={t('ov.cond.mode', { name: overlayLabel(id, lang) })}>
        <option value="always">{t('ov.cond.always')}</option>
        <option value="when">{t('ov.cond.when')}</option>
      </select>
      {c ? (
        <>
          <label className="field">
            {t('ov.cond.metric')}
            <select
              value={c.metric}
              onChange={(e) => {
                const m = e.target.value as ConditionMetric;
                // A new metric starts from its own sensible thresholds.
                set({ metric: m, ...startingThresholds(m), hideAfterS: c.hideAfterS });
              }}
            >
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {coreTr(lang, `metric.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <ValueField metric={c.metric} value={c.above} units={style.units} steps={steps} label={t(pace ? 'ov.cond.slower' : 'ov.cond.above')} onChange={(above) => set({ ...c, above })} />
          <ValueField metric={c.metric} value={c.below} units={style.units} steps={steps} label={t(pace ? 'ov.cond.faster' : 'ov.cond.below')} onChange={(below) => set({ ...c, below })} />
          <label className="field cond-value">
            {t('ov.cond.hideAfter')}
            <span className="cond-input">
              <input type="number" min={0} max={600} step={1} value={c.hideAfterS} onChange={(e) => Number(e.target.value) >= 0 && set({ ...c, hideAfterS: Math.min(600, Math.round(Number(e.target.value))) })} />
              <span className="muted">s</span>
            </span>
          </label>
          {c.above === null && c.below === null ? <p className="notice small cond-warn">{t('ov.cond.needValue')}</p> : null}
        </>
      ) : null}
    </div>
  );
}

export function ConditionsPanel() {
  const { ride, overlays, style } = useApp();
  const t = useT();
  if (!ride || !overlays.length) return null;
  const n = overlays.filter((o) => style.conditions?.[o]).length;
  return (
    <details className="card cond-panel" open={n > 0}>
      <summary>
        <h3>{t('ov.cond.title')}</h3>
        <span className="muted">{n ? t('ov.cond.count', { n }) : t('ov.cond.none')}</span>
      </summary>
      <p className="lead">{t('ov.cond.lead')}</p>
      {overlays.map((id) => (
        <ConditionRow key={id} id={id} ride={ride} />
      ))}
    </details>
  );
}
