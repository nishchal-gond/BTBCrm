import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	outputDir: "./.playwright",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
	use: {
		baseURL: BASE_URL,
		trace: "off",
		screenshot: "only-on-failure",
		launchOptions: {
			executablePath:
				process.env.E2E_CHROMIUM ??
				"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
		},
	},
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile",
			testIgnore: /(responsive|console)\.e2e\.ts/,
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 375, height: 812 },
				hasTouch: true,
				isMobile: true,
			},
		},
	],
});
