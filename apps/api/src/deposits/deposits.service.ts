import { type Db, Prisma, withActor } from "@crm/db";
import {
	type Actor,
	can,
	canAccessFinancials,
	canAccessVertical,
	clientScope,
	seesEveryClient,
	visibleOwnerIds,
} from "@crm/db/access";
import {
	DEPOSIT_ENTRIES,
	formatFils,
	isAmount,
	judgeEntry,
	LEDGER_CURRENCY,
	type LedgerTotals,
	parseAmount,
	totalsFrom,
} from "@crm/db/deposit-ledger";
import type { DepositEntry, Vertical } from "@crm/db/enums";
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
	type ListResult,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	DepositListInput,
	DepositRow,
	RecordDepositInput,
} from "./deposits.contracts";

const ROW_SELECT = {
	id: true,
	entryType: true,
	amount: true,
	currency: true,
	method: true,
	reference: true,
	note: true,
	correctsId: true,
	occurredAt: true,
	verifiedAt: true,
	recordedBy: { select: { userId: true, user: { select: { name: true } } } },
	verifiedBy: { select: { userId: true, user: { select: { name: true } } } },
	client: {
		select: {
			clientRef: true,
			firstName: true,
			lastName: true,
			vertical: true,
			salesOwnerId: true,
			mentorOwnerId: true,
		},
	},
} as const;

type DepositShape = Prisma.DepositGetPayload<{ select: typeof ROW_SELECT }>;

const SORTABLE: OrderByColumns<Prisma.DepositOrderByWithRelationInput> = {
	occurredAt: (dir) => ({ occurredAt: dir }),
	amount: (dir) => ({ amount: dir }),
	entryType: (dir) => ({ entryType: dir }),
	client: (dir) => ({ client: { clientRef: dir } }),
};

const NOT_FOUND = "No such entry, or it is not yours to see.";

const FUTURE_TOLERANCE_MS = 60_000;

const EMPTY_TOTALS: LedgerTotals = {
	total: "0.00",
	verified: "0.00",
	pending: "0.00",
	paymentCount: 0,
	entryCount: 0,
};

function person(value: { userId: string; user: { name: string } } | null) {
	return value ? { userId: value.userId, name: value.user.name } : null;
}

