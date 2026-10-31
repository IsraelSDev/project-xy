-- Perfil social (Fase 12): localização opcional, aniversário visível e novos eventos do feed.
ALTER TABLE "User" ADD COLUMN "location" VARCHAR(60);
ALTER TABLE "User" ADD COLUMN "showBirthday" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ProfileEventKind" ADD VALUE 'AVATAR';
ALTER TYPE "ProfileEventKind" ADD VALUE 'ROOM';
