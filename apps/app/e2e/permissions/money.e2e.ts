import { expect, test } from "@playwright/test";
import {
	callApi,
	firstClientRef,
	primaryNav,
	signIn,
	workspacePath,
} from "../people";

test.describe("a mentor sees the client and never the money", () => {
	test("the API refuses a mentor every ledger read", async () => {
		const listed = await callApi("mentorA", "deposits.list", {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 25,
			vertical: "ACADEMY",
			entryType: [],
			verified: [],
			recordedBy: [],
		});

		expect(listed.status).toBe(403);
		expect(listed.body).toContain("FORBIDDEN");
	});

	test("the API refuses a mentor the ledger on their own client", async ({
		context,
		page,
	}) => {
		await signIn(context, "mentorA");

		const clientRef = await firstClientRef(page);

		const ledger = await callApi("mentorA", "deposits.forClient", {
			clientRef,
		});

		expect(ledger.status).toBe(403);
	});

	test("Deposits is missing from a mentor's navigation", async ({
		context,
		page,
	}) => {
		await signIn(context, "mentorA");
		await page.goto(workspacePath("/clients"));

		const rail = await primaryNav(page);

		await expect(rail.getByRole("link", { name: "Deposits" })).toHaveCount(0);
		await expect(rail.getByRole("link", { name: "Clients" })).toHaveCount(1);
	});

	test("the Deposits page tells a mentor plainly", async ({
		context,
		page,
	}) => {
		await signIn(context, "mentorA");
		await page.goto(workspacePath("/deposits"));

		await expect(
			page.getByText("Deposits are not yours to read"),
		).toBeVisible();
	});

	test("a salesperson reads the ledger on their own client", async ({
		context,
		page,
	}) => {
		await signIn(context, "salesA");
		const clientRef = await firstClientRef(page);

		const ledger = await callApi("salesA", "deposits.forClient", {
			clientRef,
		});

		expect(ledger.status).toBe(200);
	});

	test("finance reads every ledger and edits no client", async () => {
		const listed = await callApi("finance", "deposits.list", {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 25,
			vertical: "ACADEMY",
			entryType: [],
			verified: [],
			recordedBy: [],
		});

		expect(listed.status).toBe(200);

		const clients = await callApi("finance", "clients.list", {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 5,
			vertical: "ACADEMY",
			view: "clients",
			status: [],
			salesOwner: [],
			mentorOwner: [],
			source: [],
		});

		const rows = JSON.parse(clients.body).result.data.rows as {
			clientRef: string;
		}[];

		const first = rows[0];
		expect(first).toBeDefined();
		if (!first) return;

		const edit = await callApi(
			"finance",
			"clients.update",
			{ clientRef: first.clientRef, city: "Nowhere" },
			"POST",
		);

		expect(edit.status).toBe(403);
	});
});
