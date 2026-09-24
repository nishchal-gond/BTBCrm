import type { ClientStatus, Vertical } from "./generated/prisma/enums";

export const CLIENT_STATUSES = [
	"LEAD",
	"QUALIFIED",
	"MENTOR_ASSIGNED",
	"CONVERTED",
	"STUDENT",
	"LOST",
	"DORMANT",
] as const satisfies readonly ClientStatus[];

const ACADEMY_STATUSES = CLIENT_STATUSES;

const REAL_ESTATE_STATUSES = [
	"LEAD",
	"QUALIFIED",
	"CONVERTED",
	"LOST",
	"DORMANT",
] as const satisfies readonly ClientStatus[];

export function statusesForVertical(
	vertical: Vertical,
): readonly ClientStatus[] {
	return vertical === "ACADEMY" ? ACADEMY_STATUSES : REAL_ESTATE_STATUSES;
}

export function isStatusInVertical(
	vertical: Vertical,
	status: ClientStatus,
): boolean {
	return statusesForVertical(vertical).includes(status);
}

export const CLIENT_VIEWS = ["leads", "clients", "students"] as const;

export type ClientView = (typeof CLIENT_VIEWS)[number];

const PRE_CONVERSION: ReadonlySet<ClientStatus> = new Set([
	"LEAD",
	"QUALIFIED",
	"MENTOR_ASSIGNED",
]);

const POST_CONVERSION: ReadonlySet<ClientStatus> = new Set([
	"CONVERTED",
	"STUDENT",
]);

export function viewsForVertical(vertical: Vertical): readonly ClientView[] {
	return vertical === "ACADEMY" ? CLIENT_VIEWS : ["leads", "clients"];
}

export function statusesForView(
	vertical: Vertical,
	view: ClientView,
): readonly ClientStatus[] {
	const inVertical = statusesForVertical(vertical);

	if (view === "clients") return inVertical;

	const wanted = view === "leads" ? PRE_CONVERSION : POST_CONVERSION;
	return inVertical.filter((status) => wanted.has(status));
}

const CLOSED: ReadonlySet<ClientStatus> = new Set(["LOST", "DORMANT"]);

const FORWARD = {
	LEAD: ["QUALIFIED"],
	QUALIFIED: ["MENTOR_ASSIGNED", "CONVERTED"],
	MENTOR_ASSIGNED: ["CONVERTED"],
	CONVERTED: ["STUDENT"],
	STUDENT: [],
	LOST: [],
	DORMANT: [],
} as const satisfies Record<ClientStatus, readonly ClientStatus[]>;

const RANK = {
	LEAD: 0,
	QUALIFIED: 1,
	MENTOR_ASSIGNED: 2,
	CONVERTED: 3,
	STUDENT: 4,
	LOST: -1,
	DORMANT: -1,
} as const satisfies Record<ClientStatus, number>;

export type TransitionVerdict =
	| { allowed: true; requiresReason: boolean; adminOnly: boolean }
	| { allowed: false; because: string };

export function judgeTransition(
	vertical: Vertical,
	from: ClientStatus,
	to: ClientStatus,
): TransitionVerdict {
	if (from === to) {
		return { allowed: false, because: "The client already has that status." };
	}

	if (!isStatusInVertical(vertical, to)) {
		return {
			allowed: false,
			because:
				vertical === "ACADEMY"
					? `${to} is not a status the Trading Academy uses.`
					: `${to} belongs to the Trading Academy, not Real Estate.`,
		};
	}

	if (CLOSED.has(to)) {
		return { allowed: true, requiresReason: true, adminOnly: false };
	}

	if (CLOSED.has(from)) {
		if (to !== "LEAD") {
			return {
				allowed: false,
				because:
					"A lost or dormant client comes back as a lead, not further along.",
			};
		}

		return { allowed: true, requiresReason: true, adminOnly: false };
	}

	const next: readonly ClientStatus[] = FORWARD[from];

	if (next.includes(to)) {
		return { allowed: true, requiresReason: false, adminOnly: false };
	}

	if (RANK[to] < RANK[from]) {
		return {
			allowed: true,
			requiresReason: true,
			adminOnly: RANK[from] >= RANK.CONVERTED,
		};
	}

	return {
		allowed: false,
		because: `A client moves to ${to} one step at a time, not straight from ${from}.`,
	};
}

export function conversionStatusFor(vertical: Vertical): ClientStatus {
	return vertical === "ACADEMY" ? "MENTOR_ASSIGNED" : "QUALIFIED";
}
