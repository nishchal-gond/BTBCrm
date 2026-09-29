import { onSignedIn } from "@crm/auth";
import {
	type Db,
	Prisma,
	type StaffRole,
	StaffRole as StaffRoles,
	type TeamKind,
} from "@crm/db";
import {
	type Actor,
	capabilitiesOf,
	isStaffRole,
	loadActor,
	verticalsForRole,
} from "@crm/db/access";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	type OnModuleInit,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { requireCapability } from "../trpc/capabilities";
import {
	countsByKey,
	type ListResult,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	AssignTeamInput,
	CreateTeamInput,
	SetStaffActiveInput,
	SetStaffRoleInput,
	SetStaffVerticalsInput,
	StaffListInput,
	StaffMe,
	StaffMember,
	Team,
	UpdateMeInput,
	UpdateTeamInput,
} from "./staff.contracts";

const PROFILE_SELECT = {
	userId: true,
	role: true,
	verticals: true,
	timezone: true,
	phone: true,
	isActive: true,
	createdAt: true,
	user: { select: { name: true, email: true, image: true } },
	team: { select: { id: true, name: true, kind: true } },
} as const;

type ProfileRow = Prisma.StaffProfileGetPayload<{
	select: typeof PROFILE_SELECT;
}>;

const TEAM_SELECT = {
	id: true,
	name: true,
	kind: true,
	isActive: true,
	createdAt: true,
	manager: { select: { userId: true, user: { select: { name: true } } } },
	_count: { select: { members: { where: { isActive: true } } } },
} as const;

type TeamRow = Prisma.TeamGetPayload<{ select: typeof TEAM_SELECT }>;

const SORTABLE: OrderByColumns<Prisma.StaffProfileOrderByWithRelationInput> = {
	name: (dir) => ({ user: { name: dir } }),
	email: (dir) => ({ user: { email: dir } }),
	role: (dir) => ({ role: dir }),
	joinedAt: (dir) => ({ createdAt: dir }),
};

const MANAGER_ROLES_FOR = {
	SALES: new Set<StaffRole>([StaffRoles.SALES_MANAGER, StaffRoles.ADMIN]),
	MENTOR: new Set<StaffRole>([StaffRoles.MENTOR_MANAGER, StaffRoles.ADMIN]),
} satisfies Record<TeamKind, ReadonlySet<StaffRole>>;

function isUniqueViolation(cause: unknown): boolean {
	return (
		cause instanceof Prisma.PrismaClientKnownRequestError &&
		cause.code === "P2002"
	);
}

