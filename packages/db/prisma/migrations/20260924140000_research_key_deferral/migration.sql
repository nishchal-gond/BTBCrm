-- AlterTable
ALTER TABLE "appSetting" ADD COLUMN     "contextDevDeferredAt" TIMESTAMPTZ(3);

ALTER TABLE "appSetting" ADD CONSTRAINT "app_setting_research_gate_settled"
  CHECK ("contextDevApiKey" IS NULL OR "contextDevDeferredAt" IS NULL);
