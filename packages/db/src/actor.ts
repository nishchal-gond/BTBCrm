import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";

export type ActorContext = {
	actorId: string;
	statusReason?: string;
};

export async function withActor<Result>(
	db: Db,
	context: ActorContext,
	work: (tx: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
	return db.$transaction(async (tx) => {
		await tx.$executeRaw`select set_config('app.actorId', ${context.actorId}, true)`;

		await tx.$executeRaw`select set_config('app.statusReason', ${context.statusReason ?? ""}, true)`;

		return work(tx);
	});
}
