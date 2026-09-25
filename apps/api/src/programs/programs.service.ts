import { type Db, Prisma, withActor } from "@crm/db";
import {
	type Actor,
	can,
	canAccessVertical,
	canEditClient,
	clientScope,
	roleOwnsSide,
} from "@crm/db/access";
import { formatFils, isAmount, parseAmount } from "@crm/db/deposit-ledger";
import {
	ENROLLMENT_STATUSES,
	isOpenEnrollment,
	judgeEnrollmentMove,
	progressPercent,
	weeksElapsed,
} from "@crm/db/enrollment";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { requireCapability } from "../trpc/capabilities";
import {
	type ListResult,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CreateProgramInput,
	EnrollInput,
	Enrollment,
	MoveEnrollmentInput,
	Program,
	ProgramListInput,
	ReassignMentorInput,
	UpdateProgramInput,
} from "./programs.contracts";

const PROGRAM_SELECT = {
	id: true,
	code: true,
	name: true,
	description: true,
	durationWeeks: true,
	priceAed: true,
	isActive: true,
	createdAt: true,
	_count: { select: { enrollments: true } },
} as const;

type ProgramShape = Prisma.ProgramGetPayload<{
	select: typeof PROGRAM_SELECT;
}>;

const ENROLLMENT_SELECT = {
	id: true,
	cohort: true,
	status: true,
	enrolledAt: true,
	completedAt: true,
	closedAt: true,
	notes: true,
	program: {
		select: { id: true, code: true, name: true, durationWeeks: true },
	},
	mentor: { select: { userId: true, user: { select: { name: true } } } },
	createdBy: { select: { userId: true, user: { select: { name: true } } } },
	client: {
		select: {
			id: true,
			clientRef: true,
			firstName: true,
			lastName: true,
			vertical: true,
			status: true,
			salesOwnerId: true,
			mentorOwnerId: true,
		},
	},
} as const;

type EnrollmentShape = Prisma.EnrollmentGetPayload<{
	select: typeof ENROLLMENT_SELECT;
}>;

