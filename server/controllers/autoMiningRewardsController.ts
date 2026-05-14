import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";

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

    const reward = await prisma.autoMiningReward.create({
      data: {
        name: String(name),
        slug: String(slug),
        gpuHashRate: Number(gpu_hash_rate),
        imageUrl: image_url == null ? null : String(image_url),
        description: description == null ? undefined : String(description),
      },
    });

    res.status(201).json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getAllRewardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const rewards = await prisma.autoMiningReward.findMany();
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch (_err: unknown) {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getActiveRewardsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const rewards = await prisma.autoMiningReward.findMany({ where: { isActive: true } });
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch (_err: unknown) {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.findUnique({ where: { id: Number(reward_id) } });
    if (!reward) {
      res.status(404).json({ success: false, error: "Reward not found" });
      return;
    }
    res.json({ success: true, data: reward });
  } catch (_err: unknown) {
    res.status(500).json({ success: false, error: "Error fetching reward" });
  }
}

type UpdateRewardBody = Prisma.AutoMiningRewardUpdateInput;

export async function updateRewardHandler(
  req: Request<RewardIdParams, unknown, UpdateRewardBody>,
  res: Response
): Promise<void> {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: req.body,
    });
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function activateRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: { isActive: true },
    });
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deactivateRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: { isActive: false },
    });
    res.json({ success: true, data: reward });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteRewardHandler(req: Request<RewardIdParams>, res: Response): Promise<void> {
  try {
    const { reward_id } = req.params;
    await prisma.autoMiningReward.delete({ where: { id: Number(reward_id) } });
    res.json({ success: true, message: "Reward deleted" });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getRewardsStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const total = await prisma.autoMiningReward.count();
    const active = await prisma.autoMiningReward.count({ where: { isActive: true } });
    res.json({ success: true, data: { total, active } });
  } catch (_err: unknown) {
    res.status(500).json({ success: false, error: "Error fetching stats" });
  }
}
