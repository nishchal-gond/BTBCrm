ALTER TABLE "deposit" ADD CONSTRAINT "deposit_ledger_currency"
  CHECK ("currency" = 'AED');

CREATE FUNCTION "enrollment_needs_converted_client"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  state "ClientStatus";
BEGIN
  SELECT "status" INTO state FROM "client" WHERE "id" = NEW."clientId";

  IF state NOT IN ('CONVERTED', 'STUDENT') THEN
    RAISE EXCEPTION 'a client enrols once they convert'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "enrollment_needs_converted_client"
BEFORE INSERT ON "enrollment"
FOR EACH ROW EXECUTE FUNCTION "enrollment_needs_converted_client"();

CREATE FUNCTION "enrollment_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'an enrolment is withdrawn, never deleted; the history stays'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "enrollment_no_delete"
BEFORE DELETE ON "enrollment"
FOR EACH ROW EXECUTE FUNCTION "enrollment_no_delete"();

CREATE FUNCTION "enrollment_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."clientId" IS DISTINCT FROM OLD."clientId" THEN
    RAISE EXCEPTION 'an enrolment stays with the client it was made for'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."programId" IS DISTINCT FROM OLD."programId" THEN
    RAISE EXCEPTION 'an enrolment stays on the programme it was made for; withdraw and enrol again'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."enrolledAt" IS DISTINCT FROM OLD."enrolledAt" THEN
    RAISE EXCEPTION 'the enrolment date cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
    RAISE EXCEPTION 'createdById records who enrolled the student and cannot change'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "enrollment_guard_immutable"
BEFORE UPDATE ON "enrollment"
FOR EACH ROW EXECUTE FUNCTION "enrollment_guard_immutable"();

CREATE FUNCTION "program_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a programme is retired, never deleted; enrolments reference it'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "program_no_delete"
BEFORE DELETE ON "program"
FOR EACH ROW EXECUTE FUNCTION "program_no_delete"();

CREATE FUNCTION "client_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a client is never deleted; one human keeps one permanent record'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "client_no_delete"
BEFORE DELETE ON "client"
FOR EACH ROW EXECUTE FUNCTION "client_no_delete"();
