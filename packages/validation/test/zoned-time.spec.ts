import { describe, expect, it } from "bun:test";
import {
	clockIn,
	dayLabel,
	instantFromWallClock,
	shortMoment,
	wallClockIn,
	zoneLabel,
} from "../src/zoned-time";

describe("turning a wall clock into an instant", () => {
	it("reads 09:00 in Dubai as 05:00 UTC", () => {
		const instant = instantFromWallClock(
			{ day: "2026-03-01", time: "09:00" },
			"Asia/Dubai",
		);

		expect(instant?.toISOString()).toBe("2026-03-01T05:00:00.000Z");
	});

	it("keeps 09:00 London on both sides of the spring change", () => {
		const winter = instantFromWallClock(
			{ day: "2026-03-01", time: "09:00" },
			"Europe/London",
		);
		const summer = instantFromWallClock(
			{ day: "2026-06-01", time: "09:00" },
			"Europe/London",
		);

		expect(winter?.toISOString()).toBe("2026-03-01T09:00:00.000Z");
		expect(summer?.toISOString()).toBe("2026-06-01T08:00:00.000Z");
	});

	it("keeps 09:00 New York on both sides of the autumn change", () => {
		const summer = instantFromWallClock(
			{ day: "2026-10-01", time: "09:00" },
			"America/New_York",
		);
		const winter = instantFromWallClock(
			{ day: "2026-12-01", time: "09:00" },
			"America/New_York",
		);

		expect(summer?.toISOString()).toBe("2026-10-01T13:00:00.000Z");
		expect(winter?.toISOString()).toBe("2026-12-01T14:00:00.000Z");
	});

	it("refuses a zone that does not exist", () => {
		expect(
			instantFromWallClock({ day: "2026-03-01", time: "09:00" }, "Mars/Base"),
		).toBeNull();
	});

	it("refuses a day that does not parse", () => {
		expect(
			instantFromWallClock({ day: "not-a-day", time: "09:00" }, "Asia/Dubai"),
		).toBeNull();
	});
});

describe("reading an instant back as a wall clock", () => {
	it("round-trips every zone it is given", () => {
		const zones = [
			"Asia/Dubai",
			"Europe/London",
			"America/New_York",
			"Asia/Tokyo",
			"Australia/Sydney",
			"Asia/Kolkata",
		];

		for (const zone of zones) {
			for (const day of ["2026-01-15", "2026-06-15", "2026-11-05"]) {
				const wall = { day, time: "14:30" };
				const instant = instantFromWallClock(wall, zone);

				if (!instant) throw new Error(`${zone} did not parse`);

				expect(wallClockIn(instant, zone)).toEqual(wall);
			}
		}
	});

	it("shows a half-hour zone correctly", () => {
		const instant = instantFromWallClock(
			{ day: "2026-06-15", time: "14:30" },
			"Asia/Kolkata",
		);

		expect(instant?.toISOString()).toBe("2026-06-15T09:00:00.000Z");
	});
});

describe("naming the zone", () => {
	it("gives the short name a person recognises", () => {
		const instant = new Date("2026-06-15T09:00:00.000Z");

		expect(zoneLabel(instant, "Asia/Dubai")).toBe("GST");
		expect(zoneLabel(instant, "America/New_York")).toBe("EDT");
		expect(zoneLabel(instant, "Europe/London")).toBe("GMT+1");
	});

	it("falls back to the identifier it was given", () => {
		expect(zoneLabel(new Date(), "Mars/Base")).toBe("Mars/Base");
	});

	it("names the company zone the way the company does", () => {
		const winter = new Date("2026-01-15T09:00:00.000Z");
		const summer = new Date("2026-07-15T09:00:00.000Z");

		expect(zoneLabel(winter, "Asia/Dubai")).toBe("GST");
		expect(zoneLabel(summer, "Asia/Dubai")).toBe("GST");
	});
});

describe("writing a moment the same way on a server and in a browser", () => {
	it("spells a short moment without asking the platform for wording", () => {
		const instant = new Date("2026-09-27T09:00:00.000Z");

		expect(shortMoment(instant, "Asia/Dubai")).toBe("Sun 27 Sep, 13:00");
	});

	it("moves the day with the zone", () => {
		const instant = new Date("2026-09-27T20:30:00.000Z");

		expect(shortMoment(instant, "Asia/Dubai")).toBe("Mon 28 Sep, 00:30");
		expect(shortMoment(instant, "America/New_York")).toBe("Sun 27 Sep, 16:30");
	});

	it("writes a full day label with the year", () => {
		const instant = new Date("2026-01-01T04:00:00.000Z");

		expect(dayLabel(instant, "Asia/Dubai")).toBe("Thu 01 Jan 2026");
	});

	it("reads midnight as 00:00, never 24:00", () => {
		const instant = new Date("2026-06-14T20:00:00.000Z");

		expect(clockIn(instant, "Asia/Dubai")).toBe("00:00");
	});

	it("holds a summer clock in a zone that changes", () => {
		const instant = new Date("2026-06-14T12:00:00.000Z");

		expect(clockIn(instant, "Europe/London")).toBe("13:00");
		expect(clockIn(new Date("2026-01-14T12:00:00.000Z"), "Europe/London")).toBe(
			"12:00",
		);
	});
});
