import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { ActorTrpcContext } from "../trpc/context.types";
import { ActorMiddleware } from "../trpc/middlewares/actor.middleware";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { overviewInput, overviewOutput } from "./overview.contracts";
import { OverviewService } from "./overview.service";

@Router({ alias: "overview" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class OverviewRouter {
	constructor(
		@Inject(OverviewService) private readonly overview: OverviewService,
	) {}

	@Query({
		input: overviewInput,
		output: overviewOutput,
		meta: restMeta("POST", "/overview", ["Overview"]),
	})
	async summary(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof overviewInput>,
	) {
		return this.overview.summary(ctx.actor, input);
	}
}
