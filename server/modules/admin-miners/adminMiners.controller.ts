import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
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
import { ADMIN_MINERS_ERROR, prismaErrorCode, unknownErrorMessage } from "./adminMiners.errors.js";

const logger = loggerLib.child("AdminMiners");

function isInvalidInput(error: unknown): boolean {
  return unknownErrorMessage(error).startsWith("invalid_");
}

function sendFailure(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, code, message, error: message });
}

function handleAdminMinersError(res: Response, error: unknown, fallbackMessage: string) {
  if (isInvalidInput(error)) {
    return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Dados de mineradora inválidos.");
  }
  if (prismaErrorCode(error) === "P2002") {
    return sendFailure(res, 409, ADMIN_MINERS_ERROR.DUPLICATE_SLUG, "Slug já está em uso.");
  }
  logger.error("admin_miners.unexpected", { message: unknownErrorMessage(error) });
  return sendFailure(res, 500, ADMIN_MINERS_ERROR.INTERNAL_ERROR, fallbackMessage);
}

export async function listAdminMinersController(req: Request, res: Response) {
  try {
    const data = await listAdminMinersForAdmin(prisma, req.query);
    return res.json(data);
  } catch (error: unknown) {
    if (isInvalidInput(error)) {
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_QUERY, "Consulta de mineradoras inválida.");
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
    return res.json(await createAdminMinerForAdmin(prisma, req.body));
  } catch (error: unknown) {
    return handleAdminMinersError(res, error, "Não foi possível criar mineradora agora.");
  }
}

export async function updateAdminMinerController(req: Request, res: Response) {
  try {
    const data = await updateAdminMinerForAdmin(prisma, req.params.id, req.body);
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

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../uploads"));
mkdirSync(uploadsDir, { recursive: true });

const uploadMinerImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Formato não suportado. Use JPG, PNG ou WebP."));
  },
});

export function uploadAdminMinerImageController(req: Request, res: Response, next: NextFunction) {
  uploadMinerImage.single("image")(req, res, (err: unknown) => {
    if (err) return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, unknownErrorMessage(err) || "Upload inválido.");
    try {
      if (!req.file) return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Nenhum arquivo enviado.");
      const url = validateMinerImageUrl(`/uploads/${req.file.filename}`);
      return res.json({ ok: true, url });
    } catch (error: unknown) {
      logger.warn("admin_miners.upload.invalid", { message: unknownErrorMessage(error) });
      return sendFailure(res, 400, ADMIN_MINERS_ERROR.INVALID_PAYLOAD, "Imagem inválida.");
    }
  });
  void next;
}
