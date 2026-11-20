// "When it appears", for the selected gadget: always, or only while a value is above or below a limit (speed above
// 30 km/h, heart rate above 170 bpm, gradient below −5 % or above +5 %), hidden a few seconds after it stops holding.
// Stored in base units (core overlays/visibility.ts), as on the desktop; the preview and the export follow it.
import { useEffect, useState } from 'react';
import {
  CONDITION_METRICS,
  conditionMetricAvailable,
  defaultCondition,
  ownConditionMetric,
  startingThresholds,
  tr as coreTr,
  type ConditionMetric,
  type OverlayId,
  type RideData,
  type Units,
} from '@telemesync/core';
import { LANG, t } from '../i18n.ts';
import { conditionStep, conditionUnit, fromDisplay, toDisplay } from '../lib/conditionUnits.ts';
import { useProject } from '../state.ts';

/** A number (or m:ss pace) box that keeps what is being typed and passes on only valid values. */
function ValueField(props: { metric: ConditionMetric; value: number | null; units: Units; steps: boolean; label: string; onChange: (v: number | null) => void }) {
  const { metric, value, units } = props;
  const shown = toDisplay(metric, value, units);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <label className="field cond__value">
      <span>{props.label}</span>
      <span className="cond__input">
        <input
          className="num-input"
          type="text"
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
        <span className="fine">{conditionUnit(metric, units, props.steps)}</span>
      </span>
    </label>
  );
}

export function ConditionSettings({ id, ride }: { id: OverlayId; ride: RideData }) {
  const c = useProject((st) => st.look.conditions?.[id]);
  const units = useProject((st) => st.look.units);
  const setCondition = useProject((st) => st.setCondition);
  const own = ownConditionMetric(id);
  const metrics = CONDITION_METRICS.filter((m) => conditionMetricAvailable(ride, m)).sort((a, b) => (a === own ? -1 : b === own ? 1 : 0));
  const pace = c?.metric === 'pace';
  // Running cadence is in steps per minute (running files, and the running gadgets)
  const steps = ride.sport === 'running' || id.startsWith('run');
  return (
    <div className="cond">
      <div className="field">
        <span>{t('cond.title')}</span>
        <div className="segmented">
          <button type="button" className={c ? '' : 'is-on'} aria-pressed={!c} onClick={() => setCondition(id, undefined)}>
            {t('cond.always')}
          </button>
          <button type="button" className={c ? 'is-on' : ''} aria-pressed={!!c} onClick={() => !c && setCondition(id, defaultCondition(id, ride))}>
            {t('cond.when')}
          </button>
        </div>
      </div>
      {c && (
        <>
          <label className="field">
            <span>{t('cond.metric')}</span>
            <select
              className="num-input"
              value={c.metric}
              onChange={(e) => {
                const m = e.target.value as ConditionMetric;
                // A new metric starts from its own sensible thresholds
                setCondition(id, { metric: m, ...startingThresholds(m), hideAfterS: c.hideAfterS });
              }}
            >
              {metrics.map((m) => (
                <option key={m} value={m}>
                  {coreTr(LANG, `metric.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="cond__row">
            <ValueField metric={c.metric} value={c.above} units={units} steps={steps} label={t(pace ? 'cond.slower' : 'cond.above')} onChange={(above) => setCondition(id, { ...c, above })} />
            <ValueField metric={c.metric} value={c.below} units={units} steps={steps} label={t(pace ? 'cond.faster' : 'cond.below')} onChange={(below) => setCondition(id, { ...c, below })} />
            <label className="field cond__value">
              <span>{t('cond.hideAfter')}</span>
              <span className="cond__input">
                <input
                  className="num-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={600}
                  value={c.hideAfterS}
                  onChange={(e) => e.target.value !== '' && Number(e.target.value) >= 0 && setCondition(id, { ...c, hideAfterS: Math.min(600, Math.round(Number(e.target.value))) })}
                />
                <span className="fine">s</span>
              </span>
            </label>
          </div>
          {c.above === null && c.below === null ? <p className="warn">{t('cond.needValue')}</p> : <p className="fine">{t('cond.lead')}</p>}
        </>
      )}
    </div>
  );
}
