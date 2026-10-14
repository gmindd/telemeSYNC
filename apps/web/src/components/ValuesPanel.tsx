import { convert, fmt, formatDuration, formatTime, sampleAt, type OverlayStyle, type RideData } from '@telemesync/core';

/** Current values at the playhead — useful to validate sync (e.g. speed 0 when stopped). */
export function ValuesPanel({ ride, t, style }: { ride: RideData; t: number; style: OverlayStyle }) {
  const s = sampleAt(ride, t, { gapSpeed: style.gapSpeed });
  const u = style.units;
  const rows: [string, string][] = [['Hora', formatTime(t, style.timeZone)]];
  if (ride.available.has('speed')) rows.push(['Velocidade', `${fmt(convert.speed(s.speed, u), 1)} ${convert.speedUnit(u)}`]);
  if (ride.available.has('altitude')) rows.push(['Altitude', `${fmt(convert.elevation(s.altitude, u))} ${convert.elevationUnit(u)}`]);
  if (ride.available.has('grade')) rows.push(['Inclinação', `${fmt(s.grade)} %`]);
  if (ride.available.has('heartRate')) rows.push(['FC', `${fmt(s.heartRate)} bpm`]);
  if (ride.available.has('cadence')) rows.push(['Cadência', `${fmt(s.cadence)} rpm`]);
  if (ride.available.has('power')) rows.push(['Potência', `${fmt(s.power)} W`]);
  if (ride.available.has('distance')) rows.push(['Distância', `${fmt(convert.distance(s.distance, u), 2)} ${convert.distanceUnit(u)}`]);
  rows.push(['Tempo', formatDuration(s.elapsedMs)]);
  return (
    <div className="values">
      {s.outside ? <div className="badge warn">Fora da volta</div> : s.inGap ? <div className="badge">Pausa / sem dados</div> : null}
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