const SORTABLE: OrderByColumns<Prisma.ProgramOrderByWithRelationInput> = {
	code: (dir) => ({ code: dir }),
	name: (dir) => ({ name: dir }),
	durationWeeks: (dir) => ({ durationWeeks: dir }),
	priceAed: (dir) => ({ priceAed: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
};

function person(value: { userId: string; user: { name: string } } | null) {
	return value ? { userId: value.userId, name: value.user.name } : null;
}

@Injectable()
export class ProgramsService {
	private readonly logger = new Logger(ProgramsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	private requireAcademy(actor: Actor): void {
		if (canAccessVertical(actor, "ACADEMY")) return;

		throw new ForbiddenException(
			"Programmes belong to the Trading Academy, and you do not work that line.",
		);
	}

	workspace(actor: Actor) {
		this.requireAcademy(actor);

		return {
			canManagePrograms: can(actor, "programs.manage"),
			canManageStudents: can(actor, "students.manage"),
			statuses: [...ENROLLMENT_STATUSES],
		};
	}

	private program(row: ProgramShape, open: number): Program {
		return {
			id: row.id,
			code: row.code,
			name: row.name,
			description: row.description,
			durationWeeks: row.durationWeeks,
			priceAed: row.priceAed.toFixed(2),
			isActive: row.isActive,
			activeEnrollments: open,
			totalEnrollments: row._count.enrollments,
			createdAt: row.createdAt.toISOString(),
		};
	}

	async list(
		actor: Actor,
		input: ProgramListInput,
	): Promise<ListResult<Program>> {
		this.requireAcademy(actor);

		const and: Prisma.ProgramWhereInput[] = [];

		if (input.status !== "all") {
			and.push({ isActive: input.status === "active" });
		}

		const q = input.q.trim();

		if (q.length > 0) {
			and.push({
				OR: [
					{ code: { contains: q, mode: "insensitive" } },
					{ name: { contains: q, mode: "insensitive" } },
				],
			});
		}

		const where: Prisma.ProgramWhereInput = { AND: and };
		const { skip, take } = paginate(input);

		const [rows, total, byStatus] = await Promise.all([
			this.db.program.findMany({
				where,
				select: PROGRAM_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { code: "asc" }),
				skip,
				take,
			}),
			this.db.program.count({ where }),
			this.db.program.groupBy({
				by: ["isActive"],
				where: { AND: [] },
				_count: { _all: true },
			}),
		]);

		const openCounts = await this.db.enrollment.groupBy({
			by: ["programId"],
			where: { closedAt: null, programId: { in: rows.map((row) => row.id) } },
			_count: { _all: true },
		});

		const open = new Map(
			openCounts.map((row) => [row.programId, row._count._all]),
		);

		return {
			rows: rows.map((row) => this.program(row, open.get(row.id) ?? 0)),
			total,
			facetCounts: {
				status: Object.fromEntries(
					byStatus.map((row) => [
						row.isActive ? "active" : "retired",
						row._count._all,
					]),
				),
			},
		};
	}

	async options(actor: Actor) {
		this.requireAcademy(actor);

		const rows = await this.db.program.findMany({
			where: { isActive: true },
			select: {
				id: true,
				code: true,
				name: true,
				durationWeeks: true,
				priceAed: true,
			},
			orderBy: { code: "asc" },
		});

		return rows.map((row) => ({
			...row,
			priceAed: row.priceAed.toFixed(2),
		}));
	}

	private price(input: string): Prisma.Decimal {
		const parsed = parseAmount(input);

		if (!isAmount(parsed)) throw new BadRequestException(parsed.because);

		if (parsed.fils < 0) {
			throw new BadRequestException("A programme price is never negative.");
		}

		return new Prisma.Decimal(formatFils(parsed.fils));
	}

	async create(actor: Actor, input: CreateProgramInput): Promise<Program> {
		requireCapability(
			actor,
			"programs.manage",
			"Programmes are an administrator's to define.",
		);
		this.requireAcademy(actor);

		try {
			const created = await this.db.program.create({
				data: {
					code: input.code,
					name: input.name,
					description: input.description,
					durationWeeks: input.durationWeeks,
					priceAed: this.price(input.priceAed),
				},
				select: PROGRAM_SELECT,
			});

			this.logger.log({ message: "Programme created", code: created.code });

			return this.program(created, 0);
		} catch (cause) {
			if (
				cause instanceof Prisma.PrismaClientKnownRequestError &&
				cause.code === "P2002"
			) {
				throw new ConflictException(
					`A programme with the code ${input.code} already exists.`,
				);
			}

			throw cause;
		}
	}

	async update(actor: Actor, input: UpdateProgramInput): Promise<Program> {
		requireCapability(
			actor,
			"programs.manage",
			"Programmes are an administrator's to change.",
		);

		const { id, priceAed, ...rest } = input;

		const existing = await this.db.program.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existing) throw new NotFoundException("No such programme.");

		if (rest.isActive === false) {
			const running = await this.db.enrollment.count({
				where: { programId: id, status: { in: ["ACTIVE", "PAUSED"] } },
			});

			if (running > 0) {
				throw new ConflictException(
					`${running} ${running === 1 ? "student is" : "students are"} still on this programme. Finish or withdraw them before retiring it.`,
				);
			}
		}

		const data: Prisma.ProgramUpdateInput = { ...rest };

		if (priceAed !== undefined) data.priceAed = this.price(priceAed);

		const updated = await this.db.program.update({
			where: { id },
			data,
			select: PROGRAM_SELECT,
		});

		const open = await this.db.enrollment.count({
			where: { programId: id, closedAt: null },
		});

		return this.program(updated, open);
	}

	private enrollment(
		actor: Actor,
		row: EnrollmentShape,
		now: Date,
	): Enrollment {
		const point = {
			enrolledAt: row.enrolledAt,
			durationWeeks: row.program.durationWeeks,
			completedAt: row.completedAt,
			status: row.status,
		};

		return {
			id: row.id,
			clientRef: row.client.clientRef,
			clientName: `${row.client.firstName} ${row.client.lastName}`,
			program: row.program,
			mentor: person(row.mentor),
			cohort: row.cohort,
			status: row.status,
			enrolledAt: row.enrolledAt.toISOString(),
			completedAt: row.completedAt?.toISOString() ?? null,
			notes: row.notes,
			createdBy: person(row.createdBy),
			weeksElapsed: weeksElapsed(point, now),
			progressPercent: progressPercent(point, now),
			canManage:
				can(actor, "students.manage") && canEditClient(actor, row.client),
		};
	}

	private async clientFor(actor: Actor, clientRef: string) {
		const client = await this.db.client.findFirst({
			where: { clientRef, ...clientScope(actor) },
			select: {
				id: true,
				clientRef: true,
				vertical: true,
				status: true,
				salesOwnerId: true,
				mentorOwnerId: true,
			},
		});

		if (!client) {
			throw new NotFoundException(
				"No client with that reference, or it is not yours to see.",
			);
		}

		return client;
	}

	async forClient(actor: Actor, clientRef: string) {
		const client = await this.clientFor(actor, clientRef);
		const now = new Date();

		const rows = await this.db.enrollment.findMany({
			where: { clientId: client.id },
			select: ENROLLMENT_SELECT,
			orderBy: { enrolledAt: "desc" },
		});

		const mapped = rows.map((row) => this.enrollment(actor, row, now));
		const open = mapped.find((row) => isOpenEnrollment(row.status)) ?? null;

		return {
			rows: mapped,
			active: open,
			canEnroll:
				open === null &&
				client.vertical === "ACADEMY" &&
				(client.status === "CONVERTED" || client.status === "STUDENT") &&
				can(actor, "students.manage") &&
				canEditClient(actor, client),
		};
	}

	private async requireMentor(userId: string): Promise<void> {
		const profile = await this.db.staffProfile.findUnique({
			where: { userId },
			select: { role: true, isActive: true },
		});

		if (!profile?.isActive) {
			throw new BadRequestException("That person has no active staff profile.");
		}

		if (!roleOwnsSide(profile.role, "mentor")) {
			throw new BadRequestException("A mentor has to be on the mentor side.");
		}
	}

	async enroll(actor: Actor, input: EnrollInput): Promise<Enrollment> {
		requireCapability(
			actor,
			"students.manage",
			"Enrolling a student is for a mentor or an administrator.",
		);

		const client = await this.clientFor(actor, input.clientRef);

		if (!canEditClient(actor, client)) {
			throw new ForbiddenException(
				"This client belongs to somebody else. Ask their owner or an administrator.",
			);
		}

		if (client.vertical !== "ACADEMY") {
			throw new BadRequestException(
				"Enrolments belong to the Trading Academy, not Real Estate.",
			);
		}

		if (client.status !== "CONVERTED" && client.status !== "STUDENT") {
			throw new BadRequestException(
				`A client enrols once they convert. ${client.clientRef} is ${client.status}.`,
			);
		}

		const program = await this.db.program.findUnique({
			where: { id: input.programId },
			select: { id: true, isActive: true, code: true },
		});

		if (!program) throw new BadRequestException("No such programme.");

		if (!program.isActive) {
			throw new BadRequestException(
				`${program.code} is retired. Choose a programme that still runs.`,
			);
		}

		const mentorId = input.mentorId ?? client.mentorOwnerId;
		if (mentorId !== null) await this.requireMentor(mentorId);

		const created = await withActor(
			this.db,
			{ actorId: actor.userId, statusReason: `Enrolled on ${program.code}` },
			async (tx) => {
				const enrollment = await tx.enrollment.create({
					data: {
						clientId: client.id,
						programId: program.id,
						mentorId,
						cohort: input.cohort,
						notes: input.notes,
						createdById: actor.userId,
					},
					select: ENROLLMENT_SELECT,
				});

				const becomesStudent = client.status === "CONVERTED";

				await tx.client.update({
					where: { id: client.id },
					data: becomesStudent
						? { status: "STUDENT", lastActivityAt: new Date() }
						: { lastActivityAt: new Date() },
				});

				return enrollment;
			},
		).catch((cause: unknown) => {
			if (
				cause instanceof Prisma.PrismaClientKnownRequestError &&
				cause.code === "P2002"
			) {
				throw new ConflictException(
					`${client.clientRef} is already on a programme. Finish or withdraw that enrolment first.`,
				);
			}

			throw cause;
		});

		this.logger.log({
			message: "Student enrolled",
			clientRef: client.clientRef,
			programme: program.code,
		});

		return this.enrollment(actor, created, new Date());
	}

	private async readable(actor: Actor, id: string) {
		const row = await this.db.enrollment.findFirst({
			where: { id, client: clientScope(actor) },
			select: ENROLLMENT_SELECT,
		});

		if (!row) {
			throw new NotFoundException(
				"No such enrolment, or it is not yours to see.",
			);
		}

		return row;
	}

	private requireManage(actor: Actor, row: EnrollmentShape): void {
		requireCapability(
			actor,
			"students.manage",
			"Enrolments are for a mentor or an administrator to change.",
		);

		if (!canEditClient(actor, row.client)) {
			throw new ForbiddenException(
				"This client belongs to somebody else. Ask their owner or an administrator.",
			);
		}
	}

	async move(actor: Actor, input: MoveEnrollmentInput): Promise<Enrollment> {
		const row = await this.readable(actor, input.id);
		this.requireManage(actor, row);

		const verdict = judgeEnrollmentMove(row.status, input.status);
		if (!verdict.allowed) throw new BadRequestException(verdict.because);

		const data: Prisma.EnrollmentUpdateInput = { status: input.status };

		if (input.notes !== null) data.notes = input.notes;

		const moved = await withActor(
			this.db,
			{ actorId: actor.userId, statusReason: input.notes ?? undefined },
			(tx) =>
				tx.enrollment.update({
					where: { id: row.id },
					data,
					select: ENROLLMENT_SELECT,
				}),
		);

		this.logger.log({
			message: "Enrolment moved",
			clientRef: row.client.clientRef,
			from: row.status,
			to: input.status,
		});

		return this.enrollment(actor, moved, new Date());
	}

	async reassignMentor(
		actor: Actor,
		input: ReassignMentorInput,
	): Promise<Enrollment> {
		const row = await this.readable(actor, input.id);
		this.requireManage(actor, row);

		if (!isOpenEnrollment(row.status)) {
			throw new BadRequestException(
				"A finished enrolment keeps the mentor it had.",
			);
		}

		if (input.mentorId !== null) await this.requireMentor(input.mentorId);

		const updated = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.enrollment.update({
				where: { id: row.id },
				data: { mentorId: input.mentorId },
				select: ENROLLMENT_SELECT,
			}),
		);

		return this.enrollment(actor, updated, new Date());
	}
}
