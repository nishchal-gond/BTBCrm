import { expect, test } from "@playwright/test";
import { callApi, firstClientRef, signIn } from "../people";

test.describe("what nobody may do, administrator included", () => {
	test("a status move straight to STUDENT is refused", async ({
		context,
		page,
	}) => {
		await signIn(context, "admin");
		const clientRef = await firstClientRef(page);

		const moved = await callApi(
			"admin",
			"clients.setStatus",
			{ clientRef, status: "STUDENT", reason: null },
			"POST",
		);

		expect(moved.status).toBeGreaterThanOrEqual(400);
		expect(moved.body).toContain("becomes a student by enrolling");
	});

	test("conversion is its own action, not a status move", async ({
		context,
		page,
	}) => {
		await signIn(context, "admin");
		const clientRef = await firstClientRef(page);

		const moved = await callApi(
			"admin",
			"clients.setStatus",
			{ clientRef, status: "CONVERTED", reason: null },
			"POST",
		);

		expect(moved.status).toBeGreaterThanOrEqual(400);
		expect(moved.body).toContain("Conversion is its own action");
	});

	test("a salesperson cannot convert", async ({ context, page }) => {
		await signIn(context, "salesA");
		const clientRef = await firstClientRef(page);

		const converted = await callApi(
			"salesA",
			"clients.convert",
			{ clientRef, mentorId: null },
			"POST",
		);

		expect(converted.status).toBe(403);
	});

	test("a salesperson cannot take a client from another mentor", async () => {
		const listed = await callApi("admin", "clients.list", {
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

		const rows = JSON.parse(listed.body).result.data.rows as {
			clientRef: string;
			salesOwner: { userId: string } | null;
			mentorOwner: { userId: string } | null;
		}[];

		const held = rows.find(
			(row) =>
				row.salesOwner?.userId === "academy-sales-a" &&
				row.mentorOwner?.userId === "academy-mentor-a",
		);

		expect(held, "the seed gives sales-a a mentored client").toBeDefined();
		if (!held) return;

		const moved = await callApi(
			"salesA",
			"clients.assignMentor",
			{ clientRef: held.clientRef, userId: "academy-mentor-b" },
			"POST",
		);

		expect(moved.status).toBe(403);
		expect(moved.body).toContain("administrator");
	});

	test("nobody may define a programme but an administrator", async () => {
		const made = await callApi(
			"salesA",
			"programs.create",
			{
				code: "E2E-NOPE",
				name: "Should not exist",
				description: null,
				durationWeeks: 4,
				priceAed: "1000",
			},
			"POST",
		);

		expect(made.status).toBe(403);
	});

	test("a member who is not a workspace admin cannot write a setting", async () => {
		const written = await callApi(
			"salesA",
			"settings.setResearchKey",
			{ apiKey: "not-a-real-key-at-all" },
			"POST",
		);

		expect(written.status).toBe(403);
	});
});
