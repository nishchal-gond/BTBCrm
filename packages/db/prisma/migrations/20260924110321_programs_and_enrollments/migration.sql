-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "program" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationWeeks" INTEGER NOT NULL,
    "priceAed" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "mentorId" TEXT,
    "cohort" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "program_code_key" ON "program"("code");

-- CreateIndex
CREATE INDEX "program_isActive_code_idx" ON "program"("isActive", "code");

-- CreateIndex
CREATE INDEX "enrollment_clientId_enrolledAt_idx" ON "enrollment"("clientId", "enrolledAt" DESC);

-- CreateIndex
CREATE INDEX "enrollment_mentorId_status_idx" ON "enrollment"("mentorId", "status");

-- CreateIndex
CREATE INDEX "enrollment_programId_idx" ON "enrollment"("programId");

-- CreateIndex
CREATE INDEX "enrollment_createdById_idx" ON "enrollment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_one_active_per_client" ON "enrollment"("clientId") WHERE ("status" = 'ACTIVE');

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program" ADD CONSTRAINT "program_code_shape"
  CHECK ("code" ~ '^[A-Z0-9-]{2,20}$');

ALTER TABLE "program" ADD CONSTRAINT "program_duration_positive"
  CHECK ("durationWeeks" > 0);

ALTER TABLE "program" ADD CONSTRAINT "program_price_not_negative"
  CHECK ("priceAed" >= 0);

ALTER TABLE "program" ADD CONSTRAINT "program_name_present"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_completed_pair"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

CREATE FUNCTION "enrollment_is_academy"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line "Vertical";
BEGIN
  SELECT "vertical" INTO line FROM "client" WHERE "id" = NEW."clientId";

  IF line <> 'ACADEMY' THEN
    RAISE EXCEPTION 'enrolments belong to the Trading Academy, not Real Estate'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "enrollment_is_academy"
BEFORE INSERT OR UPDATE OF "clientId" ON "enrollment"
FOR EACH ROW EXECUTE FUNCTION "enrollment_is_academy"();

CREATE FUNCTION "client_student_needs_enrollment"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'a client becomes a student by enrolling, never on entry'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "enrollment"
    WHERE "clientId" = NEW."id" AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'a student has an active enrolment; enrol them on a programme first'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_student_needs_enrollment_on_insert"
BEFORE INSERT ON "client"
FOR EACH ROW WHEN (NEW."status" = 'STUDENT')
EXECUTE FUNCTION "client_student_needs_enrollment"();

CREATE TRIGGER "client_student_needs_enrollment_on_update"
BEFORE UPDATE OF "status" ON "client"
FOR EACH ROW WHEN (NEW."status" = 'STUDENT' AND OLD."status" IS DISTINCT FROM 'STUDENT')
EXECUTE FUNCTION "client_student_needs_enrollment"();
