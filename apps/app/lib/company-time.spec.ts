import { describe, expect, it } from "bun:test";
import { middayInCompanyZone, todayInCompanyZone } from "./company-time";

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
