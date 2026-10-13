import { describe, it, expect } from "vitest";
import { plannedBuses, returnStateOf, returnStepMode, roomOf, freeSeatsOf, suggestReturn, type ReturnBusOcc } from "../return-need";

const labels = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
const bus = (id: string, cap: number, taken: string[] = [], seatCount = cap): ReturnBusOcc => ({
  bus_id: id, return_trip_id: "rt", return_trip_name: "R", bus_name: id, bus_number: 1, capacity: cap,
  layout_id: null, seat_labels: labels(seatCount), taken,
});

describe("plannedBuses", () => {
  it.each([[0, 0], [1, 1], [48, 1], [63, 1], [64, 2], [96, 2], [111, 2], [112, 3]])("P=%i → %i", (p, b) => {
    expect(plannedBuses(p, 15, 48).buses).toBe(b);
  });
  it("overflow when remainder <= T", () => expect(plannedBuses(60, 15, 48).overflow).toBe(12));
});

describe("seats", () => {
  it("full bus has no room/free seats", () => {
    const b = bus("a", 4, ["1", "2", "3", "4"]);
    expect(roomOf(b)).toBe(0); expect(freeSeatsOf(b)).toEqual([]);
  });
  it("capacity smaller than layout caps room", () => expect(roomOf(bus("a", 2, [], 4))).toBe(2));
  it("duplicate/taken seats excluded from suggestion", () => {
    const s = suggestReturn([bus("a", 4, ["1"])], ["1", "2"], 2)!;
    expect(s.same).toEqual(["2"]);
  });
  it("no suggestion when no bus fits", () => expect(suggestReturn([bus("a", 2), bus("b", 2)], [], 4)).toBeNull());
});

describe("returnStepMode (families)", () => {
  it("single bus fits", () => expect(returnStepMode([bus("a", 48, labels(40))], 4)).toBe("single"));
  it("needs two buses → admin, no partial", () => expect(returnStepMode([bus("a", 2), bus("b", 2)], 4)).toBe("admin"));
  it("insufficient total still admin (pending)", () => expect(returnStepMode([bus("a", 1)], 4)).toBe("admin"));
  it("no buses → none", () => expect(returnStepMode([], 3)).toBe("none"));
  it("all full → none", () => expect(returnStepMode([bus("a", 2, ["1", "2"])], 1)).toBe("none"));
});

describe("returnStateOf (regression modes)", () => {
  it("outbound n/a", () => expect(returnStateOf({ trip_mode: "outbound", actual_return_date: "2026-10-20" })).toBe("na"));
  it("open return (no date) n/a", () => expect(returnStateOf({ trip_mode: "round_open", actual_return_date: null })).toBe("na"));
  it("round pending", () => expect(returnStateOf({ trip_mode: "round", actual_return_date: "2026-10-20" })).toBe("pending"));
  it("return confirmed", () => expect(returnStateOf({ trip_mode: "return", actual_return_date: "2026-10-20", return_bus_id: "x", return_seat_numbers: ["1"] })).toBe("confirmed"));
});
