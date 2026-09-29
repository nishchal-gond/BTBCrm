-- CreateEnum
CREATE TYPE "CompanyEventType" AS ENUM ('SALES_CALL', 'CLIENT_APPOINTMENT', 'MENTOR_SESSION', 'REVIEW', 'ONBOARDING', 'COMPANY_MEETING', 'INTERNAL_TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "EventResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateTable
CREATE TABLE "companyEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "CompanyEventType" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "organizerId" TEXT NOT NULL,
    "clientId" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companyEventAttendee" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" "EventResponse" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "companyEventAttendee_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "companyEvent_startsAt_endsAt_idx" ON "companyEvent"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "companyEvent_organizerId_startsAt_idx" ON "companyEvent"("organizerId", "startsAt");

-- CreateIndex
CREATE INDEX "companyEvent_clientId_startsAt_idx" ON "companyEvent"("clientId", "startsAt") WHERE ("clientId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "companyEvent_createdById_idx" ON "companyEvent"("createdById");

-- CreateIndex
CREATE INDEX "companyEventAttendee_userId_idx" ON "companyEventAttendee"("userId");

-- AddForeignKey
ALTER TABLE "companyEvent" ADD CONSTRAINT "companyEvent_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyEvent" ADD CONSTRAINT "companyEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyEvent" ADD CONSTRAINT "companyEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staffProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyEventAttendee" ADD CONSTRAINT "companyEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "companyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companyEventAttendee" ADD CONSTRAINT "companyEventAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "staffProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "companyEvent" ADD CONSTRAINT "company_event_title_present"
  CHECK (length(btrim("title")) > 0);

ALTER TABLE "companyEvent" ADD CONSTRAINT "company_event_time_order"
  CHECK ("endsAt" > "startsAt");

ALTER TABLE "companyEvent" ADD CONSTRAINT "company_event_cancel_pair"
  CHECK ("isCancelled" = ("cancelledAt" IS NOT NULL));

ALTER TABLE "companyEvent" ADD CONSTRAINT "company_event_company_has_no_client"
  CHECK ("eventType" NOT IN ('COMPANY_MEETING', 'INTERNAL_TRAINING') OR "clientId" IS NULL);

CREATE FUNCTION "company_event_zone_is_real"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM now() AT TIME ZONE NEW."timezone";
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'timezone must be an IANA identifier, like Asia/Dubai'
      USING ERRCODE = 'check_violation';
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_event_zone_is_real"
BEFORE INSERT OR UPDATE OF "timezone" ON "companyEvent"
FOR EACH ROW EXECUTE FUNCTION "company_event_zone_is_real"();

CREATE FUNCTION "company_event_cancel_stamp"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."isCancelled" THEN
    NEW."cancelledAt" := COALESCE(OLD."cancelledAt", NEW."cancelledAt", now());
  ELSE
    NEW."cancelledAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_event_cancel_stamp"
BEFORE INSERT OR UPDATE OF "isCancelled" ON "companyEvent"
FOR EACH ROW EXECUTE FUNCTION "company_event_cancel_stamp"();

CREATE FUNCTION "company_event_attendee_responded"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."response" = 'PENDING' THEN
    NEW."respondedAt" := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW."response" IS DISTINCT FROM OLD."response" THEN
    NEW."respondedAt" := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_event_attendee_responded"
BEFORE INSERT OR UPDATE OF "response" ON "companyEventAttendee"
FOR EACH ROW EXECUTE FUNCTION "company_event_attendee_responded"();
