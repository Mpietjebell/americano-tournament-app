-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "googleMapsUrl" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "price" REAL;
ALTER TABLE "Tournament" ADD COLUMN "currency" TEXT DEFAULT 'EUR';
ALTER TABLE "Tournament" ADD COLUMN "city" TEXT;
