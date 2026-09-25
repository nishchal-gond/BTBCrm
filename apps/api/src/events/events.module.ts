import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { EventsRouter } from "./events.router";
import { EventsService } from "./events.service";

@Module({
	imports: [TrpcModule],
	providers: [EventsService, EventsRouter],
	exports: [EventsService],
})
export class EventsModule {}
