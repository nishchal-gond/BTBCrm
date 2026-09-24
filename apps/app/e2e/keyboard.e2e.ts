import { expect, test } from "@playwright/test";
import { firstClientRef, hydrated, signIn, workspacePath } from "./people";

test.describe("the product works without a mouse", () => {
	test.beforeEach(async ({ context }) => {
		await signIn(context, "admin");
	});

	test("every stop on the clients list shows the gold focus ring", async ({
		page,
	}) => {
		await page.goto(workspacePath("/clients"));
		await page.locator('[data-slot="client-ref"]').first().waitFor();

		const seen: string[] = [];

		for (let stop = 0; stop < 18; stop += 1) {
			await page.keyboard.press("Tab");

			const style = await page.evaluate(() => {
				const node = document.activeElement;
				if (!node || node === document.body) return null;

				const box = node.getBoundingClientRect();
				if (box.width === 0 && box.height === 0) return null;

				const computed = getComputedStyle(node);

				return {
					name:
						node.getAttribute("aria-label") ??
						node.textContent?.trim().slice(0, 24) ??
						node.tagName,
					outlineWidth: computed.outlineWidth,
					outlineColor: computed.outlineColor,
					outlineStyle: computed.outlineStyle,
				};
			});

			if (!style) continue;

			const ringed =
				style.outlineStyle !== "none" &&
				Number.parseFloat(style.outlineWidth) >= 2 &&
				style.outlineColor === "rgb(201, 162, 39)";

			if (!ringed) {
				seen.push(
					`${style.name}: ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
				);
			}
		}

		expect(seen, seen.join(" | ")).toHaveLength(0);
	});

	test("a table row opens with Enter", async ({ page }) => {
		await page.goto(workspacePath("/clients"));
		await page.locator('[data-slot="client-ref"]').first().waitFor();

		const row = page.locator('tr[data-clickable="true"]').first();

		if (!(await row.isVisible())) {
			test.skip(true, "the table is in card mode at this width");
			return;
		}

		await hydrated(row);
		await row.focus();
		await page.keyboard.press("Enter");

		await expect(page).toHaveURL(/\/clients\/CL-\d{6}/);
	});

	test("a sheet traps focus, closes on Escape, and gives focus back", async ({
		page,
	}) => {
		await page.goto(workspacePath("/clients"));

		const trigger = page.getByRole("button", { name: "New client" });
		await trigger.click();

		const sheet = page.getByRole("dialog");
		await expect(sheet).toBeVisible();

		await expect(
			page.getByRole("navigation", { name: "Primary" }),
			"the page behind a modal is hidden from assistive technology",
		).toHaveCount(0);

		for (let press = 0; press < 14; press += 1) {
			await page.keyboard.press("Tab");

			const inside = await page.evaluate(() => {
				const open = document.querySelector('[role="dialog"]');
				return open?.contains(document.activeElement) ?? false;
			});

			expect(inside, `focus escaped the sheet on press ${press + 1}`).toBe(
				true,
			);
		}

		await page.keyboard.press("Escape");
		await expect(sheet).toBeHidden();

		await expect(async () => {
			const back = await page.evaluate(
				() => document.activeElement?.textContent?.trim() ?? "",
			);

			expect(back).toContain("New client");
		}).toPass({ timeout: 5_000 });
	});

	test("a menu opens with the keyboard and Escape returns focus", async ({
		page,
	}) => {
		await page.goto(workspacePath("/clients"));

		const collapsed = page.getByRole("button", { name: "Filters and sort" });

		if (await collapsed.isVisible()) await collapsed.click();

		const sort = page.getByRole("button", { name: "Sort", exact: true });
		await hydrated(sort);
		await sort.focus();
		await page.keyboard.press("Enter");

		await expect(
			page.getByRole("menuitemradio", { name: "Client ID" }),
		).toBeVisible();

		await page.keyboard.press("Escape");

		await expect(async () => {
			const back = await page.evaluate(
				() => document.activeElement?.textContent?.trim() ?? "",
			);

			expect(back).toContain("Sort");
		}).toPass({ timeout: 5_000 });
	});

	test("the record tabs move with the arrow keys", async ({ page }) => {
		const ref = await firstClientRef(page);
		await page.goto(workspacePath(`/clients/${ref}`));

		const overview = page.getByRole("tab", { name: "Overview" });
		await hydrated(overview);
		await overview.focus();

		await page.keyboard.press("ArrowRight");

		await expect(page.getByRole("tab", { name: "Sales" })).toBeFocused();
	});
});
