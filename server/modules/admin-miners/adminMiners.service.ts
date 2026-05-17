import type { PrismaClient } from "@prisma/client";
import type { QueryRecord } from "../../services/queryRecord.js";
import { adminMinersRepository } from "./adminMiners.repository.js";
import { toAdminMinersListResponse } from "./adminMiners.dto.js";

export async function listAdminMinersForAdmin(prisma: PrismaClient, query: QueryRecord) {
  const data = await adminMinersRepository.list(prisma, query);
  return toAdminMinersListResponse(data);
}

export async function getAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return adminMinersRepository.get(prisma, id);
}

export async function createAdminMinerForAdmin(prisma: PrismaClient, body: QueryRecord) {
  return adminMinersRepository.create(prisma, body);
}

export async function updateAdminMinerForAdmin(prisma: PrismaClient, id: unknown, body: QueryRecord) {
  return adminMinersRepository.update(prisma, id, body);
}

export async function duplicateAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return adminMinersRepository.duplicate(prisma, id);
}

export async function archiveAdminMinerForAdmin(prisma: PrismaClient, id: unknown) {
  return adminMinersRepository.archive(prisma, id);
}

export async function toggleAdminMinerStoreForAdmin(prisma: PrismaClient, id: unknown, showInShop: unknown) {
  return adminMinersRepository.toggleStore(prisma, id, showInShop);
}

export async function toggleAdminMinerActiveForAdmin(prisma: PrismaClient, id: unknown, isActive: unknown) {
  return adminMinersRepository.toggleActive(prisma, id, isActive);
}
