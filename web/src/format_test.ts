import { assertEquals } from "@std/assert";
import { dayLabel, isNewDay, localHour } from "./format.ts";

const midnightBerlin = Date.UTC(2026, 9, 6, 22);

Deno.test("localHour works in locales that decorate the hour (de: '00 Uhr')", () => {
  assertEquals(localHour(midnightBerlin, "Europe/Berlin"), 0);
  assertEquals(localHour(midnightBerlin, "UTC"), 22);
  assertEquals(isNewDay(midnightBerlin, "Europe/Berlin"), true);
});

Deno.test("dayLabel uses Today/Tomorrow/English weekday in the location's timezone", () => {
  const now = Date.UTC(2026, 9, 6, 12); // Tue
  assertEquals(dayLabel(now, "Europe/Berlin", now), "Today");
  assertEquals(dayLabel(midnightBerlin, "Europe/Berlin", now), "Tomorrow");
  assertEquals(dayLabel(now + 2 * 86_400_000, "Europe/Berlin", now), "Thu");
});
