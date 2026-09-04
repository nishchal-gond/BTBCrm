import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { StaffRouter } from "./staff.router";
import { StaffService } from "./staff.service";

@Module({
	imports: [TrpcModule],
	providers: [StaffService, StaffRouter],
	exports: [StaffService],
})
export class StaffModule {}
