import { PrismaPg } from '@prisma/adapter-pg';
import { FREE_PART_IDS, PART_CATALOG } from '@3dx/contracts';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definida (veja o .env na raiz do repositório).');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Peças da biblioteca à venda: tudo do catálogo que não é grátis. Preço único de 100 créditos.
 * Os ids são UUID v4 de verdade (versão 4 no 3º grupo, variante 8 no 4º): o `BuyRequest.shopItemId`
 * é `z.uuid()`, e o Zod v4 recusa "8-4-4-4-12" fora do padrão RFC (ex.: `...-2222-...`), o que
 * quebrava a compra com "Dados inválidos. Invalid UUID".
 */
const PART_PRICE = 100;
const PART_ITEMS = PART_CATALOG.filter((part) => !FREE_PART_IDS.includes(part.id as never)).map(
  (part, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    kind: part.slot,
    name: part.label,
    value: part.id,
    price: PART_PRICE,
  }),
);

async function main() {
  const seededIds = PART_ITEMS.map((item) => item.id);
  // Desativa o que não faz mais parte do seed (itens legados sem GLB e ids fora do padrão RFC).
  await prisma.shopItem.updateMany({
    where: { id: { notIn: seededIds }, active: true },
    data: { active: false },
  });
  for (const item of PART_ITEMS) {
    await prisma.shopItem.upsert({
      where: { id: item.id },
      update: {
        kind: item.kind,
        name: item.name,
        value: item.value,
        price: item.price,
        active: true,
      },
      create: item,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${PART_ITEMS.length} peças da loja garantidas.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
