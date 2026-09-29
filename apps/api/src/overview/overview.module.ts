import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { OverviewRouter } from "./overview.router";
import { OverviewService } from "./overview.service";

@Module({
	imports: [TrpcModule],
	providers: [OverviewService, OverviewRouter],
	exports: [OverviewService],
})
export class OverviewModule {}
