-- AlterTable
ALTER TABLE "Sanction" ADD COLUMN     "reason" TEXT,
ALTER COLUMN "reportId" DROP NOT NULL;
