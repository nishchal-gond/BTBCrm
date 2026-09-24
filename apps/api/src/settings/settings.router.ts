import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	agentModelOutput,
	archiveRetentionOutput,
	modelCatalogOutput,
	researchKeyOutput,
	setAgentModelInput,
	setArchiveRetentionDaysInput,
	setResearchKeyInput,
} from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
@UseMiddlewares(AuthMiddleware)
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
	) {}

	@Query({
		output: agentModelOutput,
		meta: restMeta("GET", "/settings/agent-model", ["Settings"]),
	})
	async agentModel() {
		return this.settings.agentModel();
	}

	@Query({
		output: modelCatalogOutput,
		meta: restMeta("GET", "/settings/model-catalog", ["Settings"]),
	})
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Mutation({
		input: setAgentModelInput,
		output: agentModelOutput,
		meta: restMeta("PATCH", "/settings/agent-model", ["Settings"]),
	})
	async setAgentModel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentModelInput>,
	) {
		return this.settings.setAgentModel(ctx.user.id, input.modelId);
	}

	@Query({
		output: researchKeyOutput,
		meta: restMeta("GET", "/settings/research-key", ["Settings"]),
	})
	async researchKey(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.researchKey(ctx.user.id);
	}

	@Mutation({
		input: setResearchKeyInput,
		output: researchKeyOutput,
		meta: restMeta("PATCH", "/settings/research-key", ["Settings"]),
	})
	async setResearchKey(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setResearchKeyInput>,
	) {
		return this.settings.setResearchKey(ctx.user.id, input.apiKey);
	}

	@Mutation({
		output: researchKeyOutput,
		meta: restMeta("POST", "/settings/research-key/defer", ["Settings"]),
	})
	async deferResearchKey(@Ctx() ctx: AuthedTrpcContext) {
		return this.settings.deferResearchKey(ctx.user.id);
	}

	@Query({
		output: archiveRetentionOutput,
		meta: restMeta("GET", "/settings/archive-retention", ["Settings"]),
	})
	async archiveRetention() {
		return this.settings.archiveRetention();
	}

	@Mutation({
		input: setArchiveRetentionDaysInput,
		output: archiveRetentionOutput,
		meta: restMeta("PATCH", "/settings/archive-retention", ["Settings"]),
	})
	async setArchiveRetention(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setArchiveRetentionDaysInput>,
	) {
		return this.settings.setArchiveRetention(ctx.user.id, input.days);
	}
}
