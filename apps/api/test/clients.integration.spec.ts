import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";

const suffix = process.env.TEST_RUN_ID ?? "clients-spec";

const ids = {
	admin: `clients-${suffix}-admin`,
	salesA: `clients-${suffix}-sales-a`,
	salesB: `clients-${suffix}-sales-b`,
	mentorA: `clients-${suffix}-mentor-a`,
	estate: `clients-${suffix}-estate`,
	finance: `clients-${suffix}-finance`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8);
}

async function cleanUp(): Promise<void> {
	await db.client.deleteMany({ where: { createdById: { in: staffIds } } });
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
	await db.staffProfile.create({
		data: { userId: ids.estate, role: "SALES", verticals: ["REAL_ESTATE"] },
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

	throw new Error("the service accepted a call it should have refused");
}

async function newLead(actor: Actor) {
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

describe("entering a person", () => {
	it("gives them a permanent reference and keeps the creator", async () => {
		const created = await newLead(actors.salesA);

		expect(created.clientRef).toMatch(/^CL-\d{6}$/);
		expect(created.createdBy?.userId).toBe(ids.salesA);
		expect(created.salesOwner?.userId).toBe(ids.salesA);
		expect(created.status).toBe("LEAD");
	});

	it("refuses a person nobody can reach", async () => {
		expect(
			await refused(() =>
				clients.create(actors.salesA, {
					vertical: "ACADEMY",
					firstName: "No",
					lastName: "Contact",
					email: null,
					phone: null,
					country: null,
					city: null,
					source: null,
					salesOwnerId: null,
				}),
			),
		).toMatch(/email or a phone/);
	});

	it("refuses a second row for the same human", async () => {
		const email = `twice.${unique()}@student.example`;
		await clients.create(actors.salesA, {
			vertical: "ACADEMY",
			firstName: "Aisha",
			lastName: unique(),
			email,
			phone: null,
			country: null,
			city: null,
			source: null,
			salesOwnerId: null,
		});

		expect(
			await refused(() =>
				clients.create(actors.salesA, {
					vertical: "ACADEMY",
					firstName: "Aisha",
					lastName: unique(),
					email: email.toUpperCase(),
					phone: null,
					country: null,
					city: null,
					source: null,
					salesOwnerId: null,
				}),
			),
		).toMatch(/already in the CRM/);
	});

	it("refuses a business line the person does not work in", async () => {
		expect(
			await refused(() =>
				clients.create(actors.salesA, {
					vertical: "REAL_ESTATE",
					firstName: "Flat",
					lastName: unique(),
					email: `flat.${unique()}@owner.example`,
					phone: null,
					country: null,
					city: null,
					source: null,
					salesOwnerId: null,
				}),
			),
		).toMatch(/do not work in that business line/);
	});

	it("does not let a mentor enter people", async () => {
		expect(await refused(() => newLead(actors.mentorA))).toMatch(
			/cannot enter new people/,
		);
	});
});

describe("who can see a client", () => {
	it("hides one rep's client from another", async () => {
		const mine = await newLead(actors.salesA);

		expect(
			await refused(() => clients.byRef(actors.salesB, mine.clientRef)),
		).toMatch(/not yours to see/);
	});

	it("says the same thing for a reference that does not exist", async () => {
		const theirs = await newLead(actors.salesA);

		const missing = await refused(() =>
			clients.byRef(actors.salesB, "CL-000000"),
		);
		const hidden = await refused(() =>
			clients.byRef(actors.salesB, theirs.clientRef),
		);

		expect(missing).toBe(hidden);
	});

	it("keeps a list to the rows the reader owns", async () => {
		await newLead(actors.salesA);
		await newLead(actors.salesB);

		const seen = await clients.list(actors.salesB, {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 100,
			vertical: "ACADEMY",
			view: "clients",
			status: [],
			salesOwner: [],
			mentorOwner: [],
			source: [],
		});

		expect(seen.rows.length).toBeGreaterThan(0);
		expect(
			seen.rows.every((row) => row.salesOwner?.userId === ids.salesB),
		).toBe(true);
	});

	it("refuses a list in a line the reader does not work", async () => {
		expect(
			await refused(() =>
				clients.list(actors.salesA, {
					q: "",
					sort: "",
					dir: "asc",
					page: 1,
					pageSize: 25,
					vertical: "REAL_ESTATE",
					view: "clients",
					status: [],
					salesOwner: [],
					mentorOwner: [],
					source: [],
				}),
			),
		).toMatch(/do not work in that business line/);
	});
});

describe("the three views", () => {
	it("puts a lead in Leads and not in Students", async () => {
		const lead = await newLead(actors.salesA);

		const query = {
			q: lead.clientRef,
			sort: "",
			dir: "asc" as const,
			page: 1,
			pageSize: 25,
			vertical: "ACADEMY" as const,
			status: [],
			salesOwner: [],
			mentorOwner: [],
			source: [],
		};

		expect(
			(await clients.list(actors.salesA, { ...query, view: "leads" })).total,
		).toBe(1);
		expect(
			(await clients.list(actors.salesA, { ...query, view: "students" })).total,
		).toBe(0);
		expect(
			(await clients.list(actors.salesA, { ...query, view: "clients" })).total,
		).toBe(1);
	});

	it("offers Real Estate two views, not three", () => {
		expect(clients.workspace(actors.estate).views).toEqual([
			"leads",
			"clients",
		]);
		expect(clients.workspace(actors.salesA).views).toEqual([
			"leads",
			"clients",
			"students",
		]);
	});
});

describe("assigning a mentor", () => {
	it("moves a qualified lead to mentor-assigned in one step", async () => {
		const lead = await newLead(actors.salesA);

		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "QUALIFIED",
			reason: null,
		});

		const assigned = await clients.assignMentor(actors.salesA, {
			clientRef: lead.clientRef,
			userId: ids.mentorA,
		});

		expect(assigned.status).toBe("MENTOR_ASSIGNED");
		expect(assigned.mentorOwner?.userId).toBe(ids.mentorA);
		expect(assigned.salesOwner?.userId).toBe(ids.salesA);
	});

	it("refuses a mentor who is not on the mentor side", async () => {
		const lead = await newLead(actors.salesA);

		expect(
			await refused(() =>
				clients.assignMentor(actors.salesA, {
					clientRef: lead.clientRef,
					userId: ids.salesB,
				}),
			),
		).toMatch(/mentor side/);
	});
});

describe("conversion", () => {
	async function readyToConvert() {
		const lead = await newLead(actors.salesA);

		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "QUALIFIED",
			reason: null,
		});
		await clients.assignMentor(actors.salesA, {
			clientRef: lead.clientRef,
			userId: ids.mentorA,
		});

		return lead.clientRef;
	}

	it("keeps the same row and the same reference", async () => {
		const before = await db.client.count();
		const clientRef = await readyToConvert();

		const converted = await clients.convert(actors.mentorA, {
			clientRef,
			mentorId: null,
		});

		expect(converted.clientRef).toBe(clientRef);
		expect(converted.status).toBe("CONVERTED");
		expect(converted.convertedBy?.userId).toBe(ids.mentorA);
		expect(converted.convertedAt).not.toBeNull();
		expect(converted.createdBy?.userId).toBe(ids.salesA);
		expect(converted.salesOwner?.userId).toBe(ids.salesA);
		expect(await db.client.count()).toBe(before + 1);
	});

	it("happens once", async () => {
		const clientRef = await readyToConvert();
		await clients.convert(actors.mentorA, { clientRef, mentorId: null });

		expect(
			await refused(() =>
				clients.convert(actors.mentorA, { clientRef, mentorId: null }),
			),
		).toMatch(/converts once/);
	});

	it("is not something setStatus will do", async () => {
		const clientRef = await readyToConvert();

		expect(
			await refused(() =>
				clients.setStatus(actors.mentorA, {
					clientRef,
					status: "CONVERTED",
					reason: null,
				}),
			),
		).toMatch(/its own action/);
	});

	it("refuses an academy client with no mentor", async () => {
		const lead = await newLead(actors.salesA);
		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "QUALIFIED",
			reason: null,
		});

		expect(
			await refused(() =>
				clients.convert(actors.admin, {
					clientRef: lead.clientRef,
					mentorId: null,
				}),
			),
		).toMatch(/converts with a mentor/);
	});

	it("is not a salesperson's to close", async () => {
		const clientRef = await readyToConvert();

		expect(
			await refused(() =>
				clients.convert(actors.salesA, { clientRef, mentorId: null }),
			),
		).toMatch(/cannot close a conversion/);
	});
});

