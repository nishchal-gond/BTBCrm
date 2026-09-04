import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Actor, loadActor } from "@crm/db/access";
import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "../src/staff/staff.service";

const suffix = process.env.TEST_RUN_ID ?? "staff-spec";

const ids = {
	admin: `staff-${suffix}-admin`,
	salesLead: `staff-${suffix}-sales-lead`,
	salesA: `staff-${suffix}-sales-a`,
	salesB: `staff-${suffix}-sales-b`,
	mentorA: `staff-${suffix}-mentor-a`,
} as const;

const teamName = `Sales team ${suffix}`;

const staff = new StaffService(db);

async function actorOf(userId: string): Promise<Actor> {
	const actor = await loadActor(db, userId);
	if (!actor) throw new Error(`${userId} has no active profile`);
	return actor;
}

async function cleanUp(): Promise<void> {
	await db.team.deleteMany({ where: { name: teamName } });
	await db.staffProfile.deleteMany({
		where: { userId: { in: Object.values(ids) } },
	});
	await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
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

	for (const id of [ids.salesLead, ids.salesA, ids.salesB]) {
		await db.staffProfile.create({ data: { userId: id, role: "SALES" } });
	}

	await db.staffProfile.create({
		data: { userId: ids.mentorA, role: "MENTOR" },
	});
});

afterAll(cleanUp);

describe("staff roles against the database", () => {
	it("lets an admin promote a rep to sales manager, and a rep not", async () => {
		const admin = await actorOf(ids.admin);
		const salesA = await actorOf(ids.salesA);

		await expect(
			staff.setRole(salesA, { userId: ids.salesLead, role: "SALES_MANAGER" }),
		).rejects.toBeInstanceOf(ForbiddenException);

		const promoted = await staff.setRole(admin, {
			userId: ids.salesLead,
			role: "SALES_MANAGER",
		});

		expect(promoted.role).toBe("SALES_MANAGER");
	});

	it("scopes a sales manager to the reps on their team", async () => {
		const admin = await actorOf(ids.admin);

		const team = await staff.createTeam(admin, {
			name: teamName,
			kind: "SALES",
			managerId: ids.salesLead,
		});

		expect(team.manager?.userId).toBe(ids.salesLead);

		await staff.assignTeam(admin, { userId: ids.salesA, teamId: team.id });

		const lead = await actorOf(ids.salesLead);
		expect(lead.managedTeamIds).toEqual([team.id]);
		expect(lead.managedUserIds).toEqual([ids.salesA]);

		const salesB = await actorOf(ids.salesB);
		expect(salesB.managedUserIds).toEqual([]);
	});

	it("refuses a mentor as the manager of a sales team, in the service and in the database", async () => {
		const admin = await actorOf(ids.admin);

		await expect(
			staff.createTeam(admin, {
				name: `${teamName} wrong`,
				kind: "SALES",
				managerId: ids.mentorA,
			}),
		).rejects.toThrow();

		const outcome = await db.team
			.create({
				data: {
					name: `${teamName} raw`,
					kind: "SALES",
					managerId: ids.mentorA,
				},
			})
			.then(
				() => "created",
				(error: Error) => error.message,
			);

		expect(outcome).toMatch(/SALES_MANAGER/);
	});

	it("deactivating a rep drops them out of every actor scope", async () => {
		const admin = await actorOf(ids.admin);

		await staff.setActive(admin, { userId: ids.salesA, isActive: false });

		expect(await loadActor(db, ids.salesA)).toBeNull();

		const lead = await actorOf(ids.salesLead);
		expect(lead.managedUserIds).toEqual([]);

		await staff.setActive(admin, { userId: ids.salesA, isActive: true });
	});

	it("lists the directory with role counts for everyone", async () => {
		const salesB = await actorOf(ids.salesB);

		const page = await staff.directory(salesB, {
			q: `staff-${suffix}`,
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 50,
			role: [],
			status: "active",
		});

		expect(page.total).toBe(5);
		expect(page.rows.find((row) => row.userId === ids.salesB)?.isViewer).toBe(
			true,
		);
		expect(page.facetCounts.role?.SALES_MANAGER).toBe(1);
	});
});
