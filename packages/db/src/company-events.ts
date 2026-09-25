import { type Actor, can, isMentorSide, isSalesSide } from "./access";
import type {
	CompanyEventType,
	EventResponse,
	StaffRole,
} from "./generated/prisma/enums";

export const EVENT_TYPES = [
	"SALES_CALL",
	"CLIENT_APPOINTMENT",
	"MENTOR_SESSION",
	"REVIEW",
	"ONBOARDING",
	"COMPANY_MEETING",
	"INTERNAL_TRAINING",
	"OTHER",
] as const satisfies readonly CompanyEventType[];

export const EVENT_RESPONSES = [
	"PENDING",
	"ACCEPTED",
	"DECLINED",
	"TENTATIVE",
] as const satisfies readonly EventResponse[];

export const COMPANY_EVENT_TYPES: ReadonlySet<CompanyEventType> = new Set([
	"COMPANY_MEETING",
	"INTERNAL_TRAINING",
]);

export const SALES_EVENT_TYPES: ReadonlySet<CompanyEventType> = new Set([
	"SALES_CALL",
	"CLIENT_APPOINTMENT",
]);

export const MENTOR_EVENT_TYPES: ReadonlySet<CompanyEventType> = new Set([
	"MENTOR_SESSION",
	"REVIEW",
]);

export const SHARED_EVENT_TYPES: ReadonlySet<CompanyEventType> = new Set([
	"ONBOARDING",
	"OTHER",
]);

export function isCompanyEventType(type: CompanyEventType): boolean {
	return COMPANY_EVENT_TYPES.has(type);
}

export function roleCreatesEventType(
	role: StaffRole,
	type: CompanyEventType,
): boolean {
	if (role === "ADMIN") return true;
	if (COMPANY_EVENT_TYPES.has(type)) return false;
	if (SHARED_EVENT_TYPES.has(type)) {
		return isSalesSide(role) || isMentorSide(role);
	}
	if (SALES_EVENT_TYPES.has(type)) return isSalesSide(role);
	return isMentorSide(role);
}

export function canCreateEventType(
	actor: Actor,
	type: CompanyEventType,
): boolean {
	if (COMPANY_EVENT_TYPES.has(type)) {
		return can(actor, "calendar.createCompanyEvent");
	}

	return roleCreatesEventType(actor.role, type);
}

export function eventTypesFor(actor: Actor): CompanyEventType[] {
	return EVENT_TYPES.filter((type) => canCreateEventType(actor, type));
}

export type EventTimes = { startsAt: Date; endsAt: Date };

export type EventVerdict =
	| { allowed: true }
	| { allowed: false; because: string };

export const MAX_EVENT_HOURS = 24;

export function judgeEventTimes(times: EventTimes): EventVerdict {
	if (Number.isNaN(times.startsAt.getTime())) {
		return { allowed: false, because: "The start is not a real moment." };
	}

	if (Number.isNaN(times.endsAt.getTime())) {
		return { allowed: false, because: "The end is not a real moment." };
	}

	if (times.endsAt.getTime() <= times.startsAt.getTime()) {
		return { allowed: false, because: "An event ends after it starts." };
	}

	const hours =
		(times.endsAt.getTime() - times.startsAt.getTime()) / (60 * 60 * 1000);

	if (hours > MAX_EVENT_HOURS) {
		return {
			allowed: false,
			because: `One event covers at most ${MAX_EVENT_HOURS} hours. Split a longer booking.`,
		};
	}

	return { allowed: true };
}

export function overlaps(a: EventTimes, b: EventTimes): boolean {
	return (
		a.startsAt.getTime() < b.endsAt.getTime() &&
		b.startsAt.getTime() < a.endsAt.getTime()
	);
}
