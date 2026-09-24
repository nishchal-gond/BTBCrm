import type { Db } from "./client";
import type {
	CompanyEventType,
	StaffRole,
	Vertical,
} from "./generated/prisma/enums";

export const VERTICALS = [
	"ACADEMY",
	"REAL_ESTATE",
] as const satisfies readonly Vertical[];

export function isVertical(value: string): value is Vertical {
	return (VERTICALS as readonly string[]).includes(value);
}

export const STAFF_ROLES = [
	"ADMIN",
	"SALES_MANAGER",
	"SALES",
	"MENTOR_MANAGER",
	"MENTOR",
	"FINANCE",
] as const satisfies readonly StaffRole[];

export function isStaffRole(value: string): value is StaffRole {
	return (STAFF_ROLES as readonly string[]).includes(value);
}

export function isManagerRole(role: StaffRole): boolean {
	return role === "SALES_MANAGER" || role === "MENTOR_MANAGER";
}

export function isSalesSide(role: StaffRole): boolean {
	return role === "SALES" || role === "SALES_MANAGER";
}

export function isMentorSide(role: StaffRole): boolean {
	return role === "MENTOR" || role === "MENTOR_MANAGER";
}

export const CAPABILITIES = [
	"clients.create",
	"clients.edit",
	"clients.convert",
	"clients.reverseConversion",
	"clients.assignMentor",
	"clients.reassignMentor",
	"clients.assignSalesOwner",
	"deposits.view",
	"deposits.record",
	"deposits.verify",
	"students.manage",
	"programs.manage",
	"calendar.createCompanyEvent",
	"team.view",
	"users.manage",
	"teams.manage",
	"audit.viewGlobal",
	"settings.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const MATRIX = {
	ADMIN: new Set<Capability>(CAPABILITIES),
	SALES_MANAGER: new Set<Capability>([
		"clients.create",
		"clients.edit",
		"clients.assignMentor",
		"clients.assignSalesOwner",
		"deposits.view",
		"deposits.record",
		"team.view",
	]),
	SALES: new Set<Capability>([
		"clients.create",
		"clients.edit",
		"clients.assignMentor",
		"deposits.view",
		"deposits.record",
	]),
	MENTOR_MANAGER: new Set<Capability>([
		"clients.edit",
		"clients.convert",
		"students.manage",
		"team.view",
	]),
	MENTOR: new Set<Capability>([
		"clients.edit",
		"clients.convert",
		"students.manage",
	]),
	FINANCE: new Set<Capability>([
		"deposits.view",
		"deposits.record",
		"deposits.verify",
	]),
} satisfies Record<StaffRole, ReadonlySet<Capability>>;

export type Actor = {
	userId: string;
	role: StaffRole;
	verticals: readonly Vertical[];
	teamId: string | null;
	managedTeamIds: readonly string[];
	managedUserIds: readonly string[];
};

export function can(actor: Actor | null, capability: Capability): boolean {
	return actor ? MATRIX[actor.role].has(capability) : false;
}

export function capabilitiesOf(actor: Actor): Capability[] {
	return CAPABILITIES.filter((capability) => can(actor, capability));
}

export type ActorReader = Pick<Db, "staffProfile" | "team">;

export async function loadActor(
	db: ActorReader,
	userId: string,
): Promise<Actor | null> {
	const profile = await db.staffProfile.findUnique({
		where: { userId },
		select: { role: true, verticals: true, teamId: true, isActive: true },
	});

	if (!profile?.isActive) return null;

	const ownTeam =
		isManagerRole(profile.role) && profile.teamId
			? [{ id: profile.teamId }]
			: [];

	const teams = await db.team.findMany({
		where: { isActive: true, OR: [{ managerId: userId }, ...ownTeam] },
		select: {
			id: true,
			members: { where: { isActive: true }, select: { userId: true } },
		},
	});

	const managedUserIds = new Set<string>();
	for (const team of teams) {
		for (const member of team.members) {
			if (member.userId !== userId) managedUserIds.add(member.userId);
		}
	}

	return {
		userId,
		role: profile.role,
		verticals: verticalsForRole(profile.role, profile.verticals),
		teamId: profile.teamId,
		managedTeamIds: teams.map((team) => team.id),
		managedUserIds: [...managedUserIds],
	};
}

