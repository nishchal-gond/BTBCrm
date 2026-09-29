import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";
import { DepositsService } from "../src/deposits/deposits.service";
import { withoutDeleteGuards } from "./guards";

const suffix = process.env.TEST_RUN_ID ?? "deposits-spec";

const ids = {
	admin: `dep-${suffix}-admin`,
	salesA: `dep-${suffix}-sales-a`,
	salesB: `dep-${suffix}-sales-b`,
	mentorA: `dep-${suffix}-mentor-a`,
	finance: `dep-${suffix}-finance`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);
const deposits = new DepositsService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8);
}

const AT = "2026-09-01T09:00:00.000Z";

async function cleanUp(): Promise<void> {
	const mine = await db.client.findMany({
		where: { createdById: { in: staffIds } },
		select: { id: true },
	});
	const clientIds = mine.map((row) => row.id);

	await withoutDeleteGuards(async () => {
		await db.deposit.deleteMany({ where: { clientId: { in: clientIds } } });
		await db.client.deleteMany({ where: { id: { in: clientIds } } });
	});
	await db.staffProfile.deleteMany({ where: { userId: { in: staffIds } } });
	await db.user.deleteMany({ where: { id: { in: staffIds } } });
}

beforeAll(async () => {
	await cleanUp();

	for (const [key, id] of Object.entries(ids)) {
		await db.user.create({
			data: {
				id,
				name: key,
				email: `${id}@academy.example`,
				emailVerified: true,
				updatedAt: new Date(),
			},
		});
	}

	await db.staffProfile.create({ data: { userId: ids.admin, role: "ADMIN" } });
	await db.staffProfile.create({ data: { userId: ids.salesA, role: "SALES" } });
	await db.staffProfile.create({ data: { userId: ids.salesB, role: "SALES" } });
	await db.staffProfile.create({
		data: { userId: ids.mentorA, role: "MENTOR" },
	});
	await db.staffProfile.create({
		data: { userId: ids.finance, role: "FINANCE" },
	});

	for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
		const actor = await loadActor(db, ids[key]);
		if (!actor) throw new Error(`${key} has no profile`);
		actors[key] = actor;
	}
});

afterAll(cleanUp);

