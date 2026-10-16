-- AlterEnum
ALTER TYPE "AgeAssurance" ADD VALUE 'VERIFIED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ageVerificationMethod" TEXT;

-- CreateTable
CREATE TABLE "AgeVerificationReference" (
    "reference" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgeVerificationReference_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE INDEX "AgeVerificationReference_expiresAt_idx" ON "AgeVerificationReference"("expiresAt");

-- CreateIndex
CREATE INDEX "AgeVerificationReference_userId_idx" ON "AgeVerificationReference"("userId");

-- AddForeignKey
ALTER TABLE "AgeVerificationReference" ADD CONSTRAINT "AgeVerificationReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
