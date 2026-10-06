// Shared domain types. Pure TS: imported by the Deno server and the browser bundle.

export const EVENT_TYPES = ["fog", "sunrise", "sunset", "inversion"] as const;
export type EventType = typeof EVENT_TYPES[number];

export const EVENT_LABELS: Record<EventType, string> = {
  fog: "Fog / mist",
  sunrise: "Colorful sunrise",
  sunset: "Colorful sunset",
  inversion: "Sea of clouds",
};

export const EVENT_ICONS: Record<EventType, string> = {
  fog: "🌫️",
  sunrise: "🌅",
  sunset: "🌇",
  inversion: "☁️",
};

export interface Location {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Overrides the DEM elevation returned by Open-Meteo (metres). */
  elevation?: number;
  events: EventType[];
  /** Per-event score offset, -20..+20. Positive = alert more easily. */
  sensitivity?: Partial<Record<EventType, number>>;
}

export interface NotifyPrefs {
  enabled: boolean;
  minScore: number;
  /** Only alert for windows starting between leadMinHours and leadMaxHours from now. */
  leadMinHours: number;
  leadMaxHours: number;
  /** "HH:MM" local time, no pushes are sent in this range. */
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface Preferences {
  /** Windows below this score are not shown / grouped. */
  minScore: number;
  notify: NotifyPrefs;
}

export const DEFAULT_PREFS: Preferences = {
  minScore: 40,
  notify: {
    enabled: false,
    minScore: 60,
    leadMinHours: 2,
    leadMaxHours: 18,
    quietEnabled: true,
    quietStart: "22:00",
    quietEnd: "07:00",
  },
};

export interface PressureLevel {
  hPa: number;
  temp: number[];
  rh: number[];
  cloud: number[];
  height: number[];
}

/** Normalized forecast. All hourly arrays share the `time` index; times are unix ms. */
export interface Forecast {
  lat: number;
  lon: number;
  elevation: number;
  timezone: string;
  utcOffsetSeconds: number;
  fetchedAt: number;
  hourly: {
    time: number[];
    temp: number[];
    dewPoint: number[];
    rh: number[];
    visibility: number[];
    wind: number[];
    cloudLow: number[];
    cloudMid: number[];
    cloudHigh: number[];
    precip: number[];
    weatherCode: number[];
    isDay: number[];
    levels: PressureLevel[];
    /** Low cloud cover ~80 km towards sunrise / sunset azimuth (null if unknown). */
    horizonLowEast: (number | null)[];
    horizonLowWest: (number | null)[];
  };
  daily: { sunrise: number[]; sunset: number[] };
}

export interface HourScore {
  time: number;
  score: number;
  reasons: string[];
}

export interface EventWindow {
  type: EventType;
  start: number;
  /** Exclusive end (unix ms). */
  end: number;
  peak: number;
  peakTime: number;
  reasons: string[];
  /** Exact sunrise/sunset time for glow events. */
  at?: number;
}

export interface Evaluation {
  hourly: Record<EventType, HourScore[]>;
  windows: EventWindow[];
}

/** Payload synced to the server for push notifications. */
export interface SyncPayload {
  subscription: { endpoint: string; keys: { auth: string; p256dh: string } };
  locations: Location[];
  prefs: Preferences;
  tz: string;
}
