import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ClientsRouter } from "./clients.router";
import { ClientsService } from "./clients.service";

@Module({
	imports: [TrpcModule],
	providers: [ClientsService, ClientsRouter],
	exports: [ClientsService],
})
export class ClientsModule {}
