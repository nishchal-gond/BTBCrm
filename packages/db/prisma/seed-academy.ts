import { db } from "../src/client";
import { Prisma } from "../src/generated/prisma/client";
import type {
	ClientStatus,
	CompanyEventType,
	StaffRole,
} from "../src/generated/prisma/enums";
import { markOnboarded, WORKSPACE_ID } from "../src/workspace";

const WORKSPACE_WEBSITE = "tradingacademy.ae";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = makeRandom(20260924);

function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error("pick() on an empty list");
	return item;
}

function integer(min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1));
}

function daysFromNow(days: number, hour = 10): Date {
	const when = new Date(Date.now() + days * DAY_MS);
	when.setUTCHours(hour, 0, 0, 0);
	return when;
}

type SeedStaff = {
	key: string;
	name: string;
	role: StaffRole;
	verticals?: ("ACADEMY" | "REAL_ESTATE")[];
};

const STAFF: readonly SeedStaff[] = [
	{ key: "admin", name: "Layla Haddad", role: "ADMIN" },
	{ key: "sales-a", name: "Priya Nair", role: "SALES" },
	{ key: "sales-b", name: "Omar Aziz", role: "SALES" },
	{ key: "sales-lead", name: "Dana Kowalski", role: "SALES_MANAGER" },
	{ key: "mentor-a", name: "Michael Osei", role: "MENTOR" },
	{ key: "mentor-b", name: "Yuki Tanaka", role: "MENTOR" },
	{ key: "finance", name: "Rania Farouk", role: "FINANCE" },
	{
		key: "estate",
		name: "Tomás Rivera",
		role: "SALES",
		verticals: ["REAL_ESTATE"],
	},
];

const PROGRAMS = [
	{
		code: "FND-12",
		name: "Foundation",
		description: "Twelve weeks on risk, structure and execution.",
		durationWeeks: 12,
		priceAed: "25000.00",
	},
	{
		code: "ADV-16",
		name: "Advanced desk",
		description: "Sixteen weeks of live-desk mentoring.",
		durationWeeks: 16,
		priceAed: "48000.00",
	},
	{
		code: "INT-08",
		name: "Intensive",
		description: "Eight weeks, four sessions a week.",
		durationWeeks: 8,
		priceAed: "18000.00",
	},
	{
		code: "LEG-06",
		name: "Legacy short course",
		description: "Retired. Kept because enrolments reference it.",
		durationWeeks: 6,
		priceAed: "9000.00",
	},
] as const;

const FIRST_NAMES = [
	"Rahul",
	"Aisha",
	"Marcus",
	"Fatima",
	"Diego",
	"Noor",
	"Kwame",
	"Elena",
	"Hassan",
	"Mei",
	"Jonas",
	"Zainab",
	"Ravi",
	"Sofia",
	"Idris",
	"Anya",
];

const LAST_NAMES = [
	"Sharma",
	"Al Mansoori",
	"Bennett",
	"Okafor",
	"Moreau",
	"Ivanov",
	"Silva",
	"Haddad",
	"Nakamura",
	"Fernandes",
	"Karlsson",
	"Rahman",
];

const CITIES = [
	["Dubai", "AE"],
	["Abu Dhabi", "AE"],
	["London", "GB"],
	["Singapore", "SG"],
	["Mumbai", "IN"],
	["Lagos", "NG"],
] as const;

const SOURCES = [
	"Instagram",
	"Referral",
	"Webinar",
	"Walk-in",
	"Website form",
	"Partner",
];

const METHODS = ["Bank transfer", "Card", "Cash", "Cheque"];

async function seedWorkspace(): Promise<void> {
	const existing = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { metadata: true },
	});

	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: "Trading Academy",
			slug: "trading-academy",
			website: WORKSPACE_WEBSITE,
			metadata: markOnboarded(null, new Date()),
			createdAt: new Date(),
		},
		update: {
			website: WORKSPACE_WEBSITE,
			metadata: markOnboarded(existing?.metadata ?? null, new Date()),
		},
	});

	console.log(`Workspace onboarded with website ${WORKSPACE_WEBSITE}.`);
}

