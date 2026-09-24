import { describe, expect, it } from "bun:test";
import {
	instantForCompanyDay,
	middayInCompanyZone,
	todayInCompanyZone,
} from "./company-time";

describe("the company's day", () => {
	it("is Dubai's day, not the browser's", () => {
		expect(todayInCompanyZone(new Date("2026-09-24T21:30:00.000Z"))).toBe(
			"2026-09-25",
		);
		expect(todayInCompanyZone(new Date("2026-09-24T19:59:00.000Z"))).toBe(
			"2026-09-24",
		);
	});
});

describe("midday in the company's zone", () => {
	it("is 08:00 UTC, because Dubai is four hours ahead", () => {
		expect(middayInCompanyZone("2026-09-24")).toBe("2026-09-24T08:00:00.000Z");
	});

	it("does not drift across the year", () => {
		for (const day of ["2026-01-15", "2026-06-15", "2026-12-31"]) {
			expect(middayInCompanyZone(day)).toBe(`${day}T08:00:00.000Z`);
		}
	});

	it("round-trips back to the day it was given", () => {
		for (const day of ["2026-03-01", "2026-09-24", "2027-01-01"]) {
			expect(todayInCompanyZone(new Date(middayInCompanyZone(day)))).toBe(day);
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
			const day = todayInCompanyZone(now);
			const instant = instantForCompanyDay(day, now);

			expect(instant).toBe(nowIso);
			expect(Date.parse(instant)).toBeLessThanOrEqual(now.getTime());
		}
	});

	it("is midday in Dubai for any other day", () => {
		const now = new Date("2026-09-24T08:30:00.000Z");

		expect(instantForCompanyDay("2026-09-20", now)).toBe(
			"2026-09-20T08:00:00.000Z",
		);
	});

	it("never hands the server an instant it will refuse", () => {
		for (let hour = 0; hour < 24; hour += 1) {
			const now = new Date(
				`2026-09-24T${String(hour).padStart(2, "0")}:15:00.000Z`,
			);
			const instant = instantForCompanyDay(todayInCompanyZone(now), now);

			expect(Date.parse(instant)).toBeLessThanOrEqual(now.getTime() + 60_000);
		}
	});
});
