export type HealthPayload = { ok: true; message: string };

export function getHealthPayload(): HealthPayload {
  return { ok: true, message: "BlockMiner online" };
}
