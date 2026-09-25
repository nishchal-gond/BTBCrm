import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { z } from "zod";
import type { ActorTrpcContext } from "../trpc/context.types";
import { ActorMiddleware } from "../trpc/middlewares/actor.middleware";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { SearchService } from "./search.service";

const quickInput = z.object({ q: z.string().default("") });

const searchHitOutput = z.object({
	kind: z.enum(["client", "company", "contact", "deal"]),
	id: z.string(),
	label: z.string(),
	detail: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

const quickOutput = z.object({ hits: z.array(searchHitOutput) });

@Router({ alias: "search" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class SearchRouter {
	constructor(@Inject(SearchService) private readonly search: SearchService) {}

	@Query({
		input: quickInput,
		output: quickOutput,
		meta: restMeta("GET", "/search", ["Search"]),
	})
	async quick(@Ctx() ctx: ActorTrpcContext, @Input("q") q: string) {
		return this.search.quick(ctx.actor, q);
	}
}