async function refused(work: () => Promise<unknown>): Promise<string> {
	try {
		await work();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("the ledger accepted something it should have refused");
}

async function clientOf(actor: Actor): Promise<string> {
	const created = await clients.create(actor, {
		vertical: "ACADEMY",
		firstName: "Rahul",
		lastName: unique(),
		email: `rahul.${unique()}@student.example`,
		phone: null,
		country: null,
		city: null,
		source: null,
		salesOwnerId: null,
	});

	return created.clientRef;
}

async function pay(
	actor: Actor,
	clientRef: string,
	amount: string,
): Promise<string> {
	const row = await deposits.record(actor, {
		clientRef,
		entryType: "PAYMENT",
		amount,
		method: "Bank transfer",
		reference: null,
		note: null,
		correctsId: null,
		occurredAt: AT,
	});

	return row.id;
}

describe("recording money", () => {
	it("writes an entry against the client who paid", async () => {
		const clientRef = await clientOf(actors.salesA);
		const row = await deposits.record(actors.salesA, {
			clientRef,
			entryType: "PAYMENT",
			amount: "25000",
			method: "Bank transfer",
			reference: "TT-4471",
			note: null,
			correctsId: null,
			occurredAt: AT,
		});

		expect(row).toMatchObject({
			clientRef,
			entryType: "PAYMENT",
			amount: "25000.00",
			currency: "AED",
			reference: "TT-4471",
			verifiedAt: null,
		});
		expect(row.recordedBy.userId).toBe(ids.salesA);
	});

	it("refuses an amount that is not an amount", async () => {
		const clientRef = await clientOf(actors.salesA);

		expect(await refused(() => pay(actors.salesA, clientRef, "1.234"))).toMatch(
			/two decimal places/,
		);
	});

	it("refuses a payment that is money out", async () => {
		const clientRef = await clientOf(actors.salesA);

		expect(await refused(() => pay(actors.salesA, clientRef, "-500"))).toMatch(
			/money in/,
		);
	});

	it("is not a mentor's to do", async () => {
		const clientRef = await clientOf(actors.salesA);
		await clients.assignMentor(actors.salesA, {
			clientRef,
			userId: ids.mentorA,
		});

		expect(await refused(() => pay(actors.mentorA, clientRef, "100"))).toMatch(
			/not yours/,
		);
	});

	it("refuses a refund from a salesperson", async () => {
		const clientRef = await clientOf(actors.salesA);

		expect(
			await refused(() =>
				deposits.record(actors.salesA, {
					clientRef,
					entryType: "REFUND",
					amount: "-100",
					method: null,
					reference: null,
					note: null,
					correctsId: null,
					occurredAt: AT,
				}),
			),
		).toMatch(/administrator or finance/);
	});

	it("lets finance record a refund", async () => {
		const clientRef = await clientOf(actors.salesA);
		await pay(actors.salesA, clientRef, "1000");

		const refund = await deposits.record(actors.finance, {
			clientRef,
			entryType: "REFUND",
			amount: "-250",
			method: null,
			reference: null,
			note: "Overpaid",
			correctsId: null,
			occurredAt: AT,
		});

		expect(refund.amount).toBe("-250.00");
	});
});

describe("the ledger is append-only", () => {
	it("refuses an update to an entry", async () => {
		const clientRef = await clientOf(actors.salesA);
		const id = await pay(actors.salesA, clientRef, "1000");

		expect(
			await refused(() =>
				db.deposit.update({ where: { id }, data: { amount: "9999.00" } }),
			),
		).toMatch(/append-only/);
	});

	it("refuses a delete", async () => {
		const clientRef = await clientOf(actors.salesA);
		const id = await pay(actors.salesA, clientRef, "1000");

		expect(await refused(() => db.deposit.delete({ where: { id } }))).toMatch(
			/never deleted/,
		);
	});

	it("corrects a mistake with an adjustment that names the entry", async () => {
		const clientRef = await clientOf(actors.salesA);
		const wrong = await pay(actors.salesA, clientRef, "2500");

		const fix = await deposits.record(actors.admin, {
			clientRef,
			entryType: "ADJUSTMENT",
			amount: "-500",
			method: null,
			reference: null,
			note: "Entered 2500, should have been 2000",
			correctsId: wrong,
			occurredAt: AT,
		});

		expect(fix.correctsId).toBe(wrong);
		expect(
			(await deposits.forClient(actors.salesA, clientRef)).totals.total,
		).toBe("2000.00");
	});

	it("refuses an adjustment that names nothing", async () => {
		const clientRef = await clientOf(actors.salesA);

		expect(
			await refused(() =>
				deposits.record(actors.admin, {
					clientRef,
					entryType: "ADJUSTMENT",
					amount: "-500",
					method: null,
					reference: null,
					note: null,
					correctsId: null,
					occurredAt: AT,
				}),
			),
		).toMatch(/which entry it corrects/);
	});

	it("refuses an adjustment against another client's entry", async () => {
		const mine = await clientOf(actors.salesA);
		const theirs = await clientOf(actors.salesA);
		const onTheirs = await pay(actors.salesA, theirs, "1000");

		expect(
			await refused(() =>
				deposits.record(actors.admin, {
					clientRef: mine,
					entryType: "ADJUSTMENT",
					amount: "-100",
					method: null,
					reference: null,
					note: null,
					correctsId: onTheirs,
					occurredAt: AT,
				}),
			),
		).toMatch(/not on this client's ledger/);
	});
});

describe("totals are derived", () => {
	it("adds up the lines and splits verified from pending", async () => {
		const clientRef = await clientOf(actors.salesA);
		const first = await pay(actors.salesA, clientRef, "25000");
		await pay(actors.salesA, clientRef, "5000");

		await deposits.verify(actors.finance, first);

		const ledger = await deposits.forClient(actors.salesA, clientRef);

		expect(ledger.totals).toMatchObject({
			total: "30000.00",
			verified: "25000.00",
			pending: "5000.00",
			currency: "AED",
			paymentCount: 2,
			entryCount: 2,
		});
	});

	it("keeps no total on the client row", async () => {
		const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
			"select column_name from information_schema.columns where table_name = 'client'",
		);

		expect(columns.some((column) => /total/i.test(column.column_name))).toBe(
			false,
		);
	});
});

describe("when money arrived", () => {
	it("refuses an entry dated in the future", async () => {
		const clientRef = await clientOf(actors.salesA);
		const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

		expect(
			await refused(() =>
				deposits.record(actors.salesA, {
					clientRef,
					entryType: "PAYMENT",
					amount: "1000",
					method: null,
					reference: null,
					note: null,
					correctsId: null,
					occurredAt: tomorrow,
				}),
			),
		).toMatch(/dated in the future/);
	});

	it("accepts an entry from the past", async () => {
		const clientRef = await clientOf(actors.salesA);
		const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();

		const row = await deposits.record(actors.salesA, {
			clientRef,
			entryType: "PAYMENT",
			amount: "1000",
			method: null,
			reference: null,
			note: null,
			correctsId: null,
			occurredAt: lastWeek,
		});

		expect(row.occurredAt).toBe(lastWeek);
	});
});

describe("verification", () => {
	it("stamps who checked the money and when", async () => {
		const clientRef = await clientOf(actors.salesA);
		const id = await pay(actors.salesA, clientRef, "1000");

		const verified = await deposits.verify(actors.finance, id);

		expect(verified.verifiedBy?.userId).toBe(ids.finance);
		expect(verified.verifiedAt).not.toBeNull();
	});

	it("happens once", async () => {
		const clientRef = await clientOf(actors.salesA);
		const id = await pay(actors.salesA, clientRef, "1000");
		await deposits.verify(actors.finance, id);

		expect(await refused(() => deposits.verify(actors.admin, id))).toMatch(
			/verified already/,
		);
	});

	it("is not a salesperson's to do", async () => {
		const clientRef = await clientOf(actors.salesA);
		const id = await pay(actors.salesA, clientRef, "1000");

		expect(await refused(() => deposits.verify(actors.salesA, id))).toMatch(
			/administrator or finance/,
		);
	});
});

describe("who can read the ledger", () => {
	it("keeps one rep's money away from another", async () => {
		const mine = await clientOf(actors.salesA);
		await pay(actors.salesA, mine, "1000");

		expect(
			await refused(() => deposits.forClient(actors.salesB, mine)),
		).toMatch(/not yours to see/);
	});

	it("never shows a mentor the money on their own client", async () => {
		const clientRef = await clientOf(actors.salesA);
		await clients.assignMentor(actors.salesA, {
			clientRef,
			userId: ids.mentorA,
		});
		await pay(actors.salesA, clientRef, "1000");

		expect((await clients.byRef(actors.mentorA, clientRef)).canSeeMoney).toBe(
			false,
		);
		expect(
			await refused(() => deposits.forClient(actors.mentorA, clientRef)),
		).toMatch(/never the money/);
	});

	it("keeps the global ledger to the rows the reader owns", async () => {
		const mine = await clientOf(actors.salesA);
		const theirs = await clientOf(actors.salesB);
		await pay(actors.salesA, mine, "1000");
		await pay(actors.salesB, theirs, "2000");

		const seen = await deposits.list(actors.salesB, {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 100,
			vertical: "ACADEMY",
			entryType: [],
			verified: [],
			recordedBy: [],
		});

		expect(seen.rows.every((row) => row.clientRef === theirs)).toBe(true);
	});
});
