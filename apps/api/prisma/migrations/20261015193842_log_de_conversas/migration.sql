-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('ROOM', 'DIRECT');

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" UUID NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "roomId" TEXT,
    "roomTitle" TEXT,
    "senderId" UUID NOT NULL,
    "recipientId" UUID,
    "conversationKey" TEXT,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLog_kind_sentAt_idx" ON "MessageLog"("kind", "sentAt");

-- CreateIndex
CREATE INDEX "MessageLog_conversationKey_sentAt_idx" ON "MessageLog"("conversationKey", "sentAt");

-- CreateIndex
CREATE INDEX "MessageLog_roomId_sentAt_idx" ON "MessageLog"("roomId", "sentAt");

-- CreateIndex
CREATE INDEX "MessageLog_senderId_sentAt_idx" ON "MessageLog"("senderId", "sentAt");

-- CreateIndex
CREATE INDEX "MessageLog_recipientId_sentAt_idx" ON "MessageLog"("recipientId", "sentAt");

-- CreateIndex
CREATE INDEX "MessageLog_sentAt_idx" ON "MessageLog"("sentAt");
