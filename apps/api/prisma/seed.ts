import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient();

const ITEMS = [
  { id: '11111111-1111-1111-1111-111111111001', kind: 'top', name: 'Jaqueta de couro', value: 'leather-jacket', price: 150 },
  { id: '11111111-1111-1111-1111-111111111002', kind: 'top', name: 'Hoodie com capuz', value: 'hoodie', price: 120 },
  { id: '11111111-1111-1111-1111-111111111003', kind: 'bottom', name: 'Calça cargo', value: 'cargo-pants', price: 140 },
  { id: '11111111-1111-1111-1111-111111111004', kind: 'hair', name: 'Moicano', value: 'mohawk', price: 200 },
  { id: '11111111-1111-1111-1111-111111111005', kind: 'accessory', name: 'Óculos escuros', value: 'sunglasses', price: 90 },
  { id: '11111111-1111-1111-1111-111111111006', kind: 'body', name: 'Corpo atlético', value: 'athletic', price: 180 },
];

async function main() {
  for (const item of ITEMS) {
    await prisma.shopItem.upsert({
      where: { id: item.id },
      update: { kind: item.kind, name: item.name, value: item.value, price: item.price, active: true },
      create: item,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seed: ${ITEMS.length} itens da loja garantidos.`);
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
