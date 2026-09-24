import { expect, type Page, test } from "@playwright/test";
import { firstClientRef, signIn, workspacePath } from "./people";

const WIDTHS = [320, 375, 390, 414, 640, 768, 1024, 1280, 1440, 1920];

const PAGES = [
	{ name: "overview", path: workspacePath("") },
	{ name: "leads", path: workspacePath("/leads") },
	{ name: "clients", path: workspacePath("/clients") },
	{ name: "students", path: workspacePath("/students") },
	{ name: "deposits", path: workspacePath("/deposits") },
	{ name: "programmes", path: workspacePath("/programs") },
];

async function overflow(page: Page): Promise<{ over: number; who: string[] }> {
	return page.evaluate(() => {
		const root = document.documentElement;
		const over = root.scrollWidth - root.clientWidth;
		const who: string[] = [];

		if (over > 0) {
			for (const node of document.querySelectorAll<HTMLElement>("body *")) {
				const box = node.getBoundingClientRect();
				if (box.width > root.clientWidth + 1) {
					who.push(
						`${node.tagName.toLowerCase()}.${node.className.toString().slice(0, 120)} = ${Math.round(box.width)}px`,
					);
				}
				if (who.length > 4) break;
			}
		}

		return { over, who };
	});
}

test.describe("nothing overflows sideways", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	for (const width of WIDTHS) {
		test(`every page fits at ${width}px`, async ({ page, context }) => {
			await signIn(context, "admin");
			await page.setViewportSize({ width, height: 900 });

			for (const target of PAGES) {
				await page.goto(target.path);
				await page.waitForLoadState("networkidle");

				const { over, who } = await overflow(page);

				expect(
					over,
					`${target.name} overflows by ${over}px at ${width}px: ${who.join(" | ")}`,
				).toBeLessThanOrEqual(0);
			}
		});
	}

	test("a client record fits at every width", async ({ page, context }) => {
		test.setTimeout(180_000);
		await signIn(context, "admin");

		await page.setViewportSize({ width: 1440, height: 900 });

		const ref = await firstClientRef(page);
		const record = workspacePath(`/clients/${ref}`);

		for (const width of WIDTHS) {
			await page.setViewportSize({ width, height: 900 });

			for (const tab of [
				"overview",
				"sales",
				"student",
				"deposits",
				"schedule",
				"activity",
			]) {
				await page.goto(tab === "overview" ? record : `${record}?tab=${tab}`);
				await page
					.getByRole("tablist")
					.waitFor({ state: "visible", timeout: 15_000 });

				const { over, who } = await overflow(page);

				expect(
					over,
					`the ${tab} tab overflows by ${over}px at ${width}px: ${who.join(" | ")}`,
				).toBeLessThanOrEqual(0);
			}
		}
	});
});

test.describe("a touch target is at least 44 by 44", () => {
	test.use({
		viewport: { width: 375, height: 812 },
		hasTouch: true,
		isMobile: true,
	});

	for (const target of PAGES) {
		test(`${target.name} has no small control`, async ({ page, context }) => {
			await signIn(context, "admin");
			await page.goto(target.path);
			await page.waitForLoadState("networkidle");

			const small = await page.evaluate(() => {
				const found: string[] = [];

				const nodes = document.querySelectorAll<HTMLElement>(
					'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="radio"]',
				);

				for (const node of nodes) {
					const box = node.getBoundingClientRect();

					if (box.width === 0 && box.height === 0) continue;
					if (node.closest('[aria-hidden="true"]')) continue;
					if (getComputedStyle(node).display === "none") continue;

					const label = node.getAttribute("aria-label") ?? "";
					if (label.includes("Tanstack query devtools")) continue;
					if (node.closest("[data-tanstack-query-devtools]")) continue;

					if (box.height < 44 || box.width < 24) {
						found.push(
							`${node.tagName.toLowerCase()}[${node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 30) ?? ""}] ${Math.round(box.width)}x${Math.round(box.height)}`,
						);
					}
				}

				return found;
			});

			expect(small, small.join(" | ")).toHaveLength(0);
		});
	}
});
