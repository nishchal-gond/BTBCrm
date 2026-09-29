import { type Db, Prisma } from "@crm/db";
import {
	type Actor,
	can,
	canAccessVertical,
	clientScope,
	isManagerRole,
	seesEveryClient,
	VERTICALS,
	visibleOwnerIds,
} from "@crm/db/access";
import { CLIENT_STATUSES, isPreConversion } from "@crm/db/client-lifecycle";
import {
	EMPTY_TOTALS,
	LEDGER_CURRENCY,
	totalsFromSums,
} from "@crm/db/deposit-ledger";
import type { ClientStatus, Vertical } from "@crm/db/enums";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { Overview, OverviewInput } from "./overview.contracts";

const STALE_DAYS = 14;

const NEXT_EVENTS = 6;

const RECENT_MOVES = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OverviewService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private lineFor(actor: Actor, wanted: Vertical | null): Vertical {
		const allowed = VERTICALS.filter((one) => canAccessVertical(actor, one));

		if (wanted !== null && allowed.includes(wanted)) return wanted;

		return allowed[0] ?? "ACADEMY";
	}

	private scopeName(actor: Actor): Overview["scope"] {
		if (seesEveryClient(actor)) return "company";
		return isManagerRole(actor.role) ? "team" : "own";
	}

	async summary(actor: Actor, input: OverviewInput): Promise<Overview> {
		const vertical = this.lineFor(actor, input.vertical);
		const where = clientScope(actor, vertical) as Prisma.ClientWhereInput;

		const now = new Date();
		const monthStart = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
		);
		const stale = new Date(now.getTime() - STALE_DAYS * DAY_MS);

		const [byStatus, convertedThisMonth, activeStudents] = await Promise.all([
			this.db.client.groupBy({
				by: ["status"],
				where,
				_count: { _all: true },
			}),
			this.db.client.count({
				where: { AND: [where, { convertedAt: { gte: monthStart } }] },
			}),
			vertical === "ACADEMY"
				? this.db.enrollment.count({
						where: { status: "ACTIVE", client: where },
					})
				: Promise.resolve(0),
		]);

		const counts = new Map(
			byStatus.map((row) => [row.status, row._count._all]),
		);

		const pipeline = CLIENT_STATUSES.filter((status) => counts.has(status)).map(
			(status) => ({ status, count: counts.get(status) ?? 0 }),
		);

		const openPipeline = CLIENT_STATUSES.filter((status) =>
			isPreConversion(status),
		).reduce((total, status) => total + (counts.get(status) ?? 0), 0);

		const [money, attention, next, recent] = await Promise.all([
			this.money(actor, where, monthStart),
			this.attention(actor, where, vertical, stale),
			this.next(actor, now),
			this.recent(where),
		]);

		return {
			vertical,
			scope: this.scopeName(actor),
			pipeline,
			openPipeline,
			convertedThisMonth,
			activeStudents,
			money,
			attention,
			next,
			recent,
		};
	}

	private async money(
		actor: Actor,
		clients: Prisma.ClientWhereInput,
		monthStart: Date,
	): Promise<Overview["money"]> {
		if (!can(actor, "deposits.view")) return null;

		const owners = visibleOwnerIds(actor);

		const scoped: Prisma.DepositWhereInput = {
			client: seesEveryClient(actor)
				? clients
				: { ...clients, salesOwnerId: { in: [...(owners ?? [])] } },
		};

		const [month, unverified] = await Promise.all([
			this.db.deposit.aggregate({
				where: { AND: [scoped, { occurredAt: { gte: monthStart } }] },
				_sum: { amount: true },
				_count: { _all: true },
			}),
			this.db.deposit.aggregate({
				where: { AND: [scoped, { verifiedAt: null }] },
				_sum: { amount: true },
			}),
		]);

		const totals =
			month._count._all === 0
				? EMPTY_TOTALS
				: totalsFromSums({
						total: month._sum.amount?.toFixed(2) ?? null,
						verified: null,
						paymentCount: 0,
						entryCount: month._count._all,
					});

		const pending = totalsFromSums({
			total: unverified._sum.amount?.toFixed(2) ?? null,
			verified: null,
			paymentCount: 0,
			entryCount: 0,
		});

		return {
			currency: LEDGER_CURRENCY,
			thisMonth: totals.total,
			pending: pending.total,
			entryCount: month._count._all,
		};
	}

	private async attention(
		actor: Actor,
		clients: Prisma.ClientWhereInput,
		vertical: Vertical,
		stale: Date,
	): Promise<Overview["attention"]> {
		const open: ClientStatus[] = CLIENT_STATUSES.filter((status) =>
			isPreConversion(status),
		);

		const [unassigned, going, waiting, unverified] = await Promise.all([
			seesEveryClient(actor)
				? this.db.client.count({
						where: { AND: [clients, { salesOwnerId: null }] },
					})
				: Promise.resolve(0),
			this.db.client.count({
				where: {
					AND: [
						clients,
						{ status: { in: open } },
						{
							OR: [{ lastActivityAt: { lt: stale } }, { lastActivityAt: null }],
						},
					],
				},
			}),
			vertical === "ACADEMY"
				? this.db.client.count({
						where: {
							AND: [clients, { status: "QUALIFIED" }, { mentorOwnerId: null }],
						},
					})
				: Promise.resolve(0),
			can(actor, "deposits.verify")
				? this.db.deposit.count({
						where: { verifiedAt: null, client: clients },
					})
				: Promise.resolve(0),
		]);

		const rows: Overview["attention"] = [];

		if (unassigned > 0) {
			rows.push({
				kind: "unassigned",
				count: unassigned,
				label: "with no sales owner",
				href: "/clients?salesOwner=unassigned",
			});
		}

		if (going > 0) {
			rows.push({
				kind: "stale",
				count: going,
				label: `untouched for ${STALE_DAYS} days`,
				href: "/leads",
			});
		}

		if (waiting > 0) {
			rows.push({
				kind: "noMentor",
				count: waiting,
				label: "qualified and waiting for a mentor",
				href: "/clients?status=QUALIFIED&mentorOwner=unassigned",
			});
		}

		if (unverified > 0) {
			rows.push({
				kind: "unverified",
				count: unverified,
				label: "ledger entries not yet verified",
				href: "/deposits?verified=pending",
			});
		}

		return rows;
	}

	private async next(actor: Actor, now: Date): Promise<Overview["next"]> {
		const rows = await this.db.companyEvent.findMany({
			where: {
				isCancelled: false,
				endsAt: { gte: now },
				OR: [
					{ organizerId: actor.userId },
					{ attendees: { some: { userId: actor.userId } } },
					{ eventType: { in: ["COMPANY_MEETING", "INTERNAL_TRAINING"] } },
				],
			},
			orderBy: { startsAt: "asc" },
			take: NEXT_EVENTS,
			select: {
				id: true,
				title: true,
				eventType: true,
				startsAt: true,
				endsAt: true,
				timezone: true,
				client: {
					select: { clientRef: true, firstName: true, lastName: true },
				},
			},
		});

		return rows.map((row) => ({
			id: row.id,
			title: row.title,
			eventType: row.eventType,
			startsAt: row.startsAt.toISOString(),
			endsAt: row.endsAt.toISOString(),
			timezone: row.timezone,
			clientRef: row.client?.clientRef ?? null,
			clientName: row.client
				? `${row.client.firstName} ${row.client.lastName}`
				: null,
		}));
	}

	private async recent(
		clients: Prisma.ClientWhereInput,
	): Promise<Overview["recent"]> {
		const rows = await this.db.clientStatusHistory.findMany({
			where: { client: clients },
			orderBy: { changedAt: "desc" },
			take: RECENT_MOVES,
			select: {
				id: true,
				fromStatus: true,
				toStatus: true,
				changedAt: true,
				changedBy: { select: { user: { select: { name: true } } } },
				client: {
					select: { clientRef: true, firstName: true, lastName: true },
				},
			},
		});

		return rows.map((row) => ({
			id: row.id,
			clientRef: row.client.clientRef,
			clientName: `${row.client.firstName} ${row.client.lastName}`,
			fromStatus: row.fromStatus,
			toStatus: row.toStatus,
			changedBy: row.changedBy?.user.name ?? null,
			changedAt: row.changedAt.toISOString(),
		}));
	}
}
