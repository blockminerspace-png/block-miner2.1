import type { NextFunction, Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { validateMinerImageUrl } from "./adminMiners.schemas.js";
import {
  archiveAdminMinerForAdmin,
  createAdminMinerForAdmin,
  duplicateAdminMinerForAdmin,
  getAdminMinerForAdmin,
  listAdminMinersForAdmin,
  toggleAdminMinerActiveForAdmin,
  toggleAdminMinerStoreForAdmin,
  updateAdminMinerForAdmin,
} from "./adminMiners.service.js";
import { ADMIN_MINERS_ERROR, isPrismaSchemaMismatch, prismaErrorCode, unknownErrorMessage } from "./adminMiners.errors.js";
import {
  ADMIN_MINER_IMAGE_FIELD,
  buildMinerUploadPublicUrl,
  uploadAdminMinerImageMiddleware,
} from "./adminMiners.upload.js";
import type { QueryRecord } from "../../services/queryRecord.js";

const logger = loggerLib.child("AdminMiners");

function isInvalidInput(error: unknown): boolean {
  return unknownErrorMessage(error).startsWith("invalid_");
}

function sendFailure(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, code, message, error: message });
}

function enrichWriteBodyWithUpload(req: Request, body: QueryRecord): QueryRecord {
  if (!req.file) return body;
  const imageUrl = validateMinerImageUrl(buildMinerUploadPublicUrl(req.file.filename));
  return { ...body, imageUrl: imageUrl ?? undefined };
}

export function optionalAdminMinerImageUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("multipart/form-data")) {
    next();
    return;
  }
  uploadAdminMinerImageMiddleware.single(ADMIN_MINER_IMAGE_FIELD)(req, res, (err: unknown) => {
    if (err) {
      sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, unknownErrorMessage(err) || "Upload inválido.");
      return;
    }
    next();
  });
}

function handleAdminMinersError(res: Response, error: unknown, fallbackMessage: string) {
  if (isInvalidInput(error)) {
    return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Dados de mineradora inválidos.");
  }
  if (prismaErrorCode(error) === "P2002") {
    return sendFailure(res, 409, ADMIN_MINERS_ERROR.DUPLICATE_SLUG, "Slug já está em uso.");
  }
  if (isPrismaSchemaMismatch(error)) {
    logger.error("admin_miners.schema_out_of_date", { message: unknownErrorMessage(error) });
    return sendFailure(
      res,
      503,
      ADMIN_MINERS_ERROR.SCHEMA_OUT_OF_DATE,
      "Catálogo de mineradoras requer atualização do banco (migration admin_miner_catalog).",
    );
  }
  logger.error("admin_miners.unexpected", { message: unknownErrorMessage(error) });
  return sendFailure(res, 500, ADMIN_MINERS_ERROR.INTERNAL_ERROR, fallbackMessage);
}

export async function listOrphanMachineTypesController(req: Request, res: Response) {
  try {
    const { listOrphanMachineTypes } = await import("./adminMiners.orphanTypes.js");
    const types = await listOrphanMachineTypes(prisma);
    return res.json({ ok: true, types });
  } catch (err: unknown) {
    console.error("listOrphanMachineTypes", err);
    return res.status(500).json({ ok: false, message: ADMIN_MINERS_ERROR });
  }
}

export async function relinkOrphanMachineTypesController(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as QueryRecord;
    const all = body.all === true || body.all === "true" || body.all === 1 || body.all === "1";
    const minerName = String(body.minerName ?? "").trim();
    const mode = String(body.mode ?? "catalog").trim().toLowerCase();

    const {
      relinkAllOrphanTypesWithCatalogMatch,
      relinkAllOrphanInstancesByCatalogNameMatch,
      repairAllOrphanEventMachineTypes,
      relinkOrphanMachineTypeToCatalog,
      repairOrphanEventMachineType,
    } = await import("./adminMiners.orphanRelink.js");

    if (all) {
      const repairEvents = body.repairEvents === true || body.repairEvents === "true" || body.repairEvents === 1;
      const catalogScan =
        body.catalogScan === true || body.catalogScan === "true" || body.catalogScan === 1 || repairEvents;
      const catalog = await relinkAllOrphanTypesWithCatalogMatch(prisma);
      const payload: Record<string, unknown> = { ok: true, catalog };
      if (catalogScan) {
        payload.catalogScan = await relinkAllOrphanInstancesByCatalogNameMatch(prisma);
      }
      if (!repairEvents) {
        return res.json(payload);
      }
      payload.events = await repairAllOrphanEventMachineTypes(prisma);
      return res.json(payload);
    }

    if (!minerName) {
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Informe minerName ou all=true.");
    }

    if (mode === "event") {
      const result = await repairOrphanEventMachineType(prisma, minerName);
      return res.status(result.ok ? 200 : 400).json(result);
    }

    const result = await relinkOrphanMachineTypeToCatalog(prisma, minerName);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err: unknown) {
    console.error("relinkOrphanMachineTypes", err);
    return handleAdminMinersError(res, err, "Erro ao reparar instâncias órfãs.");
  }
}

