const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export const timeOf = (t: number, tz: string) =>
  fmt(tz, { hour: "2-digit", minute: "2-digit" }).format(t);

// formatToParts: some locales add text around the number ("00 Uhr").
export const localHour = (t: number, tz: string) =>
  Number(
    fmt(tz, { hour: "numeric", hourCycle: "h23" }).formatToParts(t).find((p) => p.type === "hour")
      ?.value,
  );

const dateKey = (t: number, tz: string) =>
  fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

export function dayLabel(t: number, tz: string, now = Date.now()): string {
  const k = dateKey(t, tz);
  if (k === dateKey(now, tz)) return "Today";
  if (k === dateKey(now + 86_400_000, tz)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { timeZone: tz, weekday: "short" }).format(t);
}

export const isNewDay = (t: number, tz: string) => localHour(t, tz) === 0;

export function relative(t: number, now = Date.now()): string {
  const mins = Math.round((t - now) / 60_000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return mins >= 0 ? `in ${mins} min` : `${-mins} min ago`;
  const h = Math.round(mins / 60);
  return h >= 0 ? `in ${h} h` : `${-h} h ago`;
}

export function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-mid";
  return "score-low";
}
