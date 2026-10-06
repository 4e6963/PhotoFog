import type {
  Evaluation,
  EventType,
  EventWindow,
  Forecast,
  HourScore,
  Location,
} from "../types.ts";
import { EVENT_TYPES } from "../types.ts";
import { scoreFog } from "./fog.ts";
import { scoreGlow } from "./glow.ts";
import { scoreInversion } from "./inversion.ts";
import { HOUR, nearest } from "./util.ts";

export interface EvaluateOptions {
  elevation?: number;
  events?: readonly EventType[];
  sensitivity?: Location["sensitivity"];
  /** Hours at or above this (after sensitivity) form windows. */
  minScore: number;
}

export function scoreAll(f: Forecast, elevation = f.elevation): Record<EventType, HourScore[]> {
  return {
    fog: scoreFog(f),
    sunrise: scoreGlow(f, "sunrise"),
    sunset: scoreGlow(f, "sunset"),
    inversion: scoreInversion(f, elevation),
  };
}

/** Groups consecutive hours with score >= minScore into windows. */
export function toWindows(type: EventType, hours: HourScore[], minScore: number): EventWindow[] {
  const out: EventWindow[] = [];
  let cur: EventWindow | null = null;
  for (const h of hours) {
    if (h.score >= minScore) {
      if (cur && cur.end === h.time) {
        cur.end = h.time + HOUR;
        if (h.score > cur.peak) {
          Object.assign(cur, { peak: h.score, peakTime: h.time, reasons: h.reasons });
        }
      } else {
        cur = {
          type,
          start: h.time,
          end: h.time + HOUR,
          peak: h.score,
          peakTime: h.time,
          reasons: h.reasons,
        };
        out.push(cur);
      }
    } else {
      cur = null;
    }
  }
  return out;
}

export function evaluate(f: Forecast, opts: EvaluateOptions): Evaluation {
  const raw = scoreAll(f, opts.elevation ?? f.elevation);
  const events = opts.events ?? EVENT_TYPES;
  const hourly = {} as Record<EventType, HourScore[]>;
  const windows: EventWindow[] = [];

  for (const type of EVENT_TYPES) {
    const offset = opts.sensitivity?.[type] ?? 0;
    hourly[type] = raw[type].map((h) => ({
      ...h,
      score: h.score === 0 ? 0 : Math.max(0, Math.min(100, h.score + offset)),
    }));
    if (!events.includes(type)) continue;
    for (const w of toWindows(type, hourly[type], opts.minScore)) {
      if (type === "sunrise" || type === "sunset") {
        w.at = nearest(type === "sunrise" ? f.daily.sunrise : f.daily.sunset, w.peakTime);
      }
      windows.push(w);
    }
  }
  windows.sort((a, b) => a.start - b.start);
  return { hourly, windows };
}
