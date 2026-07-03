import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import * as repo from "./auto-mining.repository.js";

type RewardIdParams = { reward_id: string };

type CreateRewardBody = {
  name?: unknown;
  slug?: unknown;
  gpu_hash_rate?: unknown;
  image_url?: unknown;
  description?: unknown;
};

export async function createRewardHandler(
  req: Request<unknown, unknown, CreateRewardBody>,
  res: Response
): Promise<void> {
  try {
    const { name, slug, gpu_hash_rate, image_url, description } = req.body;
    if (!name || !slug || gpu_hash_rate === undefined) {
      res.status(400).json({ success: false, error: "Missing required fields" });
      return;
    }
    const reward = await repo.adminCreateReward({
      name: String(name),
      slug: String(slug),
      gpuHashRate: Number(gpu_hash_rate),
      imageUrl: image_url == null ? null : String(image_url),
      description: description == null ? undefined : String(description),
    });
    res.status(201).json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getAllRewardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const rewards = await repo.adminFindAllRewards();
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getActiveRewardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const rewards = await repo.adminFindActiveRewards();
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const reward = await repo.adminFindRewardById(Number(req.params.reward_id));
    if (!reward) {
      res.status(404).json({ success: false, error: "Reward not found" });
      return;
    }
    res.json({ success: true, data: reward });
  } catch {
    res.status(500).json({ success: false, error: "Error fetching reward" });
  }
}

export async function updateRewardHandler(
  req: Request<RewardIdParams, unknown, Prisma.AutoMiningRewardUpdateInput>,
  res: Response
): Promise<void> {
  try {
    const reward = await repo.adminUpdateReward(Number(req.params.reward_id), req.body);
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function activateRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const reward = await repo.adminUpdateReward(Number(req.params.reward_id), { isActive: true });
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deactivateRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const reward = await repo.adminUpdateReward(Number(req.params.reward_id), { isActive: false });
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    await repo.adminDeleteReward(Number(req.params.reward_id));
    res.json({ success: true, message: "Reward deleted" });
  } catch (err: unknown) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getRewardsStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await repo.adminCountRewards();
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, error: "Error fetching stats" });
  }
}
