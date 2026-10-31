-- Opções do perfil social: status, o que procura, pronomes, interesses e idiomas.
ALTER TABLE "User" ADD COLUMN "status" VARCHAR(80);
ALTER TABLE "User" ADD COLUMN "lookingFor" VARCHAR(20);
ALTER TABLE "User" ADD COLUMN "pronouns" VARCHAR(20);
ALTER TABLE "User" ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
