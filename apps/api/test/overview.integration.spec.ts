import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";
import { DepositsService } from "../src/deposits/deposits.service";
import { OverviewService } from "../src/overview/overview.service";
import { withoutDeleteGuards } from "./guards";

const suffix = process.env.TEST_RUN_ID ?? "overview-spec";

const ids = {
	admin: `ovw-${suffix}-admin`,
	salesA: `ovw-${suffix}-sales-a`,
	salesB: `ovw-${suffix}-sales-b`,
	mentorA: `ovw-${suffix}-mentor-a`,
	finance: `ovw-${suffix}-finance`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);
const deposits = new DepositsService(db);
const overview = new OverviewService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8);
}

async function cleanUp(): Promise<void> {
	const mine = await db.client.findMany({
		where: { createdById: { in: staffIds } },
		select: { id: true },
	});
	const clientIds = mine.map((row) => row.id);

	await db.companyEvent.deleteMany({
		where: {
			OR: [{ createdById: { in: staffIds } }, { clientId: { in: clientIds } }],
		},
	});
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

async function leadFor(actor: Actor) {
	return clients.create(actor, {
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
}

const NO_LINE = { vertical: null };

describe("the overview counts only what the viewer may see", () => {
	it("keeps one salesperson's book out of another's numbers", async () => {
		const before = await overview.summary(actors.salesB, NO_LINE);

		await leadFor(actors.salesA);
		await leadFor(actors.salesA);

		const mine = await overview.summary(actors.salesA, NO_LINE);
		const theirs = await overview.summary(actors.salesB, NO_LINE);

		expect(mine.openPipeline).toBeGreaterThanOrEqual(2);
		expect(theirs.openPipeline).toBe(before.openPipeline);
	});

	it("names the scope it is counting at", async () => {
		expect((await overview.summary(actors.admin, NO_LINE)).scope).toBe(
			"company",
		);
		expect((await overview.summary(actors.finance, NO_LINE)).scope).toBe(
			"company",
		);
		expect((await overview.summary(actors.salesA, NO_LINE)).scope).toBe("own");
	});

	it("gives a mentor no money at all", async () => {
		const seen = await overview.summary(actors.mentorA, NO_LINE);

		expect(seen.money).toBeNull();
	});

	it("gives a salesperson their own money", async () => {
		const lead = await leadFor(actors.salesA);

		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "QUALIFIED",
			reason: null,
		});
		await clients.assignMentor(actors.salesA, {
			clientRef: lead.clientRef,
			userId: ids.mentorA,
		});
		await clients.convert(actors.mentorA, {
			clientRef: lead.clientRef,
			mentorId: null,
		});

		await deposits.record(actors.salesA, {
			clientRef: lead.clientRef,
			entryType: "PAYMENT",
			amount: "5000",
			method: "Bank transfer",
			reference: null,
			note: null,
			correctsId: null,
			occurredAt: new Date().toISOString(),
		});

		const seen = await overview.summary(actors.salesA, NO_LINE);

		expect(seen.money).not.toBeNull();
		expect(Number(seen.money?.thisMonth ?? "0")).toBeGreaterThanOrEqual(5000);
		expect(seen.convertedThisMonth).toBeGreaterThanOrEqual(1);
	});

	it("offers an administrator the unassigned pile and a salesperson never", async () => {
		await db.client.create({
			data: {
				vertical: "ACADEMY",
				firstName: "Nobody",
				lastName: unique(),
				email: `nobody.${unique()}@student.example`,
				createdById: ids.admin,
				salesOwnerId: null,
			},
		});

		const boss = await overview.summary(actors.admin, NO_LINE);
		const rep = await overview.summary(actors.salesA, NO_LINE);

		expect(boss.attention.map((row) => row.kind)).toContain("unassigned");
		expect(rep.attention.map((row) => row.kind)).not.toContain("unassigned");
	});

	it("offers the unverified pile only to somebody who may verify", async () => {
		const boss = await overview.summary(actors.admin, NO_LINE);
		const rep = await overview.summary(actors.salesA, NO_LINE);

		expect(rep.attention.map((row) => row.kind)).not.toContain("unverified");
		expect(boss.attention.every((row) => row.count > 0)).toBe(true);
	});

	it("falls back to a line the viewer works in", async () => {
		const forced = await overview.summary(actors.salesA, {
			vertical: "REAL_ESTATE",
		});

		expect(forced.vertical).toBe("ACADEMY");
	});
});
