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
import { clientRefInput } from "../clients/clients.contracts";
import type { ActorTrpcContext } from "../trpc/context.types";
import { ActorMiddleware } from "../trpc/middlewares/actor.middleware";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	clientEnrollmentsOutput,
	createProgramInput,
	enrollInput,
	enrollmentOutput,
	moveEnrollmentInput,
	programListInput,
	programListOutput,
	programOptionsOutput,
	programOutput,
	programWorkspaceOutput,
	reassignMentorInput,
	updateProgramInput,
} from "./programs.contracts";
import { ProgramsService } from "./programs.service";

@Router({ alias: "programs" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class ProgramsRouter {
	constructor(
		@Inject(ProgramsService) private readonly programs: ProgramsService,
	) {}

	@Query({
		output: programWorkspaceOutput,
		meta: restMeta("GET", "/programs/workspace", ["Programs"]),
	})
	async workspace(@Ctx() ctx: ActorTrpcContext) {
		return this.programs.workspace(ctx.actor);
	}

	@Query({
		input: programListInput,
		output: programListOutput,
		meta: restMeta("POST", "/programs/search", ["Programs"]),
	})
	async list(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof programListInput>,
	) {
		return this.programs.list(ctx.actor, input);
	}

	@Query({
		output: programOptionsOutput,
		meta: restMeta("GET", "/programs/options", ["Programs"]),
	})
	async options(@Ctx() ctx: ActorTrpcContext) {
		return this.programs.options(ctx.actor);
	}

	@Mutation({
		input: createProgramInput,
		output: programOutput,
		meta: restMeta("POST", "/programs", ["Programs"]),
	})
	async create(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof createProgramInput>,
	) {
		return this.programs.create(ctx.actor, input);
	}

	@Mutation({
		input: updateProgramInput,
		output: programOutput,
		meta: restMeta("PATCH", "/programs/{id}", ["Programs"]),
	})
	async update(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof updateProgramInput>,
	) {
		return this.programs.update(ctx.actor, input);
	}

	@Query({
		input: clientRefInput,
		output: clientEnrollmentsOutput,
		meta: restMeta("GET", "/clients/{clientRef}/enrollments", ["Programs"]),
	})
	async forClient(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof clientRefInput>,
	) {
		return this.programs.forClient(ctx.actor, input.clientRef);
	}

	@Mutation({
		input: enrollInput,
		output: enrollmentOutput,
		meta: restMeta("POST", "/enrollments", ["Programs"]),
	})
	async enroll(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof enrollInput>,
	) {
		return this.programs.enroll(ctx.actor, input);
	}

	@Mutation({
		input: moveEnrollmentInput,
		output: enrollmentOutput,
		meta: restMeta("PATCH", "/enrollments/{id}/status", ["Programs"]),
	})
	async move(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof moveEnrollmentInput>,
	) {
		return this.programs.move(ctx.actor, input);
	}

	@Mutation({
		input: reassignMentorInput,
		output: enrollmentOutput,
		meta: restMeta("PATCH", "/enrollments/{id}/mentor", ["Programs"]),
	})
	async reassignMentor(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof reassignMentorInput>,
	) {
		return this.programs.reassignMentor(ctx.actor, input);
	}
}