async function seedAcademyStaff(): Promise<Record<string, string>> {
	const byKey: Record<string, string> = {};

	for (const person of STAFF) {
		const id = `academy-${person.key}`;

		await db.user.upsert({
			where: { id },
			create: {
				id,
				name: person.name,
				email: `${person.key}@${WORKSPACE_WEBSITE}`,
				emailVerified: true,
				updatedAt: new Date(),
			},
			update: { name: person.name },
		});

		await db.staffProfile.upsert({
			where: { userId: id },
			create: {
				userId: id,
				role: person.role,
				verticals: person.verticals ?? ["ACADEMY"],
			},
			update: {
				role: person.role,
				verticals: person.verticals ?? ["ACADEMY"],
			},
		});

		await db.member.upsert({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId: id },
			},
			create: {
				id: `academy-member-${person.key}`,
				organizationId: WORKSPACE_ID,
				userId: id,
				role: person.role === "ADMIN" ? "owner" : "member",
				createdAt: new Date(),
			},
			update: { role: person.role === "ADMIN" ? "owner" : "member" },
		});

		byKey[person.key] = id;
	}

	console.log(`Academy staff ready: ${STAFF.length} profiles.`);

	return byKey;
}

async function seedPrograms(): Promise<{ id: string; code: string }[]> {
	const rows: { id: string; code: string }[] = [];

	for (const program of PROGRAMS) {
		const row = await db.program.upsert({
			where: { code: program.code },
			create: {
				code: program.code,
				name: program.name,
				description: program.description,
				durationWeeks: program.durationWeeks,
				priceAed: new Prisma.Decimal(program.priceAed),
				isActive: program.code !== "LEG-06",
			},
			update: {},
			select: { id: true, code: true },
		});

		rows.push(row);
	}

	console.log(`Programmes ready: ${rows.length}.`);

	return rows;
}

type Plan = {
	status: ClientStatus;
	count: number;
	mentor: boolean;
	converted: boolean;
};

const PLAN: readonly Plan[] = [
	{ status: "LEAD", count: 9, mentor: false, converted: false },
	{ status: "QUALIFIED", count: 6, mentor: false, converted: false },
	{ status: "MENTOR_ASSIGNED", count: 4, mentor: true, converted: false },
	{ status: "CONVERTED", count: 4, mentor: true, converted: true },
	{ status: "STUDENT", count: 7, mentor: true, converted: true },
	{ status: "LOST", count: 3, mentor: false, converted: false },
	{ status: "DORMANT", count: 2, mentor: false, converted: false },
];

type SeededClient = {
	id: string;
	clientRef: string;
	status: ClientStatus;
	salesOwnerId: string | null;
	mentorOwnerId: string | null;
};

async function seedClients(
	staff: Record<string, string>,
	programs: { id: string; code: string }[],
): Promise<SeededClient[]> {
	const existing = await db.client.count();

	if (existing > 0) {
		console.log(`Clients already present (${existing}); leaving them alone.`);
		return [];
	}

	const salesPool = [
		staff["sales-a"],
		staff["sales-b"],
		staff["sales-lead"],
	].filter((id): id is string => id !== undefined);
	const mentorPool = [staff["mentor-a"], staff["mentor-b"]].filter(
		(id): id is string => id !== undefined,
	);

	const running = programs.filter((program) => program.code !== "LEG-06");
	const made: SeededClient[] = [];

	let serial = 0;

	for (const plan of PLAN) {
		for (let index = 0; index < plan.count; index += 1) {
			serial += 1;

			const firstName = pick(FIRST_NAMES);
			const lastName = pick(LAST_NAMES);
			const [city, country] = pick(CITIES);
			const salesOwnerId = pick(salesPool);
			const mentorOwnerId = plan.mentor ? pick(mentorPool) : null;
			const createdAt = daysFromNow(-integer(10, 300), 9);

			const client = await db.client.create({
				data: {
					vertical: "ACADEMY",
					firstName,
					lastName,
					email: `${firstName}.${lastName}.${serial}`
						.toLowerCase()
						.replace(/[^a-z0-9.]/g, "")
						.concat(`@student.example`),
					phone: `+9715${String(1000000 + serial * 7919).slice(0, 7)}`,
					city,
					country,
					source: pick(SOURCES),
					status: plan.converted ? "CONVERTED" : plan.status,
					createdById: salesOwnerId,
					salesOwnerId,
					mentorOwnerId,
					convertedById: plan.converted ? mentorOwnerId : null,
					convertedAt: plan.converted ? daysFromNow(-integer(5, 90), 11) : null,
					createdAt,
					lastActivityAt: daysFromNow(-integer(0, 30), 15),
				},
				select: {
					id: true,
					clientRef: true,
					status: true,
					salesOwnerId: true,
					mentorOwnerId: true,
				},
			});

			if (plan.status === "STUDENT") {
				const program = pick(running);

				const enrollment = await db.enrollment.create({
					data: {
						clientId: client.id,
						programId: program.id,
						mentorId: mentorOwnerId,
						cohort: pick(["Jan 2026", "Apr 2026", "Jul 2026"]),
						enrolledAt: daysFromNow(-integer(7, 80), 9),
						createdById: mentorOwnerId ?? salesOwnerId,
					},
					select: { id: true },
				});

				await db.client.update({
					where: { id: client.id },
					data: { status: "STUDENT" },
				});

				if (index === 0) {
					await db.enrollment.update({
						where: { id: enrollment.id },
						data: { status: "PAUSED" },
					});
				}

				client.status = "STUDENT";
			}

			made.push(client);
		}
	}

	console.log(`Clients ready: ${made.length}.`);

	return made;
}

