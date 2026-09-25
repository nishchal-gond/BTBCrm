import type { EnrollmentStatus } from "./generated/prisma/enums";

export const ENROLLMENT_STATUSES = [
	"ACTIVE",
	"PAUSED",
	"COMPLETED",
	"WITHDRAWN",
] as const satisfies readonly EnrollmentStatus[];

const OPEN: ReadonlySet<EnrollmentStatus> = new Set(["ACTIVE", "PAUSED"]);

const CLOSED: ReadonlySet<EnrollmentStatus> = new Set([
	"COMPLETED",
	"WITHDRAWN",
]);

export function isOpenEnrollment(status: EnrollmentStatus): boolean {
	return OPEN.has(status);
}

export function isClosedEnrollment(status: EnrollmentStatus): boolean {
	return CLOSED.has(status);
}

export type EnrollmentVerdict =
	| { allowed: true; completes: boolean }
	| { allowed: false; because: string };

export function judgeEnrollmentMove(
	from: EnrollmentStatus,
	to: EnrollmentStatus,
): EnrollmentVerdict {
	if (from === to) {
		return {
			allowed: false,
			because: "The enrolment already has that status.",
		};
	}

	if (CLOSED.has(from)) {
		return {
			allowed: false,
			because:
				"A finished enrolment is history. Enrol the student again rather than reopening it.",
		};
	}

	return { allowed: true, completes: to === "COMPLETED" };
}

export function isEnrollmentClosed(closedAt: Date | null): boolean {
	return closedAt !== null;
}

export type ProgressPoint = {
	enrolledAt: Date;
	durationWeeks: number;
	completedAt: Date | null;
	status: EnrollmentStatus;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weeksElapsed(point: ProgressPoint, now: Date): number {
	const end = point.completedAt ?? now;
	const weeks = (end.getTime() - point.enrolledAt.getTime()) / WEEK_MS;
	return Math.max(0, Math.floor(weeks));
}

export function progressPercent(point: ProgressPoint, now: Date): number {
	if (point.status === "COMPLETED") return 100;
	if (point.durationWeeks <= 0) return 0;

	const done = weeksElapsed(point, now) / point.durationWeeks;
	return Math.min(99, Math.max(0, Math.round(done * 100)));
}
