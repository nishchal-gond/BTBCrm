import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";
import { ProgramsService } from "../src/programs/programs.service";

const suffix = process.env.TEST_RUN_ID ?? "programs-spec";

const ids = {
	admin: `prog-${suffix}-admin`,
	salesA: `prog-${suffix}-sales-a`,
	mentorA: `prog-${suffix}-mentor-a`,
	mentorB: `prog-${suffix}-mentor-b`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);
const programs = new ProgramsService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8).toUpperCase();
}

let programId = "";

async function cleanUp(): Promise<void> {
	const mine = await db.client.findMany({
		where: { createdById: { in: staffIds } },
		select: { id: true },
	});
	const clientIds = mine.map((row) => row.id);

	await db.enrollment.deleteMany({ where: { clientId: { in: clientIds } } });
	await db.program.deleteMany({ where: { code: { startsWith: "T-" } } });
	await db.client.deleteMany({ where: { id: { in: clientIds } } });
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
	await db.staffProfile.create({
		data: { userId: ids.mentorB, role: "MENTOR" },
	});

	for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
		const actor = await loadActor(db, ids[key]);
		if (!actor) throw new Error(`${key} has no profile`);
		actors[key] = actor;
	}

	const program = await programs.create(actors.admin, {
		code: `T-${unique()}`,
		name: "Foundation",
		description: null,
		durationWeeks: 12,
		priceAed: "25000",
	});

	programId = program.id;
});

afterAll(cleanUp);

async function refused(work: () => Promise<unknown>): Promise<string> {
	try {
		await work();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("the service accepted something it should have refused");
}

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

describe("defining a programme", () => {
	it("is an administrator's to do", async () => {
		expect(
			await refused(() =>
				programs.create(actors.mentorA, {
					code: `T-${unique()}`,
					name: "Not yours",
					description: null,
					durationWeeks: 4,
					priceAed: "1000",
				}),
			),
		).toMatch(/administrator's to define/);
	});

	it("keeps the price exact", async () => {
		const program = await programs.create(actors.admin, {
			code: `T-${unique()}`,
			name: "Priced",
			description: null,
			durationWeeks: 8,
			priceAed: "1250.50",
		});

		expect(program.priceAed).toBe("1250.50");
	});

	it("refuses a duplicate code", async () => {
		const code = `T-${unique()}`;
		await programs.create(actors.admin, {
			code,
			name: "First",
			description: null,
			durationWeeks: 4,
			priceAed: "100",
		});

		expect(
			await refused(() =>
				programs.create(actors.admin, {
					code,
					name: "Second",
					description: null,
					durationWeeks: 4,
					priceAed: "100",
				}),
			),
		).toMatch(/already exists/);
	});

	it("refuses a negative price", async () => {
		expect(
			await refused(() =>
				programs.create(actors.admin, {
					code: `T-${unique()}`,
					name: "Backwards",
					description: null,
					durationWeeks: 4,
					priceAed: "-100",
				}),
			),
		).toMatch(/never negative/);
	});
});

describe("enrolling a student", () => {
	it("moves a converted client to student in one write", async () => {
		const clientRef = await converted();

		const enrollment = await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: "Jan 2026",
			notes: null,
		});

		expect(enrollment.status).toBe("ACTIVE");
		expect(enrollment.mentor?.userId).toBe(ids.mentorA);
		expect((await clients.byRef(actors.mentorA, clientRef)).status).toBe(
			"STUDENT",
		);
	});

	it("keeps the same row and the same reference", async () => {
		const before = await db.client.count();
		const clientRef = await converted();
		await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});

		const client = await clients.byRef(actors.mentorA, clientRef);

		expect(client.clientRef).toBe(clientRef);
		expect(client.createdBy?.userId).toBe(ids.salesA);
		expect(await db.client.count()).toBe(before + 1);
	});

	it("refuses a client who has not converted", async () => {
		const created = await clients.create(actors.salesA, {
			vertical: "ACADEMY",
			firstName: "Too",
			lastName: unique(),
			email: `too.${unique().toLowerCase()}@student.example`,
			phone: null,
			country: null,
			city: null,
			source: null,
			salesOwnerId: null,
		});

		expect(
			await refused(() =>
				programs.enroll(actors.admin, {
					clientRef: created.clientRef,
					programId,
					mentorId: null,
					cohort: null,
					notes: null,
				}),
			),
		).toMatch(/enrols once they convert/);
	});

	it("allows one running enrolment at a time", async () => {
		const clientRef = await converted();
		await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});

		expect(
			await refused(() =>
				programs.enroll(actors.mentorA, {
					clientRef,
					programId,
					mentorId: null,
					cohort: null,
					notes: null,
				}),
			),
		).toMatch(/already on a programme/);
	});

	it("is not a salesperson's to do", async () => {
		const clientRef = await converted();

		expect(
			await refused(() =>
				programs.enroll(actors.salesA, {
					clientRef,
					programId,
					mentorId: null,
					cohort: null,
					notes: null,
				}),
			),
		).toMatch(/mentor or an administrator/);
	});

	it("refuses a retired programme", async () => {
		const retired = await programs.create(actors.admin, {
			code: `T-${unique()}`,
			name: "Retired",
			description: null,
			durationWeeks: 4,
			priceAed: "100",
		});
		await programs.update(actors.admin, { id: retired.id, isActive: false });

		const clientRef = await converted();

		expect(
			await refused(() =>
				programs.enroll(actors.mentorA, {
					clientRef,
					programId: retired.id,
					mentorId: null,
					cohort: null,
					notes: null,
				}),
			),
		).toMatch(/retired/);
	});
});

