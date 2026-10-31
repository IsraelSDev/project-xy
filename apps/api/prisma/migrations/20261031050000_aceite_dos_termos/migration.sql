-- Aceite registrado dos Termos de Uso/Política de Privacidade (data e versão).
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" VARCHAR(20);