@Injectable()
export class StaffService implements OnModuleInit {
	private readonly logger = new Logger(StaffService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	onModuleInit(): void {
		onSignedIn(async (user) => {
			await this.ensureProfile(user.id);
		});
	}

	async ensureProfile(userId: string): Promise<ProfileRow> {
		return this.db.$transaction(async (tx) => {
			const existing = await tx.staffProfile.findUnique({
				where: { userId },
				select: PROFILE_SELECT,
			});

			if (existing) return existing;

			const others = await tx.staffProfile.count();
			const role = others === 0 ? StaffRoles.ADMIN : StaffRoles.SALES;

			const created = await tx.staffProfile.create({
				data: { userId, role },
				select: PROFILE_SELECT,
			});

			this.logger.log({ message: "Staff profile created", userId, role });

			return created;
		});
	}

	async me(userId: string): Promise<StaffMe> {
		const row = await this.ensureProfile(userId);
		const actor = await loadActor(this.db, userId);

		return {
			...this.toMember(row, userId),
			capabilities: actor ? capabilitiesOf(actor) : [],
		};
	}

	async directory(
		actor: Actor,
		input: StaffListInput,
	): Promise<ListResult<StaffMember>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, roles] = await Promise.all([
			this.db.staffProfile.findMany({
				where,
				skip,
				take,
				select: PROFILE_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { user: { name: "asc" } }),
			}),
			this.db.staffProfile.count({ where }),
			this.db.staffProfile.groupBy({
				by: ["role"],
				where: {
					...this.statusWhere(input.status),
					...this.searchWhere(input.q),
				},
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map((row) => this.toMember(row, actor.userId)),
			total,
			facetCounts: { role: countsByKey(roles, "role") },
		};
	}

	async setRole(actor: Actor, input: SetStaffRoleInput): Promise<StaffMember> {
		requireCapability(
			actor,
			"users.manage",
			"Only an administrator can change a role.",
		);

		if (input.userId === actor.userId) {
			throw new ForbiddenException(
				"You cannot change your own role. Ask another administrator.",
			);
		}

		const updated = await this.db.$transaction(async (tx) => {
			const target = await this.requireProfile(tx, input.userId);

			if (target.role === StaffRoles.ADMIN && input.role !== StaffRoles.ADMIN) {
				await this.requireAnotherAdmin(tx, target.userId);
			}

			return tx.staffProfile.update({
				where: { userId: target.userId },
				data: { role: input.role },
				select: PROFILE_SELECT,
			});
		});

		this.logger.log({
			message: "Staff role changed",
			userId: actor.userId,
			targetUserId: updated.userId,
			role: updated.role,
		});

		return this.toMember(updated, actor.userId);
	}

	async setActive(
		actor: Actor,
		input: SetStaffActiveInput,
	): Promise<StaffMember> {
		requireCapability(
			actor,
			"users.manage",
			"Only an administrator can deactivate or reactivate a person.",
		);

		if (input.userId === actor.userId) {
			throw new ForbiddenException(
				"You cannot deactivate yourself. Ask another administrator.",
			);
		}

		const updated = await this.db.$transaction(async (tx) => {
			const target = await this.requireProfile(tx, input.userId);

			if (target.role === StaffRoles.ADMIN && !input.isActive) {
				await this.requireAnotherAdmin(tx, target.userId);
			}

			return tx.staffProfile.update({
				where: { userId: target.userId },
				data: { isActive: input.isActive },
				select: PROFILE_SELECT,
			});
		});

		this.logger.log({
			message: updated.isActive
				? "Staff member reactivated"
				: "Staff member deactivated",
			userId: actor.userId,
			targetUserId: updated.userId,
		});

		return this.toMember(updated, actor.userId);
	}

	async assignTeam(actor: Actor, input: AssignTeamInput): Promise<StaffMember> {
		requireCapability(
			actor,
			"users.manage",
			"Only an administrator can move a person between teams.",
		);

		const updated = await this.db.$transaction(async (tx) => {
			const target = await this.requireProfile(tx, input.userId);

			if (input.teamId !== null) {
				const team = await tx.team.findFirst({
					where: { id: input.teamId, isActive: true },
					select: { id: true },
				});

				if (!team) {
					throw new NotFoundException("That team does not exist.");
				}
			}

			return tx.staffProfile.update({
				where: { userId: target.userId },
				data: { teamId: input.teamId },
				select: PROFILE_SELECT,
			});
		});

		return this.toMember(updated, actor.userId);
	}

	async setVerticals(
		actor: Actor,
		input: SetStaffVerticalsInput,
	): Promise<StaffMember> {
		requireCapability(
			actor,
			"users.manage",
			"Only an administrator can change which business lines a person works in.",
		);

		const updated = await this.db.$transaction(async (tx) => {
			const target = await this.requireProfile(tx, input.userId);

			return tx.staffProfile.update({
				where: { userId: target.userId },
				data: { verticals: input.verticals },
				select: PROFILE_SELECT,
			});
		});

		this.logger.log({
			message: "Business lines changed",
			userId: actor.userId,
			targetUserId: updated.userId,
			verticals: input.verticals,
		});

		return this.toMember(updated, actor.userId);
	}

	async updateMe(actor: Actor, input: UpdateMeInput): Promise<StaffMember> {
		const updated = await this.db.staffProfile.update({
			where: { userId: actor.userId },
			data: { timezone: input.timezone, phone: input.phone || null },
			select: PROFILE_SELECT,
		});

		return this.toMember(updated, actor.userId);
	}

	async teams(): Promise<Team[]> {
		const rows = await this.db.team.findMany({
			select: TEAM_SELECT,
			orderBy: [{ isActive: "desc" }, { name: "asc" }],
		});

		return rows.map((row) => this.toTeam(row));
	}

	async createTeam(actor: Actor, input: CreateTeamInput): Promise<Team> {
		requireCapability(
			actor,
			"teams.manage",
			"Only an administrator can create a team.",
		);

		try {
			const row = await this.db.$transaction(async (tx) => {
				await this.requireManagerFor(tx, input.kind, input.managerId);

				return tx.team.create({
					data: {
						name: input.name,
						kind: input.kind,
						managerId: input.managerId,
					},
					select: TEAM_SELECT,
				});
			});

			this.logger.log({
				message: "Team created",
				userId: actor.userId,
				teamId: row.id,
			});

			return this.toTeam(row);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException("A team with that name already exists.");
			}
			throw error;
		}
	}

