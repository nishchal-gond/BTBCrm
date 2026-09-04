import type { Db } from "./client";
import type { StaffRole } from "./generated/prisma/enums";

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
	"clients.assignMentor",
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
		"clients.convert",
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
		select: { role: true, teamId: true, isActive: true },
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
		teamId: profile.teamId,
		managedTeamIds: teams.map((team) => team.id),
		managedUserIds: [...managedUserIds],
	};
}

export type OwnedRow = {
	salesOwnerId: string | null;
	mentorOwnerId: string | null;
};

function ownsOrManages(actor: Actor, ownerId: string | null): boolean {
	if (ownerId === null) return false;
	return ownerId === actor.userId || actor.managedUserIds.includes(ownerId);
}

export function seesEveryClient(actor: Actor): boolean {
	return actor.role === "ADMIN" || actor.role === "FINANCE";
}

export function canAccessClient(actor: Actor, row: OwnedRow): boolean {
	return (
		seesEveryClient(actor) ||
		ownsOrManages(actor, row.salesOwnerId) ||
		ownsOrManages(actor, row.mentorOwnerId)
	);
}

export function canEditClient(actor: Actor, row: OwnedRow): boolean {
	return (
		actor.role === "ADMIN" ||
		ownsOrManages(actor, row.salesOwnerId) ||
		ownsOrManages(actor, row.mentorOwnerId)
	);
}

export function canAccessFinancials(actor: Actor, row: OwnedRow): boolean {
	if (seesEveryClient(actor)) return true;
	if (isMentorSide(actor.role)) return false;
	return ownsOrManages(actor, row.salesOwnerId);
}

export function visibleOwnerIds(actor: Actor): readonly string[] | null {
	if (seesEveryClient(actor)) return null;
	return [actor.userId, ...actor.managedUserIds];
}
