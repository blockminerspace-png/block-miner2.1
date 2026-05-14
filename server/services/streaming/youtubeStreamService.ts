import type { Prisma, StreamDestination } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { decryptStreamSecret, encryptStreamSecret, isStreamEncryptionConfigured } from "./streamSecrets.js";
import { defaultRtmpUrl, parseCreateStreamDestination, parsePatchStreamDestination } from "./streamAdminValidation.js";

export function destinationToAdminJson(row: StreamDestination) {
  return {
    id: row.id,
    label: row.label,
    captureUrl: row.captureUrl,
    rtmpUrl: row.rtmpUrl,
    hasStreamKey: Boolean(row.streamKeyEnc),
    hasYoutubeDataApiKey: Boolean(row.youtubeDataApiKeyEnc),
    videoWidth: row.videoWidth,
    videoHeight: row.videoHeight,
    videoBitrateK: row.videoBitrateK,
    audioBitrateK: row.audioBitrateK,
    enabled: row.enabled,
    desiredRunning: row.desiredRunning,
    lastWorkerStatus: row.lastWorkerStatus,
    lastError: row.lastError,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
    lastStoppedAt: row.lastStoppedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function adminListStreamDestinations() {
  const rows = await prisma.streamDestination.findMany({
    orderBy: [{ id: "asc" }]
  });
  return rows.map(destinationToAdminJson);
}

export async function adminCreateStreamDestination(body: unknown) {
  if (!isStreamEncryptionConfigured()) {
    return { ok: false, status: 503, message: "STREAM_ENCRYPTION_KEY is not configured (64 hex chars)." };
  }
  const parsed = parseCreateStreamDestination(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, message: parsed.message };
  }
  const d = parsed.data;
  const streamKeyEnc = encryptStreamSecret(d.streamKey);
  if (!streamKeyEnc) {
    return { ok: false, status: 500, message: "Failed to encrypt stream key." };
  }
  let youtubeDataApiKeyEnc: string | null = null;
  if (d.youtubeDataApiKey && String(d.youtubeDataApiKey).trim()) {
    youtubeDataApiKeyEnc = encryptStreamSecret(String(d.youtubeDataApiKey).trim());
  }
  const row = await prisma.streamDestination.create({
    data: {
      label: d.label,
      captureUrl: d.captureUrl,
      rtmpUrl: d.rtmpUrl?.trim() || defaultRtmpUrl(),
      streamKeyEnc,
      youtubeDataApiKeyEnc,
      videoWidth: d.videoWidth ?? 1280,
      videoHeight: d.videoHeight ?? 720,
      videoBitrateK: d.videoBitrateK ?? 2500,
      audioBitrateK: d.audioBitrateK ?? 128,
      enabled: d.enabled !== false
    }
  });
  return { ok: true, destination: destinationToAdminJson(row) };
}

export async function adminPatchStreamDestination(id: number, body: unknown) {
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, message: "Invalid id." };
  }
  const existing = await prisma.streamDestination.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, status: 404, message: "Destination not found." };
  }
  const parsed = parsePatchStreamDestination(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, message: parsed.message };
  }
  const d = parsed.data;
  const data: Prisma.StreamDestinationUpdateInput = {};
  if (d.label !== undefined) data.label = d.label;
  if (d.captureUrl !== undefined) data.captureUrl = d.captureUrl;
  if (d.rtmpUrl !== undefined) data.rtmpUrl = d.rtmpUrl && d.rtmpUrl.trim() ? d.rtmpUrl.trim() : defaultRtmpUrl();
  if (d.videoWidth !== undefined) data.videoWidth = d.videoWidth;
  if (d.videoHeight !== undefined) data.videoHeight = d.videoHeight;
  if (d.videoBitrateK !== undefined) data.videoBitrateK = d.videoBitrateK;
  if (d.audioBitrateK !== undefined) data.audioBitrateK = d.audioBitrateK;
  if (d.enabled !== undefined) data.enabled = d.enabled;

  if (d.streamKey !== undefined) {
    if (!isStreamEncryptionConfigured()) {
      return { ok: false, status: 503, message: "STREAM_ENCRYPTION_KEY is not configured (64 hex chars)." };
    }
    if (d.streamKey === "") {
      data.streamKeyEnc = null;
    } else {
      const enc = encryptStreamSecret(d.streamKey);
      if (!enc) return { ok: false, status: 500, message: "Failed to encrypt stream key." };
      data.streamKeyEnc = enc;
    }
  }

  if (d.youtubeDataApiKey !== undefined) {
    if (!isStreamEncryptionConfigured()) {
      return { ok: false, status: 503, message: "STREAM_ENCRYPTION_KEY is not configured (64 hex chars)." };
    }
    if (d.youtubeDataApiKey === null || d.youtubeDataApiKey === "") {
      data.youtubeDataApiKeyEnc = null;
    } else {
      const enc = encryptStreamSecret(String(d.youtubeDataApiKey).trim());
      if (!enc) return { ok: false, status: 500, message: "Failed to encrypt API key." };
      data.youtubeDataApiKeyEnc = enc;
    }
  }

  const row = await prisma.streamDestination.update({
    where: { id },
    data
  });
  return { ok: true, destination: destinationToAdminJson(row) };
}

export async function adminGetStreamDestination(id: number) {
  const row = await prisma.streamDestination.findUnique({ where: { id } });
  if (!row) return { ok: false, status: 404, message: "Destination not found." };
  return { ok: true, destination: destinationToAdminJson(row) };
}

export function buildRtmpIngestUrl(rtmpBase: string, streamKey: string) {
  const base = String(rtmpBase || "").replace(/\/+$/, "");
  const key = String(streamKey || "").replace(/^\/+/, "");
  return `${base}/${key}`;
}

export function getDecryptedStreamCredentials(row: StreamDestination) {
  const key = decryptStreamSecret(row.streamKeyEnc);
  if (!key) return null;
  return { streamKey: key, rtmpUrl: buildRtmpIngestUrl(row.rtmpUrl, key) };
}

export async function adminDeleteStreamDestination(id: number) {
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, message: "Invalid id." };
  }
  const existing = await prisma.streamDestination.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, status: 404, message: "Destination not found." };
  }
  await prisma.streamDestination.delete({ where: { id } });
  return { ok: true };
}
