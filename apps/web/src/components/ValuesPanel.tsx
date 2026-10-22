import { convert, formatDuration, formatNumber, formatTime, sampleAt, tr, type OverlayStyle, type RideData } from '@telemesync/core';
import { useLang, useT } from '../i18n/index.tsx';

/** Current values at the playhead — useful to validate sync (e.g. speed 0 when stopped). */
export function ValuesPanel({ ride, t: at, style }: { ride: RideData; t: number; style: OverlayStyle }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const s = sampleAt(ride, at, { gapSpeed: style.gapSpeed });
  const u = style.units;
  const n = (v: number, d = 0) => formatNumber(v, d, lang);
  const rows: [string, string][] = [[t('values.clock'), formatTime(at, style.timeZone)]];
  if (ride.available.has('speed')) rows.push([tr(lang, 'metric.speed'), `${n(convert.speed(s.speed, u), 1)} ${convert.speedUnit(u)}`]);
  if (ride.available.has('altitude')) rows.push([tr(lang, 'metric.altitude'), `${n(convert.elevation(s.altitude, u))} ${convert.elevationUnit(u)}`]);
  if (ride.available.has('grade')) rows.push([tr(lang, 'metric.grade'), `${n(s.grade)} %`]);
  if (ride.available.has('heartRate')) rows.push([t('values.hr'), `${n(s.heartRate)} bpm`]);
  if (ride.available.has('cadence')) rows.push([tr(lang, 'metric.cadence'), `${n(s.cadence)} rpm`]);
  if (ride.available.has('power')) rows.push([tr(lang, 'metric.power'), `${n(s.power)} W`]);
  if (ride.available.has('distance')) rows.push([tr(lang, 'metric.distance'), `${n(convert.distance(s.distance, u), 2)} ${convert.distanceUnit(u)}`]);
  rows.push([tr(lang, 'metric.elapsedTime'), formatDuration(s.elapsedMs)]);
  return (
    <div className="values">
      {s.outside ? <div className="badge warn">{t('values.outside')}</div> : s.inGap ? <div className="badge">{t('values.gap')}</div> : null}
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
