-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('MUTE', 'SUSPEND');

-- AlterTable
ALTER TABLE "ModerationAction" ADD COLUMN     "sanctionId" UUID;

-- CreateTable
CREATE TABLE "Sanction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "SanctionType" NOT NULL,
    "endsAt" TIMESTAMP(3),
    "reportId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sanction_userId_type_idx" ON "Sanction"("userId", "type");

-- CreateIndex
CREATE INDEX "Sanction_createdAt_idx" ON "Sanction"("createdAt");

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_sanctionId_fkey" FOREIGN KEY ("sanctionId") REFERENCES "Sanction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
