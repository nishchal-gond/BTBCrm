-- CreateEnum
CREATE TYPE "DepositEntry" AS ENUM ('PAYMENT', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "deposit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entryType" "DepositEntry" NOT NULL DEFAULT 'PAYMENT',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "correctsId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_clientId_occurredAt_idx" ON "deposit"("clientId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "deposit_occurredAt_idx" ON "deposit"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "deposit_recordedById_idx" ON "deposit"("recordedById");

-- CreateIndex
CREATE INDEX "deposit_correctsId_idx" ON "deposit"("correctsId");

-- CreateIndex
CREATE INDEX "deposit_verifiedById_idx" ON "deposit"("verifiedById");

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit" ADD CONSTRAINT "deposit_amount_sign"
  CHECK (("entryType" = 'PAYMENT' AND "amount" > 0)
      OR ("entryType" = 'REFUND' AND "amount" < 0)
      OR ("entryType" = 'ADJUSTMENT' AND "amount" <> 0));

ALTER TABLE "deposit" ADD CONSTRAINT "deposit_currency_code"
  CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "deposit" ADD CONSTRAINT "deposit_adjustment_corrects"
  CHECK ("entryType" <> 'ADJUSTMENT' OR "correctsId" IS NOT NULL);

ALTER TABLE "deposit" ADD CONSTRAINT "deposit_corrects_not_self"
  CHECK ("correctsId" IS NULL OR "correctsId" <> "id");

ALTER TABLE "deposit" ADD CONSTRAINT "deposit_verification_pair"
  CHECK (("verifiedAt" IS NULL) = ("verifiedById" IS NULL));

CREATE FUNCTION "deposit_corrects_same_client"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  other text;
BEGIN
  IF NEW."correctsId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "clientId" INTO other FROM "deposit" WHERE "id" = NEW."correctsId";

  IF other IS DISTINCT FROM NEW."clientId" THEN
    RAISE EXCEPTION 'an adjustment corrects an entry on the same client'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "deposit_corrects_same_client"
BEFORE INSERT OR UPDATE OF "correctsId" ON "deposit"
FOR EACH ROW EXECUTE FUNCTION "deposit_corrects_same_client"();

CREATE FUNCTION "deposit_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
     OR NEW."entryType" IS DISTINCT FROM OLD."entryType"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."correctsId" IS DISTINCT FROM OLD."correctsId"
     OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
     OR NEW."recordedById" IS DISTINCT FROM OLD."recordedById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'the deposit ledger is append-only; correct a mistake with an adjustment entry'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."verifiedAt" IS NOT NULL AND NEW."verifiedAt" IS DISTINCT FROM OLD."verifiedAt" THEN
    RAISE EXCEPTION 'a deposit is verified once'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "deposit_append_only"
BEFORE UPDATE ON "deposit"
FOR EACH ROW EXECUTE FUNCTION "deposit_append_only"();

CREATE FUNCTION "deposit_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the deposit ledger is append-only; a row is never deleted'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "deposit_no_delete"
BEFORE DELETE ON "deposit"
FOR EACH ROW EXECUTE FUNCTION "deposit_no_delete"();
