import { expect, test } from "@playwright/test";
import { firstClientRef, signIn, workspacePath } from "./people";

const WIDTHS = [375, 768, 1024, 1440];

const PAGES = [
	workspacePath(""),
	workspacePath("/agents"),
	workspacePath("/chat"),
	workspacePath("/leads"),
	workspacePath("/clients"),
	workspacePath("/students"),
	workspacePath("/deposits"),
	workspacePath("/programs"),
	workspacePath("/companies"),
	workspacePath("/contacts"),
	workspacePath("/deals"),
	workspacePath("/settings"),
	workspacePath("/settings/members"),
	workspacePath("/settings/api-keys"),
	workspacePath("/settings/connections"),
	workspacePath("/settings/currencies"),
	workspacePath("/settings/sso"),
	workspacePath("/settings/tracking"),
];

const TABS = [
	"",
	"?tab=sales",
	"?tab=student",
	"?tab=deposits",
	"?tab=schedule",
	"?tab=activity",
];

test.describe("the browser console stays quiet", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	for (const width of WIDTHS) {
		test(`no console error and no failed request at ${width}px`, async ({
			page,
			context,
		}) => {
			test.setTimeout(300_000);
			await signIn(context, "admin");
			await page.setViewportSize({ width, height: 900 });

			const noise: string[] = [];

			page.on("console", (message) => {
				if (message.type() !== "error") return;

				noise.push(`console: ${message.text().slice(0, 200)}`);
			});

			page.on("pageerror", (error) => {
				noise.push(`page: ${error.message.slice(0, 200)}`);
			});

			page.on("response", (response) => {
				if (response.status() < 400) return;

				noise.push(`${response.status()} ${response.url().slice(0, 160)}`);
			});

			for (const path of PAGES) {
				await page.goto(path);
				await page.waitForLoadState("networkidle");
			}

			const ref = await firstClientRef(page);

			for (const tab of TABS) {
				await page.goto(workspacePath(`/clients/${ref}${tab}`));
				await page.waitForLoadState("networkidle");
			}

			expect(noise, noise.join("\n")).toHaveLength(0);
		});
	}
});
