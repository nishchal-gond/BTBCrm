import { type Db, Prisma, withActor } from "@crm/db";
import {
	type Actor,
	can,
	canAccessFinancials,
	canAccessVertical,
	canEditClient,
	clientScope,
	isSalesSide,
	type OwnerSide,
	roleOwnsSide,
	roleWorksVertical,
	seesEveryClient,
	VERTICALS,
	visibleOwnerIds,
} from "@crm/db/access";
import {
	CLIENT_STATUSES,
	conversionStatusFor,
	isConverted,
	judgeTransition,
	statusesForVertical,
	statusesForView,
	viewsForVertical,
} from "@crm/db/client-lifecycle";
import type { ClientStatus, Vertical } from "@crm/db/enums";
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
	countsByKey,
	FACET_UNASSIGNED,
	type ListResult,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
	splitSentinel,
} from "../trpc/list-input";
import type {
	AssignOwnerInput,
	ClientDetail,
	ClientListInput,
	ClientRow,
	ClientWorkspaceInput,
	ConvertClientInput,
	CreateClientInput,
	DuplicateCheckInput,
	SetStatusInput,
	UpdateClientInput,
} from "./clients.contracts";

const OWNER_SELECT = {
	userId: true,
	user: { select: { name: true } },
} as const;

const ROW_SELECT = {
	id: true,
	clientRef: true,
	vertical: true,
	firstName: true,
	lastName: true,
	email: true,
	phone: true,
	country: true,
	city: true,
	status: true,
	source: true,
	salesOwner: { select: OWNER_SELECT },
	mentorOwner: { select: OWNER_SELECT },
	createdAt: true,
	lastActivityAt: true,
} as const;

const DETAIL_SELECT = {
	...ROW_SELECT,
	salesOwnerId: true,
	mentorOwnerId: true,
	createdBy: { select: OWNER_SELECT },
	convertedBy: { select: OWNER_SELECT },
	convertedAt: true,
	updatedAt: true,
} as const;

type RowShape = Prisma.ClientGetPayload<{ select: typeof ROW_SELECT }>;
type DetailShape = Prisma.ClientGetPayload<{ select: typeof DETAIL_SELECT }>;

type OwnerShape = { userId: string; user: { name: string } } | null;

