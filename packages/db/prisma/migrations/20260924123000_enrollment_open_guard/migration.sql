-- DropIndex
DROP INDEX "enrollment_one_active_per_client";

-- AlterTable
ALTER TABLE "enrollment" ADD COLUMN     "closedAt" TIMESTAMPTZ(3);

UPDATE "enrollment"
SET "closedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" IN ('COMPLETED', 'WITHDRAWN');

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_one_open_per_client" ON "enrollment"("clientId") WHERE ("closedAt" IS NULL);

ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_closed_pair"
  CHECK (("status" IN ('COMPLETED', 'WITHDRAWN')) = ("closedAt" IS NOT NULL));

CREATE FUNCTION "enrollment_close_stamp"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IN ('COMPLETED', 'WITHDRAWN') THEN
    NEW."closedAt" := COALESCE(OLD."closedAt", NEW."closedAt", now());
  ELSE
    NEW."closedAt" := NULL;
  END IF;

  IF NEW."status" = 'COMPLETED' THEN
    NEW."completedAt" := COALESCE(OLD."completedAt", NEW."completedAt", now());
  ELSE
    NEW."completedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "enrollment_close_stamp"
BEFORE INSERT OR UPDATE OF "status" ON "enrollment"
FOR EACH ROW EXECUTE FUNCTION "enrollment_close_stamp"();
