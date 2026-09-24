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
import type {
	ActorTrpcContext,
	AuthedTrpcContext,
} from "../trpc/context.types";
import { ActorMiddleware } from "../trpc/middlewares/actor.middleware";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	assignTeamInput,
	createTeamInput,
	setStaffActiveInput,
	setStaffRoleInput,
	setStaffVerticalsInput,
	staffListInput,
	staffListOutput,
	staffMemberOutput,
	staffMeOutput,
	teamListOutput,
	teamOutput,
	updateMeInput,
	updateTeamInput,
} from "./staff.contracts";
import { StaffService } from "./staff.service";

@Router({ alias: "staff" })
@UseMiddlewares(AuthMiddleware)
export class StaffRouter {
	constructor(@Inject(StaffService) private readonly staff: StaffService) {}

	@Query({
		output: staffMeOutput,
		meta: restMeta("GET", "/staff/me", ["Staff"]),
	})
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.staff.me(ctx.user.id);
	}

	@Query({
		input: staffListInput,
		output: staffListOutput,
		meta: restMeta("POST", "/staff/search", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async directory(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof staffListInput>,
	) {
		return this.staff.directory(ctx.actor, input);
	}

	@Mutation({
		input: setStaffRoleInput,
		output: staffMemberOutput,
		meta: restMeta("PATCH", "/staff/{userId}/role", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async setRole(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof setStaffRoleInput>,
	) {
		return this.staff.setRole(ctx.actor, input);
	}

	@Mutation({
		input: setStaffActiveInput,
		output: staffMemberOutput,
		meta: restMeta("PATCH", "/staff/{userId}/active", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async setActive(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof setStaffActiveInput>,
	) {
		return this.staff.setActive(ctx.actor, input);
	}

	@Mutation({
		input: assignTeamInput,
		output: staffMemberOutput,
		meta: restMeta("PATCH", "/staff/{userId}/team", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async assignTeam(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof assignTeamInput>,
	) {
		return this.staff.assignTeam(ctx.actor, input);
	}

	@Mutation({
		input: updateMeInput,
		output: staffMemberOutput,
		meta: restMeta("PATCH", "/staff/me", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async updateMe(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof updateMeInput>,
	) {
		return this.staff.updateMe(ctx.actor, input);
	}

	@Query({
		output: teamListOutput,
		meta: restMeta("GET", "/teams", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async teams() {
		return this.staff.teams();
	}

	@Mutation({
		input: setStaffVerticalsInput,
		output: staffMemberOutput,
		meta: restMeta("PATCH", "/staff/{userId}/verticals", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async setVerticals(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof setStaffVerticalsInput>,
	) {
		return this.staff.setVerticals(ctx.actor, input);
	}

	@Mutation({
		input: createTeamInput,
		output: teamOutput,
		meta: restMeta("POST", "/teams", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async createTeam(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof createTeamInput>,
	) {
		return this.staff.createTeam(ctx.actor, input);
	}

	@Mutation({
		input: updateTeamInput,
		output: teamOutput,
		meta: restMeta("PATCH", "/teams/{id}", ["Staff"]),
	})
	@UseMiddlewares(ActorMiddleware)
	async updateTeam(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof updateTeamInput>,
	) {
		return this.staff.updateTeam(ctx.actor, input);
	}
}