@Injectable()
export class DepositsService {
	private readonly logger = new Logger(DepositsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	workspace(actor: Actor) {
		return {
			currency: LEDGER_CURRENCY,
			entryTypes: this.entryTypesFor(actor),
			canRecord: can(actor, "deposits.record"),
			canCorrect: can(actor, "deposits.verify"),
			canVerify: can(actor, "deposits.verify"),
		};
	}

	private entryTypesFor(actor: Actor): DepositEntry[] {
		if (!can(actor, "deposits.record")) return [];
		if (can(actor, "deposits.verify")) return [...DEPOSIT_ENTRIES];
		return ["PAYMENT"];
	}

	private requireLedgerAccess(actor: Actor): void {
		requireCapability(
			actor,
			"deposits.view",
			"Deposits are not yours to read. A mentor sees the client, never the money.",
		);
	}

	private scope(actor: Actor, vertical?: Vertical): Prisma.DepositWhereInput {
		const clients = clientScope(actor, vertical);

		if (seesEveryClient(actor)) return { client: clients };

		const owners = visibleOwnerIds(actor) ?? [];

		return {
			client: {
				vertical: clients.vertical,
				salesOwnerId: { in: [...owners] },
			},
		};
	}

	private row(actor: Actor, deposit: DepositShape): DepositRow {
		const recorder = person(deposit.recordedBy);

		return {
			id: deposit.id,
			clientRef: deposit.client.clientRef,
			clientName: `${deposit.client.firstName} ${deposit.client.lastName}`,
			vertical: deposit.client.vertical,
			entryType: deposit.entryType,
			amount: deposit.amount.toFixed(2),
			currency: deposit.currency,
			method: deposit.method,
			reference: deposit.reference,
			note: deposit.note,
			correctsId: deposit.correctsId,
			occurredAt: deposit.occurredAt.toISOString(),
			recordedBy: recorder ?? { userId: "", name: "Unknown" },
			verifiedBy: person(deposit.verifiedBy),
			verifiedAt: deposit.verifiedAt?.toISOString() ?? null,
			canVerify: deposit.verifiedAt === null && can(actor, "deposits.verify"),
		};
	}

	private where(
		actor: Actor,
		input: DepositListInput,
	): Prisma.DepositWhereInput {
		const and: Prisma.DepositWhereInput[] = [];

		const entries = input.entryType.filter((value): value is DepositEntry =>
			(DEPOSIT_ENTRIES as readonly string[]).includes(value),
		);
		if (entries.length > 0) and.push({ entryType: { in: entries } });

		if (input.verified.length === 1) {
			and.push({
				verifiedAt: input.verified[0] === "verified" ? { not: null } : null,
			});
		}

		if (input.recordedBy.length > 0) {
			and.push({ recordedById: { in: input.recordedBy } });
		}

		const q = input.q.trim();

		if (q.length > 0) {
			and.push({
				OR: [
					{ reference: { contains: q, mode: "insensitive" } },
					{ method: { contains: q, mode: "insensitive" } },
					{ client: { clientRef: { contains: q, mode: "insensitive" } } },
					{ client: { firstName: { contains: q, mode: "insensitive" } } },
					{ client: { lastName: { contains: q, mode: "insensitive" } } },
				],
			});
		}

		return { ...this.scope(actor, input.vertical), AND: and };
	}

	private async totalsFor(
		where: Prisma.DepositWhereInput,
	): Promise<LedgerTotals & { lastDepositAt: string | null }> {
		const lines = await this.db.deposit.findMany({
			where,
			select: {
				amount: true,
				entryType: true,
				verifiedAt: true,
				occurredAt: true,
			},
			orderBy: { occurredAt: "desc" },
		});

		const totals =
			lines.length === 0
				? EMPTY_TOTALS
				: totalsFrom(
						lines.map((line) => ({
							amount: line.amount.toFixed(2),
							entryType: line.entryType,
							verifiedAt: line.verifiedAt,
						})),
					);

		return {
			...totals,
			lastDepositAt: lines[0]?.occurredAt.toISOString() ?? null,
		};
	}

	async list(
		actor: Actor,
		input: DepositListInput,
	): Promise<
		ListResult<DepositRow> & {
			totals: LedgerTotals & { currency: string; lastDepositAt: string | null };
		}
	> {
		this.requireLedgerAccess(actor);

		if (!canAccessVertical(actor, input.vertical)) {
			throw new ForbiddenException(
				"You do not work in that business line. Ask an administrator.",
			);
		}

		const where = this.where(actor, input);
		const { skip, take } = paginate(input);

		const [rows, count, byEntry, byRecorder, totals] = await Promise.all([
			this.db.deposit.findMany({
				where,
				select: ROW_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { occurredAt: "desc" }),
				skip,
				take,
			}),
			this.db.deposit.count({ where }),
			this.db.deposit.groupBy({
				by: ["entryType"],
				where: this.where(actor, { ...input, entryType: [] }),
				_count: { _all: true },
			}),
			this.db.deposit.groupBy({
				by: ["recordedById"],
				where: this.where(actor, { ...input, recordedBy: [] }),
				_count: { _all: true },
			}),
			this.totalsFor(where),
		]);

		return {
			rows: rows.map((row) => this.row(actor, row)),
			total: count,
			facetCounts: {
				entryType: countsByKey(byEntry, "entryType"),
				recordedBy: countsByKey(byRecorder, "recordedById"),
			},
			totals: { ...totals, currency: LEDGER_CURRENCY },
		};
	}

