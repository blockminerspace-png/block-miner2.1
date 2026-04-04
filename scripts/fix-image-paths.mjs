import { PrismaClient } from '/app/node_modules/.prisma/client/index.js';
const p = new PrismaClient();
const [a, b, c] = await Promise.all([
  p.$executeRawUnsafe(`UPDATE miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`),
  p.$executeRawUnsafe(`UPDATE user_inventory SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`),
  p.$executeRawUnsafe(`UPDATE user_miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`),
]);
console.log('Updated - miners:', a, 'inventory:', b, 'user_miners:', c);
await p.$disconnect();