export async function listAdminMinersController(req: Request, res: Response) {
  try {
    const data = await listAdminMinersForAdmin(prisma, req.query);
    return res.json(data);
  } catch (error: unknown) {
    if (isInvalidInput(error)) {
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_QUERY, "Consulta de mineradoras inválida.");
    }
    if (isPrismaSchemaMismatch(error)) {
      logger.error("admin_miners.list.schema_out_of_date", { message: unknownErrorMessage(error) });
      return sendFailure(
        res,
        503,
        ADMIN_MINERS_ERROR.SCHEMA_OUT_OF_DATE,
        "Catálogo de mineradoras requer atualização do banco (migration admin_miner_catalog).",
      );
    }
    logger.error("admin_miners.list.unexpected", { message: unknownErrorMessage(error) });
    return sendFailure(res, 500, ADMIN_MINERS_ERROR.INTERNAL_ERROR, "Não foi possível carregar mineradoras agora.");
  }
}

export async function getAdminMinerController(req: Request, res: Response) {
  try {
    const data = await getAdminMinerForAdmin(prisma, req.params.id);
    if (!data) return sendFailure(res, 404, ADMIN_MINERS_ERROR.NOT_FOUND, "Mineradora não encontrada.");
    return res.json(data);
  } catch (error: unknown) {
    if (isInvalidInput(error)) return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_ID, "ID de mineradora inválido.");
    return handleAdminMinersError(res, error, "Não foi possível carregar mineradora agora.");
  }
}

export async function createAdminMinerController(req: Request, res: Response) {
  try {
    return res.json(await createAdminMinerForAdmin(prisma, enrichWriteBodyWithUpload(req, req.body)));
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível criar mineradora agora.");
  }
}

export async function updateAdminMinerController(req: Request, res: Response) {
  try {
    const data = await updateAdminMinerForAdmin(prisma, req.params.id, enrichWriteBodyWithUpload(req, req.body));
    if (!data) return sendFailure(res, 404, ADMIN_MINERS_ERROR.NOT_FOUND, "Mineradora não encontrada.");
    return res.json(data);
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível atualizar mineradora agora.");
  }
}

export async function duplicateAdminMinerController(req: Request, res: Response) {
  try {
    const data = await duplicateAdminMinerForAdmin(prisma, req.params.id);
    if (!data) return sendFailure(res, 404, ADMIN_MINERS_ERROR.NOT_FOUND, "Mineradora não encontrada.");
    return res.json(data);
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível duplicar mineradora agora.");
  }
}

export async function archiveAdminMinerController(req: Request, res: Response) {
  try {
    return res.json(await archiveAdminMinerForAdmin(prisma, req.params.id));
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível arquivar mineradora agora.");
  }
}

export async function toggleAdminMinerStoreController(req: Request, res: Response) {
  try {
    return res.json(await toggleAdminMinerStoreForAdmin(prisma, req.params.id, req.body?.showInShop ?? req.body?.isStoreVisible));
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível alterar visibilidade da mineradora agora.");
  }
}

export async function toggleAdminMinerActiveController(req: Request, res: Response) {
  try {
    return res.json(await toggleAdminMinerActiveForAdmin(prisma, req.params.id, req.body?.isActive));
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível alterar status da mineradora agora.");
  }
}

export function uploadAdminMinerImageController(req: Request, res: Response) {
  uploadAdminMinerImageMiddleware.single("image")(req, res, (err: unknown) => {
    if (err) {
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, unknownErrorMessage(err) || "Upload inválido.");
    }
    try {
      if (!req.file) {
        return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Nenhum arquivo enviado.");
      }
      const url = validateMinerImageUrl(buildMinerUploadPublicUrl(req.file.filename));
      return res.json({ ok: true, url });
    } catch (error: unknown) {
      logger.warn("admin_miners.upload.invalid", { message: unknownErrorMessage(error) });
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Imagem inválida.");
    }
  });
}
