import { canManageSettings, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	deferContextDevKey,
	maskKey,
	readAgentModel,
	readArchiveRetentionDays,
	readContextDevGate,
	writeAgentModel,
	writeArchiveRetentionDays,
	writeContextDevKey,
} from "@crm/db/settings";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
} from "@nestjs/common";
import { ResearchKeyService } from "../agent/research-key.service";
import { BackfillService } from "../backfill/backfill.service";
import { InjectDatabase } from "../database/database.constants";
import { ModelCatalogService } from "./model-catalog.service";
import type {
	AgentModelSettings,
	ArchiveRetentionSettings,
	ModelCatalogResult,
	ResearchKeySettings,
} from "./settings.contracts";

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly catalog: ModelCatalogService,
		private readonly researchKeys: ResearchKeyService,
		private readonly backfill: BackfillService,
	) {}

	private async canManage(userId: string): Promise<boolean> {
		return canManageSettings(await workspaceRoleOf(userId));
	}

	private async requireManager(userId: string, what: string): Promise<void> {
		if (!(await this.canManage(userId))) {
			throw new ForbiddenException(
				`Only an owner or an admin can change ${what}.`,
			);
		}
	}

	async agentModel(): Promise<AgentModelSettings> {
		const [model, row] = await Promise.all([
			readAgentModel(this.db),
			this.db.appSetting.findFirst({ select: { updatedAt: true } }),
		]);

		return {
			selectedId: model.isDefault ? null : model.id,
			effectiveId: model.id,
			defaultId: DEFAULT_AGENT_MODEL.id,
			effective: await this.catalog.find(model.id),
			updatedAt: row?.updatedAt.toISOString() ?? null,
		};
	}

	async setAgentModel(
		actingUserId: string,
		modelId: string | null,
	): Promise<AgentModelSettings> {
		await this.requireManager(actingUserId, "which model the agent runs on");

		if (modelId === null) {
			await writeAgentModel(this.db, null);
			this.logger.log({ message: "Agent model reset to the default" });
			return this.agentModel();
		}

		const models = await this.catalog.models();

		if (!models) {
			throw new BadRequestException(
				"Could not reach the AI Gateway to check that model. Try again in a moment.",
			);
		}

		const chosen = models.find((model) => model.id === modelId);

		if (!chosen) {
			throw new BadRequestException(
				`The AI Gateway does not serve a tool-using model called "${modelId}".`,
			);
		}

		await writeAgentModel(this.db, {
			id: chosen.id,
			contextWindowTokens: chosen.contextWindowTokens,
		});

		this.logger.log({ message: "Agent model changed", modelId: chosen.id });

		return this.agentModel();
	}

	async modelCatalog(): Promise<ModelCatalogResult> {
		const models = await this.catalog.models();
		return { models: models ?? [], available: models !== null };
	}

	async researchKey(actingUserId: string): Promise<ResearchKeySettings> {
		const [gate, canManage] = await Promise.all([
			readContextDevGate(this.db),
			this.canManage(actingUserId),
		]);

		return {
			configured: gate.key !== null,
			deferred: gate.deferredAt !== null,
			hint: gate.key ? maskKey(gate.key) : null,
			canManage,
		};
	}

	async deferResearchKey(actingUserId: string): Promise<ResearchKeySettings> {
		await this.requireManager(actingUserId, "the research key");

		const gate = await readContextDevGate(this.db);

		if (gate.key === null) await deferContextDevKey(this.db);

		this.logger.log({ message: "Research key deferred" });

		return this.researchKey(actingUserId);
	}

	async setResearchKey(
		actingUserId: string,
		apiKey: string,
	): Promise<ResearchKeySettings> {
		await this.requireManager(actingUserId, "the research key");

		const check = await this.researchKeys.verify(apiKey);

		if (check.outcome === "invalid") {
			throw new BadRequestException(check.reason);
		}

		await writeContextDevKey(this.db, apiKey);

		this.logger.log({
			message: "Context key saved",
			verified: check.outcome === "valid",
		});

		// Every company added while there was no key is still PENDING, because a
		// brand task with nowhere to look leaves the record alone. The sign-in
		// sweep would find them, but the person who just fixed it is standing
		// here — so pick the work up now rather than on their next sign-in.
		void this.backfill
			.run("companies")
			.then(({ queued, remaining }) => {
				if (queued > 0) {
					this.logger.log({
						message: "Queued the research that was waiting on a key",
						queued,
						remaining,
					});
				}
			})
			.catch((cause: unknown) => {
				this.logger.warn(
					{ message: "Could not queue the waiting research" },
					cause instanceof Error ? cause.stack : String(cause),
				);
			});

		return this.researchKey(actingUserId);
	}

	async archiveRetention(): Promise<ArchiveRetentionSettings> {
		return { days: await readArchiveRetentionDays(this.db) };
	}

	async setArchiveRetention(
		actingUserId: string,
		days: number,
	): Promise<ArchiveRetentionSettings> {
		await this.requireManager(actingUserId, "how long archived records live");

		const saved = await writeArchiveRetentionDays(this.db, days);

		this.logger.log({
			message: "Archive retention changed",
			days: saved,
		});

		return { days: saved };
	}
}
