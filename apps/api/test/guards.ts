import { db } from "@crm/db";

export type DeleteGuard = { table: string; trigger: string };

export const DELETE_GUARDS: readonly DeleteGuard[] = [
	{ table: "deposit", trigger: "deposit_no_delete" },
	{ table: "enrollment", trigger: "enrollment_no_delete" },
	{ table: "program", trigger: "program_no_delete" },
	{ table: "client", trigger: "client_no_delete" },
];

export async function withoutDeleteGuards<T>(
	work: () => Promise<T>,
	guards: readonly DeleteGuard[] = DELETE_GUARDS,
): Promise<T> {
	for (const guard of guards) {
		await db.$executeRawUnsafe(
			`ALTER TABLE "${guard.table}" DISABLE TRIGGER "${guard.trigger}"`,
		);
	}

	try {
		return await work();
	} finally {
		for (const guard of guards) {
			await db.$executeRawUnsafe(
				`ALTER TABLE "${guard.table}" ENABLE TRIGGER "${guard.trigger}"`,
			);
		}
	}
}