	private async clientFor(actor: Actor, clientRef: string) {
		const client = await this.db.client.findFirst({
			where: { clientRef, ...clientScope(actor) },
			select: {
				id: true,
				clientRef: true,
				vertical: true,
				salesOwnerId: true,
				mentorOwnerId: true,
			},
		});

		if (!client) {
			throw new NotFoundException(
				"No client with that reference, or it is not yours to see.",
			);
		}

		if (!canAccessFinancials(actor, client)) {
			throw new ForbiddenException(
				"This client's money is not yours to read. A mentor sees the client, never the ledger.",
			);
		}

		return client;
	}

	async forClient(actor: Actor, clientRef: string) {
		this.requireLedgerAccess(actor);

		const client = await this.clientFor(actor, clientRef);
		const where: Prisma.DepositWhereInput = { clientId: client.id };

		const [rows, totals] = await Promise.all([
			this.db.deposit.findMany({
				where,
				select: ROW_SELECT,
				orderBy: { occurredAt: "desc" },
			}),
			this.totalsFor(where),
		]);

		return {
			rows: rows.map((row) => this.row(actor, row)),
			totals: { ...totals, currency: LEDGER_CURRENCY },
			canRecord: can(actor, "deposits.record"),
			canCorrect: can(actor, "deposits.verify"),
		};
	}

	async record(actor: Actor, input: RecordDepositInput): Promise<DepositRow> {
		requireCapability(
			actor,
			"deposits.record",
			"Recording money is not yours to do.",
		);

		if (input.entryType !== "PAYMENT") {
			requireCapability(
				actor,
				"deposits.verify",
				"A refund or an adjustment is for an administrator or finance to record.",
			);
		}

		const client = await this.clientFor(actor, input.clientRef);
		const parsed = parseAmount(input.amount);

		if (!isAmount(parsed)) throw new BadRequestException(parsed.because);

		const verdict = judgeEntry(input.entryType, parsed.fils, input.correctsId);
		if (!verdict.allowed) throw new BadRequestException(verdict.because);

		const occurredAt = new Date(input.occurredAt);

		if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
			throw new BadRequestException(
				"A ledger entry records money that has arrived, so it cannot be dated in the future.",
			);
		}

		if (input.correctsId !== null) {
			const original = await this.db.deposit.findFirst({
				where: { id: input.correctsId, clientId: client.id },
				select: { id: true },
			});

			if (!original) {
				throw new BadRequestException(
					"That entry is not on this client's ledger, so an adjustment cannot correct it.",
				);
			}
		}

		const created = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.deposit.create({
				data: {
					clientId: client.id,
					entryType: input.entryType,
					amount: new Prisma.Decimal(formatFils(parsed.fils)),
					currency: LEDGER_CURRENCY,
					method: input.method,
					reference: input.reference,
					note: input.note,
					correctsId: input.correctsId,
					occurredAt,
					recordedById: actor.userId,
				},
				select: ROW_SELECT,
			}),
		);

		await this.db.client.update({
			where: { id: client.id },
			data: { lastActivityAt: new Date() },
		});

		this.logger.log({
			message: "Deposit recorded",
			clientRef: client.clientRef,
			entryType: created.entryType,
		});

		return this.row(actor, created);
	}

	async verify(actor: Actor, id: string): Promise<DepositRow> {
		requireCapability(
			actor,
			"deposits.verify",
			"Verifying money is for an administrator or finance.",
		);

		const existing = await this.db.deposit.findFirst({
			where: { id, ...this.scope(actor) },
			select: { id: true, verifiedAt: true },
		});

		if (!existing) throw new NotFoundException(NOT_FOUND);

		if (existing.verifiedAt !== null) {
			throw new ConflictException("That entry is verified already.");
		}

		const verified = await this.db.deposit.update({
			where: { id },
			data: { verifiedById: actor.userId, verifiedAt: new Date() },
			select: ROW_SELECT,
		});

		return this.row(actor, verified);
	}
}