describe("moving a status", () => {
	it("asks why before losing a client", async () => {
		const lead = await newLead(actors.salesA);

		expect(
			await refused(() =>
				clients.setStatus(actors.salesA, {
					clientRef: lead.clientRef,
					status: "LOST",
					reason: null,
				}),
			),
		).toMatch(/Say why/);

		const lost = await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "LOST",
			reason: "Went with another academy",
		});

		expect(lost.status).toBe("LOST");
	});

	it("records the reason and the person in the history", async () => {
		const lead = await newLead(actors.salesA);

		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "DORMANT",
			reason: "No answer in six weeks",
		});

		expect(
			(await clients.history(actors.salesA, lead.clientRef))[0],
		).toMatchObject({
			fromStatus: "LEAD",
			toStatus: "DORMANT",
			reason: "No answer in six weeks",
			changedBy: { userId: ids.salesA, name: "salesA" },
		});
	});

	it("refuses a jump that skips a step", async () => {
		const lead = await newLead(actors.salesA);

		expect(
			await refused(() =>
				clients.setStatus(actors.salesA, {
					clientRef: lead.clientRef,
					status: "STUDENT",
					reason: null,
				}),
			),
		).toMatch(/one step at a time/);
	});

	it("keeps a converted client from walking backwards without an admin", async () => {
		const lead = await newLead(actors.salesA);
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

		expect(
			await refused(() =>
				clients.setStatus(actors.mentorA, {
					clientRef: lead.clientRef,
					status: "QUALIFIED",
					reason: "Entered by mistake",
				}),
			),
		).toMatch(/Only an administrator/);

		expect(
			(
				await clients.setStatus(actors.admin, {
					clientRef: lead.clientRef,
					status: "QUALIFIED",
					reason: "Entered by mistake",
				})
			).status,
		).toBe("QUALIFIED");
	});
});

