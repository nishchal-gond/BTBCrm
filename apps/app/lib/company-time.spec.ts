import { describe, expect, it } from "bun:test";
import {
	COMPANY_TIME_ZONE,
	instantForDay,
	middayInZone,
	todayInZone,
} from "./company-time";

const DUBAI = COMPANY_TIME_ZONE;

describe("the day a person is living in", () => {
	it("is their zone's day, not the browser's", () => {
		expect(todayInZone(DUBAI, new Date("2026-09-24T21:30:00.000Z"))).toBe(
			"2026-09-25",
		);
		expect(todayInZone(DUBAI, new Date("2026-09-24T19:59:00.000Z"))).toBe(
			"2026-09-24",
		);
	});

	it("answers for any zone it is given", () => {
		const instant = new Date("2026-09-24T21:30:00.000Z");

		expect(todayInZone("Europe/London", instant)).toBe("2026-09-24");
		expect(todayInZone("Asia/Tokyo", instant)).toBe("2026-09-25");
		expect(todayInZone("America/New_York", instant)).toBe("2026-09-24");
	});
});

describe("midday in a zone", () => {
	it("is 08:00 UTC in Dubai, because Dubai is four hours ahead", () => {
		expect(middayInZone("2026-09-24", DUBAI)).toBe("2026-09-24T08:00:00.000Z");
	});

	it("does not drift across the year in a zone with no daylight saving", () => {
		for (const day of ["2026-01-15", "2026-06-15", "2026-12-31"]) {
			expect(middayInZone(day, DUBAI)).toBe(`${day}T08:00:00.000Z`);
		}
	});

	it("moves with daylight saving in a zone that has it", () => {
		expect(middayInZone("2026-01-15", "Europe/London")).toBe(
			"2026-01-15T12:00:00.000Z",
		);
		expect(middayInZone("2026-06-15", "Europe/London")).toBe(
			"2026-06-15T11:00:00.000Z",
		);
	});

	it("round-trips back to the day it was given", () => {
		for (const zone of [DUBAI, "Europe/London", "America/New_York"]) {
			for (const day of ["2026-03-01", "2026-09-24", "2027-01-01"]) {
				expect(todayInZone(zone, new Date(middayInZone(day, zone)))).toBe(day);
			}
		}
	});
});

describe("the instant a ledger entry records", () => {
	it("is now when the chosen day is today, so it is never in the future", () => {
		for (const nowIso of [
			"2026-09-24T02:00:00.000Z",
			"2026-09-24T07:59:00.000Z",
			"2026-09-24T08:01:00.000Z",
			"2026-09-24T20:30:00.000Z",
		]) {
			const now = new Date(nowIso);
			const instant = instantForDay(todayInZone(DUBAI, now), DUBAI, now);

			expect(instant).toBe(nowIso);
			expect(Date.parse(instant)).toBeLessThanOrEqual(now.getTime());
		}
	});

	it("is midday for any other day", () => {
		const now = new Date("2026-09-24T08:30:00.000Z");

		expect(instantForDay("2026-09-20", DUBAI, now)).toBe(
			"2026-09-20T08:00:00.000Z",
		);
	});

	it("never hands the server an instant it will refuse, in any zone", () => {
		for (const zone of [
			DUBAI,
			"Europe/London",
			"Asia/Tokyo",
			"Pacific/Auckland",
		]) {
			for (let hour = 0; hour < 24; hour += 1) {
				const now = new Date(
					`2026-09-24T${String(hour).padStart(2, "0")}:15:00.000Z`,
				);
				const instant = instantForDay(todayInZone(zone, now), zone, now);

				expect(Date.parse(instant)).toBeLessThanOrEqual(now.getTime() + 60_000);
			}
		}
	});
});
