import type { Db } from "@crm/db";
import { loadActor } from "@crm/db/access";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { InjectDatabase } from "../../database/database.constants";
import type { ActorTrpcContext, AuthedTrpcContext } from "../context.types";

@Injectable()
export class ActorMiddleware implements TRPCMiddleware {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as AuthedTrpcContext;

		if (!ctx.user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}

		const actor = await loadActor(this.db, ctx.user.id);

		if (!actor) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message:
					"Your account has no active staff profile. Ask an administrator.",
			});
		}

		const nextCtx: ActorTrpcContext = { ...ctx, actor };
		return opts.next({ ctx: nextCtx });
	}
}