const SORTABLE: OrderByColumns<Prisma.ClientOrderByWithRelationInput> = {
	name: (dir) => ({ firstName: dir }),
	clientRef: (dir) => ({ clientRef: dir }),
	status: (dir) => ({ status: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	lastActivityAt: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
};

const NOT_FOUND = "No client with that reference, or it is not yours to see.";

function owner(value: OwnerShape) {
	return value ? { userId: value.userId, name: value.user.name } : null;
}

function toRow(row: RowShape): ClientRow {
	return {
		id: row.id,
		clientRef: row.clientRef,
		vertical: row.vertical,
		name: `${row.firstName} ${row.lastName}`,
		firstName: row.firstName,
		lastName: row.lastName,
		email: row.email,
		phone: row.phone,
		country: row.country,
		city: row.city,
		status: row.status,
		source: row.source,
		salesOwner: owner(row.salesOwner),
		mentorOwner: owner(row.mentorOwner),
		createdAt: row.createdAt.toISOString(),
		lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
	};
}

function ownerFacetFilter(
	field: "salesOwnerId" | "mentorOwnerId",
	values: string[],
): Prisma.ClientWhereInput | undefined {
	if (values.length === 0) return undefined;

	const { ids, includesSentinel } = splitSentinel(values, FACET_UNASSIGNED);

	if (includesSentinel && ids.length === 0) return { [field]: null };
	if (!includesSentinel) return { [field]: { in: ids } };

	return { OR: [{ [field]: { in: ids } }, { [field]: null }] };
}

@Injectable()
export class ClientsService {
	private readonly logger = new Logger(ClientsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	workspace(actor: Actor, input: ClientWorkspaceInput) {
		const verticals = VERTICALS.filter((one) => canAccessVertical(actor, one));

		const wanted = input.vertical;

		const vertical =
			wanted !== null && verticals.includes(wanted)
				? wanted
				: (verticals[0] ?? "ACADEMY");

		return {
			verticals,
			vertical,
			views: [...viewsForVertical(vertical)],
			statuses: [...statusesForVertical(vertical)],
			canCreate: can(actor, "clients.create"),
		};
	}

	private requireVertical(actor: Actor, vertical: Vertical): void {
		if (!canAccessVertical(actor, vertical)) {
			throw new ForbiddenException(
				"You do not work in that business line. Ask an administrator.",
			);
		}
	}

	private where(actor: Actor, input: ClientListInput): Prisma.ClientWhereInput {
		const scope = clientScope(actor, input.vertical);
		const inView = statusesForView(input.vertical, input.view);

		const chosen = input.status.filter((value): value is ClientStatus =>
			(CLIENT_STATUSES as readonly string[]).includes(value),
		);

		const statuses =
			chosen.length === 0
				? inView
				: inView.filter((status) => chosen.includes(status));

		const and: Prisma.ClientWhereInput[] = [{ status: { in: [...statuses] } }];

		const bySales = ownerFacetFilter("salesOwnerId", input.salesOwner);
		if (bySales) and.push(bySales);

		const byMentor = ownerFacetFilter("mentorOwnerId", input.mentorOwner);
		if (byMentor) and.push(byMentor);

		if (input.source.length > 0) and.push({ source: { in: input.source } });

		const q = input.q.trim();

		if (q.length > 0) {
			and.push({
				OR: [
					{ clientRef: { contains: q, mode: "insensitive" } },
					{ firstName: { contains: q, mode: "insensitive" } },
					{ lastName: { contains: q, mode: "insensitive" } },
					{ email: { contains: q, mode: "insensitive" } },
					{ phone: { contains: q } },
				],
			});
		}

		return { ...scope, AND: and };
	}

	async list(
		actor: Actor,
		input: ClientListInput,
	): Promise<ListResult<ClientRow>> {
		this.requireVertical(actor, input.vertical);

		const where = this.where(actor, input);
		const { skip, take } = paginate(input);

		const [rows, total, byStatus, bySales, byMentor] = await Promise.all([
			this.db.client.findMany({
				where,
				select: ROW_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, {
					lastActivityAt: { sort: "desc", nulls: "first" },
				}),
				skip,
				take,
			}),
			this.db.client.count({ where }),
			this.db.client.groupBy({
				by: ["status"],
				where: this.where(actor, { ...input, status: [] }),
				_count: { _all: true },
			}),
			this.db.client.groupBy({
				by: ["salesOwnerId"],
				where: this.where(actor, { ...input, salesOwner: [] }),
				_count: { _all: true },
			}),
			this.db.client.groupBy({
				by: ["mentorOwnerId"],
				where: this.where(actor, { ...input, mentorOwner: [] }),
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map(toRow),
			total,
			facetCounts: {
				status: countsByKey(byStatus, "status"),
				salesOwner: countsByKey(bySales, "salesOwnerId", FACET_UNASSIGNED),
				mentorOwner: countsByKey(byMentor, "mentorOwnerId", FACET_UNASSIGNED),
			},
		};
	}

	private async readable(actor: Actor, clientRef: string) {
		const row = await this.db.client.findFirst({
			where: { clientRef, ...clientScope(actor) },
			select: DETAIL_SELECT,
		});

		if (!row) throw new NotFoundException(NOT_FOUND);

		return row;
	}

	private detail(actor: Actor, row: DetailShape): ClientDetail {
		const editable = canEditClient(actor, row);

		const reassigning =
			row.mentorOwnerId !== null && !can(actor, "clients.reassignMentor");

		return {
			...toRow(row),
			createdBy: owner(row.createdBy),
			convertedBy: owner(row.convertedBy),
			convertedAt: row.convertedAt?.toISOString() ?? null,
			updatedAt: row.updatedAt.toISOString(),
			canEdit: editable,
			canSeeMoney: canAccessFinancials(actor, row),
			canConvert:
				editable &&
				can(actor, "clients.convert") &&
				judgeTransition(row.vertical, row.status, "CONVERTED").allowed,
			canAssignMentor:
				editable &&
				row.vertical === "ACADEMY" &&
				can(actor, "clients.assignMentor") &&
				!reassigning,
			canAssignSalesOwner: editable && can(actor, "clients.assignSalesOwner"),
			reconverting: row.convertedAt !== null && !isConverted(row.status),
		};
	}

	async byRef(actor: Actor, clientRef: string): Promise<ClientDetail> {
		return this.detail(actor, await this.readable(actor, clientRef));
	}

	async history(actor: Actor, clientRef: string) {
		const row = await this.readable(actor, clientRef);

		const entries = await this.db.clientStatusHistory.findMany({
			where: { clientId: row.id },
			orderBy: { changedAt: "desc" },
			select: {
				id: true,
				fromStatus: true,
				toStatus: true,
				reason: true,
				changedAt: true,
				changedBy: { select: OWNER_SELECT },
			},
		});

		return entries.map((entry) => ({
			id: entry.id,
			fromStatus: entry.fromStatus,
			toStatus: entry.toStatus,
			reason: entry.reason,
			changedBy: owner(entry.changedBy),
			changedAt: entry.changedAt.toISOString(),
		}));
	}

	async duplicateCheck(actor: Actor, input: DuplicateCheckInput) {
		const email = input.email?.trim().toLowerCase() ?? null;
		const phone = input.phone?.replace(/\D/g, "") ?? null;

		const or: Prisma.ClientWhereInput[] = [];
		if (email) or.push({ emailNorm: email });
		if (phone && phone.length > 0) or.push({ phoneNorm: phone });

		if (or.length === 0) return { exists: false, match: null };

		const found = await this.db.client.findFirst({
			where: { OR: or, status: { not: "LOST" } },
			select: {
				clientRef: true,
				firstName: true,
				lastName: true,
				status: true,
				vertical: true,
				salesOwnerId: true,
				mentorOwnerId: true,
				salesOwner: { select: OWNER_SELECT },
			},
		});

		if (!found) return { exists: false, match: null };

		const maySee =
			canAccessVertical(actor, found.vertical) &&
			(seesEveryClient(actor) ||
				[found.salesOwnerId, found.mentorOwnerId].some(
					(id) => id !== null && visibleOwnerIds(actor)?.includes(id),
				));

		if (!maySee) return { exists: true, match: null };

		return {
			exists: true,
			match: {
				clientRef: found.clientRef,
				name: `${found.firstName} ${found.lastName}`,
				status: found.status,
				vertical: found.vertical,
				salesOwner: owner(found.salesOwner),
			},
		};
	}

	async create(actor: Actor, input: CreateClientInput): Promise<ClientDetail> {
		requireCapability(
			actor,
			"clients.create",
			"You cannot enter new people into the CRM.",
		);
		this.requireVertical(actor, input.vertical);

		if (input.email === null && input.phone === null) {
			throw new BadRequestException(
				"Give an email or a phone number, so somebody can reach this person.",
			);
		}

		const salesOwnerId =
			input.salesOwnerId ?? (isSalesSide(actor.role) ? actor.userId : null);

		if (salesOwnerId !== null && salesOwnerId !== actor.userId) {
			requireCapability(
				actor,
				"clients.assignSalesOwner",
				"You can only enter people you own yourself.",
			);
		}

		try {
			const created = await withActor(
				this.db,
				{ actorId: actor.userId },
				(tx) =>
					tx.client.create({
						data: {
							vertical: input.vertical,
							firstName: input.firstName,
							lastName: input.lastName,
							email: input.email,
							phone: input.phone,
							country: input.country,
							city: input.city,
							source: input.source,
							createdById: actor.userId,
							salesOwnerId,
							lastActivityAt: new Date(),
						},
						select: DETAIL_SELECT,
					}),
			);

			this.logger.log({
				message: "Client created",
				clientRef: created.clientRef,
				vertical: created.vertical,
			});

			return this.detail(actor, created);
		} catch (cause) {
			if (
				cause instanceof Prisma.PrismaClientKnownRequestError &&
				cause.code === "P2002"
			) {
				throw new ConflictException(
					"Somebody with that email or phone number is already in the CRM. Open the existing record rather than making a second one.",
				);
			}

			throw cause;
		}
	}

	async update(actor: Actor, input: UpdateClientInput): Promise<ClientDetail> {
		requireCapability(actor, "clients.edit", "You cannot edit clients.");

		const row = await this.readable(actor, input.clientRef);
		this.requireEdit(actor, row);

		const { clientRef, ...fields } = input;

		const updated = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.client.update({
				where: { id: row.id },
				data: { ...fields, lastActivityAt: new Date() },
				select: DETAIL_SELECT,
			}),
		);

		return this.detail(actor, updated);
	}

	private requireEdit(actor: Actor, row: DetailShape): void {
		if (!canEditClient(actor, row)) {
			throw new ForbiddenException(
				"This client belongs to somebody else. Ask their owner or an administrator.",
			);
		}
	}

	private async requireStaffInVertical(
		userId: string,
		vertical: Vertical,
		expectation: OwnerSide,
	): Promise<void> {
		const profile = await this.db.staffProfile.findUnique({
			where: { userId },
			select: { role: true, verticals: true, isActive: true },
		});

		if (!profile?.isActive) {
			throw new BadRequestException("That person has no active staff profile.");
		}

		if (!roleWorksVertical(profile.role, profile.verticals, vertical)) {
			throw new BadRequestException(
				"That person does not work in this business line.",
			);
		}

		if (!roleOwnsSide(profile.role, expectation)) {
			throw new BadRequestException(
				expectation === "sales"
					? "A sales owner has to be on the sales side."
					: "A mentor has to be on the mentor side.",
			);
		}
	}

	async assignSalesOwner(
		actor: Actor,
		input: AssignOwnerInput,
	): Promise<ClientDetail> {
		requireCapability(
			actor,
			"clients.assignSalesOwner",
			"You cannot change who owns a client.",
		);

		const row = await this.readable(actor, input.clientRef);
		this.requireEdit(actor, row);

		if (input.userId !== null) {
			await this.requireStaffInVertical(input.userId, row.vertical, "sales");
		}

		const updated = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.client.update({
				where: { id: row.id },
				data: { salesOwnerId: input.userId, lastActivityAt: new Date() },
				select: DETAIL_SELECT,
			}),
		);

		this.logger.log({
			message: "Sales owner changed",
			clientRef: row.clientRef,
			from: row.salesOwnerId,
			to: input.userId,
		});

		return this.detail(actor, updated);
	}

	async assignMentor(
		actor: Actor,
		input: AssignOwnerInput,
	): Promise<ClientDetail> {
		requireCapability(
			actor,
			"clients.assignMentor",
			"You cannot assign mentors.",
		);

		const row = await this.readable(actor, input.clientRef);
		this.requireEdit(actor, row);

		if (row.vertical !== "ACADEMY") {
			throw new BadRequestException(
				"Mentors belong to the Trading Academy, not Real Estate.",
			);
		}

		const reassigning =
			row.mentorOwnerId !== null && input.userId !== row.mentorOwnerId;

		if (reassigning) {
			requireCapability(
				actor,
				"clients.reassignMentor",
				"This client has a mentor already. Only an administrator moves a client to a different mentor.",
			);
		}

		if (input.userId === null && row.convertedAt !== null) {
			throw new BadRequestException(
				"A converted client keeps a mentor. Assign a different one instead of removing this one.",
			);
		}

		if (input.userId !== null) {
			await this.requireStaffInVertical(input.userId, row.vertical, "mentor");
		}

		const advances =
			input.userId !== null && row.status === "QUALIFIED"
				? { status: "MENTOR_ASSIGNED" as const }
				: {};

		const updated = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.client.update({
				where: { id: row.id },
				data: {
					mentorOwnerId: input.userId,
					lastActivityAt: new Date(),
					...advances,
				},
				select: DETAIL_SELECT,
			}),
		);

		this.logger.log({
			message: "Mentor changed",
			clientRef: row.clientRef,
			from: row.mentorOwnerId,
			to: input.userId,
		});

		return this.detail(actor, updated);
	}

	async setStatus(actor: Actor, input: SetStatusInput): Promise<ClientDetail> {
		requireCapability(actor, "clients.edit", "You cannot edit clients.");

		const row = await this.readable(actor, input.clientRef);
		this.requireEdit(actor, row);

		if (input.status === "CONVERTED") {
			throw new BadRequestException(
				"Conversion is its own action, so the mentor and the stamp are recorded together.",
			);
		}

		if (input.status === "STUDENT") {
			throw new BadRequestException(
				"A client becomes a student by enrolling on a programme, never by a status change alone.",
			);
		}

		const verdict = judgeTransition(row.vertical, row.status, input.status);

		if (!verdict.allowed) throw new BadRequestException(verdict.because);

		if (verdict.adminOnly && !can(actor, "clients.reverseConversion")) {
			throw new ForbiddenException(
				"Only an administrator moves a converted client backwards.",
			);
		}

		if (verdict.requiresReason && input.reason === null) {
			throw new BadRequestException("Say why, so the history explains itself.");
		}

		if (input.status === "MENTOR_ASSIGNED" && row.mentorOwnerId === null) {
			throw new BadRequestException(
				"Assign the mentor first; the status follows from it.",
			);
		}

		const updated = await withActor(
			this.db,
			{ actorId: actor.userId, statusReason: input.reason ?? undefined },
			(tx) =>
				tx.client.update({
					where: { id: row.id },
					data: { status: input.status, lastActivityAt: new Date() },
					select: DETAIL_SELECT,
				}),
		);

		return this.detail(actor, updated);
	}

	async convert(
		actor: Actor,
		input: ConvertClientInput,
	): Promise<ClientDetail> {
		requireCapability(
			actor,
			"clients.convert",
			"You cannot close a conversion.",
		);

		const row = await this.readable(actor, input.clientRef);
		this.requireEdit(actor, row);

		const reconverting = row.convertedAt !== null;

		if (reconverting && isConverted(row.status)) {
			throw new ConflictException(
				`${row.clientRef} converted already, on ${row.convertedAt?.toISOString()}. A client converts once.`,
			);
		}

		const mentorId = input.mentorId ?? row.mentorOwnerId;

		if (row.vertical === "ACADEMY" && mentorId === null) {
			throw new BadRequestException(
				"A Trading Academy client converts with a mentor. Assign one first.",
			);
		}

		if (mentorId !== null) {
			await this.requireStaffInVertical(mentorId, row.vertical, "mentor");
		}

		const verdict = judgeTransition(row.vertical, row.status, "CONVERTED");

		if (!verdict.allowed) {
			throw new BadRequestException(
				`${row.clientRef} is ${row.status}. A client converts from ${conversionStatusFor(row.vertical)}.`,
			);
		}

		const stamp = reconverting
			? {}
			: { convertedById: actor.userId, convertedAt: new Date() };

		const converted = await withActor(
			this.db,
			{
				actorId: actor.userId,
				statusReason: reconverting ? "Converted again" : "Converted",
			},
			(tx) =>
				tx.client.update({
					where: { id: row.id },
					data: {
						status: "CONVERTED",
						mentorOwnerId: mentorId,
						lastActivityAt: new Date(),
						...stamp,
					},
					select: DETAIL_SELECT,
				}),
		);

		this.logger.log({
			message: "Client converted",
			clientRef: converted.clientRef,
			vertical: converted.vertical,
		});

		return this.detail(actor, converted);
	}
}
