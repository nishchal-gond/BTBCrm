import { expect, test } from "@playwright/test";
import { callApi } from "../people";

const HOUR = 60 * 60 * 1000;

function soon(hours: number): string {
	return new Date(Date.now() + hours * HOUR).toISOString();
}

test.describe("a schedule tells you when, never who with", () => {
	test("busy ranges carry three fields and nothing else", async () => {
		const ranges = await callApi("salesB", "events.busy", {
			userIds: ["academy-sales-a", "academy-mentor-a"],
			from: soon(-24 * 30),
			to: soon(24 * 30),
		});

		expect(ranges.status).toBe(200);

		type BusyRange = { userId: string; startsAt: string; endsAt: string };

		const rows = JSON.parse(ranges.body).result.data as BusyRange[];

		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual(["endsAt", "startsAt", "userId"]);
		}

		expect(ranges.body).not.toMatch(/CL-\d{6}/);
		expect(ranges.body).not.toMatch(/session|call|review|onboarding/i);
	});

	test("a salesperson cannot read another's client schedule", async () => {
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
			name: string;
			salesOwner: { userId: string } | null;
		}[];

		const owned = rows.find(
			(row) => row.salesOwner?.userId === "academy-sales-a",
		);

		expect(owned).toBeDefined();
		if (!owned) return;

		const schedule = await callApi("salesB", "events.forClient", {
			clientRef: owned.clientRef,
		});

		expect(schedule.status).toBe(404);
		expect(schedule.body).not.toContain(owned.name);
	});

	test("only an administrator books a company-wide event", async () => {
		const made = await callApi(
			"salesA",
			"events.create",
			{
				title: "Unauthorised all hands",
				description: null,
				eventType: "COMPANY_MEETING",
				startsAt: soon(24),
				endsAt: soon(25),
				timezone: "Asia/Dubai",
				isAllDay: false,
				location: null,
				clientRef: null,
				attendeeIds: [],
			},
			"POST",
		);

		expect(made.status).toBe(403);
	});
});
