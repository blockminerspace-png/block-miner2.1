import type { PrismaClient } from "@prisma/client";
import type { QueryRecord } from "../../services/queryRecord.js";
import {
  archiveAdminMiner,
  createAdminMiner,
  duplicateAdminMiner,
  getAdminMiner,
  listAdminMiners,
  toggleAdminMinerActive,
  toggleAdminMinerStore,
  updateAdminMiner,
} from "../../services/adminMinersService.js";

export const adminMinersRepository = {
  list(prisma: PrismaClient, query: QueryRecord) {
    return listAdminMiners(prisma, query);
  },
  get(prisma: PrismaClient, id: unknown) {
    return getAdminMiner(prisma, id);
  },
  create(prisma: PrismaClient, body: QueryRecord) {
    return createAdminMiner(prisma, body);
  },
  update(prisma: PrismaClient, id: unknown, body: QueryRecord) {
    return updateAdminMiner(prisma, id, body);
  },
  duplicate(prisma: PrismaClient, id: unknown) {
    return duplicateAdminMiner(prisma, id);
  },
  archive(prisma: PrismaClient, id: unknown) {
    return archiveAdminMiner(prisma, id);
  },
  toggleStore(prisma: PrismaClient, id: unknown, showInShop: unknown) {
    return toggleAdminMinerStore(prisma, id, showInShop);
  },
  toggleActive(prisma: PrismaClient, id: unknown, isActive: unknown) {
    return toggleAdminMinerActive(prisma, id, isActive);
  },
};
