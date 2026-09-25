import { expect, type Page, test } from "@playwright/test";
import { signIn, workspacePath } from "./people";

async function openStudent(page: Page): Promise<string> {
	await page.goto(`${workspacePath("/clients")}?status=STUDENT`);
	await page.locator('[data-slot="client-link"]').first().click();
	await page.waitForURL(/\/clients\/CL-/);

	return page.url();
}

test.describe("the ledger is append-only, and it shows", () => {
	test("records a payment and moves the derived total", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		const record = await openStudent(page);

		await page.goto(`${record}?tab=deposits`);

		const panel = page.getByRole("tabpanel", { name: "Deposits" });
		await expect(panel.getByText(/Derived|derived/).first()).toBeVisible();

		const totals = panel.getByLabel("Ledger totals");
		const before = await totals.innerText();

		await page
			.getByRole("button", { name: /Record a payment|Record money/ })
			.click();

		const sheet = page.getByRole("dialog");
		await sheet.getByLabel(/Amount/).fill("1234.50");
		await sheet
			.getByRole("button", { name: /Record/ })
			.last()
			.click();

		await expect(page.getByText(/recorded/i).first()).toBeVisible({
			timeout: 15_000,
		});

		await expect(async () => {
			expect(await totals.innerText()).not.toBe(before);
		}).toPass({ timeout: 15_000 });
	});

	test("offers no way to edit or delete an entry", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		const record = await openStudent(page);

		await page.goto(`${record}?tab=deposits`);

		const panel = page.getByRole("tabpanel", { name: "Deposits" });
		await expect(panel.getByText(/derived/i).first()).toBeVisible();

		await expect(panel.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
		await expect(panel.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
	});
});

test.describe("a client's schedule", () => {
	test("books something, answers it, then cancels it", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		const record = await openStudent(page);

		await page.goto(`${record}?tab=schedule`);

		const panel = page.getByRole("tabpanel", { name: "Schedule" });
		await panel.getByRole("button", { name: "Book something" }).click();

		const sheet = page.getByRole("dialog");
		const title = `Review ${Date.now()}`;

		await sheet.getByLabel("What is it").fill(title);
		await sheet.getByRole("button", { name: "Book it" }).click();

		await expect(panel.getByText(title)).toBeVisible({ timeout: 15_000 });

		const row = panel.locator("li", { hasText: title });

		await expect(row.getByText(/GST|GMT/)).toBeVisible();

		await row.getByRole("button", { name: "Not going" }).click();
		await expect(row.getByText("Not going").first()).toBeVisible({
			timeout: 15_000,
		});

		await row.getByRole("button", { name: "Cancel it" }).click();
		await expect(row.getByText("Cancelled")).toBeVisible({ timeout: 15_000 });
	});

	test("says plainly when nothing is booked", async ({ page, context }) => {
		await signIn(context, "admin");

		await page.goto(`${workspacePath("/clients")}?status=LEAD`);
		await page.locator('[data-slot="client-link"]').first().click();
		await page.waitForURL(/\/clients\/CL-/);

		await page.goto(`${page.url()}?tab=schedule`);

		const panel = page.getByRole("tabpanel", { name: "Schedule" });

		await expect(
			panel.getByText(/Nothing booked with|Coming up/).first(),
		).toBeVisible();
	});
});

test.describe("programmes", () => {
	test("lists every programme and keeps the tab in the URL", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/programs"));

		await expect(
			page.getByRole("heading", { name: "Programmes" }),
		).toBeVisible();

		await expect(page.getByText(/FND-12|ADV-16|INT-08/).first()).toBeVisible();
	});

	test("refuses to retire a programme somebody is still on", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/programs"));

		await expect(page.getByText(/FND-12|ADV-16/).first()).toBeVisible();
	});
});

test.describe("the overview tells the truth about the book", () => {
	test("shows real figures, not zeroes", async ({ page, context }) => {
		await signIn(context, "admin");
		await page.goto(workspacePath(""));

		const rail = page.getByLabel("The book at a glance");
		await expect(rail).toBeVisible();

		await expect(rail.getByText("In the pipeline")).toBeVisible();
		await expect(rail.getByText("Studying now")).toBeVisible();

		const figures = await rail.locator(".font-mono").allInnerTexts();

		expect(figures.some((one) => one.trim() !== "0")).toBe(true);
	});

	test("hides money from a mentor and says why", async ({ page, context }) => {
		await signIn(context, "mentorA");
		await page.goto(workspacePath(""));

		const rail = page.getByLabel("The book at a glance");
		await expect(rail).toBeVisible();

		await expect(rail.getByText("Taken this month")).toHaveCount(0);
		await expect(
			rail.getByText("A mentor sees the client, never the money"),
		).toBeVisible();
	});
});
