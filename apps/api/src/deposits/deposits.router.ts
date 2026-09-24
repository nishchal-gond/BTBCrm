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
	clientLedgerInput,
	clientLedgerOutput,
	depositListInput,
	depositListOutput,
	depositRowOutput,
	depositWorkspaceOutput,
	recordDepositInput,
	verifyDepositInput,
} from "./deposits.contracts";
import { DepositsService } from "./deposits.service";

@Router({ alias: "deposits" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class DepositsRouter {
	constructor(
		@Inject(DepositsService) private readonly deposits: DepositsService,
	) {}

	@Query({
		output: depositWorkspaceOutput,
		meta: restMeta("GET", "/deposits/workspace", ["Deposits"]),
	})
	async workspace(@Ctx() ctx: ActorTrpcContext) {
		return this.deposits.workspace(ctx.actor);
	}

	@Query({
		input: depositListInput,
		output: depositListOutput,
		meta: restMeta("POST", "/deposits/search", ["Deposits"]),
	})
	async list(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof depositListInput>,
	) {
		return this.deposits.list(ctx.actor, input);
	}

	@Query({
		input: clientLedgerInput,
		output: clientLedgerOutput,
		meta: restMeta("GET", "/clients/{clientRef}/deposits", ["Deposits"]),
	})
	async forClient(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof clientLedgerInput>,
	) {
		return this.deposits.forClient(ctx.actor, input.clientRef);
	}

	@Mutation({
		input: recordDepositInput,
		output: depositRowOutput,
		meta: restMeta("POST", "/deposits", ["Deposits"]),
	})
	async record(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof recordDepositInput>,
	) {
		return this.deposits.record(ctx.actor, input);
	}

	@Mutation({
		input: verifyDepositInput,
		output: depositRowOutput,
		meta: restMeta("POST", "/deposits/{id}/verify", ["Deposits"]),
	})
	async verify(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof verifyDepositInput>,
	) {
		return this.deposits.verify(ctx.actor, input.id);
	}
}
