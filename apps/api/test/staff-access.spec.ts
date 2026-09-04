import { describe, expect, it } from "bun:test";
import type { Db, StaffRole } from "@crm/db";
import {
	type Actor,
	type ActorReader,
	can,
	canAccessClient,
	canAccessFinancials,
	canEditClient,
	capabilitiesOf,
	loadActor,
	visibleOwnerIds,
} from "@crm/db/access";
import { ForbiddenException } from "@nestjs/common";
import { StaffService } from "../src/staff/staff.service";

function actor(
	role: StaffRole,
	userId: string,
	managedUserIds: string[] = [],
): Actor {
	return { userId, role, teamId: null, managedTeamIds: [], managedUserIds };
}

const admin = actor("ADMIN", "admin");
const finance = actor("FINANCE", "finance");
const salesA = actor("SALES", "sales_a");
const salesB = actor("SALES", "sales_b");
const mentorA = actor("MENTOR", "mentor_a");
const mentorB = actor("MENTOR", "mentor_b");
const salesLead = actor("SALES_MANAGER", "sales_lead", ["sales_a"]);
const mentorLead = actor("MENTOR_MANAGER", "mentor_lead", ["mentor_a"]);

const clientOfA = { salesOwnerId: "sales_a", mentorOwnerId: "mentor_a" };
const leadOfA = { salesOwnerId: "sales_a", mentorOwnerId: null };
const unassigned = { salesOwnerId: null, mentorOwnerId: null };

describe("client visibility", () => {
	it("shows a client to its sales owner and its mentor", () => {
		expect(canAccessClient(salesA, clientOfA)).toBe(true);
		expect(canAccessClient(mentorA, clientOfA)).toBe(true);
	});

	it("hides a client from another salesperson and another mentor", () => {
		expect(canAccessClient(salesB, clientOfA)).toBe(false);
		expect(canAccessClient(mentorB, clientOfA)).toBe(false);
		expect(canAccessClient(mentorA, leadOfA)).toBe(false);
	});

	it("shows every client to an admin and to finance", () => {
		for (const row of [clientOfA, leadOfA, unassigned]) {
			expect(canAccessClient(admin, row)).toBe(true);
			expect(canAccessClient(finance, row)).toBe(true);
		}
	});

	it("hides an unassigned client from everyone but admin and finance", () => {
		for (const who of [salesA, salesB, mentorA, salesLead, mentorLead]) {
			expect(canAccessClient(who, unassigned)).toBe(false);
		}
	});

	it("scopes a manager to the owners on the teams they manage", () => {
		expect(canAccessClient(salesLead, clientOfA)).toBe(true);
		expect(canAccessClient(mentorLead, clientOfA)).toBe(true);
		expect(canAccessClient(mentorLead, leadOfA)).toBe(false);
		expect(
			canAccessClient(salesLead, {
				salesOwnerId: "sales_b",
				mentorOwnerId: null,
			}),
		).toBe(false);
	});
});

describe("editing a client", () => {
	it("is for owners, their managers and admins", () => {
		expect(canEditClient(salesA, clientOfA)).toBe(true);
		expect(canEditClient(mentorA, clientOfA)).toBe(true);
		expect(canEditClient(salesLead, clientOfA)).toBe(true);
		expect(canEditClient(admin, unassigned)).toBe(true);
	});

	it("is read-only for finance", () => {
		expect(canEditClient(finance, clientOfA)).toBe(false);
	});
});

describe("financial access", () => {
	it("is narrower than client access: a mentor never sees money", () => {
		expect(canAccessClient(mentorA, clientOfA)).toBe(true);
		expect(canAccessFinancials(mentorA, clientOfA)).toBe(false);
		expect(canAccessFinancials(mentorLead, clientOfA)).toBe(false);
	});

	it("follows the sales side, finance and admin", () => {
		expect(canAccessFinancials(salesA, clientOfA)).toBe(true);
		expect(canAccessFinancials(salesLead, clientOfA)).toBe(true);
		expect(canAccessFinancials(salesB, clientOfA)).toBe(false);
		expect(canAccessFinancials(finance, clientOfA)).toBe(true);
		expect(canAccessFinancials(admin, unassigned)).toBe(true);
	});
});

describe("visible owner ids", () => {
	it("is unbounded for admin and finance", () => {
		expect(visibleOwnerIds(admin)).toBeNull();
		expect(visibleOwnerIds(finance)).toBeNull();
	});

	it("is the person themselves for a rep or a mentor", () => {
		expect(visibleOwnerIds(salesA)).toEqual(["sales_a"]);
		expect(visibleOwnerIds(mentorB)).toEqual(["mentor_b"]);
	});

	it("adds the managed team for a manager", () => {
		expect(visibleOwnerIds(salesLead)).toEqual(["sales_lead", "sales_a"]);
	});
});

describe("capabilities", () => {
	it("keeps user administration with admins", () => {
		expect(can(admin, "users.manage")).toBe(true);
		for (const who of [salesA, mentorA, salesLead, mentorLead, finance]) {
			expect(can(who, "users.manage")).toBe(false);
			expect(can(who, "audit.viewGlobal")).toBe(false);
		}
	});

	it("lets only finance and admin verify a deposit", () => {
		expect(can(finance, "deposits.verify")).toBe(true);
		expect(can(admin, "deposits.verify")).toBe(true);
		expect(can(salesA, "deposits.verify")).toBe(false);
	});

	it("lets a sales manager reassign a sales owner, and a rep not", () => {
		expect(can(salesLead, "clients.assignSalesOwner")).toBe(true);
		expect(can(salesA, "clients.assignSalesOwner")).toBe(false);
	});

	it("answers false for nobody", () => {
		expect(can(null, "clients.create")).toBe(false);
	});

	it("lists every capability for an admin", () => {
		expect(capabilitiesOf(admin)).toContain("settings.manage");
		expect(capabilitiesOf(mentorA)).toEqual([
			"clients.edit",
			"clients.convert",
			"students.manage",
		]);
	});
});

