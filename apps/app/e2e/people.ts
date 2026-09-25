import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const WORKSPACE = "trading-academy";

export const PEOPLE = {
	admin: "admin",
	salesA: "sales-a",
	salesB: "sales-b",
	salesLead: "sales-lead",
	mentorA: "mentor-a",
	mentorB: "mentor-b",
	finance: "finance",
	estate: "estate",
} as const;

export type PersonKey = keyof typeof PEOPLE;

function apiDirectory(): string {
	const here = process.cwd();

	for (const candidate of [
		resolve(here, "..", "api"),
		resolve(here, "apps", "api"),
	]) {
		if (existsSync(resolve(candidate, "package.json"))) return candidate;
	}

	throw new Error(
		"could not find apps/api from the Playwright working directory",
	);
}

const API_DIR = apiDirectory();

type SessionCookie = { name: string; value: string };

const cookies = new Map<PersonKey, SessionCookie>();

export function sessionCookie(person: PersonKey): SessionCookie {
	const cached = cookies.get(person);
	if (cached) return cached;

	const email = `${PEOPLE[person]}@tradingacademy.ae`;

	const minted = spawnSync("bun", ["run", "dev:session", email], {
		cwd: API_DIR,
		encoding: "utf8",
	});

	if (minted.status !== 0) {
		throw new Error(
			`could not mint a session for ${email}: ${minted.stderr || minted.stdout}`,
		);
	}

	const line = minted.stdout
		.split("\n")
		.map((one) => one.trim())
		.find((one) => one.startsWith("crm.session_token="));

	if (!line) {
		throw new Error(`dev:session printed no cookie for ${email}`);
	}

	const split = line.indexOf("=");
	const pair: SessionCookie = {
		name: line.slice(0, split),
		value: line.slice(split + 1),
	};

	cookies.set(person, pair);

	return pair;
}

const HIDE_DEV_OVERLAYS =
	".tsqd-parent-container { display: none !important; }";

export async function signIn(
	context: BrowserContext,
	person: PersonKey,
): Promise<void> {
	const cookie = sessionCookie(person);

	await context.clearCookies();
	await context.addCookies([
		{ ...cookie, domain: "localhost", path: "/", httpOnly: false },
	]);

	await context.addInitScript((css: string) => {
		const paint = () => {
			const style = document.createElement("style");
			style.dataset.e2e = "hide-dev-overlays";
			style.textContent = css;
			document.documentElement.append(style);
		};

		if (document.documentElement) paint();
		else document.addEventListener("DOMContentLoaded", paint, { once: true });
	}, HIDE_DEV_OVERLAYS);
}

export function workspacePath(path = ""): string {
	return `/${WORKSPACE}${path}`;
}

export type ProcedureInput = Record<
	string,
	string | number | boolean | null | readonly string[]
>;

export type ApiAnswer = { status: number; body: string };

export async function callApi(
	person: PersonKey,
	procedure: string,
	input: ProcedureInput,
	method: "GET" | "POST" = "GET",
): Promise<ApiAnswer> {
	const cookie = sessionCookie(person);
	const base = process.env.E2E_API_URL ?? "http://localhost:3001";
	const headers = {
		cookie: `${cookie.name}=${cookie.value}`,
		"content-type": "application/json",
	};

	const response =
		method === "GET"
			? await fetch(
					`${base}/api/trpc/${procedure}?input=${encodeURIComponent(
						JSON.stringify(input),
					)}`,
					{ headers },
				)
			: await fetch(`${base}/api/trpc/${procedure}`, {
					method: "POST",
					headers,
					body: JSON.stringify(input),
				});

	return { status: response.status, body: await response.text() };
}

export async function hydrated(target: Locator): Promise<void> {
	await target.waitFor();

	await expect
		.poll(
			() =>
				target.evaluate((node) =>
					Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
				),
			{
				message:
					"React never hydrated this control, so it ignores the keyboard",
				timeout: 15_000,
			},
		)
		.toBe(true);
}

export async function mentorAssignedClient(): Promise<string> {
	const staff = await callApi("admin", "staff.directory", {
		role: ["MENTOR"],
		status: "active",
	});

	const mentors = JSON.parse(staff.body).result.data.rows as {
		userId: string;
	}[];

	const mentor = mentors[0];

	if (!mentor) throw new Error("the seed has no active mentor");

	const stamp = Date.now();

	const made = await callApi(
		"admin",
		"clients.create",
		{
			vertical: "ACADEMY",
			firstName: "Conversion",
			lastName: `Journey ${stamp}`,
			email: `conversion.journey.${stamp}@tradingacademy.ae`,
			phone: null,
			country: "AE",
			city: "Dubai",
			source: "e2e",
			salesOwnerId: null,
		},
		"POST",
	);

	if (made.status !== 200) {
		throw new Error(`could not create a client: ${made.body}`);
	}

	const clientRef = JSON.parse(made.body).result.data.clientRef as string;

	const qualified = await callApi(
		"admin",
		"clients.setStatus",
		{ clientRef, status: "QUALIFIED", reason: null },
		"POST",
	);

	if (qualified.status !== 200) {
		throw new Error(`could not qualify ${clientRef}: ${qualified.body}`);
	}

	const assigned = await callApi(
		"admin",
		"clients.assignMentor",
		{ clientRef, userId: mentor.userId },
		"POST",
	);

	if (assigned.status !== 200) {
		throw new Error(
			`could not assign a mentor to ${clientRef}: ${assigned.body}`,
		);
	}

	return clientRef;
}

export async function primaryNav(page: Page) {
	const opener = page.getByRole("button", { name: "Open navigation" });

	if (await opener.isVisible()) {
		await opener.click();
	}

	const nav = page.getByRole("navigation", { name: "Primary" }).last();
	await nav.waitFor();

	return nav;
}

export async function firstClientRef(page: Page): Promise<string> {
	await page.goto(workspacePath("/clients"));

	const ref = page.locator('[data-slot="client-ref"]').first();
	await ref.waitFor();

	const label = await ref.getAttribute("aria-label");
	const found = label?.match(/CL-\d{6}/)?.[0];

	if (!found) throw new Error("no client reference on the clients list");

	return found;
}
