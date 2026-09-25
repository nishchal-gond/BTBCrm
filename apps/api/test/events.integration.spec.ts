import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ClientsService } from "../src/clients/clients.service";
import { EventsService } from "../src/events/events.service";
import { withoutDeleteGuards } from "./guards";

const suffix = process.env.TEST_RUN_ID ?? "events-spec";

const ids = {
	admin: `evt-${suffix}-admin`,
	salesA: `evt-${suffix}-sales-a`,
	salesB: `evt-${suffix}-sales-b`,
	mentorA: `evt-${suffix}-mentor-a`,
	finance: `evt-${suffix}-finance`,
} as const;

const staffIds = Object.values(ids);

const clients = new ClientsService(db);
const events = new EventsService(db);

const actors = {} as Record<keyof typeof ids, Actor>;

function unique(): string {
	return crypto.randomUUID().slice(0, 8);
}

const HOUR = 60 * 60 * 1000;

function soon(offsetHours: number): string {
	return new Date(Date.now() + offsetHours * HOUR).toISOString();
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

	throw new Error("the service accepted something it should have refused");
}

async function ownedBySalesA(): Promise<string> {
	const created = await clients.create(actors.salesA, {
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

function callOn(clientRef: string | null) {
	return {
		title: "Discovery call",
		description: null,
		eventType: "SALES_CALL" as const,
		startsAt: soon(24),
		endsAt: soon(25),
		timezone: "Asia/Dubai",
		isAllDay: false,
		location: null,
		clientRef,
		attendeeIds: [],
	};
}

describe("booking an event", () => {
	it("puts a sales call on the client's schedule", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, callOn(clientRef));

		expect(event.clientRef).toBe(clientRef);
		expect(event.organizer.userId).toBe(ids.salesA);
		expect(event.viewerResponse).toBe("ACCEPTED");

		const schedule = await events.forClient(actors.salesA, clientRef);

		expect(schedule.upcoming.map((row) => row.id)).toContain(event.id);
		expect(schedule.past).toHaveLength(0);
	});

	it("separates what has finished from what has not", async () => {
		const clientRef = await ownedBySalesA();

		const done = await events.create(actors.admin, {
			...callOn(clientRef),
			title: "Last week",
			startsAt: soon(-72),
			endsAt: soon(-71),
		});

		const ahead = await events.create(actors.admin, {
			...callOn(clientRef),
			title: "Next week",
		});

		const schedule = await events.forClient(actors.admin, clientRef);

		expect(schedule.past.map((row) => row.id)).toEqual([done.id]);
		expect(schedule.upcoming.map((row) => row.id)).toEqual([ahead.id]);
	});

	it("refuses an event that ends before it starts", async () => {
		const clientRef = await ownedBySalesA();

		expect(
			await refused(() =>
				events.create(actors.salesA, {
					...callOn(clientRef),
					startsAt: soon(25),
					endsAt: soon(24),
				}),
			),
		).toMatch(/ends after it starts/);
	});

	it("refuses an event longer than a day", async () => {
		const clientRef = await ownedBySalesA();

		expect(
			await refused(() =>
				events.create(actors.salesA, {
					...callOn(clientRef),
					startsAt: soon(1),
					endsAt: soon(40),
				}),
			),
		).toMatch(/at most 24 hours/);
	});

	it("refuses a time zone the database does not know", async () => {
		const clientRef = await ownedBySalesA();
		const client = await db.client.findFirstOrThrow({
			where: { clientRef },
			select: { id: true },
		});

		expect(
			await refused(() =>
				db.companyEvent.create({
					data: {
						title: "Nowhere",
						eventType: "OTHER",
						startsAt: new Date(),
						endsAt: new Date(Date.now() + HOUR),
						timezone: "Mars/Olympus",
						organizerId: ids.admin,
						createdById: ids.admin,
						clientId: client.id,
					},
				}),
			),
		).toMatch(/IANA identifier/);
	});
});

describe("who may create which kind of event", () => {
	it("refuses a salesperson a mentor session", async () => {
		const clientRef = await ownedBySalesA();

		expect(
			await refused(() =>
				events.create(actors.salesA, {
					...callOn(clientRef),
					eventType: "MENTOR_SESSION",
				}),
			),
		).toMatch(/other side of the business/);
	});

	it("refuses a salesperson a company meeting", async () => {
		expect(
			await refused(() =>
				events.create(actors.salesA, {
					...callOn(null),
					eventType: "COMPANY_MEETING",
				}),
			),
		).toMatch(/administrator's to create/);
	});

	it("lets an administrator create a company meeting with no client", async () => {
		const event = await events.create(actors.admin, {
			...callOn(null),
			eventType: "COMPANY_MEETING",
			title: "All hands",
		});

		expect(event.clientRef).toBeNull();
	});

	it("refuses a company meeting that names a client", async () => {
		const clientRef = await ownedBySalesA();

		expect(
			await refused(() =>
				events.create(actors.admin, {
					...callOn(clientRef),
					eventType: "COMPANY_MEETING",
				}),
			),
		).toMatch(/belongs to the company/);
	});

	it("lets both sides create an onboarding", async () => {
		const clientRef = await ownedBySalesA();

		const bySales = await events.create(actors.salesA, {
			...callOn(clientRef),
			eventType: "ONBOARDING",
		});

		expect(bySales.eventType).toBe("ONBOARDING");
	});
});

describe("who may see an event", () => {
	it("hides another salesperson's client meeting", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, callOn(clientRef));

		expect(
			await refused(() =>
				events.update(actors.salesB, { id: event.id, title: "Mine now" }),
			),
		).toMatch(/not yours to see/);
	});

	it("hides the client's schedule from another salesperson", async () => {
		const clientRef = await ownedBySalesA();
		await events.create(actors.salesA, callOn(clientRef));

		expect(
			await refused(() => events.forClient(actors.salesB, clientRef)),
		).toMatch(/not yours to see/);
	});

	it("shows a company meeting to everybody", async () => {
		const event = await events.create(actors.admin, {
			...callOn(null),
			eventType: "INTERNAL_TRAINING",
			title: "Compliance refresher",
		});

		const answered = await events.respond(actors.admin, {
			id: event.id,
			response: "ACCEPTED",
		});

		expect(answered.isCancelled).toBe(false);

		expect(
			await refused(() =>
				events.respond(actors.salesB, { id: event.id, response: "ACCEPTED" }),
			),
		).toMatch(/not on the invitation/);
	});

	it("lets an invited person answer, and only for themselves", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, {
			...callOn(clientRef),
			attendeeIds: [ids.mentorA],
		});

		const answered = await events.respond(actors.mentorA, {
			id: event.id,
			response: "DECLINED",
		});

		expect(answered.viewerResponse).toBe("DECLINED");
		expect(
			answered.attendees.find((one) => one.userId === ids.mentorA)?.respondedAt,
		).not.toBeNull();
	});
});