describe("loadActor", () => {
	function reader(options: {
		profile: {
			role: StaffRole;
			teamId: string | null;
			isActive: boolean;
		} | null;
		teams: { id: string; members: { userId: string }[] }[];
	}): ActorReader {
		return {
			staffProfile: {
				findUnique: async () => options.profile,
			},
			team: {
				findMany: async () => options.teams,
			},
		} as unknown as ActorReader;
	}

	it("is nobody without an active profile", async () => {
		expect(
			await loadActor(reader({ profile: null, teams: [] }), "u"),
		).toBeNull();
		expect(
			await loadActor(
				reader({
					profile: { role: "SALES", teamId: null, isActive: false },
					teams: [],
				}),
				"u",
			),
		).toBeNull();
	});

	it("collects the people on the teams a manager runs, without themselves", async () => {
		const actor = await loadActor(
			reader({
				profile: { role: "SALES_MANAGER", teamId: "t1", isActive: true },
				teams: [
					{ id: "t1", members: [{ userId: "lead" }, { userId: "a" }] },
					{ id: "t2", members: [{ userId: "b" }, { userId: "a" }] },
				],
			}),
			"lead",
		);

		expect(actor).toEqual({
			userId: "lead",
			role: "SALES_MANAGER",
			teamId: "t1",
			managedTeamIds: ["t1", "t2"],
			managedUserIds: ["a", "b"],
		});
	});
});

describe("StaffService guards", () => {
	type FakeProfile = {
		userId: string;
		role: StaffRole;
		isActive: boolean;
	};

	type FakeWrite = Partial<Pick<FakeProfile, "role" | "isActive">>;

	function service(options: { profiles: FakeProfile[]; otherAdmins?: number }) {
		const writes: { userId: string; data: FakeWrite }[] = [];

		const row = (profile: FakeProfile) => ({
			...profile,
			timezone: "Asia/Dubai",
			phone: null,
			createdAt: new Date("2026-09-01T00:00:00Z"),
			user: {
				name: profile.userId,
				email: `${profile.userId}@test`,
				image: null,
			},
			team: null,
		});

		const fake = {
			staffProfile: {
				findUnique: async ({ where }: { where: { userId: string } }) => {
					const profile = options.profiles.find(
						(candidate) => candidate.userId === where.userId,
					);
					return profile ? row(profile) : null;
				},
				count: async () => options.profiles.length,
				create: async ({
					data,
				}: {
					data: { userId: string; role: StaffRole };
				}) => row({ ...data, isActive: true }),
				update: async ({
					where,
					data,
				}: {
					where: { userId: string };
					data: FakeWrite;
				}) => {
					writes.push({ userId: where.userId, data });
					const profile = options.profiles.find(
						(candidate) => candidate.userId === where.userId,
					);
					if (!profile) throw new Error("missing");
					return row({ ...profile, ...data });
				},
			},
			$queryRaw: async () =>
				Array.from({ length: options.otherAdmins ?? 0 }, (_, index) => ({
					userId: `admin-${index}`,
				})),
		};

		const db = {
			...fake,
			$transaction: async (fn: (tx: typeof fake) => Promise<unknown>) =>
				fn(fake),
		} as unknown as Db;

		return { staff: new StaffService(db), writes };
	}

	it("makes the first profile an admin and the next a salesperson", async () => {
		const empty = service({ profiles: [] });
		expect((await empty.staff.ensureProfile("first")).role).toBe("ADMIN");

		const populated = service({
			profiles: [{ userId: "first", role: "ADMIN", isActive: true }],
		});
		expect((await populated.staff.ensureProfile("second")).role).toBe("SALES");
	});

	it("refuses a role change from anyone but an admin", async () => {
		const { staff, writes } = service({
			profiles: [{ userId: "sales_b", role: "SALES", isActive: true }],
		});

		await expect(
			staff.setRole(salesA, { userId: "sales_b", role: "ADMIN" }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(writes).toHaveLength(0);
	});

	it("refuses an admin changing their own role or active flag", async () => {
		const { staff, writes } = service({
			profiles: [{ userId: "admin", role: "ADMIN", isActive: true }],
			otherAdmins: 3,
		});

		await expect(
			staff.setRole(admin, { userId: "admin", role: "SALES" }),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			staff.setActive(admin, { userId: "admin", isActive: false }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(writes).toHaveLength(0);
	});

	it("keeps the last admin", async () => {
		const { staff, writes } = service({
			profiles: [{ userId: "other", role: "ADMIN", isActive: true }],
			otherAdmins: 0,
		});

		await expect(
			staff.setRole(admin, { userId: "other", role: "SALES" }),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			staff.setActive(admin, { userId: "other", isActive: false }),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(writes).toHaveLength(0);
	});

	it("demotes an admin when another one remains", async () => {
		const { staff, writes } = service({
			profiles: [{ userId: "other", role: "ADMIN", isActive: true }],
			otherAdmins: 1,
		});

		const updated = await staff.setRole(admin, {
			userId: "other",
			role: "FINANCE",
		});

		expect(updated.role).toBe("FINANCE");
		expect(writes).toEqual([{ userId: "other", data: { role: "FINANCE" } }]);
	});
});
