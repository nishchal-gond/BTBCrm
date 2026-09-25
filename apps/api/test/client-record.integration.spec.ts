import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma, withActor } from "@crm/db";
import { withoutDeleteGuards } from "./guards";

const suffix = process.env.TEST_RUN_ID ?? "client-record-spec";

const ids = {
	sales: `client-${suffix}-sales`,
	mentor: `client-${suffix}-mentor`,
	other: `client-${suffix}-other`,
} as const;

const staffIds = Object.values(ids);

function mail(local: string): string {
	return `${local}.${suffix}@academy.example`;
}

async function cleanUp(): Promise<void> {
	await withoutDeleteGuards(async () => {
		await db.client.deleteMany({ where: { createdById: { in: staffIds } } });
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

	await db.staffProfile.create({ data: { userId: ids.sales, role: "SALES" } });
	await db.staffProfile.create({
		data: { userId: ids.mentor, role: "MENTOR" },
	});
	await db.staffProfile.create({ data: { userId: ids.other, role: "SALES" } });
});

afterAll(cleanUp);

async function refused(work: () => Promise<unknown>): Promise<string> {
	try {
		await work();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("the database accepted a row it should have refused");
}

async function lead(
	overrides: Partial<Prisma.ClientUncheckedCreateInput> = {},
) {
	return db.client.create({
		data: {
			firstName: "Rahul",
			lastName: "Sharma",
			email: mail(`rahul.${crypto.randomUUID()}`),
			createdById: ids.sales,
			salesOwnerId: ids.sales,
			...overrides,
		},
	});
}

describe("the permanent client reference", () => {
	it("is written by the database, not the caller", async () => {
		const row = await lead();
		expect(row.clientRef).toMatch(/^CL-\d{6}$/);
	});

	it("counts up, so two people never share one", async () => {
		const [first, second] = await Promise.all([lead(), lead()]);
		expect(first.clientRef).not.toBe(second.clientRef);
	});

	it("refuses to change", async () => {
		const row = await lead();

		expect(
			await refused(() =>
				db.client.update({
					where: { id: row.id },
					data: { clientRef: "CL-999999" },
				}),
			),
		).toMatch(/permanent/);
	});

	it("survives every step of the lifecycle", async () => {
		const row = await lead();

		await db.client.update({
			where: { id: row.id },
			data: { status: "QUALIFIED" },
		});
		await db.client.update({
			where: { id: row.id },
			data: { status: "MENTOR_ASSIGNED", mentorOwnerId: ids.mentor },
		});
		const converted = await db.client.update({
			where: { id: row.id },
			data: {
				status: "CONVERTED",
				convertedById: ids.mentor,
				convertedAt: new Date(),
			},
		});

		expect(converted.id).toBe(row.id);
		expect(converted.clientRef).toBe(row.clientRef);
		expect(converted.createdById).toBe(ids.sales);
		expect(await db.client.count({ where: { clientRef: row.clientRef } })).toBe(
			1,
		);
	});
});

describe("who entered the person", () => {
	it("cannot be rewritten", async () => {
		const row = await lead();

		expect(
			await refused(() =>
				db.client.update({
					where: { id: row.id },
					data: { createdById: ids.other },
				}),
			),
		).toMatch(/createdById/);
	});
});

describe("conversion", () => {
	it("happens once", async () => {
		const at = new Date();
		const row = await lead({
			status: "CONVERTED",
			mentorOwnerId: ids.mentor,
			convertedById: ids.mentor,
			convertedAt: at,
		});

		expect(
			await refused(() =>
				db.client.update({
					where: { id: row.id },
					data: { convertedById: ids.other, convertedAt: new Date() },
				}),
			),
		).toMatch(/converts once/);
	});

	it("refuses a stamp with only half of it filled in", async () => {
		expect(await refused(() => lead({ convertedAt: new Date() }))).toMatch(
			/client_conversion_pair/,
		);
	});

	it("refuses a converted client with no stamp", async () => {
		expect(
			await refused(() =>
				lead({ status: "CONVERTED", mentorOwnerId: ids.mentor }),
			),
		).toMatch(/client_conversion_chain/);
	});

	it("refuses a converted academy client with no mentor", async () => {
		expect(
			await refused(() =>
				lead({
					status: "CONVERTED",
					convertedById: ids.mentor,
					convertedAt: new Date(),
				}),
			),
		).toMatch(/client_mentor_required/);
	});
});

describe("contact details", () => {
	it("refuses a person with no way to reach them", async () => {
		expect(await refused(() => lead({ email: null, phone: null }))).toMatch(
			/client_contact_channel/,
		);
	});

	it("refuses a blank name", async () => {
		expect(await refused(() => lead({ firstName: "   " }))).toMatch(
			/client_name_present/,
		);
	});

	it("refuses a country that is not an ISO code", async () => {
		expect(
			await refused(() => lead({ country: "United Arab Emirates" })),
		).toMatch(/client_country_code/);
	});

	it("normalises the email and the phone", async () => {
		const row = await lead({
			email: `  ${mail(`MiXeD.${crypto.randomUUID()}`).toUpperCase()} `,
			phone: "+971 (50) 123-4567",
		});

		expect(row.emailNorm).toBe(row.email?.trim().toLowerCase() ?? null);
		expect(row.phoneNorm).toBe("971501234567");
	});

	it("keeps one human from becoming two rows", async () => {
		const shared = mail(`shared.${crypto.randomUUID()}`);
		await lead({ email: shared });

		expect(await refused(() => lead({ email: shared.toUpperCase() }))).toMatch(
			/emailNorm/,
		);
	});

	it("lets a lost lead come back without blocking the address", async () => {
		const shared = mail(`returning.${crypto.randomUUID()}`);
		const first = await lead({ email: shared });

		await db.client.update({
			where: { id: first.id },
			data: { status: "LOST" },
		});

		const second = await lead({ email: shared });
		expect(second.id).not.toBe(first.id);
	});
});

describe("the business line", () => {
	it("refuses an academy-only status on a real-estate record", async () => {
		expect(
			await refused(() =>
				lead({ vertical: "REAL_ESTATE", status: "MENTOR_ASSIGNED" }),
			),
		).toMatch(/client_vertical_status/);
	});

	it("does not ask a real-estate client for a mentor", async () => {
		const row = await lead({
			vertical: "REAL_ESTATE",
			status: "CONVERTED",
			convertedById: ids.sales,
			convertedAt: new Date(),
		});

		expect(row.mentorOwnerId).toBeNull();
	});
});

describe("the status history", () => {
	it("records the first status when the person is entered", async () => {
		const row = await lead();

		expect(
			await db.clientStatusHistory.findMany({
				where: { clientId: row.id },
				select: { fromStatus: true, toStatus: true },
			}),
		).toEqual([{ fromStatus: null, toStatus: "LEAD" }]);
	});

	it("records every move, in order", async () => {
		const row = await lead();

		await db.client.update({
			where: { id: row.id },
			data: { status: "QUALIFIED" },
		});
		await db.client.update({
			where: { id: row.id },
			data: { status: "MENTOR_ASSIGNED", mentorOwnerId: ids.mentor },
		});

		expect(
			await db.clientStatusHistory.findMany({
				where: { clientId: row.id },
				orderBy: { changedAt: "asc" },
				select: { fromStatus: true, toStatus: true },
			}),
		).toEqual([
			{ fromStatus: null, toStatus: "LEAD" },
			{ fromStatus: "LEAD", toStatus: "QUALIFIED" },
			{ fromStatus: "QUALIFIED", toStatus: "MENTOR_ASSIGNED" },
		]);
	});

	it("writes nothing when a status does not move", async () => {
		const row = await lead();

		await db.client.update({
			where: { id: row.id },
			data: { city: "Dubai" },
		});

		expect(
			await db.clientStatusHistory.count({ where: { clientId: row.id } }),
		).toBe(1);
	});

	it("names the person who moved it when the actor is set", async () => {
		const row = await lead();

		await withActor(
			db,
			{ actorId: ids.mentor, statusReason: "Signed the enrolment form" },
			(tx) =>
				tx.client.update({
					where: { id: row.id },
					data: { status: "QUALIFIED" },
				}),
		);

		expect(
			await db.clientStatusHistory.findFirst({
				where: { clientId: row.id, toStatus: "QUALIFIED" },
				select: { changedById: true, reason: true },
			}),
		).toEqual({
			changedById: ids.mentor,
			reason: "Signed the enrolment form",
		});
	});

	it("leaves the mover blank rather than guessing", async () => {
		const row = await lead();

		await db.client.update({
			where: { id: row.id },
			data: { status: "QUALIFIED" },
		});

		expect(
			await db.clientStatusHistory.findFirst({
				where: { clientId: row.id, toStatus: "QUALIFIED" },
				select: { changedById: true, reason: true },
			}),
		).toEqual({ changedById: null, reason: null });
	});
});
