// @ts-nocheck -- vitest runs via bunx; types not installed in the app
import { describe, expect, it } from "vitest";
import { isUpcomingReturn, planningTripId, riyadhToday } from "../return-planning-dates";

const trips = [
  { id: "friday", weekday: 5, return_date: "2026-10-23", return_time: "13:30:00" },
  { id: "monday", weekday: 1, return_date: "2026-10-26", return_time: "13:30:00" },
  { id: "wednesday", weekday: 3, return_date: "2026-10-21", return_time: "13:30:00" },
];

describe("real return planning date", () => {
  it("Friday 23 extended three nights belongs to Monday 26", () => {
    expect(planningTripId("2026-10-26", "friday", trips, [])).toBe("monday");
  });
  it("retains a Friday booking on Friday 23", () => {
    expect(planningTripId("2026-10-23", "friday", trips, [])).toBe("friday");
  });
  it("does not guess between multiple trips on the actual date", () => {
    expect(planningTripId("2026-10-26", "friday", trips, [
      { return_trip_id: "monday", trip_date: "2026-10-26" },
      { return_trip_id: "other", trip_date: "2026-10-26" },
    ])).toBeNull();
  });
});

describe("hide finished returns in Riyadh time", () => {
  it("hides last week's return", () => {
    expect(isUpcomingReturn("2026-10-16", "13:30:00", new Date("2026-10-21T09:06:00Z"))).toBe(false);
  });
  it("keeps today's return before its 13:30 departure", () => {
    expect(isUpcomingReturn("2026-10-21", "13:30:00", new Date("2026-10-21T10:29:59Z"))).toBe(true);
  });
  it("hides today's return at its 13:30 departure", () => {
    expect(isUpcomingReturn("2026-10-21", "13:30:00", new Date("2026-10-21T10:30:00Z"))).toBe(false);
  });
  it("keeps a future return", () => {
    expect(isUpcomingReturn("2026-10-26", "13:30:00", new Date("2026-10-21T09:06:00Z"))).toBe(true);
  });
  it("uses Riyadh date across UTC midnight", () => {
    expect(riyadhToday(new Date("2026-10-20T21:01:00Z"))).toBe("2026-10-21");
  });
  it("keeps an unknown-time return until the end of its local day", () => {
    expect(isUpcomingReturn("2026-10-21", null, new Date("2026-10-21T18:00:00Z"))).toBe(true);
    expect(isUpcomingReturn("2026-10-21", null, new Date("2026-10-21T21:00:00Z"))).toBe(false);
  });
});