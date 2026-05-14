import type { Request, Response } from "express";
import { buildAdminItemMeta } from "../services/sidebarNavRegistry.js";
import {
  getSidebarNavCategoriesPublic,
  getSidebarNavForAdmin,
  saveSidebarNavEntries,
} from "../services/sidebarNavService.js";

type PutAdminBody = {
  entries?: unknown;
};

export async function getPublicNav(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await getSidebarNavCategoriesPublic();
    res.json({ ok: true, categories });
  } catch {
    res.status(500).json({ ok: false, code: "sidebar_nav_load_failed" });
  }
}

export async function getAdminNav(_req: Request, res: Response): Promise<void> {
  try {
    const { entries, categories } = await getSidebarNavForAdmin();
    res.json({
      ok: true,
      entries,
      categories,
      itemMeta: buildAdminItemMeta(),
    });
  } catch {
    res.status(500).json({ ok: false, code: "sidebar_nav_load_failed" });
  }
}

export async function putAdminNav(req: Request<unknown, unknown, PutAdminBody>, res: Response): Promise<void> {
  const bodyEntries = req.body?.entries;
  try {
    const result = await saveSidebarNavEntries(bodyEntries);
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.code });
      return;
    }
    res.json({
      ok: true,
      entries: result.entries,
      categories: result.categories,
    });
  } catch {
    res.status(500).json({ ok: false, code: "sidebar_nav_save_failed" });
  }
}
