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
} from "./adminMiners.repository.js";
import { toAdminMinersListResponse } from "./adminMiners.dto.js";

export async function listAdminMinersForAdmin(prisma: PrismaClient, query: QueryRecord) {
  const data = await listAdminMiners(prisma, query);
  return toAdminMinersListResponse(data);
}

export async function getAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return getAdminMiner(prisma, id);
}

export async function createAdminMinerForAdmin(prisma: PrismaClient, body: QueryRecord) {
  return createAdminMiner(prisma, body);
}

export async function updateAdminMinerForAdmin(prisma: PrismaClient, id: unknown, body: QueryRecord) {
  return updateAdminMiner(prisma, id, body);
}

export async function duplicateAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return duplicateAdminMiner(prisma, id);
}

export async function archiveAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return archiveAdminMiner(prisma, id);
}

export async function toggleAdminMinerStoreForAdmin(prisma: PrismaClient, id: unknown, showInShop: unknown) {
  return toggleAdminMinerStore(prisma, id, showInShop);
}

export async function toggleAdminMinerActiveForAdmin(prisma: PrismaClient, id: unknown, isActive: unknown) {
  return toggleAdminMinerActive(prisma, id, isActive);
}