describe("changing an event", () => {
	it("refuses anybody but the organiser and an administrator", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, {
			...callOn(clientRef),
			attendeeIds: [ids.mentorA],
		});

		expect(
			await refused(() =>
				events.update(actors.mentorA, { id: event.id, title: "Moved" }),
			),
		).toMatch(/organiser or an administrator/);
	});

	it("cancels without deleting, and keeps the reason", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, callOn(clientRef));

		const cancelled = await events.cancel(actors.salesA, {
			id: event.id,
			reason: "Client is travelling",
		});

		expect(cancelled.isCancelled).toBe(true);
		expect(cancelled.description).toMatch(/Client is travelling/);
		expect(cancelled.canEdit).toBe(false);

		const row = await db.companyEvent.findUnique({
			where: { id: event.id },
			select: { cancelledAt: true },
		});

		expect(row?.cancelledAt).not.toBeNull();
	});

	it("refuses to change a cancelled event", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, callOn(clientRef));
		await events.cancel(actors.salesA, { id: event.id, reason: null });

		expect(
			await refused(() =>
				events.update(actors.salesA, { id: event.id, title: "Back on" }),
			),
		).toMatch(/cancelled/);
	});
});

describe("busy ranges", () => {
	it("returns times only, with no title and no client", async () => {
		const clientRef = await ownedBySalesA();
		await events.create(actors.salesA, {
			...callOn(clientRef),
			title: "Secret deal review",
		});

		const ranges = await events.busyRanges({
			userIds: [ids.salesA],
			from: soon(0),
			to: soon(48),
		});

		expect(ranges.length).toBeGreaterThan(0);

		for (const range of ranges) {
			expect(Object.keys(range).sort()).toEqual([
				"endsAt",
				"startsAt",
				"userId",
			]);
		}

		expect(JSON.stringify(ranges)).not.toMatch(/Secret deal review/);
		expect(JSON.stringify(ranges)).not.toMatch(clientRef);
	});

	it("leaves a cancelled event out of the busy list", async () => {
		const clientRef = await ownedBySalesA();
		const event = await events.create(actors.salesA, {
			...callOn(clientRef),
			startsAt: soon(200),
			endsAt: soon(201),
		});

		await events.cancel(actors.salesA, { id: event.id, reason: null });

		const ranges = await events.busyRanges({
			userIds: [ids.salesA],
			from: soon(199),
			to: soon(202),
		});

		expect(ranges).toHaveLength(0);
	});

	it("refuses a window longer than the horizon", async () => {
		expect(
			await refused(() =>
				events.busyRanges({
					userIds: [ids.mentorA],
					from: soon(0),
					to: soon(24 * 100),
				}),
			),
		).toMatch(/at most 62 days/);
	});
});
