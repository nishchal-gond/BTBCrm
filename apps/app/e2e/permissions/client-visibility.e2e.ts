import { expect, test } from "@playwright/test";
import { callApi, signIn, workspacePath } from "../people";

test.describe("a client is visible to three people and nobody else", () => {
	test("a salesperson never sees another salesperson's client", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/clients"));

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

		expect(owned, "the seed gives sales-a at least one client").toBeDefined();
		if (!owned) return;

		const asSalesB = await callApi("salesB", "clients.byRef", {
			clientRef: owned.clientRef,
		});

		expect(asSalesB.status).toBe(404);
		expect(asSalesB.body).not.toContain(owned.name);

		await signIn(context, "salesB");
		await page.goto(workspacePath(`/clients/${owned.clientRef}`));

		await expect(page.getByText(/not yours to see|No client/i)).toBeVisible();
		await expect(page.locator("body")).not.toContainText(owned.name);
		expect(await page.title()).not.toContain(owned.name);

		const html = await page.content();
		expect(html).not.toContain(owned.name);
	});

	test("an administrator sees every client", async ({ context, page }) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/clients"));

		await expect(
			page.locator('[data-slot="client-ref"]').first(),
		).toBeVisible();
	});

	test("a client reference never wraps", async ({ context, page }) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/clients"));

		const ref = page.locator('[data-slot="client-ref"]').first();
		await ref.waitFor();

		const lines = await ref.evaluate((node) => {
			const text = node.firstChild;
			if (!text) return 0;

			const range = document.createRange();
			range.selectNodeContents(text);

			return range.getClientRects().length;
		});

		expect(lines, "the client reference broke across lines").toBe(1);
	});
});
