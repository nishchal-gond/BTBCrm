import { describe, expect, it } from "bun:test";
import {
	isClosedEnrollment,
	isOpenEnrollment,
	judgeEnrollmentMove,
	progressPercent,
	weeksElapsed,
} from "../src/enrollment";

const ENROLLED = new Date("2026-01-01T00:00:00.000Z");

function weeksAfter(weeks: number): Date {
	return new Date(ENROLLED.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

describe("whether an enrolment is still running", () => {
	it("counts active and paused as open", () => {
		expect(isOpenEnrollment("ACTIVE")).toBe(true);
		expect(isOpenEnrollment("PAUSED")).toBe(true);
		expect(isOpenEnrollment("COMPLETED")).toBe(false);
		expect(isOpenEnrollment("WITHDRAWN")).toBe(false);
	});

	it("counts completed and withdrawn as closed", () => {
		expect(isClosedEnrollment("COMPLETED")).toBe(true);
		expect(isClosedEnrollment("WITHDRAWN")).toBe(true);
		expect(isClosedEnrollment("ACTIVE")).toBe(false);
	});
});

describe("moving an enrolment", () => {
	it("lets a running enrolment pause, finish or be withdrawn", () => {
		expect(judgeEnrollmentMove("ACTIVE", "PAUSED")).toEqual({
			allowed: true,
			completes: false,
		});
		expect(judgeEnrollmentMove("ACTIVE", "COMPLETED")).toEqual({
			allowed: true,
			completes: true,
		});
		expect(judgeEnrollmentMove("PAUSED", "ACTIVE")).toEqual({
			allowed: true,
			completes: false,
		});
	});

	it("refuses to reopen history", () => {
		for (const from of ["COMPLETED", "WITHDRAWN"] as const) {
			expect(judgeEnrollmentMove(from, "ACTIVE")).toMatchObject({
				allowed: false,
			});
		}
	});

	it("refuses a move to the status it already has", () => {
		expect(judgeEnrollmentMove("ACTIVE", "ACTIVE")).toMatchObject({
			allowed: false,
		});
	});
});

describe("how far through a programme a student is", () => {
	const twelveWeeks = {
		enrolledAt: ENROLLED,
		durationWeeks: 12,
		completedAt: null,
		status: "ACTIVE" as const,
	};

	it("counts whole weeks, never a fraction", () => {
		expect(weeksElapsed(twelveWeeks, weeksAfter(0))).toBe(0);
		expect(weeksElapsed(twelveWeeks, weeksAfter(3.9))).toBe(3);
		expect(weeksElapsed(twelveWeeks, weeksAfter(6))).toBe(6);
	});

	it("never goes backwards when a clock is behind", () => {
		expect(weeksElapsed(twelveWeeks, weeksAfter(-2))).toBe(0);
	});

	it("reads as a percentage of the programme", () => {
		expect(progressPercent(twelveWeeks, weeksAfter(0))).toBe(0);
		expect(progressPercent(twelveWeeks, weeksAfter(6))).toBe(50);
	});

	it("stops at 99 until the enrolment is actually finished", () => {
		expect(progressPercent(twelveWeeks, weeksAfter(12))).toBe(99);
		expect(progressPercent(twelveWeeks, weeksAfter(40))).toBe(99);
	});

	it("is 100 only when the enrolment is complete", () => {
		expect(
			progressPercent(
				{
					...twelveWeeks,
					status: "COMPLETED",
					completedAt: weeksAfter(10),
				},
				weeksAfter(40),
			),
		).toBe(100);
	});

	it("measures a finished enrolment to its end, not to now", () => {
		expect(
			weeksElapsed(
				{ ...twelveWeeks, status: "COMPLETED", completedAt: weeksAfter(10) },
				weeksAfter(40),
			),
		).toBe(10);
	});

	it("does not divide by a programme of no length", () => {
		expect(
			progressPercent({ ...twelveWeeks, durationWeeks: 0 }, weeksAfter(4)),
		).toBe(0);
	});
});
