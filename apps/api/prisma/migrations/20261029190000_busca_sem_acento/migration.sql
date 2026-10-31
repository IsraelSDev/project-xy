-- AlterTable
ALTER TABLE "User" ADD COLUMN "searchKey" TEXT NOT NULL DEFAULT '';

-- Backfill: mesma normalização de `nameSearchKey` (minúsculas, sem acento, espaços colapsados).
UPDATE "User" SET "searchKey" = trim(regexp_replace(lower(translate(
  "displayName",
  'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
)), '\s+', ' ', 'g'));

-- CreateIndex
CREATE INDEX "User_searchKey_idx" ON "User"("searchKey");
