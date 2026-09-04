-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'SALES_MANAGER', 'SALES', 'MENTOR_MANAGER', 'MENTOR', 'FINANCE');

-- CreateEnum
CREATE TYPE "TeamKind" AS ENUM ('SALES', 'MENTOR');

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TeamKind" NOT NULL,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffProfile" (
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'SALES',
    "teamId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staffProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "team_managerId_idx" ON "team"("managerId");

-- CreateIndex
CREATE INDEX "team_kind_isActive_idx" ON "team"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "team_name_key" ON "team"("name");

-- CreateIndex
CREATE INDEX "staffProfile_role_isActive_idx" ON "staffProfile"("role", "isActive");

-- CreateIndex
CREATE INDEX "staffProfile_teamId_idx" ON "staffProfile"("teamId");

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "staffProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffProfile" ADD CONSTRAINT "staffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffProfile" ADD CONSTRAINT "staffProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "team_validate_manager"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    manager_role "StaffRole";
BEGIN
    IF NEW."managerId" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "role" INTO manager_role FROM "staffProfile" WHERE "userId" = NEW."managerId";

    IF manager_role IS NULL THEN
        RAISE EXCEPTION 'team manager % has no staff profile', NEW."managerId";
    END IF;

    IF NEW."kind" = 'SALES' AND manager_role NOT IN ('SALES_MANAGER', 'ADMIN') THEN
        RAISE EXCEPTION 'a sales team manager must be SALES_MANAGER or ADMIN, got %', manager_role;
    END IF;

    IF NEW."kind" = 'MENTOR' AND manager_role NOT IN ('MENTOR_MANAGER', 'ADMIN') THEN
        RAISE EXCEPTION 'a mentor team manager must be MENTOR_MANAGER or ADMIN, got %', manager_role;
    END IF;

    RETURN NEW;
END
$$;

CREATE TRIGGER "team_validate_manager"
BEFORE INSERT OR UPDATE OF "managerId", "kind" ON "team"
FOR EACH ROW EXECUTE FUNCTION "team_validate_manager"();
