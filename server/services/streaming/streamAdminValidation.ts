import { z } from "zod";

const DEFAULT_RTMP = "rtmp://a.rtmp.youtube.com/live2";

export const createStreamDestinationSchema = z.object({
  label: z.string().trim().min(1).max(200),
  captureUrl: z.string().url().max(2048),
  rtmpUrl: z.string().trim().min(8).max(512).optional().nullable(),
  streamKey: z.string().min(1).max(512),
  youtubeDataApiKey: z.union([z.string().max(512), z.null()]).optional(),
  videoWidth: z.coerce.number().int().min(640).max(1920).optional(),
  videoHeight: z.coerce.number().int().min(360).max(1080).optional(),
  videoBitrateK: z.coerce.number().int().min(500).max(12000).optional(),
  audioBitrateK: z.coerce.number().int().min(64).max(320).optional(),
  enabled: z.boolean().optional(),
});

export type CreateStreamDestinationInput = z.infer<typeof createStreamDestinationSchema>;

export const patchStreamDestinationSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  captureUrl: z.string().url().max(2048).optional(),
  rtmpUrl: z.string().trim().min(8).max(512).optional().nullable(),
  streamKey: z.union([z.string().min(1).max(512), z.literal("")]).optional(),
  youtubeDataApiKey: z.union([z.string().max(512), z.literal(""), z.null()]).optional(),
  videoWidth: z.coerce.number().int().min(640).max(1920).optional(),
  videoHeight: z.coerce.number().int().min(360).max(1080).optional(),
  videoBitrateK: z.coerce.number().int().min(500).max(12000).optional(),
  audioBitrateK: z.coerce.number().int().min(64).max(320).optional(),
  enabled: z.boolean().optional(),
});

export type PatchStreamDestinationInput = z.infer<typeof patchStreamDestinationSchema>;

export function parseCreateStreamDestination(
  body: unknown,
): { ok: true; data: CreateStreamDestinationInput } | { ok: false; message: string } {
  const r = createStreamDestinationSchema.safeParse(body);
  if (!r.success) {
    return { ok: false, message: r.error.errors.map((e) => e.message).join("; ") };
  }
  return { ok: true, data: r.data };
}

export function parsePatchStreamDestination(
  body: unknown,
): { ok: true; data: PatchStreamDestinationInput } | { ok: false; message: string } {
  const r = patchStreamDestinationSchema.safeParse(body);
  if (!r.success) {
    return { ok: false, message: r.error.errors.map((e) => e.message).join("; ") };
  }
  return { ok: true, data: r.data };
}

export function defaultRtmpUrl() {
  return DEFAULT_RTMP;
}