	async updateTeam(actor: Actor, input: UpdateTeamInput): Promise<Team> {
		requireCapability(
			actor,
			"teams.manage",
			"Only an administrator can change a team.",
		);

		try {
			const row = await this.db.$transaction(async (tx) => {
				const team = await tx.team.findUnique({
					where: { id: input.id },
					select: { id: true, kind: true },
				});

				if (!team) {
					throw new NotFoundException("That team does not exist.");
				}

				if (input.managerId !== undefined) {
					await this.requireManagerFor(tx, team.kind, input.managerId);
				}

				return tx.team.update({
					where: { id: team.id },
					data: {
						name: input.name,
						managerId: input.managerId,
						isActive: input.isActive,
					},
					select: TEAM_SELECT,
				});
			});

			return this.toTeam(row);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException("A team with that name already exists.");
			}
			throw error;
		}
	}

	private buildWhere(input: StaffListInput): Prisma.StaffProfileWhereInput {
		const roles = input.role.filter(isStaffRole);

		const where: Prisma.StaffProfileWhereInput = {
			...this.statusWhere(input.status),
			...this.searchWhere(input.q),
		};

		if (roles.length > 0) {
			where.role = { in: roles };
		}

		return where;
	}

	private statusWhere(
		status: StaffListInput["status"],
	): Prisma.StaffProfileWhereInput {
		if (status === "all") return {};
		return { isActive: status === "active" };
	}

	private searchWhere(q: string): Prisma.StaffProfileWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			user: {
				OR: [
					{ name: { contains: term, mode: "insensitive" } },
					{ email: { contains: term, mode: "insensitive" } },
				],
			},
		};
	}

	private async requireProfile(
		tx: Prisma.TransactionClient,
		userId: string,
	): Promise<ProfileRow> {
		const target = await tx.staffProfile.findUnique({
			where: { userId },
			select: PROFILE_SELECT,
		});

		if (!target) {
			throw new NotFoundException("That person has no staff profile.");
		}

		return target;
	}

	private async requireAnotherAdmin(
		tx: Prisma.TransactionClient,
		exceptUserId: string,
	): Promise<void> {
		const admins = await tx.$queryRaw<{ userId: string }[]>`
			SELECT "userId" FROM "staffProfile"
			WHERE "role" = 'ADMIN' AND "isActive" = true AND "userId" <> ${exceptUserId}
			FOR UPDATE
		`;

		if (admins.length === 0) {
			throw new ForbiddenException(
				"The academy needs an administrator. Make someone else an administrator first.",
			);
		}
	}

	private async requireManagerFor(
		tx: Prisma.TransactionClient,
		kind: TeamKind,
		managerId: string | null,
	): Promise<void> {
		if (managerId === null) return;

		const manager = await tx.staffProfile.findUnique({
			where: { userId: managerId },
			select: { role: true, isActive: true },
		});

		if (!manager?.isActive) {
			throw new NotFoundException("That manager has no active staff profile.");
		}

		if (!MANAGER_ROLES_FOR[kind].has(manager.role)) {
			throw new BadRequestException(
				kind === "SALES"
					? "A sales team is managed by a sales manager or an administrator."
					: "A mentor team is managed by a mentor manager or an administrator.",
			);
		}
	}

	private toMember(row: ProfileRow, viewerId: string): StaffMember {
		return {
			userId: row.userId,
			name: row.user.name,
			email: row.user.email,
			image: row.user.image,
			role: row.role,
			verticals: [...verticalsForRole(row.role, row.verticals)],
			team: row.team,
			timezone: row.timezone,
			phone: row.phone,
			isActive: row.isActive,
			isViewer: row.userId === viewerId,
			joinedAt: row.createdAt.toISOString(),
		};
	}

	private toTeam(row: TeamRow): Team {
		return {
			id: row.id,
			name: row.name,
			kind: row.kind,
			isActive: row.isActive,
			manager: row.manager
				? { userId: row.manager.userId, name: row.manager.user.name }
				: null,
			memberCount: row._count.members,
			createdAt: row.createdAt.toISOString(),
		};
	}
}
