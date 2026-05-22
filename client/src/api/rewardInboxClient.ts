import { api } from "../store/auth";

export function getRewardInbox(signal?: AbortSignal) {
  return api.get("/reward-inbox", { signal, timeout: 15000 });
}

export function collectReward(id: number) {
  return api.post(`/reward-inbox/${id}/collect`, {}, { timeout: 15000 });
}

export function collectAllRewards() {
  return api.post("/reward-inbox/collect-all", {}, { timeout: 15000 });
}