describe("a student has an active enrolment", () => {
	it("refuses the status move when nothing is enrolled", async () => {
		const clientRef = await converted();

		expect(
			await refused(() =>
				clients.setStatus(actors.mentorA, {
					clientRef,
					status: "STUDENT",
					reason: null,
				}),
			),
		).toMatch(/enrol them on a programme first/);
	});

	it("refuses a client entered straight as a student", async () => {
		expect(
			await refused(() =>
				db.client.create({
					data: {
						firstName: "Straight",
						lastName: unique(),
						email: `straight.${unique().toLowerCase()}@student.example`,
						status: "STUDENT",
						mentorOwnerId: ids.mentorA,
						convertedById: ids.mentorA,
						convertedAt: new Date(),
						createdById: ids.salesA,
						salesOwnerId: ids.salesA,
					},
				}),
			),
		).toMatch(/never on entry/);
	});
});

describe("finishing a programme", () => {
	async function enrolled() {
		const clientRef = await converted();
		const enrollment = await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});

		return { clientRef, id: enrollment.id };
	}

	it("stamps the day it completed", async () => {
		const { id } = await enrolled();

		const done = await programs.move(actors.mentorA, {
			id,
			status: "COMPLETED",
			notes: null,
		});

		expect(done.status).toBe("COMPLETED");
		expect(done.completedAt).not.toBeNull();
		expect(done.progressPercent).toBe(100);
	});

	it("refuses to reopen a finished enrolment", async () => {
		const { id } = await enrolled();
		await programs.move(actors.mentorA, {
			id,
			status: "WITHDRAWN",
			notes: "Changed their mind",
		});

		expect(
			await refused(() =>
				programs.move(actors.mentorA, { id, status: "ACTIVE", notes: null }),
			),
		).toMatch(/history/);
	});

	it("frees the student to enrol again", async () => {
		const { clientRef, id } = await enrolled();
		await programs.move(actors.mentorA, {
			id,
			status: "COMPLETED",
			notes: null,
		});

		const again = await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});

		expect(again.status).toBe("ACTIVE");
		expect(
			(await programs.forClient(actors.mentorA, clientRef)).rows,
		).toHaveLength(2);
	});

	it("refuses to retire a programme somebody is still on", async () => {
		await enrolled();

		expect(
			await refused(() =>
				programs.update(actors.admin, { id: programId, isActive: false }),
			),
		).toMatch(/still on this programme/);
	});
});

