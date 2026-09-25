import { expect, test } from "@playwright/test";
import { callApi, primaryNav, signIn, workspacePath } from "../people";

test.describe("a business line is a wall, not a label", () => {
	test("a real-estate person cannot list academy clients", async () => {
		const listed = await callApi("estate", "clients.list", {
			q: "",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 25,
			vertical: "ACADEMY",
			view: "clients",
			status: [],
			salesOwner: [],
			mentorOwner: [],
			source: [],
		});

		expect(listed.status).toBe(403);
		expect(listed.body).toContain("business line");
	});

	test("a real-estate person is offered one line and no switcher", async ({
		context,
		page,
	}) => {
		await signIn(context, "estate");
		await page.goto(workspacePath("/clients"));

		await expect(
			page.getByRole("button", { name: /Business line:/ }),
		).toHaveCount(0);
	});

	test("an administrator switches lines and the URL says so", async ({
		context,
		page,
	}) => {
		await signIn(context, "admin");
		await page.goto(workspacePath("/clients"));

		const switcher = page.getByRole("button", { name: /Business line:/ });
		await expect(switcher).toBeVisible();

		await switcher.click();
		await page.getByRole("menuitemradio", { name: "Real Estate" }).click();

		await expect(page).toHaveURL(/line=REAL_ESTATE/);
	});

	test("the academy-only modules leave the rail on the real-estate line", async ({
		context,
		page,
	}) => {
		await signIn(context, "admin");
		await page.goto(`${workspacePath("/clients")}?line=REAL_ESTATE`);

		const rail = await primaryNav(page);

		await expect(rail.getByRole("link", { name: "Students" })).toHaveCount(0);
		await expect(rail.getByRole("link", { name: "Programmes" })).toHaveCount(0);
	});
});
