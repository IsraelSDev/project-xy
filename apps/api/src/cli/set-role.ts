/**
 * Define o papel de um usuário (ex.: o primeiro moderador). Fica registrado na auditoria como ação
 * do sistema. Uso: pnpm --filter @3dx/api user:role <email> <USER|MODERATOR|ADMIN>
 */
import { Email, ROLES, type Role } from '@3dx/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

async function main(): Promise<void> {
  try {
    process.loadEnvFile('../../.env');
  } catch {
    // Sem .env: usa o ambiente do processo.
  }

  const [rawEmail, rawRole] = process.argv.slice(2);
  const email = Email.safeParse(rawEmail);
  const role = ROLES.find((candidate) => candidate === rawRole);
  if (!email.success || !role) {
    console.error(`Uso: user:role <email> <${ROLES.join('|')}>`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  try {
    const user = await prisma.user.findUnique({ where: { email: email.data } });
    if (!user) {
      console.error('Usuário não encontrado.');
      process.exitCode = 1;
      return;
    }
    await setRole(prisma, user.id, user.role, role);
    console.log(`${user.displayName}: ${user.role} -> ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function setRole(prisma: PrismaService, userId: string, from: Role, to: Role) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role: to } }),
    prisma.moderationAction.create({
      data: { actorId: null, action: 'role.changed', note: `${userId}: ${from} -> ${to} (CLI)` },
    }),
  ]);
}

void main();