describe("one enrolment at a time, paused or not", () => {
	async function enrolledOn(clientRef: string) {
		return programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});
	}

	it("keeps a paused enrolment as the current one", async () => {
		const clientRef = await converted();
		const enrollment = await enrolledOn(clientRef);

		await programs.move(actors.mentorA, {
			id: enrollment.id,
			status: "PAUSED",
			notes: null,
		});

		const view = await programs.forClient(actors.mentorA, clientRef);

		expect(view.active?.id).toBe(enrollment.id);
		expect(view.active?.status).toBe("PAUSED");
		expect(view.canEnroll).toBe(false);
	});

	it("refuses a second enrolment while one is paused", async () => {
		const clientRef = await converted();
		const enrollment = await enrolledOn(clientRef);
		await programs.move(actors.mentorA, {
			id: enrollment.id,
			status: "PAUSED",
			notes: null,
		});

		expect(await refused(() => enrolledOn(clientRef))).toMatch(
			/already on a programme/,
		);
	});

	it("refuses a second open enrolment even when the service is bypassed", async () => {
		const clientRef = await converted();
		const enrollment = await enrolledOn(clientRef);
		await programs.move(actors.mentorA, {
			id: enrollment.id,
			status: "PAUSED",
			notes: null,
		});

		const client = await db.client.findFirstOrThrow({
			where: { clientRef },
			select: { id: true },
		});

		expect(
			await refused(() =>
				db.enrollment.create({
					data: {
						clientId: client.id,
						programId,
						createdById: ids.mentorA,
					},
				}),
			),
		).toMatch(/clientId/);
	});

	it("resumes a paused enrolment", async () => {
		const clientRef = await converted();
		const enrollment = await enrolledOn(clientRef);
		await programs.move(actors.mentorA, {
			id: enrollment.id,
			status: "PAUSED",
			notes: null,
		});

		const resumed = await programs.move(actors.mentorA, {
			id: enrollment.id,
			status: "ACTIVE",
			notes: null,
		});

		expect(resumed.status).toBe("ACTIVE");
	});

	it("does not offer to enrol a client who has not converted", async () => {
		const created = await clients.create(actors.salesA, {
			vertical: "ACADEMY",
			firstName: "Still",
			lastName: unique(),
			email: `still.${unique().toLowerCase()}@student.example`,
			phone: null,
			country: null,
			city: null,
			source: null,
			salesOwnerId: null,
		});

		expect(
			(await programs.forClient(actors.admin, created.clientRef)).canEnroll,
		).toBe(false);
	});

	it("offers to enrol a converted client", async () => {
		const clientRef = await converted();

		expect(
			(await programs.forClient(actors.mentorA, clientRef)).canEnroll,
		).toBe(true);
	});
});

describe("who can see an enrolment", () => {
	it("hides another mentor's student", async () => {
		const clientRef = await converted();
		const enrollment = await programs.enroll(actors.mentorA, {
			clientRef,
			programId,
			mentorId: null,
			cohort: null,
			notes: null,
		});

		expect(
			await refused(() =>
				programs.move(actors.mentorB, {
					id: enrollment.id,
					status: "PAUSED",
					notes: null,
				}),
			),
		).toMatch(/not yours to see/);
	});

	it("carries no personal data on the enrolment row", async () => {
		const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
			"select column_name from information_schema.columns where table_name = 'enrollment'",
		);

		const names = columns.map((column) => column.column_name);

		for (const personal of ["email", "phone", "firstName", "lastName"]) {
			expect(names).not.toContain(personal);
		}
	});
});
