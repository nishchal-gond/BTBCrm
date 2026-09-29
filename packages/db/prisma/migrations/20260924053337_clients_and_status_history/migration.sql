-- CreateSequence
CREATE SEQUENCE "client_ref_seq" START 1;

-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('ACADEMY', 'REAL_ESTATE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('LEAD', 'QUALIFIED', 'MENTOR_ASSIGNED', 'CONVERTED', 'STUDENT', 'LOST', 'DORMANT');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL DEFAULT ('CL-' || lpad((nextval('client_ref_seq'::regclass))::text, 6, '0'::text)),
    "vertical" "Vertical" NOT NULL DEFAULT 'ACADEMY',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailNorm" TEXT,
    "phoneNorm" TEXT,
    "country" TEXT,
    "city" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'LEAD',
    "source" TEXT,
    "createdById" TEXT NOT NULL,
    "salesOwnerId" TEXT,
    "mentorOwnerId" TEXT,
    "convertedById" TEXT,
    "convertedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientStatusHistory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStatus" "ClientStatus",
    "toStatus" "ClientStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_clientRef_key" ON "client"("clientRef");

-- CreateIndex
CREATE INDEX "client_salesOwnerId_idx" ON "client"("salesOwnerId");

-- CreateIndex
CREATE INDEX "client_mentorOwnerId_idx" ON "client"("mentorOwnerId");

-- CreateIndex
CREATE INDEX "client_createdById_idx" ON "client"("createdById");

-- CreateIndex
CREATE INDEX "client_vertical_status_createdAt_idx" ON "client"("vertical", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "client_vertical_salesOwnerId_status_lastActivityAt_idx" ON "client"("vertical", "salesOwnerId", "status", "lastActivityAt" DESC);

-- CreateIndex
CREATE INDEX "client_unassigned_idx" ON "client"("vertical", "createdAt") WHERE ("salesOwnerId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "client_emailNorm_active_key" ON "client"("emailNorm") WHERE ("emailNorm" IS NOT NULL AND "status" != 'LOST');

-- CreateIndex
CREATE UNIQUE INDEX "client_phoneNorm_active_key" ON "client"("phoneNorm") WHERE ("phoneNorm" IS NOT NULL AND "status" != 'LOST');

-- CreateIndex
CREATE INDEX "clientStatusHistory_clientId_changedAt_idx" ON "clientStatusHistory"("clientId", "changedAt" DESC);

-- CreateIndex
CREATE INDEX "clientStatusHistory_changedById_idx" ON "clientStatusHistory"("changedById");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_salesOwnerId_fkey" FOREIGN KEY ("salesOwnerId") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_mentorOwnerId_fkey" FOREIGN KEY ("mentorOwnerId") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientStatusHistory" ADD CONSTRAINT "clientStatusHistory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientStatusHistory" ADD CONSTRAINT "clientStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client" ADD CONSTRAINT "client_name_present"
  CHECK (length(btrim("firstName")) > 0 AND length(btrim("lastName")) > 0);

ALTER TABLE "client" ADD CONSTRAINT "client_contact_channel"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

ALTER TABLE "client" ADD CONSTRAINT "client_country_code"
  CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$');

ALTER TABLE "client" ADD CONSTRAINT "client_conversion_pair"
  CHECK (("convertedAt" IS NULL) = ("convertedById" IS NULL));

ALTER TABLE "client" ADD CONSTRAINT "client_conversion_chain"
  CHECK ("status" NOT IN ('CONVERTED', 'STUDENT')
         OR ("convertedById" IS NOT NULL AND "convertedAt" IS NOT NULL));

ALTER TABLE "client" ADD CONSTRAINT "client_mentor_required"
  CHECK ("vertical" <> 'ACADEMY'
         OR "status" NOT IN ('MENTOR_ASSIGNED', 'CONVERTED', 'STUDENT')
         OR "mentorOwnerId" IS NOT NULL);

ALTER TABLE "client" ADD CONSTRAINT "client_vertical_status"
  CHECK ("vertical" = 'ACADEMY'
         OR "status" IN ('LEAD', 'QUALIFIED', 'CONVERTED', 'LOST', 'DORMANT'));

CREATE FUNCTION "client_normalize"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."emailNorm" := nullif(lower(btrim(coalesce(NEW."email", ''))), '');
  NEW."phoneNorm" := nullif(regexp_replace(coalesce(NEW."phone", ''), '[^0-9]', '', 'g'), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_normalize"
BEFORE INSERT OR UPDATE OF "email", "phone" ON "client"
FOR EACH ROW EXECUTE FUNCTION "client_normalize"();

CREATE FUNCTION "client_touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_touch_updated_at"
BEFORE UPDATE ON "client"
FOR EACH ROW EXECUTE FUNCTION "client_touch_updated_at"();

CREATE FUNCTION "client_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."clientRef" IS DISTINCT FROM OLD."clientRef" THEN
    RAISE EXCEPTION 'clientRef is permanent and cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
    RAISE EXCEPTION 'createdById records who entered the person and cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'createdAt cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."convertedAt" IS NOT NULL
     AND (NEW."convertedAt" IS DISTINCT FROM OLD."convertedAt"
          OR NEW."convertedById" IS DISTINCT FROM OLD."convertedById") THEN
    RAISE EXCEPTION 'a client converts once; the conversion stamp cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_guard_immutable"
BEFORE UPDATE ON "client"
FOR EACH ROW EXECUTE FUNCTION "client_guard_immutable"();

CREATE FUNCTION "client_record_status"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor text := nullif(current_setting('app.actorId', true), '');
  known text;
BEGIN
  SELECT "userId" INTO known FROM "staffProfile" WHERE "userId" = actor;

  INSERT INTO "clientStatusHistory"
    ("id", "clientId", "fromStatus", "toStatus", "reason", "changedById", "changedAt")
  VALUES (
    gen_random_uuid()::text,
    NEW."id",
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."status" END,
    NEW."status",
    nullif(current_setting('app.statusReason', true), ''),
    known,
    now()
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER "client_record_status_on_insert"
AFTER INSERT ON "client"
FOR EACH ROW EXECUTE FUNCTION "client_record_status"();

CREATE TRIGGER "client_record_status_on_update"
AFTER UPDATE OF "status" ON "client"
FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "client_record_status"();
