import { expect, test } from "@playwright/test";
import { mentorAssignedClient, signIn, workspacePath } from "./people";

test.describe("the list a salesperson lives in", () => {
	test.beforeEach(async ({ context }) => {
		await signIn(context, "admin");
	});

	test("shows clients, and the sort survives a reload", async ({ page }) => {
		await page.goto(workspacePath("/clients"));

		await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
		await expect(
			page.locator('[data-slot="client-ref"]').first(),
		).toBeVisible();

		const header = page.getByRole("button", { name: /^Client ID/ });

		if (await header.first().isVisible()) {
			await header.first().click();
		} else {
			await page.getByRole("button", { name: "Filters and sort" }).click();
			await page.getByRole("button", { name: "Sort", exact: true }).click();
			await page.getByRole("menuitemradio", { name: "Client ID" }).click();
			await page.keyboard.press("Escape");
		}

		await expect(page).toHaveURL(/sort=clientRef/);

		const before = page.url();
		await page.reload();

		expect(page.url()).toBe(before);
		await expect(
			page.locator('[data-slot="client-ref"]').first(),
		).toBeVisible();
	});

	test("finds a client by reference, and says so when nothing matches", async ({
		page,
	}) => {
		await page.goto(workspacePath("/clients"));

		const first = await page
			.locator('[data-slot="client-ref"]')
			.first()
			.innerText();

		const search = page.getByPlaceholder(/Search by name, client ID/);
		await search.fill(first);

		await expect(page).toHaveURL(new RegExp(`q=${first}`));
		await expect(page.locator('[data-slot="client-ref"]')).toHaveCount(1);

		await search.fill("zzzzzznothing");
		await expect(page.getByText("Nothing matches this filter")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Clear the filter" }),
		).toBeVisible();

		await page.getByRole("button", { name: "Clear the filter" }).click();
		await expect(
			page.locator('[data-slot="client-ref"]').first(),
		).toBeVisible();
	});

	test("keeps the page in the URL", async ({ page }) => {
		await page.goto(workspacePath("/clients"));

		const next = page.getByRole("button", { name: "Next", exact: true });

		await expect(
			next,
			"the seed must hold more clients than one page",
		).toBeEnabled();

		await next.click();
		await expect(page).toHaveURL(/page=2/);

		await page.reload();
		await expect(page).toHaveURL(/page=2/);
	});

	test("the three views are three predicates on one table", async ({
		page,
	}) => {
		await page.goto(workspacePath("/leads"));
		await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();

		await page.goto(workspacePath("/students"));
		await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
	});
});

test.describe("one human, one record", () => {
	test("every tab opens, and the tab is in the URL", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/clients"));

		await page.locator('[data-slot="client-link"]').first().click();
		await expect(page).toHaveURL(/\/clients\/CL-\d{6}/);

		const reference = await page
			.locator('[data-slot="client-ref"]')
			.first()
			.innerText();

		for (const tab of ["Sales", "Schedule", "Activity", "Overview"]) {
			await page.getByRole("tab", { name: tab }).click();

			if (tab === "Overview") {
				await expect(page).not.toHaveURL(/tab=/);
			} else {
				await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`));
			}
		}

		await page.getByRole("tab", { name: "Schedule" }).click();
		await page.reload();
		await expect(page.getByRole("tab", { name: "Schedule" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		await expect(page.locator('[data-slot="client-ref"]').first()).toHaveText(
			reference,
		);
	});

	test("a converted client shows a student tab and a deposits tab", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");
		await page.goto(`${workspacePath("/clients")}?status=STUDENT`);

		await page.locator('[data-slot="client-link"]').first().click();

		await expect(page.getByRole("tab", { name: "Student" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Deposits" })).toBeVisible();

		await page.getByRole("tab", { name: "Student" }).click();
		await expect(page.getByRole("tabpanel", { name: "Student" })).toBeVisible();

		await page.getByRole("tab", { name: "Deposits" }).click();
		await expect(
			page
				.getByRole("tabpanel", { name: "Deposits" })
				.getByText(/derived from/),
		).toBeVisible();
	});

	test("conversion changes a status and never a reference", async ({
		page,
		context,
	}) => {
		await signIn(context, "admin");

		const reference = await mentorAssignedClient();

		await page.goto(workspacePath(`/clients/${reference}`));

		await page.getByRole("button", { name: /^Convert( again)?$/ }).click();
		await page
			.getByRole("button", { name: new RegExp(`Convert ${reference}`) })
			.click();

		await expect(page.getByRole("dialog", { name: /Convert/ })).toHaveCount(0);
		await expect(page.locator('[data-slot="status-badge"]').first()).toHaveText(
			"Converted",
		);
		await expect(page.locator('[data-slot="client-ref"]').first()).toHaveText(
			reference,
		);
	});
});
