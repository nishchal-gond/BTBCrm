import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";
import { DepositsService } from "../src/deposits/deposits.service";
import { ProgramsService } from "../src/programs/programs.service";
import { withoutDeleteGuards } from "./guards";

const suffix = process.env.TEST_RUN_ID ?? "races-spec";

const ids = {
	admin: `race-${suffix}-admin`,
	salesA: `race-${suffix}-sales-a`,
	mentorA: `race-${suffix}-mentor-a`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);
const programs = new ProgramsService(db);
const deposits = new DepositsService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8);
}

let programIds: string[] = [];

async function cleanUp(): Promise<void> {
	const mine = await db.client.findMany({
		where: { createdById: { in: staffIds } },
		select: { id: true },
	});
	const clientIds = mine.map((row) => row.id);

	await withoutDeleteGuards(async () => {
		await db.enrollment.deleteMany({ where: { clientId: { in: clientIds } } });
		await db.deposit.deleteMany({ where: { clientId: { in: clientIds } } });
		await db.program.deleteMany({ where: { code: { startsWith: "R-" } } });
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
	await db.staffProfile.create({
		data: { userId: ids.mentorA, role: "MENTOR" },
	});

	for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
		const actor = await loadActor(db, ids[key]);
		if (!actor) throw new Error(`${key} has no profile`);
		actors[key] = actor;
	}

	programIds = [];

	for (let index = 0; index < 2; index += 1) {
		const program = await programs.create(actors.admin, {
			code: `R-${unique().toUpperCase()}`,
			name: `Race ${index}`,
			description: null,
			durationWeeks: 8,
			priceAed: "10000",
		});

		programIds.push(program.id);
	}
});

afterAll(cleanUp);

async function converted(): Promise<string> {
	const created = await clients.create(actors.salesA, {
		vertical: "ACADEMY",
		firstName: "Rahul",
		lastName: unique(),
		email: `rahul.${unique().toLowerCase()}@student.example`,
		phone: null,
		country: null,
		city: null,
		source: null,
		salesOwnerId: null,
	});

	await clients.setStatus(actors.salesA, {
		clientRef: created.clientRef,
		status: "QUALIFIED",
		reason: null,
	});
	await clients.assignMentor(actors.salesA, {
		clientRef: created.clientRef,
		userId: ids.mentorA,
	});
	await clients.convert(actors.mentorA, {
		clientRef: created.clientRef,
		mentorId: null,
	});

	return created.clientRef;
}

function settled<T>(work: Promise<T>[]): Promise<PromiseSettledResult<T>[]> {
	return Promise.allSettled(work);
}

describe("two people pressing the same button at the same moment", () => {
	it("enrols a client once, whichever request wins", async () => {
		const clientRef = await converted();

		const attempts = programIds.map((programId) =>
			programs.enroll(actors.mentorA, {
				clientRef,
				programId,
				mentorId: null,
				cohort: null,
				notes: null,
			}),
		);

		const answers = await settled(attempts);
		const won = answers.filter((one) => one.status === "fulfilled");
		const lost = answers.filter((one) => one.status === "rejected");

		expect(won).toHaveLength(1);
		expect(lost).toHaveLength(1);

		const open = await db.enrollment.count({
			where: { client: { clientRef }, closedAt: null },
		});

		expect(open).toBe(1);

		const row = await db.client.findFirstOrThrow({
			where: { clientRef },
			select: { status: true, clientRef: true },
		});

		expect(row.status).toBe("STUDENT");
		expect(row.clientRef).toBe(clientRef);
	});

	it("converts a client once, and stamps once", async () => {
		const created = await clients.create(actors.salesA, {
			vertical: "ACADEMY",
			firstName: "Aisha",
			lastName: unique(),
			email: `aisha.${unique().toLowerCase()}@student.example`,
			phone: null,
			country: null,
			city: null,
			source: null,
			salesOwnerId: null,
		});

		await clients.setStatus(actors.salesA, {
			clientRef: created.clientRef,
			status: "QUALIFIED",
			reason: null,
		});
		await clients.assignMentor(actors.salesA, {
			clientRef: created.clientRef,
			userId: ids.mentorA,
		});

		const answers = await settled([
			clients.convert(actors.mentorA, {
				clientRef: created.clientRef,
				mentorId: null,
			}),
			clients.convert(actors.admin, {
				clientRef: created.clientRef,
				mentorId: null,
			}),
		]);

		expect(answers.some((one) => one.status === "fulfilled")).toBe(true);

		const history = await db.clientStatusHistory.count({
			where: {
				client: { clientRef: created.clientRef },
				toStatus: "CONVERTED",
			},
		});

		expect(history).toBe(1);

		const row = await db.client.findFirstOrThrow({
			where: { clientRef: created.clientRef },
			select: { convertedById: true, convertedAt: true },
		});

		expect(row.convertedById).not.toBeNull();
		expect(row.convertedAt).not.toBeNull();
	});

	it("verifies a deposit once, whoever gets there first", async () => {
		const clientRef = await converted();

		const entry = await deposits.record(actors.salesA, {
			clientRef,
			entryType: "PAYMENT",
			amount: "1000",
			method: "Card",
			reference: null,
			note: null,
			correctsId: null,
			occurredAt: new Date().toISOString(),
		});

		const answers = await settled([
			deposits.verify(actors.admin, entry.id),
			deposits.verify(actors.admin, entry.id),
		]);

		expect(answers.filter((one) => one.status === "fulfilled")).toHaveLength(1);

		const row = await db.deposit.findFirstOrThrow({
			where: { id: entry.id },
			select: { verifiedById: true, verifiedAt: true },
		});

		expect(row.verifiedById).toBe(ids.admin);
		expect(row.verifiedAt).not.toBeNull();
	});

	it("records every concurrent payment, and the total counts them all", async () => {
		const clientRef = await converted();

		const payments = ["100", "200", "300", "400"].map((amount) =>
			deposits.record(actors.salesA, {
				clientRef,
				entryType: "PAYMENT",
				amount,
				method: "Bank transfer",
				reference: null,
				note: null,
				correctsId: null,
				occurredAt: new Date().toISOString(),
			}),
		);

		const answers = await settled(payments);

		expect(answers.every((one) => one.status === "fulfilled")).toBe(true);

		const ledger = await deposits.forClient(actors.salesA, clientRef);

		expect(ledger.totals.total).toBe("1000.00");
		expect(ledger.totals.entryCount).toBe(4);
	});

	it("refuses a second person the same email, whichever arrives first", async () => {
		const email = `twice.${unique().toLowerCase()}@student.example`;

		const answers = await settled(
			["Rahul", "Aisha"].map((firstName) =>
				clients.create(actors.salesA, {
					vertical: "ACADEMY",
					firstName,
					lastName: unique(),
					email,
					phone: null,
					country: null,
					city: null,
					source: null,
					salesOwnerId: null,
				}),
			),
		);

		expect(answers.filter((one) => one.status === "fulfilled")).toHaveLength(1);

		const rows = await db.client.count({ where: { emailNorm: email } });

		expect(rows).toBe(1);
	});
});
