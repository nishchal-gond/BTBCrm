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
	busyRangesInput,
	busyRangesOutput,
	cancelEventInput,
	createEventInput,
	eventOutput,
	eventsForClientInput,
	eventsForClientOutput,
	respondToEventInput,
	updateEventInput,
} from "./events.contracts";
import { EventsService } from "./events.service";

@Router({ alias: "events" })
@UseMiddlewares(AuthMiddleware, ActorMiddleware)
export class EventsRouter {
	constructor(@Inject(EventsService) private readonly events: EventsService) {}

	@Query({
		input: eventsForClientInput,
		output: eventsForClientOutput,
		meta: restMeta("POST", "/events/for-client", ["Events"]),
	})
	async forClient(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof eventsForClientInput>,
	) {
		return this.events.forClient(ctx.actor, input.clientRef);
	}

	@Mutation({
		input: createEventInput,
		output: eventOutput,
		meta: restMeta("POST", "/events", ["Events"]),
	})
	async create(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof createEventInput>,
	) {
		return this.events.create(ctx.actor, input);
	}

	@Mutation({
		input: updateEventInput,
		output: eventOutput,
		meta: restMeta("PATCH", "/events/{id}", ["Events"]),
	})
	async update(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof updateEventInput>,
	) {
		return this.events.update(ctx.actor, input);
	}

	@Mutation({
		input: cancelEventInput,
		output: eventOutput,
		meta: restMeta("POST", "/events/{id}/cancel", ["Events"]),
	})
	async cancel(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof cancelEventInput>,
	) {
		return this.events.cancel(ctx.actor, input);
	}

	@Mutation({
		input: respondToEventInput,
		output: eventOutput,
		meta: restMeta("POST", "/events/{id}/respond", ["Events"]),
	})
	async respond(
		@Ctx() ctx: ActorTrpcContext,
		@Input() input: z.infer<typeof respondToEventInput>,
	) {
		return this.events.respond(ctx.actor, input);
	}

	@Query({
		input: busyRangesInput,
		output: busyRangesOutput,
		meta: restMeta("POST", "/events/busy", ["Events"]),
	})
	async busy(@Input() input: z.infer<typeof busyRangesInput>) {
		return this.events.busyRanges(input);
	}
}
