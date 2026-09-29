import { describe, expect, it } from "bun:test";
import {
	conversionStatusFor,
	judgeTransition,
	statusesForVertical,
	statusesForView,
	viewsForVertical,
} from "../src/client-lifecycle";

describe("the statuses a business line uses", () => {
	it("gives the academy the mentor steps", () => {
		expect(statusesForVertical("ACADEMY")).toContain("MENTOR_ASSIGNED");
		expect(statusesForVertical("ACADEMY")).toContain("STUDENT");
	});

	it("keeps them out of real estate", () => {
		expect(statusesForVertical("REAL_ESTATE")).toEqual([
			"LEAD",
			"QUALIFIED",
			"CONVERTED",
			"LOST",
			"DORMANT",
		]);
	});
});

describe("the three views over one table", () => {
	it("splits the academy into before and after conversion", () => {
		expect(statusesForView("ACADEMY", "leads")).toEqual([
			"LEAD",
			"QUALIFIED",
			"MENTOR_ASSIGNED",
		]);
		expect(statusesForView("ACADEMY", "students")).toEqual([
			"CONVERTED",
			"STUDENT",
		]);
		expect(statusesForView("ACADEMY", "clients")).toEqual(
			statusesForVertical("ACADEMY"),
		);
	});

	it("leaves real estate a Students view with only converted in it", () => {
		expect(statusesForView("REAL_ESTATE", "students")).toEqual(["CONVERTED"]);
		expect(viewsForVertical("REAL_ESTATE")).toEqual(["leads", "clients"]);
	});
});

describe("moving a client", () => {
	it("walks forward one step", () => {
		expect(judgeTransition("ACADEMY", "LEAD", "QUALIFIED")).toEqual({
			allowed: true,
			requiresReason: false,
			adminOnly: false,
		});
	});

	it("refuses a jump", () => {
		expect(judgeTransition("ACADEMY", "LEAD", "STUDENT")).toMatchObject({
			allowed: false,
		});
	});

	it("refuses a status the line does not have", () => {
		expect(
			judgeTransition("REAL_ESTATE", "QUALIFIED", "MENTOR_ASSIGNED"),
		).toMatchObject({ allowed: false });
	});

	it("lets real estate convert straight from qualified", () => {
		expect(conversionStatusFor("REAL_ESTATE")).toBe("QUALIFIED");
		expect(conversionStatusFor("ACADEMY")).toBe("MENTOR_ASSIGNED");
		expect(judgeTransition("REAL_ESTATE", "QUALIFIED", "CONVERTED")).toEqual({
			allowed: true,
			requiresReason: false,
			adminOnly: false,
		});
	});

	it("asks why before closing a client", () => {
		expect(judgeTransition("ACADEMY", "QUALIFIED", "LOST")).toEqual({
			allowed: true,
			requiresReason: true,
			adminOnly: false,
		});
	});

	it("brings a lost client back as a lead and nothing further", () => {
		expect(judgeTransition("ACADEMY", "LOST", "LEAD")).toMatchObject({
			allowed: true,
			requiresReason: true,
		});
		expect(judgeTransition("ACADEMY", "LOST", "QUALIFIED")).toMatchObject({
			allowed: false,
		});
	});

	it("needs an admin to walk a converted client back", () => {
		expect(judgeTransition("ACADEMY", "CONVERTED", "QUALIFIED")).toEqual({
			allowed: true,
			requiresReason: true,
			adminOnly: true,
		});
		expect(judgeTransition("ACADEMY", "QUALIFIED", "LEAD")).toEqual({
			allowed: true,
			requiresReason: true,
			adminOnly: false,
		});
	});

	it("refuses a move to the status it already has", () => {
		expect(judgeTransition("ACADEMY", "LEAD", "LEAD")).toMatchObject({
			allowed: false,
		});
	});
});
