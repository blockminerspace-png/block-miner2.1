import { Prisma } from "@prisma/client";
import prisma from "../dist/server/src/db/prisma.js";

const [a, b, c] = await Promise.all([
  prisma.$executeRaw(
    Prisma.sql`UPDATE miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`,
  ),
  prisma.$executeRaw(
    Prisma.sql`UPDATE user_inventory SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`,
  ),
  prisma.$executeRaw(
    Prisma.sql`UPDATE user_miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'`,
  ),
]);
console.log("Updated - miners:", a, "inventory:", b, "user_miners:", c);
await prisma.$disconnect();
