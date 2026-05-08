ALTER TABLE "Tournament" ADD COLUMN "maxStandby" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "resultsPublished" BOOLEAN NOT NULL DEFAULT false;
