import { useState } from "preact/hooks";
import type { Evaluation, EventType, Forecast } from "../../../shared/types.ts";
import { EVENT_ICONS, EVENT_LABELS } from "../../../shared/types.ts";
import { dayLabel, isNewDay, localHour, timeOf } from "../format.ts";

const HOUR = 3_600_000;
const SPAN = 48;
const CELL = 14;
const ROW = 26;
const TOP = 18;

interface Props {
  forecast: Forecast;
  evaluation: Evaluation;
  events: EventType[];
}

export function Timeline({ forecast, evaluation, events }: Props) {
  const tz = forecast.timezone;
  const h = forecast.hourly;
  const nowHour = Math.floor(Date.now() / HOUR) * HOUR;
  const startIdx = Math.max(0, h.time.findIndex((t) => t >= nowHour));
  const idx = Array.from(
    { length: Math.min(SPAN, h.time.length - startIdx) },
    (_, i) => startIdx + i,
  );
  const [selected, setSelected] = useState<number | null>(null);

  const width = idx.length * CELL;
  const height = TOP + events.length * ROW + 4;
  const x = (k: number) => k * CELL;
  const xOfTime = (t: number) => x((t - h.time[idx[0]]) / HOUR);

  const marks = [
    ...forecast.daily.sunrise.map((t) => ({ t, kind: "sunrise" })),
    ...forecast.daily.sunset.map((t) => ({ t, kind: "sunset" })),
  ].filter((m) => m.t >= h.time[idx[0]] && m.t <= h.time[idx.at(-1)!] + HOUR);

  const sel = selected ?? idx[0];

  return (
    <div class="timeline">
      <div class="timeline-rows">
        <div class="timeline-labels" style={{ paddingTop: `${TOP}px` }}>
          {events.map((e) => (
            <div
              key={e}
              class="timeline-label"
              style={{ height: `${ROW}px` }}
              title={EVENT_LABELS[e]}
            >
              {EVENT_ICONS[e]}
            </div>
          ))}
        </div>
        <div class="timeline-scroll">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="48 hour score timeline"
          >
            {idx.map((i, k) => (
              <g key={i}>
                {h.isDay[i] === 0 && (
                  <rect class="tl-night" x={x(k)} y={TOP} width={CELL} height={height - TOP} />
                )}
                {(k === 0 || isNewDay(h.time[i], tz)) && (
                  <>
                    <line class="tl-day" x1={x(k)} x2={x(k)} y1={0} y2={height} />
                    <text class="tl-text" x={x(k) + 3} y={11}>{dayLabel(h.time[i], tz)}</text>
                  </>
                )}
                {k > 0 && !isNewDay(h.time[i], tz) && localHour(h.time[i], tz) % 6 === 0 && (
                  <text class="tl-text tl-dim" x={x(k) + 2} y={11}>
                    {localHour(h.time[i], tz)}h
                  </text>
                )}
              </g>
            ))}
            {events.map((e, r) =>
              idx.map((i, k) => {
                const s = evaluation.hourly[e][i]?.score ?? 0;
                return (
                  <rect
                    key={`${e}-${i}`}
                    class={`tl-cell ev-${e}`}
                    x={x(k) + 1}
                    y={TOP + r * ROW + 3}
                    width={CELL - 2}
                    height={ROW - 6}
                    rx={2}
                    style={{ opacity: s === 0 ? 0.06 : 0.15 + 0.85 * (s / 100) }}
                    onClick={() => setSelected(i)}
                  >
                    <title>{`${EVENT_LABELS[e]} ${timeOf(h.time[i], tz)}: ${s}`}</title>
                  </rect>
                );
              })
            )}
            {marks.map((m) => (
              <line
                key={`${m.kind}${m.t}`}
                class={`tl-sun tl-${m.kind}`}
                x1={xOfTime(m.t)}
                x2={xOfTime(m.t)}
                y1={TOP}
                y2={height}
              />
            ))}
            <rect
              class="tl-selected"
              x={x(idx.indexOf(sel))}
              y={TOP}
              width={CELL}
              height={height - TOP}
              fill="none"
            />
          </svg>
        </div>
      </div>
      <HourDetails forecast={forecast} evaluation={evaluation} events={events} i={sel} />
    </div>
  );
}

function HourDetails({ forecast, evaluation, events, i }: Props & { i: number }) {
  const h = forecast.hourly;
  const tz = forecast.timezone;
  return (
    <div class="hour-details">
      <div class="hour-head">
        <strong>{dayLabel(h.time[i], tz)} {timeOf(h.time[i], tz)}</strong>
        <span class="muted">
          {Math.round(h.temp[i])} °C · dew {Math.round(h.dewPoint[i])} °C · vis{" "}
          {Number.isFinite(h.visibility[i]) ? `${(h.visibility[i] / 1000).toFixed(1)} km` : "–"}
          {" "}
          · wind {h.wind[i].toFixed(1)} m/s · clouds L/M/H{" "}
          {Math.round(h.cloudLow[i])}/{Math.round(h.cloudMid[i])}/
          {Math.round(h.cloudHigh[i])}%
        </span>
      </div>
      <ul class="hour-events">
        {events.map((e) => {
          const s = evaluation.hourly[e][i];
          if (!s) return null;
          return (
            <li key={e}>
              <span class={`dot ev-${e}`} /> {EVENT_LABELS[e]} <b>{s.score}</b>
              {s.reasons.length > 0 && s.score > 0 && (
                <span class="muted">— {s.reasons.join(", ")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
