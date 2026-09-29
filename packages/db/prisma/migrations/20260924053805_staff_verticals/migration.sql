-- AlterTable
ALTER TABLE "staffProfile" ADD COLUMN     "verticals" "Vertical"[] DEFAULT ARRAY['ACADEMY']::"Vertical"[];

UPDATE "staffProfile" SET "verticals" = ARRAY['ACADEMY']::"Vertical"[] WHERE "verticals" IS NULL;

ALTER TABLE "staffProfile" ALTER COLUMN "verticals" SET NOT NULL;