async function seedDeposits(
	clients: SeededClient[],
	staff: Record<string, string>,
): Promise<number> {
	const payers = clients.filter(
		(client) => client.status === "CONVERTED" || client.status === "STUDENT",
	);

	const finance = staff.finance;
	let written = 0;

	for (const client of payers) {
		const entries = integer(1, 3);

		for (let index = 0; index < entries; index += 1) {
			const verified = random() > 0.35;

			await db.deposit.create({
				data: {
					clientId: client.id,
					entryType: "PAYMENT",
					amount: new Prisma.Decimal(`${integer(2, 30) * 1000}.00`),
					currency: "AED",
					method: pick(METHODS),
					reference: `RCPT-${String(1000 + written)}`,
					occurredAt: daysFromNow(-integer(1, 120), 13),
					recordedById: client.salesOwnerId ?? finance ?? "",
					verifiedById: verified ? (finance ?? null) : null,
					verifiedAt: verified ? daysFromNow(-integer(0, 60), 14) : null,
				},
			});

			written += 1;
		}
	}

	console.log(`Deposit entries ready: ${written}.`);

	return written;
}

const EVENT_TITLES = {
	SALES_CALL: "Discovery call",
	CLIENT_APPOINTMENT: "Office appointment",
	MENTOR_SESSION: "Mentor session",
	REVIEW: "Progress review",
	ONBOARDING: "Onboarding walkthrough",
} as const satisfies Partial<Record<CompanyEventType, string>>;

async function seedEvents(
	clients: SeededClient[],
	staff: Record<string, string>,
): Promise<number> {
	let written = 0;

	for (const client of clients) {
		if (random() > 0.55) continue;

		const salesSide = client.status === "LEAD" || client.status === "QUALIFIED";

		const eventType: CompanyEventType = salesSide
			? pick(["SALES_CALL", "CLIENT_APPOINTMENT"])
			: pick(["MENTOR_SESSION", "REVIEW", "ONBOARDING"]);

		const organizerId = salesSide
			? (client.salesOwnerId ?? staff["sales-a"] ?? "")
			: (client.mentorOwnerId ?? staff["mentor-a"] ?? "");

		if (organizerId === "") continue;

		const offset = random() > 0.5 ? integer(1, 21) : -integer(1, 60);
		const startsAt = daysFromNow(offset, integer(8, 16));

		await db.companyEvent.create({
			data: {
				title: EVENT_TITLES[eventType as keyof typeof EVENT_TITLES],
				eventType,
				startsAt,
				endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
				timezone: "Asia/Dubai",
				location: pick(["Dubai office", "Video call", "Client office"]),
				organizerId,
				clientId: client.id,
				createdById: organizerId,
				attendees: { create: [{ userId: organizerId, response: "ACCEPTED" }] },
			},
		});

		written += 1;
	}

	const admin = staff.admin;

	if (admin) {
		const startsAt = daysFromNow(3, 9);

		await db.companyEvent.create({
			data: {
				title: "Monthly all hands",
				eventType: "COMPANY_MEETING",
				startsAt,
				endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
				timezone: "Asia/Dubai",
				location: "Dubai office",
				organizerId: admin,
				createdById: admin,
				attendees: { create: [{ userId: admin, response: "ACCEPTED" }] },
			},
		});

		written += 1;
	}

	console.log(`Events ready: ${written}.`);

	return written;
}

export async function seedAcademy(): Promise<void> {
	await seedWorkspace();

	const staff = await seedAcademyStaff();
	const programs = await seedPrograms();
	const clients = await seedClients(staff, programs);

	if (clients.length === 0) return;

	await seedDeposits(clients, staff);
	await seedEvents(clients, staff);
}