export type OwnedRow = {
	vertical: Vertical;
	salesOwnerId: string | null;
	mentorOwnerId: string | null;
};

export function verticalsForRole(
	role: StaffRole,
	verticals: readonly Vertical[],
): readonly Vertical[] {
	return role === "ADMIN" ? VERTICALS : verticals;
}

export function verticalsOf(actor: Actor): readonly Vertical[] {
	return verticalsForRole(actor.role, actor.verticals);
}

export function roleWorksVertical(
	role: StaffRole,
	verticals: readonly Vertical[],
	vertical: Vertical,
): boolean {
	return verticalsForRole(role, verticals).includes(vertical);
}

export type OwnerSide = "sales" | "mentor";

export function roleOwnsSide(role: StaffRole, side: OwnerSide): boolean {
	if (role === "ADMIN") return true;
	return side === "sales" ? isSalesSide(role) : isMentorSide(role);
}

export function canAccessVertical(actor: Actor, vertical: Vertical): boolean {
	return verticalsOf(actor).includes(vertical);
}

function ownsOrManages(actor: Actor, ownerId: string | null): boolean {
	if (ownerId === null) return false;
	return ownerId === actor.userId || actor.managedUserIds.includes(ownerId);
}

export function seesEveryClient(actor: Actor): boolean {
	return actor.role === "ADMIN" || actor.role === "FINANCE";
}

export function canAccessClient(actor: Actor, row: OwnedRow): boolean {
	if (!canAccessVertical(actor, row.vertical)) return false;

	return (
		seesEveryClient(actor) ||
		ownsOrManages(actor, row.salesOwnerId) ||
		ownsOrManages(actor, row.mentorOwnerId)
	);
}

export function canEditClient(actor: Actor, row: OwnedRow): boolean {
	if (!canAccessVertical(actor, row.vertical)) return false;

	return (
		actor.role === "ADMIN" ||
		ownsOrManages(actor, row.salesOwnerId) ||
		ownsOrManages(actor, row.mentorOwnerId)
	);
}

export function canAccessFinancials(actor: Actor, row: OwnedRow): boolean {
	if (!canAccessVertical(actor, row.vertical)) return false;
	if (seesEveryClient(actor)) return true;
	if (isMentorSide(actor.role)) return false;
	return ownsOrManages(actor, row.salesOwnerId);
}

export function visibleOwnerIds(actor: Actor): readonly string[] | null {
	if (seesEveryClient(actor)) return null;
	return [actor.userId, ...actor.managedUserIds];
}

export type ClientScope = {
	vertical: { in: Vertical[] };
	OR?: [
		{ salesOwnerId: { in: string[] } },
		{ mentorOwnerId: { in: string[] } },
	];
};

export const COMPANY_WIDE_EVENT_TYPES = [
	"COMPANY_MEETING",
	"INTERNAL_TRAINING",
] as const satisfies readonly CompanyEventType[];

export type EventScope =
	| Record<string, never>
	| {
			OR: [
				{ organizerId: { in: string[] } },
				{ attendees: { some: { userId: string } } },
				{ eventType: { in: CompanyEventType[] } },
				{ client: ClientScope },
			];
	  };

export function eventScope(actor: Actor): EventScope {
	if (actor.role === "ADMIN") return {};

	const owners = visibleOwnerIds(actor) ?? [actor.userId];

	return {
		OR: [
			{ organizerId: { in: [...owners] } },
			{ attendees: { some: { userId: actor.userId } } },
			{ eventType: { in: [...COMPANY_WIDE_EVENT_TYPES] } },
			{ client: clientScope(actor) },
		],
	};
}

export function clientScope(actor: Actor, vertical?: Vertical): ClientScope {
	const allowed = vertical
		? verticalsOf(actor).filter((one) => one === vertical)
		: verticalsOf(actor);

	const scope: ClientScope = { vertical: { in: [...allowed] } };
	const owners = visibleOwnerIds(actor);

	if (owners === null) return scope;

	return {
		...scope,
		OR: [
			{ salesOwnerId: { in: [...owners] } },
			{ mentorOwnerId: { in: [...owners] } },
		],
	};
}
