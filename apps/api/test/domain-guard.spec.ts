import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src");

const DOMAIN_MODULES = [
	"clients",
	"deposits",
	"events",
	"overview",
	"programs",
	"search",
	"staff",
] as const;

function read(module: string, file: string): string {
	return readFileSync(join(SRC, module, file), "utf8");
}

function routerOf(module: string): string {
	return read(module, `${module}.router.ts`);
}

function serviceOf(module: string): string {
	return read(module, `${module}.service.ts`);
}

describe("every domain router is behind the actor", () => {
	for (const module of DOMAIN_MODULES) {
		it(`${module} carries AuthMiddleware and ActorMiddleware`, () => {
			const router = routerOf(module);

			expect(router).toContain("AuthMiddleware");
			expect(router).toContain("ActorMiddleware");
		});

		it(`${module} takes the actor from the context, never from the input`, () => {
			const router = routerOf(module);

			expect(router).not.toMatch(/input\.(actor|userId|role)\b/);
		});
	}
});

describe("every domain read is scoped by the access module", () => {
	const SCOPED = {
		clients: "clientScope",
		deposits: "clientScope",
		events: "eventScope",
		overview: "clientScope",
		programs: "clientScope",
		search: "clientScope",
	} as const;

	for (const [module, helper] of Object.entries(SCOPED)) {
		it(`${module} builds its where from ${helper}`, () => {
			expect(serviceOf(module)).toContain(helper);
		});
	}

	it("no domain service reaches for a role name of its own", () => {
		const offenders: string[] = [];

		for (const module of DOMAIN_MODULES) {
			const service = serviceOf(module);

			for (const role of [
				"SALES_MANAGER",
				"MENTOR_MANAGER",
				"FINANCE",
				"MENTOR",
			]) {
				if (service.includes(`"${role}"`)) offenders.push(`${module}: ${role}`);
			}
		}

		expect(offenders, offenders.join(" | ")).toHaveLength(0);
	});
});

describe("the ledger has no way to change history", () => {
	it("exposes no update and no delete procedure", () => {
		const router = routerOf("deposits");

		expect(router).not.toMatch(/async (update|delete|remove)\s*\(/);
	});

	it("names no Prisma delete on a client, a deposit or an enrolment", () => {
		for (const module of ["clients", "deposits", "programs"]) {
			const service = serviceOf(module);

			expect(service).not.toMatch(
				/\.(client|deposit|enrollment|program)\.(delete|deleteMany)\s*\(/,
			);
		}
	});
});

describe("the migrations carry the invariants the documents promise", () => {
	const sql = readdirSync(
		join(SRC, "..", "..", "..", "packages", "db", "prisma", "migrations"),
		{
			withFileTypes: true,
		},
	)
		.filter((entry) => entry.isDirectory())
		.map((entry) =>
			readFileSync(
				join(
					SRC,
					"..",
					"..",
					"..",
					"packages",
					"db",
					"prisma",
					"migrations",
					entry.name,
					"migration.sql",
				),
				"utf8",
			),
		)
		.join("\n");

	const REQUIRED = [
		"client_guard_immutable",
		"client_conversion_chain",
		"client_conversion_pair",
		"client_mentor_required",
		"client_vertical_status",
		"client_student_needs_enrollment",
		"client_no_delete",
		"deposit_append_only",
		"deposit_no_delete",
		"deposit_amount_sign",
		"deposit_adjustment_corrects",
		"deposit_corrects_same_client",
		"deposit_ledger_currency",
		"enrollment_one_open_per_client",
		"enrollment_needs_converted_client",
		"enrollment_is_academy",
		"enrollment_no_delete",
		"enrollment_guard_immutable",
		"program_no_delete",
		"company_event_time_order",
		"company_event_cancel_pair",
		"company_event_zone_is_real",
	];

	for (const guard of REQUIRED) {
		it(`${guard} exists in a migration`, () => {
			expect(sql).toContain(guard);
		});
	}
});
