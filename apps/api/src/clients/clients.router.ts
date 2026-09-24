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
import type { ActorTrpcContext } from "../trpc/context.types";
import { ActorMiddleware } from "../trpc/middlewares/actor.middleware";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	assignOwnerInput,
	clientDetailOutput,
	clientListInput,
	clientListOutput,
	clientRefInput,
	clientWorkspaceOutput,
	convertClientInput,
	createClientInput,
	duplicateCheckInput,
	duplicateCheckOutput,
	setStatusInput,
	statusHistoryOutput,
	updateClientInput,
} from "./clients.contracts";
import { ClientsService } from "./clients.service";

@Router({ alias: "clients" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class ClientsRouter {
	constructor(
		@Inject(ClientsService) private readonly clients: ClientsService,
	) {}

	@Query({
		output: clientWorkspaceOutput,
		meta: restMeta("GET", "/clients/workspace", ["Clients"]),
	})
	async workspace(@Ctx() ctx: ActorTrpcContext) {
		return this.clients.workspace(ctx.actor);
	}

	@Query({
		input: clientListInput,
		output: clientListOutput,
		meta: restMeta("POST", "/clients/search", ["Clients"]),
	})
	async list(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof clientListInput>,
	) {
		return this.clients.list(ctx.actor, input);
	}

	@Query({
		input: clientRefInput,
		output: clientDetailOutput,
		meta: restMeta("GET", "/clients/{clientRef}", ["Clients"]),
	})
	async byRef(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof clientRefInput>,
	) {
		return this.clients.byRef(ctx.actor, input.clientRef);
	}

	@Query({
		input: clientRefInput,
		output: statusHistoryOutput,
		meta: restMeta("GET", "/clients/{clientRef}/history", ["Clients"]),
	})
	async history(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof clientRefInput>,
	) {
		return this.clients.history(ctx.actor, input.clientRef);
	}

	@Query({
		input: duplicateCheckInput,
		output: duplicateCheckOutput,
		meta: restMeta("POST", "/clients/duplicate-check", ["Clients"]),
	})
	async duplicateCheck(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof duplicateCheckInput>,
	) {
		return this.clients.duplicateCheck(ctx.actor, input);
	}

	@Mutation({
		input: createClientInput,
		output: clientDetailOutput,
		meta: restMeta("POST", "/clients", ["Clients"]),
	})
	async create(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof createClientInput>,
	) {
		return this.clients.create(ctx.actor, input);
	}

	@Mutation({
		input: updateClientInput,
		output: clientDetailOutput,
		meta: restMeta("PATCH", "/clients/{clientRef}", ["Clients"]),
	})
	async update(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof updateClientInput>,
	) {
		return this.clients.update(ctx.actor, input);
	}

	@Mutation({
		input: assignOwnerInput,
		output: clientDetailOutput,
		meta: restMeta("PATCH", "/clients/{clientRef}/sales-owner", ["Clients"]),
	})
	async assignSalesOwner(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof assignOwnerInput>,
	) {
		return this.clients.assignSalesOwner(ctx.actor, input);
	}

	@Mutation({
		input: assignOwnerInput,
		output: clientDetailOutput,
		meta: restMeta("PATCH", "/clients/{clientRef}/mentor", ["Clients"]),
	})
	async assignMentor(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof assignOwnerInput>,
	) {
		return this.clients.assignMentor(ctx.actor, input);
	}

	@Mutation({
		input: setStatusInput,
		output: clientDetailOutput,
		meta: restMeta("PATCH", "/clients/{clientRef}/status", ["Clients"]),
	})
	async setStatus(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof setStatusInput>,
	) {
		return this.clients.setStatus(ctx.actor, input);
	}

	@Mutation({
		input: convertClientInput,
		output: clientDetailOutput,
		meta: restMeta("POST", "/clients/{clientRef}/convert", ["Clients"]),
	})
	async convert(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof convertClientInput>,
	) {
		return this.clients.convert(ctx.actor, input);
	}
}
