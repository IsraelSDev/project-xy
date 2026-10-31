-- CreateEnum
CREATE TYPE "ReportContext" AS ENUM ('USER', 'PROFILE');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "context" "ReportContext" NOT NULL DEFAULT 'USER',
ADD COLUMN     "evidence" TEXT;
