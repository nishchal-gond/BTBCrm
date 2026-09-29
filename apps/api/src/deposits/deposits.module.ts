import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { DepositsRouter } from "./deposits.router";
import { DepositsService } from "./deposits.service";

@Module({
	imports: [TrpcModule],
	providers: [DepositsService, DepositsRouter],
	exports: [DepositsService],
})
export class DepositsModule {}
