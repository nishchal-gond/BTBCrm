import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ProgramsRouter } from "./programs.router";
import { ProgramsService } from "./programs.service";

@Module({
	imports: [TrpcModule],
	providers: [ProgramsService, ProgramsRouter],
	exports: [ProgramsService],
})
export class ProgramsModule {}
