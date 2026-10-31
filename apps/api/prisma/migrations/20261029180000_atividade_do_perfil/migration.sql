-- CreateEnum
CREATE TYPE "ProfileEventKind" AS ENUM ('JOINED', 'BIO', 'PHOTO', 'NAME');

-- CreateTable
CREATE TABLE "ProfileEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ProfileEventKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileEvent_userId_createdAt_idx" ON "ProfileEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProfileEvent" ADD CONSTRAINT "ProfileEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: contas existentes ganham o evento de entrada com a data de criação.
INSERT INTO "ProfileEvent" ("id", "userId", "kind", "createdAt")
SELECT gen_random_uuid(), "id", 'JOINED', "createdAt" FROM "User";