describe("the duplicate check before entry", () => {
	it("names the match the asker is allowed to see", async () => {
		const mine = await newLead(actors.salesA);

		expect(
			await clients.duplicateCheck(actors.salesA, {
				email: mine.email,
				phone: null,
			}),
		).toMatchObject({
			exists: true,
			match: { clientRef: mine.clientRef },
		});
	});

	it("says somebody is there without saying who", async () => {
		const theirs = await newLead(actors.salesA);

		expect(
			await clients.duplicateCheck(actors.salesB, {
				email: theirs.email,
				phone: null,
			}),
		).toEqual({ exists: true, match: null });
	});

	it("is quiet about a person nobody has entered", async () => {
		expect(
			await clients.duplicateCheck(actors.salesA, {
				email: `nobody.${unique()}@student.example`,
				phone: null,
			}),
		).toEqual({ exists: false, match: null });
	});
});

describe("money", () => {
	it("is never a mentor's to see, even on their own client", async () => {
		const lead = await newLead(actors.salesA);
		await clients.setStatus(actors.salesA, {
			clientRef: lead.clientRef,
			status: "QUALIFIED",
			reason: null,
		});
		await clients.assignMentor(actors.salesA, {
			clientRef: lead.clientRef,
			userId: ids.mentorA,
		});

		const asMentor = await clients.byRef(actors.mentorA, lead.clientRef);
		const asSales = await clients.byRef(actors.salesA, lead.clientRef);

		expect(asMentor.canSeeMoney).toBe(false);
		expect(asSales.canSeeMoney).toBe(true);
	});
});
