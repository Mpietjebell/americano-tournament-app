ALTER TABLE "Tournament" ADD COLUMN "hostToken" TEXT;

UPDATE "Tournament"
SET "hostToken" =
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)))
WHERE "hostToken" IS NULL;

CREATE UNIQUE INDEX "Tournament_hostToken_key" ON "Tournament"("hostToken");
